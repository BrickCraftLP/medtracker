// Two-way sync between a MedTracker calendar and a Google calendar.
//
// Shape of the thing:
//   pull  — incremental via Google's syncToken (falls back to a full window
//           when the token has expired); a row only changed on Google takes
//           Google's version, a row changed on both sides goes to the newer;
//   push  — every local row whose synced content differs from what we last
//           pushed or pulled;
//   state — sync token and a per-row hash of the last synced content live in
//           IndexedDB, not in Postgres, because each device syncs against
//           Google independently. A shared token would make two devices skip
//           each other's changes.
//
// Dirty tracking compares content, not updated_at. An offline save keeps the
// row's old updated_at until the queue flushes, so a timestamp check would
// never push an edit made offline.
//
// The echo guard is sameContent(): Google sends our own writes back on the
// next pull, and applying them would bump updated_at for nothing.

import { getMeta, setMeta } from './offlineDB.js'
import {
  listEvents, listInstances, insertEvent, patchEvent, deleteEvent, moveEvent,
  SyncTokenGone, userTimeZone,
} from './googleCalendar.js'
import { addDays, dayKey } from '../utils/calendar/eventModel.js'
import { parseRrule } from '../utils/calendar/recurrence.js'

const FULL_SYNC_DAYS_BACK = 90
// v1 stored updated_at stamps in lastPushed. Those can't be compared with a
// content hash, so a v1 state is dropped and the calendar resyncs once — which
// duplicates nothing, because the pull matches rows on google_event_id.
const STATE_VERSION = 2
const stateKey = calendarId => `googleSync:${calendarId}`

const freshState = (pendingDeletes = []) => ({
  version: STATE_VERSION, syncToken: null, lastPushed: {}, pendingDeletes,
})

async function loadState(calendarId) {
  const saved = await getMeta(stateKey(calendarId))
  if (saved?.version === STATE_VERSION) return saved
  return freshState(saved?.pendingDeletes ?? [])
}

const saveState = (calendarId, state) => setMeta(stateKey(calendarId), state)

// Recorded when a synced row is deleted locally, so the deletion still
// reaches Google after being offline (or after the tab was closed).
export async function noteLocalDelete(calendar, googleEventId) {
  if (!calendar?.id || !googleEventId) return
  const state = await loadState(calendar.id)
  if (!state.pendingDeletes.includes(googleEventId)) state.pendingDeletes.push(googleEventId)
  await saveState(calendar.id, state)
}

export async function clearSyncState(calendarId) {
  await setMeta(stateKey(calendarId), null)
}

// ── Mapping ────────────────────────────────────────────────────────────────

// Google's all-day end date is EXCLUSIVE; ours is inclusive. Getting this
// wrong shortens or stretches every multi-day event by a day.
const toGoogleAllDayEnd = endDate => addDays(endDate, 1)
const fromGoogleAllDayEnd = endDate => addDays(endDate, -1)

const compact = s => String(s).replace(/-/g, '')

function recurrenceLines(event) {
  if (!event.rrule) return []
  // An UNTIL may already sit inside the rule, in our dashed form. Take it out
  // and write it back once, in the form Google accepts.
  const inline = event.rrule.match(/UNTIL=(\d{4})-?(\d{2})-?(\d{2})/i)
  const until = event.rrule_until ?? (inline ? `${inline[1]}-${inline[2]}-${inline[3]}` : null)
  let rule = event.rrule.replace(/;?UNTIL=[^;]*/i, '').replace(/^;/, '')
  if (until) {
    // UNTIL must match DTSTART's value type: a bare date for all-day events,
    // a UTC timestamp for timed ones.
    rule += event.all_day ? `;UNTIL=${compact(until)}` : `;UNTIL=${compact(until)}T235959Z`
  }
  const lines = [`RRULE:${rule}`]
  for (const date of event.exdates ?? []) {
    lines.push(event.all_day
      ? `EXDATE;VALUE=DATE:${compact(date)}`
      : `EXDATE;TZID=${userTimeZone()}:${compact(date)}T${(event.start_time ?? '09:00:00').replace(/:/g, '')}`)
  }
  return lines
}

// Everything from this line down in a Google description is the checklist
// toGoogle writes, never the user's notes.
const CHECKLIST_MARKER = '— MedTracker tasks —'

function describe(notes, checklist) {
  if (!checklist) return notes ?? ''
  return `${notes ? `${notes}\n\n` : ''}${CHECKLIST_MARKER}\n${checklist}`
}

