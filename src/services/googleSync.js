// Two-way sync between a MedTracker calendar and a Google calendar.
//
// Shape of the thing:
//   pull  — incremental via Google's syncToken (falls back to a full window
//           when the token has expired), newest change wins;
//   push  — every local row whose updated_at differs from the revision we
//           last pushed;
//   state — sync token and per-row "last pushed revision" live in IndexedDB,
//           not in Postgres, because each device syncs against Google
//           independently. A shared token would make two devices skip each
//           other's changes.
//
// The one non-obvious guard is sameContent(): Google echoes our own writes
// back on the next pull, and applying them would bump updated_at, which would
// schedule another push, forever. Comparing the mapped fields before writing
// breaks that loop.

import { getMeta, setMeta } from './offlineDB.js'
import {
  listEvents, insertEvent, patchEvent, deleteEvent, SyncTokenGone,
} from './googleCalendar.js'
import { addDays, dayKey, hhmm } from '../utils/calendar/eventModel.js'
import { parseRrule } from '../utils/calendar/recurrence.js'

const FULL_SYNC_DAYS_BACK = 90
const stateKey = calendarId => `googleSync:${calendarId}`

const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna'

async function loadState(calendarId) {
  return (await getMeta(stateKey(calendarId))) ?? { syncToken: null, lastPushed: {}, pendingDeletes: [] }
}

const saveState = (calendarId, state) => setMeta(stateKey(calendarId), state)

// Recorded when a synced row is deleted locally, so the deletion still
// reaches Google after being offline (or after the tab was closed).
export async function noteLocalDelete(calendar, googleEventId) {
  if (!calendar?.id || !googleEventId) return
  const state = await loadState(calendar.id)
  if (!state.pendingDeletes.includes(googleEventId)) state.pendingDeletes.push(googleEventId)
  delete state.lastPushed[googleEventId]
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
  if (!event.rrule) return undefined
  const lines = []
  let rule = event.rrule
  if (event.rrule_until && !/UNTIL=/i.test(rule)) {
    // UNTIL must match DTSTART's value type: a bare date for all-day events,
    // a UTC timestamp for timed ones.
    rule += event.all_day
      ? `;UNTIL=${compact(event.rrule_until)}`
      : `;UNTIL=${compact(event.rrule_until)}T235959Z`
  }
  lines.push(`RRULE:${rule}`)
  for (const date of event.exdates ?? []) {
    lines.push(event.all_day
      ? `EXDATE;VALUE=DATE:${compact(date)}`
      : `EXDATE;TZID=${userTimeZone()}:${compact(date)}T${(event.start_time ?? '09:00:00').replace(/:/g, '')}`)
  }
  return lines
}

export function toGoogle(event) {
  const tz = userTimeZone()
  const body = {
    summary: event.title || '—',
    description: event.notes ?? undefined,
    location: event.location ?? undefined,
    status: 'confirmed',
    // Round-trips the fields Google has no home for, so a MedTracker event
    // that has been to Google and back is still an assignment with its links.
    extendedProperties: {
      private: {
        mtKind: event.kind ?? 'event',
        mtLinks: JSON.stringify(event.links ?? []).slice(0, 1024),
      },
    },
  }

  if (event.all_day) {
    body.start = { date: event.start_date }
    body.end = { date: toGoogleAllDayEnd(event.end_date ?? event.start_date) }
  } else {
    body.start = { dateTime: `${event.start_date}T${event.start_time ?? '09:00:00'}`, timeZone: tz }
    body.end = {
      dateTime: `${event.end_date ?? event.start_date}T${event.end_time ?? event.start_time ?? '10:00:00'}`,
      timeZone: tz,
    }
  }

  const recurrence = recurrenceLines(event)
  if (recurrence) body.recurrence = recurrence

  return body
}

export function fromGoogle(item) {
  const allDay = !!item.start?.date
  const startDate = allDay ? item.start.date : (item.start?.dateTime ?? '').slice(0, 10)
  const endRaw = allDay ? item.end?.date : (item.end?.dateTime ?? '').slice(0, 10)

  let links = []
  try { links = JSON.parse(item.extendedProperties?.private?.mtLinks ?? '[]') } catch { links = [] }

  const rruleLine = (item.recurrence ?? []).find(l => l.startsWith('RRULE:'))
  const rrule = rruleLine ? rruleLine.slice(6) : null
  const untilMatch = rrule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/)

  return {
    title: item.summary ?? '',
    notes: item.description ?? null,
    location: item.location ?? null,
    kind: item.extendedProperties?.private?.mtKind ?? 'event',
    all_day: allDay,
    start_date: startDate,
    start_time: allDay ? null : `${hhmm((item.start?.dateTime ?? '').slice(11, 19))}:00`,
    end_date: allDay ? fromGoogleAllDayEnd(endRaw || startDate) : (endRaw || startDate),
    end_time: allDay ? null : `${hhmm((item.end?.dateTime ?? '').slice(11, 19))}:00`,
    // The UNTIL is carried in rrule_until where our own editor expects it, and
    // stripped from the rule so the two can't disagree.
    rrule: rrule ? rrule.replace(/;?UNTIL=[^;]*/i, '') || null : null,
    rrule_until: untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null,
    links: Array.isArray(links) ? links : [],
  }
}

