// Study history: how much / how often / when the user studied, and whether a
// topic is getting better or worse. Works on the 90-day session window.

import { registerIntent } from '../engine/registry.js'
import { extract } from '../engine/parse/index.js'
import { fmtDuration } from '../engine/parse/times.js'
import {
  DATA_WINDOW_DAYS, summarize, inRange, accuracyTrend, followPairs, habitualFollowers, habitualPredecessors,
  fmtPctShort, fmtDelta,
} from '../engine/studyStats.js'
import { addDays, daysBetween, parseDayKey } from '../../utils/calendar/eventModel.js'
import { calcCurrentStreak } from '../../utils/calculations/streakTrackerCalcs.js'

const PART = {
  en: { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening' },
  de: { morning: 'vormittags', afternoon: 'nachmittags', evening: 'abends' },
}

function ago(api, day) {
  const n = daysBetween(day, api.today)
  if (n <= 0) return api.L('today', 'heute')
  if (n === 1) return api.L('yesterday', 'gestern')
  return api.L(`${n} days ago`, `vor ${n} Tagen`)
}

const weekdayName = (api, key) => parseDayKey(key).toLocaleDateString(api.lang === 'en' ? 'en-US' : 'de-AT', { weekday: 'long' })

function habitLines(api, topic) {
  const pairs = followPairs(api.sessions)
  const name = id => api.topics.find(t => t.id === id)?.name
  const opts = { minCount: 2, minShare: 0.3 }
  const after = habitualFollowers(pairs, topic.id, opts).map(p => name(p.topicId)).filter(Boolean)
  const before = habitualPredecessors(pairs, topic.id, opts).map(p => name(p.topicId)).filter(Boolean)
  const lines = []
  if (after.length) lines.push(api.L(`Right after ${topic.name} you usually study: ${after.join(', ')}`, `Direkt nach ${topic.name} lernst du meist: ${after.join(', ')}`))
  if (before.length) lines.push(api.L(`Usually right before: ${before.join(', ')}`, `Meist direkt davor: ${before.join(', ')}`))
  return lines
}

// ── How much / how often / when ────────────────────────────────────────────

const STUDIED = /\b(study|gelernt|geuebt|gelesen|practi[sc]ed|studied|learn(?:ed|t)|sessions?|lernzeit|lerntage?|streak|serie)\b/
const STAT = /\b(wie ?viel\w*|wie lange|wie oft|how much|how long|how often|how many|zuletzt|last time|letzte[ns]? mal|when did i|wann (?:habe?|hab) ich|wann study ich|when do i|meistens|usually|normalerweise|am meisten|most|statisti\w*|stats|streak|serie|lernzeit|lerntage?|insgesamt|total)\b/
const PROGRESS = /\b(besser|schlechter|verbesser\w*|verschlechter\w*|fortschritt\w*|progress|lernstand|improv\w*|wors\w*|better|trend\w*)\b/
const WHOLE = /\b(zuletzt|last time|letzte[ns]? mal|when did i|wann (?:habe?|hab) ich|meistens|usually|normalerweise|when do i|wann study ich)\b/

registerIntent({
  id: 'study_stats',
  describe: 'Study history: total study time, sessions, study days, streak, last time studied and usual time of day — overall or for one topic, for a period',
  slots: { topic: 'topic name optional', from: 'YYYY-MM-DD optional (past)', to: 'YYYY-MM-DD optional', all: 'true for the whole history' },
  examples: ['How much did I study this week?', 'Wie viel habe ich diese Woche gelernt?'],
  completions: {
    de: ['Wie viel habe ich diese Woche gelernt?', 'Wann habe ich {topic} zuletzt gelernt?', 'Wie oft habe ich {topic} gelernt?', 'Wann lerne ich meistens?'],
    en: ['How much did I study this week?', 'When did I last study {topic}?', 'How often did I study {topic}?'],
  },
  match(text, { today }) {
    if (!STUDIED.test(text) || !STAT.test(text) || PROGRESS.test(text)) return null
    if (/\b(soll|should|suggest|empfiehl\w*|recommend)\b/.test(text) || /\btodo\b/.test(text)) return null
    if (/\b(wann|when)\b/.test(text) && /\b(zeit|frei|free|platz)\b/.test(text)) return null
    const x = extract(text, today)
    // "wann lerne ich morgen" is planning, not history.
    if ((x.date && x.date > today) || (x.range && !x.range.past && x.range.from > today)) return null
    const whole = WHOLE.test(text) && !x.range && !x.date
    let from = x.range?.from ?? x.date ?? null
    // For history "this week" means Monday until now, not today onwards.
    if (x.range && !x.range.past && /\b(this week|diese woche|dieser woche|die woche)\b/.test(text)) {
      from = addDays(today, -((parseDayKey(today).getDay() + 6) % 7))
    }
    return { score: 0.92, slots: { from, to: x.range?.to ?? x.date ?? null, all: whole } }
  },
  execute(slots, api, ctx = {}) {
    const topic = slots.topic ? api.findTopic(slots.topic) : api.findTopicIn(ctx.raw ?? '')
    const windowStart = addDays(api.today, -(DATA_WINDOW_DAYS - 1))
    let from = slots.from
    let to = slots.to
    if (slots.all === true || slots.all === 'true') { from = windowStart; to = api.today }
    if (!from) { from = addDays(api.today, -6); to = api.today }
    if (!to || to > api.today) to = api.today
    let clipped = false
    if (from < windowStart) { from = windowStart; clipped = true }
    const whole = from === windowStart
    const label = whole ? api.L('last 90 days', 'letzte 90 Tage') : from === to ? api.fmtDay(from) : `${api.fmtDay(from)} – ${api.fmtDay(to)}`
    const title = topic ? `${topic.name} · ${label}` : api.L(`Studying · ${label}`, `Lernen · ${label}`)
    const topicId = topic?.id ?? null
    const s = summarize(api.sessions, { from, to, topicId })
    const followups = topic
      ? [api.L(`Is ${topic.name} improving?`, `Wird ${topic.name} besser?`), api.L(`When can I study ${topic.name}?`, `Wann kann ich ${topic.name} lernen?`)]
      : [api.L('Where did I get worse?', 'Wo habe ich mich verschlechtert?'), api.L('What should I study today?', 'Was soll ich heute lernen?')]

    if (!s.sessions) {
      const ever = summarize(api.sessions, { topicId })
      const text = api.L('No sessions in this period.', 'Keine Sessions in diesem Zeitraum.') + ' ' + (ever.lastDay
        ? api.L(`Last studied: ${api.fmtDay(ever.lastDay)} (${ago(api, ever.lastDay)}).`, `Zuletzt gelernt: ${api.fmtDay(ever.lastDay)} (${ago(api, ever.lastDay)}).`)
        : api.L('None in the last 90 days either.', 'Auch keine in den letzten 90 Tagen.'))
      return { title, blocks: [{ type: 'text', data: { text } }], followups }
    }

    const weekdayCounts = new Map()
    for (const x of inRange(api.sessions, { from, to, topicId })) {
      const d = new Date(x.started_at ?? x.created_at)
      weekdayCounts.set(d.getDay(), (weekdayCounts.get(d.getDay()) ?? 0) + 1)
    }
    const topDow = [...weekdayCounts].sort((a, b) => b[1] - a[1])[0]
    const topDowName = topDow && s.activeDays >= 3 ? weekdayName(api, addDays(api.today, (topDow[0] - parseDayKey(api.today).getDay() + 7) % 7)) : null

    const lines = [
      api.L(
        `${fmtDuration(s.minutes, 'en')} in ${s.sessions} ${s.sessions === 1 ? 'session' : 'sessions'} on ${s.activeDays} ${s.activeDays === 1 ? 'day' : 'days'}.`,
        `${fmtDuration(s.minutes, 'de')} in ${s.sessions} ${s.sessions === 1 ? 'Session' : 'Sessions'} an ${s.activeDays} ${s.activeDays === 1 ? 'Tag' : 'Tagen'}.`,
      ),
      s.exercises ? api.L(`${s.exercises} exercises, ${fmtPctShort(s.accuracy)} correct.`, `${s.exercises} Übungen, ${fmtPctShort(s.accuracy)} richtig.`) : null,
      api.L(`Last studied: ${api.fmtDay(s.lastDay)} (${ago(api, s.lastDay)}).`, `Zuletzt gelernt: ${api.fmtDay(s.lastDay)} (${ago(api, s.lastDay)}).`),
      s.medianHour != null
        ? api.L(`Usually ${PART.en[s.partOfDay]} (around ${s.medianHour}:00)`, `Meistens ${PART.de[s.partOfDay]} (gegen ${s.medianHour} Uhr)`)
          + (topDowName ? api.L(`, most often on ${topDowName}`, `, am häufigsten am ${topDowName}`) : '') + '.'
        : null,
      !topic ? api.L(`🔥 Streak: ${calcCurrentStreak(api.sessions)} days`, `🔥 Serie: ${calcCurrentStreak(api.sessions)} Tage`) : null,
      clipped ? api.L('Only the last 90 days are loaded.', 'Geladen sind nur die letzten 90 Tage.') : null,
    ].filter(Boolean)

    const blocks = [{ type: 'text', data: { text: lines.join('\n') } }]
    const recentDays = s.days.slice(-10).reverse().map(d => api.fmtDay(d)).join(', ')
    blocks.push({ type: 'text', data: { text: api.L(`Study days: ${recentDays}`, `Lerntage: ${recentDays}`) } })

    if (topic) {
      const habits = habitLines(api, topic)
      if (habits.length) blocks.push({ type: 'text', data: { text: habits.join('\n') } })
    } else {
      const per = api.topics
        .map(t => ({ t, s: summarize(api.sessions, { from, to, topicId: t.id }) }))
        .filter(x => x.s.sessions)
        .sort((a, b) => b.s.minutes - a.s.minutes)
      if (per.length) {
        blocks.push({ type: 'stats', data: { label: api.L('Per topic', 'Pro Thema'), items: per.map(({ t, s: ts }) => ({
          topicId: t.id,
          label: t.name,
          value: fmtDuration(ts.minutes, api.lang),
          sub: `${ts.sessions} Sessions · ${fmtPctShort(ts.accuracy)}`,
          query: api.L(`Is ${t.name} improving?`, `Wird ${t.name} besser?`),
        })) } })
      }
      const idle = api.topics.filter(t => !per.some(x => x.t.id === t.id)).map(t => t.name).filter(Boolean)
      if (idle.length) blocks.push({ type: 'text', data: { text: api.L(`Not studied in this period: ${idle.slice(0, 8).join(', ')}`, `In diesem Zeitraum nicht gelernt: ${idle.slice(0, 8).join(', ')}`) } })
    }
    return { title, blocks, followups }
  },
})

// ── Better or worse ────────────────────────────────────────────────────────

const PROG = /\b(besser|schlechter|verbesser\w*|verschlechter\w*|fortschritt\w*|progress|lernstand|leistungsstand|improv\w*|wors\w*|better|trend\w*|entwickel\w*|entwickl\w*|how am i doing|wie gut bin ich|wie gut|how good|wie stehe? ich|where do i stand|accuracy|genauigkeit|trefferquote|quote)\b/
const PROG_SCOPE = /\b(study|gelernt|geuebt|topics?|themen?|faechern?|fach|lernstand|fortschritt\w*|progress|accuracy|genauigkeit|quote|insgesamt|overall|wo|where|welche\w*|which|allgemein|general)\b/

registerIntent({
  id: 'topic_progress',
  describe: 'Is a topic (or are topics overall) getting better or worse: accuracy now vs before, target, sessions, last practised',
  slots: { topic: 'topic name optional; omit for all topics' },
  examples: ['Is cardio improving?', 'Wo habe ich mich verschlechtert?'],
  completions: {
    de: ['Wird {topic} besser?', 'Wie ist mein Lernstand in {topic}?', 'Wo habe ich mich verschlechtert?'],
    en: ['Is {topic} improving?', 'Where did I get worse?'],
  },
  match(text, { raw, api }) {
    if (!PROG.test(text) || /\b(todo|event)\b/.test(text)) return null
    if (/\b(soll|should|suggest|recommend|empfiehl\w*)\b/.test(text)) return null
    const topic = api?.findTopicIn(raw ?? '') ?? null
    if (!topic && !PROG_SCOPE.test(text)) return null
    return { score: topic ? 0.93 : 0.88, slots: { topic: topic?.name ?? null } }
  },
  execute(slots, api, ctx = {}) {
    const topic = slots.topic ? api.findTopic(slots.topic) : api.findTopicIn(ctx.raw ?? '')
    return topic ? oneTopic(api, topic) : allTopics(api)
  },
})

function oneTopic(api, topic) {
  const target = Number(topic.target_accuracy ?? 80)
  const s = summarize(api.sessions, { topicId: topic.id })
  const week = summarize(api.sessions, { topicId: topic.id, from: addDays(api.today, -6), to: api.today })
  const trend = accuracyTrend(api.sessions, topic.id, api.today)
  const lines = []

  if (!s.sessions) {
    return {
      title: topic.name,
      blocks: [{ type: 'text', data: { text: api.L(`No sessions for ${topic.name} in the last 90 days.`, `Keine Sessions für ${topic.name} in den letzten 90 Tagen.`) } }],
      followups: [api.L(`When can I study ${topic.name}?`, `Wann kann ich ${topic.name} lernen?`)],
    }
  }

  if (trend) {
    const change = `${fmtPctShort(trend.before)} → ${fmtPctShort(trend.now)} (${fmtDelta(trend.delta)})`
    lines.push(trend.dir === 'up'
      ? api.L(`📈 ${topic.name} is improving: ${change}.`, `📈 ${topic.name} wird besser: ${change}.`)
      : trend.dir === 'down'
        ? api.L(`📉 ${topic.name} is getting worse: ${change}.`, `📉 ${topic.name} wird schlechter: ${change}.`)
        : api.L(`➖ ${topic.name} is stable: ${change}.`, `➖ ${topic.name} ist stabil: ${change}.`))
  } else {
    lines.push(api.L('Not enough exercises yet to show a trend.', 'Noch zu wenige Übungen für einen Trend.'))
  }
  if (s.accuracy != null) {
    lines.push(s.accuracy >= target
      ? api.L(`Target ${target} % reached ✓`, `Ziel ${target} % erreicht ✓`)
      : api.L(`${Math.ceil(target - s.accuracy)} % to go to your target of ${target} %.`, `Noch ${Math.ceil(target - s.accuracy)} % bis zum Ziel von ${target} %.`))
  }
  lines.push(...habitLines(api, topic))

  const items = [
    { icon: '🎯', label: api.L('Accuracy (90 d)', 'Genauigkeit (90 T)'), value: fmtPctShort(s.accuracy), sub: `${api.L('Target', 'Ziel')} ${target} % · ${s.exercises} ${api.L('exercises', 'Übungen')}` },
    ...(trend ? [{
      icon: trend.dir === 'up' ? '📈' : trend.dir === 'down' ? '📉' : '➖',
      label: api.L('Trend', 'Trend'),
      value: fmtDelta(trend.delta),
      sub: `${fmtPctShort(trend.before)} → ${fmtPctShort(trend.now)} · ${trend.basis === '14d' ? api.L('last 14 d vs. before', 'letzte 14 T vs. davor') : api.L('older vs. newer sessions', 'ältere vs. neuere Sessions')}`,
      trend: trend.dir,
    }] : []),
    { icon: '🗓', label: api.L('Sessions (90 d)', 'Sessions (90 T)'), value: String(s.sessions), sub: `${fmtDuration(s.minutes, api.lang)} · ${s.activeDays} ${api.L('days', 'Tage')}` },
    { icon: '⏱', label: api.L('This week', 'Diese Woche'), value: fmtDuration(week.minutes, api.lang), sub: `${week.sessions} Sessions` },
    { icon: '🕐', label: api.L('Last practised', 'Zuletzt geübt'), value: api.fmtDay(s.lastDay), sub: ago(api, s.lastDay) },
  ]

  return {
    title: topic.name,
    blocks: [{ type: 'text', data: { text: lines.join('\n') } }, { type: 'stats', data: { items } }],
    followups: [
      api.L(`When did I last study ${topic.name}?`, `Wann habe ich ${topic.name} zuletzt gelernt?`),
      api.L(`When can I study ${topic.name}?`, `Wann kann ich ${topic.name} lernen?`),
    ],
  }
}

function allTopics(api) {
  const rows = api.topics.map(t => ({
    t,
    trend: accuracyTrend(api.sessions, t.id, api.today),
    s: summarize(api.sessions, { topicId: t.id }),
  }))
  const up = rows.filter(r => r.trend?.dir === 'up').sort((a, b) => b.trend.delta - a.trend.delta)
  const down = rows.filter(r => r.trend?.dir === 'down').sort((a, b) => a.trend.delta - b.trend.delta)
  const flat = rows.filter(r => r.trend?.dir === 'flat')
  const none = rows.filter(r => !r.trend)

  const item = r => ({
    topicId: r.t.id,
    label: r.t.name,
    value: fmtDelta(r.trend.delta),
    sub: `${fmtPctShort(r.trend.before)} → ${fmtPctShort(r.trend.now)} · ${api.L('target', 'Ziel')} ${r.t.target_accuracy ?? 80} % · ${api.L('last', 'zuletzt')} ${r.s.lastDay ? ago(api, r.s.lastDay) : '–'}`,
    trend: r.trend.dir,
    query: api.L(`Is ${r.t.name} improving?`, `Wird ${r.t.name} besser?`),
  })

  const blocks = [{ type: 'text', data: { text: api.L(
    `${up.length} improving, ${down.length} getting worse, ${flat.length} stable.`,
    `${up.length} besser, ${down.length} schlechter, ${flat.length} stabil.`,
  ) } }]
  if (down.length) blocks.push({ type: 'stats', data: { label: api.L('📉 Getting worse', '📉 Schlechter'), items: down.map(item) } })
  if (up.length) blocks.push({ type: 'stats', data: { label: api.L('📈 Improving', '📈 Besser'), items: up.map(item) } })
  if (flat.length) blocks.push({ type: 'stats', data: { label: api.L('➖ Stable', '➖ Stabil'), items: flat.map(item) } })
  if (none.length) blocks.push({ type: 'text', data: { text: api.L(`Not enough data: ${none.map(r => r.t.name).join(', ')}`, `Zu wenig Daten: ${none.map(r => r.t.name).join(', ')}`) } })

  return {
    title: api.L('Study progress', 'Lernfortschritt'),
    blocks,
    followups: [api.L('What should I study today?', 'Was soll ich heute lernen?'), api.L('How much did I study this week?', 'Wie viel habe ich diese Woche gelernt?')],
  }
}