function ownNotes(description) {
  if (!description) return null
  const at = description.indexOf(CHECKLIST_MARKER)
  return (at < 0 ? description : description.slice(0, at).trimEnd()) || null
}

// `instance` is set for a single occurrence of a series, which carries no
// recurrence of its own. `checklist` is the event's todos, from buildChecklists.
export function toGoogle(event, { instance = false, checklist = null } = {}) {
  const tz = userTimeZone()
  const links = JSON.stringify(event.links ?? [])
  const body = {
    summary: event.title || '—',
    // '' rather than undefined: PATCH leaves an omitted field as it was, so a
    // note removed here would otherwise live on in Google.
    description: describe(event.notes, checklist),
    location: event.location ?? '',
    status: 'confirmed',
    // Round-trips the fields Google has no home for, so a MedTracker event
    // that has been to Google and back is still an assignment with its links.
    extendedProperties: {
      private: {
        mtKind: event.kind ?? 'event',
        // Google caps a value at 1024 characters. Truncated JSON would not
        // parse on the way back, so an oversized list is not sent at all.
        mtLinks: links.length <= 1024 ? links : null,
      },
    },
  }

  // PATCH merges nested objects, so switching between all-day and timed has
  // to null the other shape explicitly or Google rejects the mix.
  if (event.all_day) {
    body.start = { date: event.start_date, dateTime: null, timeZone: null }
    body.end = { date: toGoogleAllDayEnd(event.end_date ?? event.start_date), dateTime: null, timeZone: null }
  } else {
    body.start = { date: null, dateTime: `${event.start_date}T${event.start_time ?? '09:00:00'}`, timeZone: tz }
    body.end = {
      date: null,
      dateTime: `${event.end_date ?? event.start_date}T${event.end_time ?? event.start_time ?? '10:00:00'}`,
      timeZone: tz,
    }
  }

  // An empty list clears the recurrence of a series that stopped repeating.
  if (!instance) body.recurrence = recurrenceLines(event)

  return body
}

function exdatesOf(item) {
  const dates = []
  for (const line of item.recurrence ?? []) {
    if (!/^EXDATE/i.test(line)) continue
    for (const value of line.slice(line.indexOf(':') + 1).split(',')) {
      const m = value.match(/^(\d{4})(\d{2})(\d{2})/)
      if (m) dates.push(`${m[1]}-${m[2]}-${m[3]}`)
    }
  }
  return dates
}

// The day an instance of a series was originally generated for.
const originalDay = item => (item.originalStartTime?.date ?? item.originalStartTime?.dateTime ?? '').slice(0, 10)

const timeOfDateTime = value => (value ? `${String(value).slice(11, 16)}:00` : null)

export function fromGoogle(item) {
  const allDay = !!item.start?.date
  const startDate = allDay ? item.start.date : (item.start?.dateTime ?? '').slice(0, 10)
  const endRaw = allDay ? item.end?.date : (item.end?.dateTime ?? '').slice(0, 10)

  const rruleLine = (item.recurrence ?? []).find(l => l.startsWith('RRULE:'))
  const rrule = rruleLine ? rruleLine.slice(6) : null
  const untilMatch = rrule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/)

  const mapped = {
    title: item.summary ?? '',
    notes: ownNotes(item.description),
    location: item.location || null,
    all_day: allDay,
    start_date: startDate,
    start_time: allDay ? null : timeOfDateTime(item.start?.dateTime),
    end_date: allDay ? fromGoogleAllDayEnd(endRaw || startDate) : (endRaw || startDate),
    end_time: allDay ? null : timeOfDateTime(item.end?.dateTime),
    // The UNTIL is carried in rrule_until where our own editor expects it, and
    // stripped from the rule so the two can't disagree.
    rrule: rrule ? rrule.replace(/;?UNTIL=[^;]*/i, '') || null : null,
    rrule_until: untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null,
    exdates: exdatesOf(item),
  }

  // Only carried when present. An event created in Google has neither, and
  // editing it there must not turn a local class into a plain event or wipe
  // its links.
  const props = item.extendedProperties?.private ?? {}
  if (props.mtKind) mapped.kind = props.mtKind
  if (props.mtLinks) {
    try {
      const links = JSON.parse(props.mtLinks)
      if (Array.isArray(links)) mapped.links = links
    } catch { /* keep the local links */ }
  }
  return mapped
}

