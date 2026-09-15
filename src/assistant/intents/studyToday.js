// "What should I study today?" — rank topics by: upcoming exam proximity,
// accuracy gap × weight (same urgency the todo widget uses), a worsening
// trend, how long since the topic was last practised, and the user's habit of
// studying certain topics right after one another.

import { registerIntent } from '../engine/registry.js'
import { hasAny, tokenScore } from '../engine/normalize.js'
import { extract } from '../engine/parse/index.js'
import { daysBetween } from '../../utils/calendar/eventModel.js'
import { sessionDay, accuracyTrend, followPairs, habitualFollowers, fmtDelta } from '../engine/studyStats.js'

registerIntent({
  id: 'study_suggestion',
  describe: 'Suggest which topics to study on a day, based on exams, accuracy, trend, recency and which topics the user usually studies back to back',
  slots: { date: 'YYYY-MM-DD optional, default today', after: 'topic name just studied, optional' },
  examples: ['What should I study today?', 'Was soll ich heute lernen?'],
  completions: {
    de: ['Was soll ich {day} lernen?', 'Was soll ich nach {topic} lernen?'],
    en: ['What should I study {day}?', 'What should I study after {topic}?'],
  },
  match(text, { today, raw, api }) {
    if (!/\bstudy\b/.test(text)) return null
    if (!hasAny(text, [/\b(what|which|was|welche\w*|suggest|empfiehl|recommend|should|soll)\b/])) return null
    const after = /\b(nach|after|danach|als naechstes)\b/.test(text) ? api?.findTopicIn(raw ?? '') ?? null : null
    return { score: 0.9, slots: { date: extract(text, today).date, after: after?.name ?? null } }
  },
  execute(slots, api) {
    const date = slots.date || api.today
    const lastByTopic = new Map()
    for (const s of api.sessions) {
      const d = sessionDay(s)
      if (s.topic_id && d && d > (lastByTopic.get(s.topic_id) ?? '')) lastByTopic.set(s.topic_id, d)
    }
    const after = slots.after ? api.findTopic(slots.after) : null
    const pairs = followPairs(api.sessions)

    const scored = api.topics.filter(t => t.id !== after?.id).map(topic => {
      const reasons = []
      let score = (api.urgency.get(topic.id) ?? 0) * 40
      if ((api.urgency.get(topic.id) ?? 0) >= 0.5) reasons.push(api.L('below target accuracy', 'unter Zielgenauigkeit'))

      const exam = api.exams
        .filter(x => x.exam_date && x.exam_date >= date && (x.topic_id === topic.id || tokenScore(topic.name, x.title ?? '') >= 1))
        .sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1))[0]
      if (exam) {
        const days = daysBetween(date, exam.exam_date)
        score += Math.max(0, 45 - days * 1.5)
        if (days <= 30) reasons.push(api.L(`exam in ${days} d`, `Prüfung in ${days} T`))
      }

      const trend = accuracyTrend(api.sessions, topic.id, api.today)
      if (trend?.dir === 'down') {
        score += Math.min(15, -trend.delta)
        reasons.push(api.L(`getting worse (${fmtDelta(trend.delta)})`, `schlechter geworden (${fmtDelta(trend.delta)})`))
      }

      const last = lastByTopic.get(topic.id)
      const idle = last ? daysBetween(last, date) : 30
      score += Math.min(idle, 30) * 0.5
      if (idle >= 7) reasons.push(last ? api.L(`not practised for ${idle} d`, `seit ${idle} T nicht geübt`) : api.L('never practised', 'noch nie geübt'))

      const planned = api.occurrences(date, date).some(o => o.event.kind === 'study' && o.event.topic_id === topic.id)
      if (planned) { score += 20; reasons.unshift(api.L('already planned', 'bereits geplant')) }

      return { topicId: topic.id, score, reasons }
    })

    // Back-to-back habit, anchored on: the topic named ("after cardio"), else
    // the last topic studied today, else the top suggestion itself.
    const byScore = (a, b) => b.score - a.score
    const applyHabit = (anchor, bonus) => {
      for (const p of habitualFollowers(pairs, anchor.id)) {
        const it = scored.find(x => x.topicId === p.topicId)
        if (!it) continue
        it.score += 15 * p.share + bonus
        it.reasons.unshift(api.L(`usually right after ${anchor.name}`, `lernst du meist direkt nach ${anchor.name}`))
      }
    }
    let pinned = null
    let anchor = after
    if (!anchor && date === api.today) {
      const latest = api.sessions
        .filter(s => sessionDay(s) === api.today)
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0]
      anchor = latest ? api.topics.find(t => t.id === latest.topic_id) ?? null : null
    }
    if (anchor) {
      applyHabit(anchor, after ? 50 : 0)
      scored.sort(byScore)
    } else if (scored.length > 1) {
      scored.sort(byScore)
      pinned = scored[0]
      const top = api.topics.find(t => t.id === pinned.topicId)
      if (top) applyHabit(top, 0)
      scored.sort(byScore)
      scored.splice(scored.indexOf(pinned), 1)
      scored.unshift(pinned)
    }
    const items = scored.slice(0, 5)

    if (!items.length) {
      return { title: api.L('No topics yet', 'Noch keine Themen'), blocks: [{ type: 'text', data: { text: api.L('Create topics first, then I can suggest what to study.', 'Lege zuerst Themen an, dann kann ich Vorschläge machen.') } }] }
    }
    const title = after
      ? api.L(`After ${after.name}`, `Nach ${after.name}`)
      : date === api.today ? api.L('Study today', 'Heute lernen') : api.L(`Study on ${api.fmtDay(date)}`, `Lernen am ${api.fmtDay(date)}`)
    return {
      title,
      blocks: [{ type: 'topics', data: { items, date } }],
      followups: [
        api.L(`Do I have 2 hours free ${date === api.today ? 'today' : 'on ' + date}?`, `Habe ich ${date === api.today ? 'heute' : 'am ' + date} 2 Stunden frei?`),
        api.L('Where did I get worse?', 'Wo habe ich mich verschlechtert?'),
      ],
    }
  },
})
