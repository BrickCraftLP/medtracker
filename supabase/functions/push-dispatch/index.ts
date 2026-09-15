import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPush, type VapidKeys } from './webpush.ts'

// Sends due reminders (called every minute by pg_cron, only when something is
// due — see supabase_migration_push.sql) and the "new version" push (called by
// scripts/notify-update.mjs). Deploy with --no-verify-jwt: callers authenticate
// with the shared CRON_SECRET instead of a user JWT.

type Kind =
  | 'scheduledSessions'
  | 'todoDue'
  | 'streak'
  | 'activeSession'
  | 'updates'
  | 'calendarEvents'
  | 'assignmentDue'
  | 'examSoon'
type Lang = 'de' | 'en'

interface Item {
  user_id: string
  kind: Kind
  ref_key: string
  payload: Record<string, any>
}

interface Message {
  title: string
  body: string
  url: string
  tag: string
}

const TEXT = {
  de: {
    sessionSoon: (m: number) => (m > 0 ? `📚 Session in ${m} Min.` : '📚 Deine Session beginnt jetzt'),
    sessionsSoon: (n: number) => `📚 ${n} Sessions stehen an`,
    todoDue: '✅ To-do fällig',
    todosDue: (n: number) => `✅ ${n} To-dos fällig`,
    streakTitle: '🔥 Deine Serie ist in Gefahr',
    streakBody: 'Du hast heute noch nicht geübt – eine kurze Session hält sie am Leben.',
    activeTitle: '⏱️ Deine Session läuft noch',
    activeBody: 'Sie läuft seit über 30 Minuten im Hintergrund. Weitermachen oder beenden?',
    updateTitle: '✨ MedTracker-Update',
    updateBody: (v: string) => `Version ${v} ist da – öffne die App zum Aktualisieren.`,
    eventSoon: (m: number) => (m > 0 ? `📅 Termin in ${m} Min.` : '📅 Dein Termin beginnt jetzt'),
    eventsSoon: (n: number) => `📅 ${n} Termine stehen an`,
    assignmentTitle: '📝 Abgabe fällig',
    assignmentsTitle: (n: number) => `📝 ${n} Abgaben fällig`,
    assignmentProgress: (done: number, total: number) => `${done}/${total} Teilaufgaben erledigt`,
    examTitle: (d: number) => (d === 1 ? '🎓 Prüfung morgen' : `🎓 Prüfung in ${d} Tagen`),
    examsTitle: (n: number) => `🎓 ${n} Prüfungen stehen an`,
  },
  en: {
    sessionSoon: (m: number) => (m > 0 ? `📚 Session in ${m} min` : '📚 Your session starts now'),
    sessionsSoon: (n: number) => `📚 ${n} sessions coming up`,
    todoDue: '✅ To-do due',
    todosDue: (n: number) => `✅ ${n} to-dos due`,
    streakTitle: '🔥 Your streak is at risk',
    streakBody: "You haven't practised today yet – a short session keeps it alive.",
    activeTitle: '⏱️ Your session is still running',
    activeBody: "It's been running in the background for over 30 minutes. Continue or finish?",
    updateTitle: '✨ MedTracker update',
    updateBody: (v: string) => `Version ${v} is ready – open the app to update.`,
    eventSoon: (m: number) => (m > 0 ? `📅 Event in ${m} min` : '📅 Your event starts now'),
    eventsSoon: (n: number) => `📅 ${n} events coming up`,
    assignmentTitle: '📝 Assignment due',
    assignmentsTitle: (n: number) => `📝 ${n} assignments due`,
    assignmentProgress: (done: number, total: number) => `${done}/${total} subtasks done`,
    examTitle: (d: number) => (d === 1 ? '🎓 Exam tomorrow' : `🎓 Exam in ${d} days`),
    examsTitle: (n: number) => `🎓 ${n} exams coming up`,
  },
}

const clip = (s: string, n = 180) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function sessionLine(p: Record<string, any>): string {
  return [[p.emoji, p.topic].filter(Boolean).join(' '), p.time].filter(Boolean).join(' · ')
}