// Only the fields that actually travel. Anything else differing (our own
// priority, a topic link) must not count as a remote change.
const SYNCED_FIELDS = [
  'title', 'notes', 'location', 'all_day',
  'start_date', 'start_time', 'end_date', 'end_time', 'rrule', 'rrule_until',
]

// Postgres hands back 'HH:MM:SS', an offline row may still hold 'HH:MM'.
function norm(field, value) {
  if (value == null || value === '') return null
  if (field.endsWith('_time')) return String(value).slice(0, 5)
  return value
}

function sameContent(local, mapped) {
  if (!SYNCED_FIELDS.every(f => norm(f, local[f]) === norm(f, mapped[f]))) return false
  if (mapped.kind != null && mapped.kind !== (local.kind ?? 'event')) return false
  if (mapped.links != null && JSON.stringify(mapped.links) !== JSON.stringify(local.links ?? [])) return false
  return true
}

// The checklist is part of what was pushed, so ticking one of the event's
// todos re-pushes the event. It never counts as a remote change: fromGoogle
// strips it, and sameContent doesn't look at notes' tail.
function contentHash(event, checklist = null) {
  return JSON.stringify([
    ...SYNCED_FIELDS.map(f => norm(f, event[f])),
    event.kind ?? 'event',
    event.links ?? [],
    [...(event.exdates ?? [])].sort(),
    event.calendar_id ?? null,
    event.recurrence_date ?? null,
    checklist,
  ])
}

// Event id → its todos as checklist text: the todos linked to the event and
// their subtrees, in the order the event editor shows them.
export function buildChecklists(todos) {
  const children = new Map()
  for (const td of todos) {
    if (!td.parent_id) continue
    if (!children.has(td.parent_id)) children.set(td.parent_id, [])
    children.get(td.parent_id).push(td)
  }
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  const lines = new Map()
  const walk = (td, depth, out, seen) => {
    if (seen.has(td.id)) return // a parent loop in bad data must not hang the sync
    seen.add(td.id)
    out.push(`${'  '.repeat(depth)}${td.completed ? '☑' : '☐'} ${td.text ?? ''}`)
    for (const child of [...(children.get(td.id) ?? [])].sort(bySort)) walk(child, depth + 1, out, seen)
  }
  for (const root of todos.filter(td => td.event_id).sort(bySort)) {
    if (!lines.has(root.event_id)) lines.set(root.event_id, [])
    walk(root, 0, lines.get(root.event_id), new Set())
  }
  return new Map([...lines].map(([eventId, out]) => [eventId, out.join('\n')]))
}

const union = (a = [], b = []) => [...new Set([...a, ...b])].sort()

// ── Sync ───────────────────────────────────────────────────────────────────