// Only the fields that actually travel. Anything else differing (our own
// priority, a topic link) must not count as a remote change.
const SYNCED_FIELDS = [
  'title', 'notes', 'location', 'all_day',
  'start_date', 'start_time', 'end_date', 'end_time', 'rrule', 'rrule_until',
]

function sameContent(local, mapped) {
  return SYNCED_FIELDS.every(field => (local[field] ?? null) === (mapped[field] ?? null))
}

// ── Sync ───────────────────────────────────────────────────────────────────

// `ctx` keeps this file free of React: { events, upsertEvent, removeEvent }.
export async function syncCalendar(calendar, ctx) {
  if (!calendar?.google_calendar_id) return { pulled: 0, pushed: 0, deleted: 0 }
  const googleId = calendar.google_calendar_id
  let state = await loadState(calendar.id)
  const result = { pulled: 0, pushed: 0, deleted: 0 }

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
      // thought we had pushed, so nothing is silently skipped.
      syncToken = null
      pageToken = null
      state = { syncToken: null, lastPushed: {}, pendingDeletes: state.pendingDeletes }
      continue
    }
    items.push(...page.items)
    if (page.nextPageToken) { pageToken = page.nextPageToken; continue }
    state.syncToken = page.nextSyncToken ?? state.syncToken
    break
  }

  // Mutated as items are processed — not a one-shot snapshot. Google can (and
  // does) resend the same item within one pull, whether from a page-boundary
  // overlap or a resumed sync; without updating this in place, the second
  // occurrence would look "new" again and collide with the row the first
  // occurrence just inserted (google_calendar_id, google_event_id is unique).
  const byGoogleId = new Map(
    ctx.events.filter(e => e.google_event_id).map(e => [e.google_event_id, e]),
  )

  for (const item of items) {
    const local = byGoogleId.get(item.id)

    if (item.status === 'cancelled') {
      if (local) {
        await ctx.removeEvent(local.id, { skipGoogle: true })
        delete state.lastPushed[local.id]
        byGoogleId.delete(item.id)
        result.deleted += 1
      }
      continue
    }
    // A single occurrence Google moved out of its series arrives with its own
    // id; we take it as a plain event rather than trying to detach ours.
    const mapped = fromGoogle(item)
    if (!mapped.start_date) continue

    if (!local) {
      const saved = await ctx.upsertEvent({
        ...mapped,
        calendar_id: calendar.id,
        google_event_id: item.id,
        google_calendar_id: googleId,
        reminders: [],
        exdates: [],
      })
      byGoogleId.set(item.id, saved)
      state.lastPushed[saved.id] = saved.updated_at ?? null
      result.pulled += 1
      continue
    }

    // Our own write, echoed back. Writing it again would bump updated_at and
    // schedule a pointless push next round.
    if (sameContent(local, mapped)) {
      state.lastPushed[local.id] = local.updated_at ?? state.lastPushed[local.id] ?? null
      continue
    }

    const remoteUpdated = Date.parse(item.updated ?? 0)
    const localUpdated = Date.parse(local.updated_at ?? 0)
    if (remoteUpdated >= localUpdated) {
      const saved = await ctx.upsertEvent({ ...local, ...mapped })
      byGoogleId.set(item.id, saved)
      state.lastPushed[saved.id] = saved.updated_at ?? null
      result.pulled += 1
    }
    // Otherwise the local row is newer and the push below sends it out.
  }

  // 3. Push
  for (const event of ctx.events) {
    if (event.calendar_id !== calendar.id) continue
    if (event.recurrence_parent_id) continue // detached occurrences stay local for now

    if (!event.google_event_id) {
      const created = await insertEvent(googleId, toGoogle(event))
      const saved = await ctx.upsertEvent({
        ...event,
        google_event_id: created.id,
        google_calendar_id: googleId,
      })
      state.lastPushed[saved.id] = saved.updated_at ?? null
      result.pushed += 1
      continue
    }

    if (state.lastPushed[event.id] === (event.updated_at ?? null)) continue
    await patchEvent(googleId, event.google_event_id, toGoogle(event))
    state.lastPushed[event.id] = event.updated_at ?? null
    result.pushed += 1
  }

  await saveState(calendar.id, state)
  return result
}

// Every connected calendar, one after another. One calendar failing must not
// stop the others — a revoked share or a deleted Google calendar is common.
export async function syncAllCalendars(calendars, ctx) {
  const totals = { pulled: 0, pushed: 0, deleted: 0, failed: 0 }
  for (const calendar of calendars) {
    if (!calendar.google_sync || !calendar.google_calendar_id) continue
    try {
      const one = await syncCalendar(calendar, ctx)
      totals.pulled += one.pulled
      totals.pushed += one.pushed
      totals.deleted += one.deleted
    } catch (e) {
      console.error(`googleSync: ${calendar.name} failed`, e)
      totals.failed += 1
    }
  }
  return totals
}

export function isRruleSupported(rrule) {
  return !rrule || !!parseRrule(rrule)
}
