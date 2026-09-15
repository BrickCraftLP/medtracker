// The calendar. Owns the visible range, the view, and which sheet is open;
// all rendering lives in components/Calendar/*.
//
// Deep links in: TopicStatsScreen passes { state: { date } }, and a push
// notification can only carry a URL, so ?d= is read too. Both are read once on
// mount — a realtime sync must never yank the user off the day they are on.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, format } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import { useNavLayout } from '../context/NavLayoutContext.jsx'
import { useCalendarSettings } from '../context/CalendarSettingsContext.jsx'
import { availableProviders } from '../services/sync/index.js'
import CalendarToolbar from '../components/Calendar/CalendarToolbar.jsx'
import TimeGridView from '../components/Calendar/TimeGridView.jsx'
import MonthView from '../components/Calendar/MonthView.jsx'
import AgendaView from '../components/Calendar/AgendaView.jsx'
import GlassPanel from '../components/Glass/GlassPanel.jsx'
import GlassButton from '../components/Glass/GlassButton.jsx'
import { makeGeometry } from '../utils/calendar/gridGeometry.js'
import { expandRange } from '../utils/calendar/recurrence.js'
import { progressByEvent } from '../utils/calculations/eventProgressCalcs.js'
import {
  dayKey, parseDayKey, addDays, draftFromDrag, findConflicts, buildEvent,
} from '../utils/calendar/eventModel.js'
import { defaultCalendarFor } from '../utils/calendar/calendarScope.js'
import { wsKey } from '../services/workspaceScope.js'

const EventEditorModal = lazy(() => import('../components/Modals/EventEditorModal.jsx'))
const CalendarManagerModal = lazy(() => import('../components/Modals/CalendarManagerModal.jsx'))
const SearchSheet = lazy(() => import('../components/Calendar/SearchSheet.jsx'))

const VIEW_KEY = 'mt_cal_view'
const HIDDEN_KEY = 'mt_cal_hidden'

const DAYS_IN_VIEW = { day: 1, three: 3, week: 7 }

// Height the bottom navbar pill actually occupies, including its safe-area
// offset. --nav-inset only describes a *side* rail (it is 0px for the bottom
// bar), so anything dodging the bottom pill needs its own number.
const BOTTOM_BAR_CLEARANCE = 96