// `ctx` keeps this file free of React:
//   { events, allCalendars, upsertEvent, removeEvent }.
export async function syncCalendar(calendar, ctx) {
  const result = { pulled: 0, pushed: 0, deleted: 0, errors: 0, lastError: null }
  if (!calendar?.google_calendar_id) return result
  const googleId = calendar.google_calendar_id
  let state = await loadState(calendar.id)

  // The event's todos, as the checklist in its Google description — null when
  // that is switched off (`ctx.checklists` absent) or the event has none.
  const checklistOf = e => ctx.checklists?.get(e.id) ?? null
  const hashOf = e => contentHash(e, checklistOf(e))
  const toRemote = (e, opts) => toGoogle(e, { ...opts, checklist: checklistOf(e) })

  // The working copy. Every row saved during this run replaces its entry here,
  // so the push step sends what the rows look like *after* the pull — pushing
  // from the snapshot taken before it would PATCH a change just pulled from
  // Google straight back to its old value.
  const rows = new Map(ctx.events.map(e => [e.id, e]))
  // Mutated as items are processed — not a one-shot snapshot. Google can (and
  // does) resend the same item within one pull, whether from a page-boundary
  // overlap or a resumed sync; without updating this in place, the second
  // occurrence would look "new" again and collide with the row the first
  // occurrence just inserted (google_calendar_id, google_event_id is unique).
  const byGoogleId = new Map()
  for (const e of rows.values()) {
    if (e.google_event_id && e.google_calendar_id === googleId) byGoogleId.set(e.google_event_id, e)
  }

  const remember = (saved, { clean = true } = {}) => {
    rows.set(saved.id, saved)
    if (saved.google_event_id && saved.google_calendar_id === googleId) byGoogleId.set(saved.google_event_id, saved)
    if (clean) state.lastPushed[saved.id] = hashOf(saved)
    return saved
  }
  const forget = row => {
    rows.delete(row.id)
    if (row.google_event_id) byGoogleId.delete(row.google_event_id)
    delete state.lastPushed[row.id]
  }
  const fail = (what, e) => {
    console.error(`googleSync: ${calendar.name}: ${what} failed`, e)
    result.errors += 1
    result.lastError = e?.message ?? String(e)
  }

  // ── Pull, one item ──
  async function applyRemote(item) {
    const local = byGoogleId.get(item.id)
    // Moved to a different local calendar: that calendar's sync owns it now.
    if (local && local.calendar_id !== calendar.id) return
    const master = item.recurringEventId ? byGoogleId.get(item.recurringEventId) : null

    if (item.status === 'cancelled') {
      if (local) {
        await ctx.removeEvent(local.id, { skipGoogle: true })
        forget(local)
        result.deleted += 1
      }
      // One occurrence deleted in Google arrives as a cancelled instance of
      // the series, never as a change to the series itself.
      const day = originalDay(item)
      if (master && day && !(master.exdates ?? []).includes(day)) {
        const wasClean = state.lastPushed[master.id] === hashOf(master)
        remember(await ctx.upsertEvent({ ...master, exdates: union(master.exdates, [day]) }), { clean: wasClean })
        result.deleted += 1
      }
      return
    }

    const mapped = fromGoogle(item)
    if (!mapped.start_date) return

    if (!local) {
      const row = {
        ...mapped,
        kind: mapped.kind ?? 'event',
        links: mapped.links ?? [],
        calendar_id: calendar.id,
        google_event_id: item.id,
        google_calendar_id: googleId,
        reminders: [],
      }
      if (master) {
        // One occurrence moved or edited in Google becomes a detached override
        // of our series — what dragging one occurrence creates locally — rather
        // than a free-standing event drawn on top of the generated slot.
        Object.assign(row, {
          rrule: null,
          rrule_until: null,
          exdates: [],
          kind: mapped.kind ?? master.kind ?? 'event',
          topic_id: master.topic_id ?? null,
          recurrence_parent_id: master.id,
          recurrence_date: originalDay(item),
        })
      }
      remember(await ctx.upsertEvent(row))
      result.pulled += 1
      return
    }

    // Our own write, echoed back. Writing it again would bump updated_at.
    if (sameContent(local, mapped)) {
      if (state.lastPushed[local.id] == null) state.lastPushed[local.id] = hashOf(local)
      return
    }

    // Changed on both sides since the last sync: the newer edit wins.
    const localDirty = state.lastPushed[local.id] !== hashOf(local)
    const remoteNewer = Date.parse(item.updated ?? 0) >= Date.parse(local.updated_at ?? 0)
    if (localDirty && !remoteNewer) return // the push below sends ours

    remember(await ctx.upsertEvent({
      ...local,
      ...mapped,
      // Occurrences deleted in Google are cancelled instances, not EXDATE
      // lines, so Google's list alone would drop them again.
      exdates: union(local.exdates, mapped.exdates),
    }))
    result.pulled += 1
  }

  // ── Push, one row ──
  async function insertHere(event) {
    const created = await insertEvent(googleId, toRemote(event))
    try {
      remember(await ctx.upsertEvent({ ...event, google_event_id: created.id, google_calendar_id: googleId }))
    } catch (e) {
      // Without the id stored locally the next run would insert it again.
      await deleteEvent(googleId, created.id).catch(() => {})
      throw e
    }
  }

  async function pushOverride(event) {
    const master = rows.get(event.recurrence_parent_id)
    // The series isn't on Google (yet): nothing to attach to until it is.
    if (!master?.google_event_id || master.google_calendar_id !== googleId) return

    if (event.google_event_id) {
      if (state.lastPushed[event.id] === hashOf(event)) return
      await patchEvent(googleId, event.google_event_id, toRemote(event, { instance: true }))
      state.lastPushed[event.id] = hashOf(event)
      result.pushed += 1
      return
    }

    const day = event.recurrence_date
    if (!day) return
    const instances = await listInstances(googleId, master.google_event_id, {
      timeMin: `${addDays(day, -1)}T00:00:00Z`,
      timeMax: `${addDays(day, 2)}T00:00:00Z`,
    })
    const instance = instances.find(i => originalDay(i) === day)
    if (!instance) return // the series on Google no longer has that date
    await patchEvent(googleId, instance.id, toRemote(event, { instance: true }))
    remember(await ctx.upsertEvent({ ...event, google_event_id: instance.id, google_calendar_id: googleId }))
    result.pushed += 1
  }

  async function pushOne(event) {
    // A row still tied to this Google calendar that now lives in another local
    // calendar. If that calendar is linked, its own sync moves the event over;
    // if not, it no longer belongs on Google at all.
    if (event.calendar_id !== calendar.id) {
      if (event.google_calendar_id !== googleId || !event.google_event_id) return
      const target = (ctx.allCalendars ?? []).find(c => c.id === event.calendar_id)
      if (target?.google_sync && target.google_calendar_id) return
      if (!target) return // not loaded here; leave it alone
      await deleteEvent(googleId, event.google_event_id)
      forget(event)
      rows.set(event.id, await ctx.upsertEvent({ ...event, google_event_id: null, google_calendar_id: null }))
      result.deleted += 1
      return
    }

    if (event.recurrence_parent_id) return pushOverride(event)

    if (!event.google_event_id) {
      await insertHere(event)
      result.pushed += 1
      return
    }

    // Moved here from another linked calendar. Google's own move keeps the id,
    // so the old calendar is left with no copy.
    if (event.google_calendar_id && event.google_calendar_id !== googleId) {
      try {
        await moveEvent(event.google_calendar_id, event.google_event_id, googleId)
        await patchEvent(googleId, event.google_event_id, toRemote(event))
        remember(await ctx.upsertEvent({ ...event, google_calendar_id: googleId }))
      } catch (e) {
        // The old calendar is gone or no longer writable: start a fresh copy.
        console.warn('googleSync: move failed, re-inserting', e)
        await deleteEvent(event.google_calendar_id, event.google_event_id).catch(() => {})
        await insertHere(event)
      }
      result.pushed += 1
      return
    }

    if (state.lastPushed[event.id] === hashOf(event)) return
    await patchEvent(googleId, event.google_event_id, toRemote(event))
    state.lastPushed[event.id] = hashOf(event)
    result.pushed += 1
  }

  try {
    // 1. Deletions queued while offline, first — so a row deleted here and
    // re-created there doesn't get resurrected by the pull below.
    const stillPending = []
    for (const googleEventId of state.pendingDeletes) {
      try { await deleteEvent(googleId, googleEventId); result.deleted += 1 } catch { stillPending.push(googleEventId) }
    }
    state.pendingDeletes = stillPending

    // 2. Pull
    let pageToken = null
    let syncToken = state.syncToken
    let nextSyncToken = null
    const items = []
    for (;;) {
      let page
      try {
        page = await listEvents(googleId, {
          syncToken,
          pageToken,
          timeMin: syncToken ? undefined : `${addDays(dayKey(), -FULL_SYNC_DAYS_BACK)}T00:00:00Z`,
        })
      } catch (e) {
        if (!(e instanceof SyncTokenGone)) throw e
        // Token too old: start over with a full window and forget what we
        // thought was in step, so nothing is silently skipped.
        syncToken = null
        pageToken = null
        items.length = 0
        state = freshState(state.pendingDeletes)
        continue
      }
      items.push(...page.items)
      if (page.nextPageToken) { pageToken = page.nextPageToken; continue }
      nextSyncToken = page.nextSyncToken
      break
    }

    // Series before their exceptions, so an override arriving in the same
    // pull as its series can be attached to it.
    items.sort((a, b) => (a.recurringEventId ? 1 : 0) - (b.recurringEventId ? 1 : 0))
    let pullFailed = false
    for (const item of items) {
      try { await applyRemote(item) } catch (e) { pullFailed = true; fail(`pull ${item.id}`, e) }
    }
    // A change that failed to apply must come back next time, so the token
    // only advances on a clean pull.
    if (!pullFailed && nextSyncToken) state.syncToken = nextSyncToken

    // 3. Push. Series before overrides, so a series inserted in this run
    // already has its Google id when its detached occurrences look for it.
    const ordered = [...rows.values()].sort((a, b) =>
      (a.recurrence_parent_id ? 1 : 0) - (b.recurrence_parent_id ? 1 : 0))
    for (const row of ordered) {
      const current = rows.get(row.id)
      if (!current) continue
      try { await pushOne(current) } catch (e) { fail(`push ${row.id}`, e) }
    }
  } finally {
    // Even after a failure: the token and hashes from the part that worked
    // must not be thrown away.
    await saveState(calendar.id, state)
  }
  return result
}

export function isRruleSupported(rrule) {
  return !rrule || !!parseRrule(rrule)
}
