// Deeper answers across calendar, todos, exams and study history:
//   weekly_review      — the last 7 days against the 7 before
//   workload_forecast  — the next 14 days: how full, crunch days, what is due
//   exam_plan          — sessions needed until an exam, placed in free windows
//   how_am_i_doing     — the big picture and one concrete next step

import { registerIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { extract } from '../engine/parse/index.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { summarize, accuracyTrend, fmtPctShort, fmtDelta, sessionDay } from '../engine/studyStats.js'
import { getProfile } from '../engine/profile.js'
import { contextRef } from '../engine/references.js'
import { addDays, daysBetween } from '../../utils/calendar/eventModel.js'
import { calcCurrentStreak } from '../../utils/calculations/streakTrackerCalcs.js'
import { freeSlots } from './calendar.js'
import { bookedMinutes } from './overview.js'
import { findExam } from './exams.js'

const pctDiff = (a, b) => (a != null && b != null ? a - b : null)
const minutesDelta = (api, now, before) => {
  const d = now - before
  if (!before && !now) return ''
  return d === 0 ? api.L('same as before', 'gleich wie davor') : `${d > 0 ? '+' : '−'}${fmtDuration(Math.abs(d), api.lang)}`
}

// ── Weekly review ──────────────────────────────────────────────────────────

registerIntent({
  id: 'weekly_review',
  describe: 'Review of the last 7 days against the week before: study time, sessions, accuracy per topic, todos done and overdue, planned study that did not happen',
  slots: {},
  examples: ['How was my week?', 'Wochenrückblick'],
  completions: { de: ['Wochenrückblick', 'Wie war meine Woche?'], en: ['Weekly review', 'How was my week?'] },
  match(text) {
    const hit = /\b(wochenrueckblick|rueckblick|weekly review|week in review|recap|wie war (?:meine|die) (?:letzte )?woche|how was (?:my|the|last) week|bilanz der woche|wochenbilanz|review (?:my|the|last) week|zusammenfassung (?:der|meiner) (?:letzten )?woche)\b/.test(text)
    return hit ? { score: 0.93, slots: {} } : null
  },
  execute(_, api) {
    const from = addDays(api.today, -6)
    const prevFrom = addDays(api.today, -13)
    const prevTo = addDays(api.today, -7)
    const now = summarize(api.sessions, { from, to: api.today })
    const before = summarize(api.sessions, { from: prevFrom, to: prevTo })
    const lines = [
      api.L(
        `📚 ${fmtDuration(now.minutes, 'en')} in ${now.sessions} sessions on ${now.activeDays} days (${minutesDelta(api, now.minutes, before.minutes)}).`,
        `📚 ${fmtDuration(now.minutes, 'de')} in ${now.sessions} Sessions an ${now.activeDays} Tagen (${minutesDelta(api, now.minutes, before.minutes)}).`,
      ),
    ]
    const accChange = pctDiff(now.accuracy, before.accuracy)
    if (now.accuracy != null) {
      lines.push(api.L(
        `🎯 ${fmtPctShort(now.accuracy)} correct${accChange != null ? ` (${fmtDelta(accChange)})` : ''}.`,
        `🎯 ${fmtPctShort(now.accuracy)} richtig${accChange != null ? ` (${fmtDelta(accChange)})` : ''}.`,
      ))
    }
    lines.push(api.L(`🔥 Streak: ${calcCurrentStreak(api.sessions)} days`, `🔥 Serie: ${calcCurrentStreak(api.sessions)} Tage`))

    // Planned study blocks without a session for that topic on that day.
    const studied = new Set(api.sessions.map(s => `${s.topic_id}|${sessionDay(s)}`))
    const planned = api.occurrences(from, api.today).filter(o => o.event.kind === 'study' && (o.date < api.today || o.endMin <= new Date().getHours() * 60))
    const missed = planned.filter(o => o.event.topic_id && !studied.has(`${o.event.topic_id}|${o.date}`))
    if (planned.length) {
      lines.push(api.L(
        `🗓 ${planned.length - missed.length} of ${planned.length} planned study blocks happened.`,
        `🗓 ${planned.length - missed.length} von ${planned.length} geplanten Lernblöcken fanden statt.`,
      ))
    }
    const dueThisWeek = api.todos.filter(t => t.due_date && t.due_date >= from && t.due_date <= api.today)
    const done = dueThisWeek.filter(t => t.completed).length
    const overdue = api.todos.filter(t => !t.completed && t.due_date && t.due_date < api.today)
    if (dueThisWeek.length || overdue.length) {
      lines.push(api.L(
        `✅ ${done} of ${dueThisWeek.length} todos due this week done${overdue.length ? ` · ${overdue.length} overdue` : ''}.`,
        `✅ ${done} von ${dueThisWeek.length} fälligen Todos erledigt${overdue.length ? ` · ${overdue.length} überfällig` : ''}.`,
      ))
    }

    const items = api.topics.map(t => {
      const a = summarize(api.sessions, { from, to: api.today, topicId: t.id })
      const b = summarize(api.sessions, { from: prevFrom, to: prevTo, topicId: t.id })
      return { t, a, b, delta: pctDiff(a.accuracy, b.accuracy) }
    }).filter(x => x.a.sessions || x.b.sessions)
      .sort((x, y) => y.a.minutes - x.a.minutes)
      .map(({ t, a, b, delta }) => ({
        topicId: t.id,
        label: t.name,
        value: fmtDuration(a.minutes, api.lang),
        sub: `${minutesDelta(api, a.minutes, b.minutes)}${a.accuracy != null ? ` · ${fmtPctShort(a.accuracy)}` : ''}${delta != null ? ` (${fmtDelta(delta)})` : ''}`,
        trend: delta == null ? null : delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'flat',
        query: api.L(`Is ${t.name} improving?`, `Wird ${t.name} besser?`),
      }))
    const idle = api.topics.filter(t => !summarize(api.sessions, { from, to: api.today, topicId: t.id }).sessions).map(t => t.name)

    const blocks = [{ type: 'text', data: { text: lines.join('\n') } }]
    if (items.length) blocks.push({ type: 'stats', data: { label: api.L('Per topic', 'Pro Thema'), items } })
    if (idle.length) blocks.push({ type: 'text', data: { text: api.L(`Not studied this week: ${idle.join(', ')}`, `Diese Woche nicht gelernt: ${idle.join(', ')}`) } })
    if (missed.length) blocks.push({ type: 'events', data: { items: missed.slice(0, 5).map(o => ({ eventId: o.event.id, date: o.date, startMin: o.startMin, endMin: o.endMin, allDay: o.allDay, showDate: true })), collapsed: true, label: api.L('Missed study blocks', 'Verpasste Lernblöcke') } })
    return {
      title: api.L('Your week in review', 'Dein Wochenrückblick'),
      blocks,
      followups: [api.L('How does next week look?', 'Wie sieht nächste Woche aus?'), api.L('What should I study today?', 'Was soll ich heute lernen?')],
    }
  },
})

// ── Workload forecast ──────────────────────────────────────────────────────

const CRUNCH_MINUTES = 6 * 60

registerIntent({
  id: 'workload_forecast',
  describe: 'Forecast of the coming days (default 14): booked hours per day, crunch days, exams and todos due, overdue backlog',
  slots: { days: slot('int', 'how many days ahead, default 14', { primary: true }) },
  examples: ['How busy will the next two weeks be?', 'Wie stressig werden die nächsten zwei Wochen?'],
  completions: { de: ['Wie stressig werden die nächsten zwei Wochen?', 'Was kommt auf mich zu?'], en: ['How busy will the next two weeks be?', "What's coming up?"] },
  match(text, { today }) {
    const hit = /\b(prognose|forecast|workload|arbeitslast|belastung|was kommt (?:alles )?(?:auf mich )?zu|what'?s coming(?: up)?|whats coming(?: up)?|wie (?:voll|stressig|busy|anstrengend) (?:wird|werden|sind|ist)|how (?:busy|stressful|full) (?:will|is|are)|crunch|engpaesse?|stressige tage|busy days)\b/.test(text)
    if (!hit) return null
    const x = extract(text, today)
    const days = x.range ? Math.min(31, daysBetween(today, x.range.to) + 1) : /\b(zwei|two|2) (?:wochen|weeks)\b/.test(text) ? 14 : null
    return { score: 0.92, slots: { days } }
  },
  execute(slots, api) {
    const n = Math.max(3, Math.min(31, Number(slots.days) || 14))
    const { dayStart, dayEnd } = api.settings
    const rows = []
    for (let i = 0; i < n; i++) {
      const d = addDays(api.today, i)
      const occ = api.occurrences(d, d).filter(o => !o.allDay)
      const booked = bookedMinutes(occ, dayStart, dayEnd)
      const exams = [...new Set([...api.exams.filter(x => x.exam_date === d).map(x => x.title), ...occ.filter(o => o.event.kind === 'exam').map(o => o.event.title)].filter(Boolean))]
      const due = api.todos.filter(t => !t.completed && t.due_date === d).length
      const nearExam = api.exams.some(x => x.exam_date && daysBetween(d, x.exam_date) >= 0 && daysBetween(d, x.exam_date) <= 2)
      rows.push({ d, booked, exams, due, crunch: booked >= CRUNCH_MINUTES || exams.length > 0 || (nearExam && booked >= 4 * 60) })
    }
    const total = rows.reduce((s, r) => s + r.booked, 0)
    const crunch = rows.filter(r => r.crunch)
    const busiest = [...rows].sort((a, b) => b.booked - a.booked)[0]
    const lightest = [...rows].filter(r => r.d > api.today).sort((a, b) => a.booked - b.booked)[0]
    const overdue = api.todos.filter(t => !t.completed && t.due_date && t.due_date < api.today).length
    const dueSoon = rows.reduce((s, r) => s + r.due, 0)
    const lines = [
      api.L(
        `📅 ${fmtDuration(total, 'en')} booked over the next ${n} days (Ø ${fmtDuration(Math.round(total / n), 'en')} a day).`,
        `📅 ${fmtDuration(total, 'de')} verplant in den nächsten ${n} Tagen (Ø ${fmtDuration(Math.round(total / n), 'de')} pro Tag).`,
      ),
      crunch.length
        ? api.L(`⚠️ ${crunch.length} crunch ${crunch.length === 1 ? 'day' : 'days'}: ${crunch.slice(0, 4).map(r => api.fmtDay(r.d)).join(', ')}.`, `⚠️ ${crunch.length} ${crunch.length === 1 ? 'stressiger Tag' : 'stressige Tage'}: ${crunch.slice(0, 4).map(r => api.fmtDay(r.d)).join(', ')}.`)
        : api.L('🌿 No crunch days ahead.', '🌿 Keine stressigen Tage in Sicht.'),
    ]
    if (busiest?.booked) lines.push(api.L(`Busiest: ${api.fmtDay(busiest.d)} (${fmtDuration(busiest.booked, 'en')}).`, `Am vollsten: ${api.fmtDay(busiest.d)} (${fmtDuration(busiest.booked, 'de')}).`))
    if (lightest) lines.push(api.L(`Lightest: ${api.fmtDay(lightest.d)} — good for catching up.`, `Am leersten: ${api.fmtDay(lightest.d)} — gut zum Aufholen.`))
    if (dueSoon || overdue) lines.push(api.L(`✅ ${dueSoon} todos due${overdue ? `, ${overdue} already overdue` : ''}.`, `✅ ${dueSoon} Todos fällig${overdue ? `, ${overdue} schon überfällig` : ''}.`))

    const items = rows.filter(r => r.booked || r.exams.length || r.due).map(r => ({
      icon: r.exams.length ? '🎓' : r.crunch ? '⚠️' : '📅',
      label: api.fmtDay(r.d),
      value: fmtDuration(r.booked, api.lang),
      sub: [r.exams.length ? `🎓 ${r.exams.join(', ')}` : null, r.due ? `${r.due} Todo${r.due === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
      trend: r.crunch ? 'down' : null,
      query: api.L(`What's on ${r.d}?`, `Was steht am ${r.d} an?`),
    }))
    return {
      title: api.L(`Next ${n} days`, `Nächste ${n} Tage`),
      blocks: [{ type: 'text', data: { text: lines.join('\n') } }, ...(items.length ? [{ type: 'stats', data: { items } }] : [])],
      followups: [
        ...(lightest ? [api.L(`When am I free on ${lightest.d}?`, `Wann habe ich am ${lightest.d} Zeit?`)] : []),
        ...(overdue ? [api.L('Show overdue todos', 'Zeig überfällige Todos')] : []),
      ],
    }
  },
})

// ── Exam plan ──────────────────────────────────────────────────────────────

// Every exam still ahead: Exams-tab rows and calendar entries of kind exam.
function upcomingExams(api) {
  const list = api.exams.filter(x => x.exam_date && x.exam_date > api.today).map(x => ({ title: x.title, date: x.exam_date, topicId: x.topic_id ?? null, examId: x.id }))
  for (const o of api.occurrences(addDays(api.today, 1), addDays(api.today, 365))) {
    if (o.event.kind === 'exam' && !list.some(e => e.date === o.date && e.title === o.event.title)) list.push({ title: o.event.title, date: o.date, topicId: o.event.topic_id ?? null, eventId: o.event.id })
  }
  return list.sort((a, b) => (a.date < b.date ? -1 : 1))
}

registerIntent({
  id: 'exam_plan',
  describe: 'Study plan for an exam (the next one, or one named by exam or topic): days left, accuracy gap, how many sessions, and free windows to put them in',
  slots: { exam: slot('text', 'exam or topic name', { primary: true }), sessions: slot('int', 'number of sessions wanted') },
  examples: ['Make a study plan for the anatomy exam', 'Lernplan für die Anatomie-Prüfung'],
  completions: { de: ['Lernplan für {topic}', 'Wie bereite ich mich auf die Prüfung vor?'], en: ['Study plan for {topic}', 'How should I prepare for my exam?'] },
  match(text, { raw, api }) {
    const plan = /\b(lernplan|study plan|studyplan|pruefungsplan|exam plan|vorbereitungsplan|prep plan)\b/.test(text)
    const prep = /\b(vorbereit\w*|prepare|prep|plan\w*)\b/.test(text) && /\bexam\b/.test(text)
    if (!plan && !prep) return null
    if (/\b(eintrag\w*|add|trag\w*|verschieb\w*|move|loesch\w*|delete)\b/.test(text)) return null
    const topic = api?.findTopicIn(raw ?? '') ?? null
    const exam = api ? api.index().mentions(raw ?? text, { types: ['exam', 'event'], min: 0.5 }).find(m => m.entity.type === 'exam' || m.row.kind === 'exam') : null
    const ref = !topic && !exam && api ? contextRef(api, ['topic', 'exam']) : null
    return { score: 0.93, slots: { exam: exam?.entity.name ?? topic?.name ?? (ref ? ref.row.name ?? ref.row.title : null) } }
  },
  execute(slots, api) {
    const all = upcomingExams(api)
    const q = String(slots.exam ?? '').trim()
    let exam = null
    if (q) {
      const row = findExam(api, q)
      const topic = api.findTopic(q)
      exam = all.find(e => (row && e.examId === row.id) || (topic && e.topicId === topic.id))
        ?? all.find(e => api.index().search(q, { types: ['event', 'exam'], min: 0.5 }).some(h => h.entity.name === e.title))
        ?? null
    }
    exam = exam ?? all[0] ?? null
    if (!exam) {
      return { title: api.L('No upcoming exam', 'Keine anstehende Prüfung'), blocks: [{ type: 'text', data: { text: q ? api.L(`No upcoming exam matching “${q}”.`, `Keine anstehende Prüfung passend zu „${q}“.`) : api.L('Add an exam first, e.g. “add exam anatomy on 5.10.”', 'Trag zuerst eine Prüfung ein, z. B. „Klausur Anatomie am 5.10. eintragen“.') } }] }
    }
    const topic = (exam.topicId ? api.topics.find(t => t.id === exam.topicId) : null) ?? api.findTopicIn(exam.title)
    const daysLeft = daysBetween(api.today, exam.date)
    const profile = getProfile(api)
    const minutes = api.settings.studyMinutes ?? profile.stored.preferences?.studyMinutes ?? Math.max(30, Math.min(120, profile.study.medianMinutes ?? 60))
    const target = Number(topic?.target_accuracy ?? 80)
    const s = topic ? summarize(api.sessions, { topicId: topic.id }) : null
    const trend = topic ? accuracyTrend(api.sessions, topic.id, api.today) : null
    const gap = s?.accuracy != null ? Math.max(0, target - s.accuracy) : null
    // Roughly one session per 2.5 points of accuracy missing, plus a review
    // every few days; never more than one a day.
    const wanted = Number(slots.sessions) || Math.ceil((gap ?? 10) / 2.5) + Math.ceil(daysLeft / 4)
    const count = Math.max(1, Math.min(daysLeft, wanted))

    // Spread the sessions over the days before the exam, in the user's usual study window.
    const days = []
    for (let i = 1; i < daysLeft && days.length < 60; i++) days.push(addDays(api.today, i))
    const step = days.length / count
    const preferred = profile.study.window ? profile.study.window.from * 60 : 17 * 60
    const picks = []
    for (let k = 0; k < count && days.length; k++) {
      const start = Math.min(days.length - 1, Math.floor(k * step))
      for (let j = start; j < days.length; j++) {
        const d = days[j]
        if (picks.some(p => p.date === d)) continue
        const free = freeSlots(api, d, minutes)
        if (!free.length) continue
        const slotAt = free.find(f => f.start <= preferred && f.end >= preferred + minutes) ?? free.find(f => f.start >= preferred) ?? free[0]
        const begin = slotAt.start <= preferred && slotAt.end >= preferred + minutes ? preferred : slotAt.start
        picks.push({ date: d, slots: [{ start: begin, end: begin + minutes }] })
        break
      }
    }

    const lines = [api.L(
      `🎓 ${exam.title} in ${daysLeft} days (${api.fmtDay(exam.date)}).`,
      `🎓 ${exam.title} in ${daysLeft} Tagen (${api.fmtDay(exam.date)}).`,
    )]
    if (topic && s?.accuracy != null) {
      lines.push(gap > 0
        ? api.L(`${topic.name}: ${fmtPctShort(s.accuracy)} of ${target} % target${trend ? `, trend ${fmtDelta(trend.delta)}` : ''}.`, `${topic.name}: ${fmtPctShort(s.accuracy)} von ${target} % Ziel${trend ? `, Trend ${fmtDelta(trend.delta)}` : ''}.`)
        : api.L(`${topic.name}: target reached (${fmtPctShort(s.accuracy)}) — keep it fresh.`, `${topic.name}: Ziel erreicht (${fmtPctShort(s.accuracy)}) — dranbleiben.`))
    } else if (topic) {
      lines.push(api.L(`No exercises for ${topic.name} yet.`, `Noch keine Übungen zu ${topic.name}.`))
    }
    lines.push(api.L(
      `Plan: ${count} sessions of ${minutes} min${picks.length < count ? ` — only ${picks.length} free windows found` : ''}. Tap a window to put it in the calendar.`,
      `Plan: ${count} Sessions à ${minutes} min${picks.length < count ? ` — nur ${picks.length} freie Fenster gefunden` : ''}. Tippe ein Fenster, um es einzutragen.`,
    ))

    return {
      title: api.L(`Plan: ${exam.title}`, `Lernplan: ${exam.title}`),
      blocks: [
        { type: 'text', data: { text: lines.join('\n') } },
        ...(picks.length ? [{ type: 'slots', data: { minutes, title: topic ? api.L(`Study: ${topic.name}`, `Lernen: ${topic.name}`) : api.L(`Study: ${exam.title}`, `Lernen: ${exam.title}`), kind: 'study', topicId: topic?.id ?? null, days: picks } }] : []),
      ],
      followups: topic ? [api.L(`Start a session for ${topic.name}`, `Starte eine Session für ${topic.name}`)] : [],
      meta: { entities: [...(topic ? [{ type: 'topic', id: topic.id }] : []), ...(exam.examId ? [{ type: 'exam', id: exam.examId }] : [])] },
    }
  },
})

// ── Big picture ────────────────────────────────────────────────────────────

registerIntent({
  id: 'how_am_i_doing',
  describe: 'The big picture: streak, study time, strongest and weakest topic, neglected topics, overdue todos, next exam, and one concrete next step',
  slots: {},
  examples: ['How am I doing overall?', 'Wie läuft es insgesamt?'],
  completions: { de: ['Wie läuft es insgesamt?', 'Gib mir einen Überblick'], en: ['How am I doing overall?', 'Give me the big picture'] },
  match(text, { api }) {
    const hit = /\b(wie (?:laeuft\w*|stehts?|steht es|geht'?s) (?:es )?(?:bei mir )?(?:insgesamt|allgemein|generell|so)|how am i doing(?: overall| in general)?|how'?s it going overall|big picture|gesamtbild|gesamtueberblick|gib mir einen ueberblick|give me an overview|status ?update|wo stehe ich (?:insgesamt|allgemein))\b/.test(text)
    if (!hit) return null
    // On a topic's screen, "how am I doing" is about that topic (topic_progress).
    if (api?.screen?.screen === 'topic-stats' && !/\b(insgesamt|overall|allgemein|generell|big picture|gesamt\w*)\b/.test(text)) return null
    return { score: 0.92, slots: {} }
  },
  execute(_, api) {
    const week = summarize(api.sessions, { from: addDays(api.today, -6), to: api.today })
    const prev = summarize(api.sessions, { from: addDays(api.today, -13), to: addDays(api.today, -7) })
    const streak = calcCurrentStreak(api.sessions)
    const rows = api.topics.map(t => {
      const s = summarize(api.sessions, { topicId: t.id })
      const target = Number(t.target_accuracy ?? 80)
      return { t, s, target, gap: s.accuracy != null ? target - s.accuracy : null, trend: accuracyTrend(api.sessions, t.id, api.today), idle: s.lastDay ? daysBetween(s.lastDay, api.today) : null }
    })
    const scored = rows.filter(r => r.gap != null)
    const strongest = [...scored].sort((a, b) => a.gap - b.gap)[0]
    const weakest = [...scored].sort((a, b) => (b.gap + (b.trend?.dir === 'down' ? 5 : 0)) - (a.gap + (a.trend?.dir === 'down' ? 5 : 0)))[0]
    const neglected = rows.filter(r => r.idle == null || r.idle >= 7)
    const overdue = api.todos.filter(t => !t.completed && t.due_date && t.due_date < api.today)
    const nextExam = upcomingExams(api)[0]

    const items = [
      { icon: '🔥', label: api.L('Streak', 'Serie'), value: `${streak} ${api.L('days', 'Tage')}` },
      { icon: '📚', label: api.L('Studied this week', 'Diese Woche gelernt'), value: fmtDuration(week.minutes, api.lang), sub: minutesDelta(api, week.minutes, prev.minutes), trend: week.minutes > prev.minutes ? 'up' : week.minutes < prev.minutes ? 'down' : 'flat' },
      ...(strongest && strongest.gap <= 0 ? [{ topicId: strongest.t.id, label: api.L('Strongest', 'Am stärksten'), value: fmtPctShort(strongest.s.accuracy), sub: `${strongest.t.name} · ${api.L('target', 'Ziel')} ${strongest.target} %` }] : []),
      ...(weakest && weakest.gap > 0 ? [{ topicId: weakest.t.id, label: api.L('Needs work', 'Braucht Arbeit'), value: fmtPctShort(weakest.s.accuracy), sub: `${weakest.t.name} · ${api.L('target', 'Ziel')} ${weakest.target} %${weakest.trend ? ` · ${fmtDelta(weakest.trend.delta)}` : ''}`, trend: weakest.trend?.dir ?? null, query: api.L(`Is ${weakest.t.name} improving?`, `Wird ${weakest.t.name} besser?`) }] : []),
      ...(nextExam ? [{ icon: '🎓', label: api.L('Next exam', 'Nächste Prüfung'), value: `${daysBetween(api.today, nextExam.date)} ${api.L('d', 'T')}`, sub: `${nextExam.title} · ${api.fmtDay(nextExam.date)}`, query: api.L(`Study plan for ${nextExam.title}`, `Lernplan für ${nextExam.title}`) }] : []),
      ...(overdue.length ? [{ icon: '⏰', label: api.L('Overdue todos', 'Überfällige Todos'), value: String(overdue.length), query: api.L('Show overdue todos', 'Zeig überfällige Todos') }] : []),
    ]

    // One concrete next step.
    let step
    const focus = weakest && weakest.gap > 0 ? weakest.t : neglected[0]?.t ?? null
    const slotToday = focus ? freeSlots(api, api.today, 45)[0] : null
    if (overdue.length >= 3) step = api.L(`Clear the ${overdue.length} overdue todos first.`, `Erst die ${overdue.length} überfälligen Todos abarbeiten.`)
    else if (focus && slotToday) step = api.L(`Next: ${focus.name} today at ${fmtMin(slotToday.start)}.`, `Nächster Schritt: ${focus.name} heute um ${fmtMin(slotToday.start)}.`)
    else if (focus) step = api.L(`Next: plan ${focus.name} for tomorrow.`, `Nächster Schritt: ${focus.name} für morgen einplanen.`)
    else step = api.L('All topics on track — keep the streak going.', 'Alle Themen im Plan — halt die Serie am Laufen.')

    const text = [
      neglected.length ? api.L(`Not practised for a week: ${neglected.map(r => r.t.name).slice(0, 4).join(', ')}.`, `Seit einer Woche nicht geübt: ${neglected.map(r => r.t.name).slice(0, 4).join(', ')}.`) : null,
      `👉 ${step}`,
    ].filter(Boolean).join('\n')
    return {
      title: api.L('How you are doing', 'Dein Stand'),
      blocks: [{ type: 'stats', data: { items } }, { type: 'text', data: { text } }],
      followups: [
        ...(focus ? [api.L(`When can I study ${focus.name}?`, `Wann kann ich ${focus.name} lernen?`)] : []),
        api.L('Weekly review', 'Wochenrückblick'),
      ],
      meta: { entities: focus ? [{ type: 'topic', id: focus.id }] : [] },
    }
  },
})