// One notification per user and kind, so a burst (five to-dos due at 08:00)
// doesn't turn into five banners.
function buildMessage(kind: Kind, items: Item[], lang: Lang): Message {
  const t = TEXT[lang]
  const first = items[0].payload
  switch (kind) {
    case 'scheduledSessions':
      return items.length === 1
        ? { title: t.sessionSoon(first.minutes), body: clip([sessionLine(first), first.note].filter(Boolean).join(' – ')), url: '/home', tag: kind }
        : { title: t.sessionsSoon(items.length), body: clip(items.map((i) => sessionLine(i.payload)).join(', ')), url: '/home', tag: kind }
    case 'todoDue':
      return items.length === 1
        ? { title: t.todoDue, body: clip([first.text, first.time].filter(Boolean).join(' · ')), url: '/home', tag: kind }
        : { title: t.todosDue(items.length), body: clip(items.map((i) => i.payload.text).join(', ')), url: '/home', tag: kind }
    case 'streak':
      return { title: t.streakTitle, body: t.streakBody, url: '/home', tag: kind }
    case 'activeSession':
      return { title: t.activeTitle, body: t.activeBody, url: '/home', tag: kind }
    case 'updates':
      return { title: t.updateTitle, body: t.updateBody(first.version), url: '/settings', tag: kind }
    case 'calendarEvents': {
      // A service worker can't restore router state, so the day travels in the
      // query string; CalendarScreen reads ?d= on mount.
      const url = `/calendar?d=${first.date}`
      return items.length === 1
        ? {
          title: t.eventSoon(first.minutes),
          body: clip([first.title, first.time, first.location].filter(Boolean).join(' · ')),
          url,
          tag: kind,
        }
        : {
          title: t.eventsSoon(items.length),
          body: clip(items.map((i) => [i.payload.time, i.payload.title].filter(Boolean).join(' ')).join(', ')),
          url,
          tag: kind,
        }
    }
    case 'assignmentDue': {
      const url = `/calendar?d=${first.date}`
      return items.length === 1
        ? {
          title: t.assignmentTitle,
          body: clip([first.title, first.total ? t.assignmentProgress(first.done, first.total) : null]
            .filter(Boolean).join(' – ')),
          url,
          tag: kind,
        }
        : {
          title: t.assignmentsTitle(items.length),
          body: clip(items.map((i) => i.payload.title).join(', ')),
          url,
          tag: kind,
        }
    }
    case 'examSoon':
      return items.length === 1
        ? { title: t.examTitle(first.days), body: clip(first.title), url: '/exams', tag: kind }
        : {
          title: t.examsTitle(items.length),
          body: clip(items.map((i) => i.payload.title).join(', ')),
          url: '/exams',
          tag: kind,
        }
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const vapid: VapidKeys = {
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
      privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
      subject: Deno.env.get('VAPID_SUBJECT')!,
    }

    let claim
    if (body?.kind === 'updates') {
      if (!body.version) return json({ error: 'Missing version' }, 400)
      claim = await admin.rpc('claim_update_notifications', { p_version: String(body.version) })
    } else {
      claim = await admin.rpc('claim_due_notifications')
    }
    if (claim.error) throw claim.error
    const items = (claim.data ?? []) as Item[]
    if (items.length === 0) return json({ sent: 0 })

    const userIds = [...new Set(items.map((i) => i.user_id))]
    const [prefs, subs] = await Promise.all([
      admin.from('notification_prefs').select('user_id, language').in('user_id', userIds),
      admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
    ])
    if (prefs.error) throw prefs.error
    if (subs.error) throw subs.error

    const langOf = new Map(prefs.data.map((p) => [p.user_id, (p.language === 'en' ? 'en' : 'de') as Lang]))

    const groups = new Map<string, Item[]>()
    for (const item of items) {
      const key = `${item.user_id}|${item.kind}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }

    const jobs: Promise<{ subId: string; res: Response }>[] = []
    for (const group of groups.values()) {
      const { user_id, kind } = group[0]
      const payload = JSON.stringify(buildMessage(kind, group, langOf.get(user_id) ?? 'de'))
      // Reminders are worthless once stale; an update notice can wait a day.
      const opts = kind === 'updates' ? { ttl: 86400, urgency: 'normal' as const } : { ttl: 3600, urgency: 'high' as const }
      for (const sub of subs.data.filter((s) => s.user_id === user_id)) {
        jobs.push(sendPush(sub, payload, vapid, opts).then((res) => ({ subId: sub.id, res })))
      }
    }

    let sent = 0
    let failed = 0
    const gone: string[] = []
    for (const result of await Promise.allSettled(jobs)) {
      if (result.status === 'rejected') {
        failed++
        console.error('push error', result.reason)
        continue
      }
      const { subId, res } = result.value
      if (res.ok) {
        sent++
        await res.body?.cancel()
      } else if (res.status === 404 || res.status === 410) {
        // Subscription expired or the app was removed from the device.
        gone.push(subId)
        await res.body?.cancel()
      } else {
        failed++
        console.error(`push rejected (${res.status})`, await res.text().catch(() => ''))
      }
    }

    if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)

    return json({ claimed: items.length, sent, failed, removed: gone.length })
  } catch (error) {
    console.error(error)
    return json({ error: (error as Error).message }, 500)
  }
})