export default function CalendarScreen() {
  const {
    events, calendars, todos, dataLoading,
    upsertEvent, setWidgetModalOpen,
  } = useData()
  const { t, language } = useLanguage()
  const { activeWorkspaceId } = useWorkspace()
  const { position: navPosition, isVertical } = useNavLayout()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [params] = useSearchParams()
  const locale = language === 'de' ? de : enUS
  const { connectPromptDismissed, setSetting: setCalSetting } = useCalendarSettings()

  // Read straight from the calendars: the prompt only needs to know whether
  // anything is linked, not the sync state GoogleSyncProvider keeps.
  const showConnectPrompt = !connectPromptDismissed
    && availableProviders().length > 0
    && !calendars.some(c => c.google_sync && c.google_calendar_id)

  // Mount-only, deliberately: see the header comment.
  const [anchor, setAnchor] = useState(() => params.get('d') ?? state?.date ?? dayKey())
  const [view, setView] = useState(() => {
    if (state?.date || params.get('d')) return 'day'
    const saved = localStorage.getItem(VIEW_KEY)
    return ['day', 'three', 'week', 'month', 'agenda'].includes(saved) ? saved : 'week'
  })
  const [sheet, setSheet] = useState(null) // { type: 'event'|'calendars'|'search', … }

  // Which calendars are hidden — device-local, per workspace. A viewing
  // preference, not data: syncing it would have phone and laptop fight.
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(localStorage.getItem(wsKey(HIDDEN_KEY)) ?? '[]') } catch { return [] }
  })

  useEffect(() => { localStorage.setItem(VIEW_KEY, view) }, [view])
  useEffect(() => {
    try { localStorage.setItem(wsKey(HIDDEN_KEY), JSON.stringify(hidden)) } catch {}
  }, [hidden, activeWorkspaceId])

  // The navbar must not sit on top of a sheet, and the tab swipe must not fire
  // while one is open — same contract HomeScreen uses for the widget modal.
  useEffect(() => {
    setWidgetModalOpen(!!sheet)
    return () => setWidgetModalOpen(false)
  }, [sheet, setWidgetModalOpen])

  const geo = useMemo(() => makeGeometry(), [])

  // ── Visible range ────────────────────────────────────────────────────────

  const { days, rangeFrom, rangeTo, title } = useMemo(() => {
    const anchorDate = parseDayKey(anchor)

    if (view === 'month') {
      const from = dayKey(startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 }))
      const to = dayKey(endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 }))
      return { days: [], rangeFrom: from, rangeTo: to, title: format(anchorDate, 'LLLL yyyy', { locale }) }
    }

    if (view === 'agenda') {
      return {
        days: [],
        rangeFrom: addDays(anchor, -14),
        rangeTo: addDays(anchor, 60),
        title: t('calendar.view.agenda'),
      }
    }

    const count = DAYS_IN_VIEW[view] ?? 7
    const first = count === 7 ? dayKey(startOfWeek(anchorDate, { weekStartsOn: 1 })) : anchor
    const list = Array.from({ length: count }, (_, i) => addDays(first, i))
    const label = count === 1
      ? format(parseDayKey(first), 'EEEE, d. LLLL', { locale })
      : `${format(parseDayKey(first), 'd. LLL', { locale })} – ${format(parseDayKey(list[list.length - 1]), 'd. LLL yyyy', { locale })}`
    return { days: list, rangeFrom: first, rangeTo: list[list.length - 1], title: label }
  }, [anchor, view, locale, t])

  // ── Data for the range ───────────────────────────────────────────────────

  const calendarById = useMemo(() => new Map(calendars.map(c => [c.id, c])), [calendars])

  const visibleEvents = useMemo(
    () => events.filter(e => !hidden.includes(e.calendar_id)),
    [events, hidden],
  )

  const occurrences = useMemo(
    () => expandRange(visibleEvents, rangeFrom, rangeTo),
    [visibleEvents, rangeFrom, rangeTo],
  )

  const conflicts = useMemo(() => findConflicts(occurrences), [occurrences])

  const progressMap = useMemo(() => progressByEvent(todos), [todos])
  const progressOf = useCallback(id => progressMap.get(id) ?? null, [progressMap])

  // ── Paging ───────────────────────────────────────────────────────────────

  const page = useCallback(delta => {
    setAnchor(prev => {
      if (view === 'month') return dayKey(addMonths(parseDayKey(prev), delta))
      if (view === 'agenda') return addDays(prev, delta * 30)
      return addDays(prev, delta * (DAYS_IN_VIEW[view] ?? 7))
    })
  }, [view])

  // ── Actions ──────────────────────────────────────────────────────────────

  const openEvent = useCallback(occurrence => setSheet({ type: 'event', occurrence }), [])

  const createDraft = useCallback(({ date, startMin, endMin }) => {
    // Prefer a calendar this workspace owns, so a quick drag-create cannot
    // land in one that is merely shared into it.
    const calendarId = defaultCalendarFor(calendars, activeWorkspaceId, { exclude: hidden })?.id
    setSheet({ type: 'event', draft: draftFromDrag({ date, startMin, endMin, calendarId }) })
  }, [calendars, hidden])

  const createRange = useCallback(({ from, to }) => {
    const calendarId = defaultCalendarFor(calendars, activeWorkspaceId, { exclude: hidden })?.id
    setSheet({
      type: 'event',
      draft: buildEvent({}, {
        calendar_id: calendarId, all_day: true, start_date: from, end_date: to, kind: 'event',
      }),
    })
  }, [calendars, hidden])

  // Drag-move / resize commit. A moved occurrence of a recurring series is
  // detached into its own row rather than shifting the whole series — moving
  // one lecture must not move the semester.
  const commitEvent = useCallback(async (occurrence, patch) => {
    const event = occurrence.event
    try {
      if (event.rrule) {
        await upsertEvent(buildEvent({}, {
          ...event,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
          rrule: null,
          rrule_until: null,
          // Provenance belongs to the master only: the column is uniquely
          // indexed, so copying it here would make the detach fail to save.
          legacy_scheduled_id: null,
          // Same for the Google identity: (google_calendar_id, google_event_id)
          // is unique too. Sync finds the matching Google instance itself.
          google_event_id: null,
          google_calendar_id: null,
          recurrence_parent_id: event.id,
          recurrence_date: occurrence.date,
          ...patch,
        }))
        return
      }
      await upsertEvent(buildEvent(event, patch))
    } catch (e) {
      console.error('CalendarScreen commitEvent failed:', e)
    }
  }, [upsertEvent])

  function toggleCalendar(id) {
    setHidden(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function goToday() {
    setAnchor(dayKey())
  }

  function selectDay(key) {
    if (key === anchor && view === 'month') { setView('day'); return }
    setAnchor(key)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div className="skeleton" style={{ width: 160, height: 28, borderRadius: 8, marginBottom: 18 }} />
          <div className="skeleton" style={{ width: '100%', height: 360, borderRadius: 18 }} />
        </div>
      </div>
    )
  }

  const scrolls = view === 'month' || view === 'agenda'

  // This screen is not a .scroll-container, so it gets none of the automatic
  // navbar padding that index.css gives the other screens — it has to apply
  // --nav-inset itself, on both the header and the body.
  const railInset = isVertical ? 'var(--nav-inset)' : 0
  const sidePad = {
    paddingLeft: navPosition === 'left' ? railInset : 0,
    paddingRight: navPosition === 'right' ? railInset : 0,
  }
  const bottomClearance = isVertical ? 24 : BOTTOM_BAR_CLEARANCE + 12

  // The FAB moves to whichever side the navbar is not on, and only needs
  // vertical clearance when the bar is the bottom pill.
  const fabPlacement = isVertical
    ? {
      bottom: 24,
      [navPosition === 'right' ? 'left' : 'right']: 'calc(var(--nav-inset) + 18px)',
    }
    : { bottom: BOTTOM_BAR_CLEARANCE + 10, right: 18 }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', position: 'relative',
      // Glass only reads as glass when there is something behind it to bend:
      // soft accent washes instead of a flat fill.
      background: `radial-gradient(120% 55% at 0% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 62%),
                   radial-gradient(110% 50% at 100% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
                   var(--bg-primary)`,
      overflow: 'hidden',
    }}>
      <div style={sidePad}>
      <CalendarToolbar
        title={title}
        view={view}
        onView={setView}
        onPrev={() => page(-1)}
        onNext={() => page(1)}
        onToday={goToday}
        onFilter={() => setSheet({ type: 'calendars' })}
        onSearch={() => setSheet({ type: 'search' })}
        onExams={() => navigate('/exams')}
        hiddenCount={hidden.length}
        t={t}
      />
      <AnimatePresence initial={false}>
        {showConnectPrompt && (
          <motion.div
            key="connect-prompt"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <GlassPanel
              cornerRadius={18}
              displacementScale={30}
              style={{ margin: '4px 16px 10px' }}
              bodyStyle={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('calsetup.banner.title')}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {t('calsetup.banner.body')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <GlassButton height={34} fontSize={13} tint="transparent" ink="var(--text-tertiary)"
                  onClick={() => setCalSetting('connectPromptDismissed', true)}>
                  {t('calsetup.banner.dismiss')}
                </GlassButton>
                <GlassButton height={34} fontSize={13} variant="primary"
                  onClick={() => navigate('/calendar/connect')}>
                  {t('calsetup.banner.cta')}
                </GlassButton>
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        overflowY: scrolls ? 'auto' : 'hidden',
        // A bottom pill needs real clearance under the scrolling views; a side
        // rail leaves the bottom free. --nav-inset is 0px when the bar is at
        // the bottom, so it cannot carry this on its own.
        paddingBottom: scrolls ? `${bottomClearance}px` : 0,
        ...sidePad,
      }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            {view === 'month' && (
              <MonthView
                month={parseDayKey(anchor)}
                selected={anchor}
                occurrences={occurrences}
                calendarById={calendarById}
                progressOf={progressOf}
                locale={locale}
                onSelectDay={selectDay}
                onOpenEvent={openEvent}
                onCreateRange={createRange}
              />
            )}

            {view === 'agenda' && (
              <AgendaView
                occurrences={occurrences}
                calendarById={calendarById}
                progressOf={progressOf}
                locale={locale}
                t={t}
                onOpenEvent={openEvent}
              />
            )}

            {(view === 'day' || view === 'three' || view === 'week') && (
              <TimeGridView
                days={days}
                occurrences={occurrences}
                geo={geo}
                calendarById={calendarById}
                progressOf={progressOf}
                conflicts={conflicts}
                locale={locale}
                onOpenEvent={openEvent}
                onCreateDraft={createDraft}
                onCommitEvent={commitEvent}
                onPage={page}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Create button. It has to dodge the navbar, which the user can move:
          a bottom pill is cleared by lifting the button, a side rail by moving
          the button to the opposite side. */}
      <GlassButton
        size={54}
        variant="primary"
        ink="#fff"
        onClick={() => createDraft({ date: anchor, startMin: 9 * 60, endMin: 10 * 60 })}
        ariaLabel={t('calendar.newEvent')}
        style={{ position: 'absolute', ...fabPlacement, zIndex: 20, borderRadius: '50%', boxShadow: 'var(--shadow-lg)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </GlassButton>

      <Suspense fallback={null}>
        <AnimatePresence>
          {sheet?.type === 'event' && (
            <EventEditorModal
              key="event"
              draft={sheet.draft}
              occurrence={sheet.occurrence}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet?.type === 'calendars' && (
            <CalendarManagerModal
              key="calendars"
              hidden={hidden}
              onToggle={toggleCalendar}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet?.type === 'search' && (
            <SearchSheet
              key="search"
              onClose={() => setSheet(null)}
              onPick={target => {
                setSheet(null)
                if (target.date) { setAnchor(target.date); setView('day') }
              }}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </div>
  )
}
