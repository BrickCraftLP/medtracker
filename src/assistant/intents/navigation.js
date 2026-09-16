// Getting around: "öffne den Kalender am Freitag", "zeig mir die Anatomie-
// Statistik", "starte eine Session für Chemie", and "was sehe ich hier?" —
// a summary of the screen the user is on.

import { registerIntent, getIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { extract } from '../engine/parse/index.js'
import { contextRef, screenEntity, screenDate, isDeictic } from '../engine/references.js'

export const SCREENS = {
  home: { path: '/home', words: /\b(home|startseite|start ?screen|dashboard|uebersicht ?seite)\b/, en: 'Home', de: 'Start' },
  calendar: { path: '/calendar', words: /\b(kalender|calendar)\b/, en: 'Calendar', de: 'Kalender' },
  topics: { path: '/topics', words: /\b(themen|topics|faecher|fach liste|topic list)\b/, en: 'Topics', de: 'Themen' },
  exams: { path: '/exams', words: /^(?:die |the |my |meine )?exam$|\b(exam (?:seite|page|screen|tab|liste|list)|semester)\b/, en: 'Exams', de: 'Prüfungen' },
  statistics: { path: '/statistics', words: /\b(statistik\w*|statistics|stats)\b/, en: 'Statistics', de: 'Statistik' },
  assistant_settings: { path: '/settings/assistant', words: /\b(assistent\w* ?einstellungen|assistant settings|einstellungen (?:des|vom) assistenten)\b/, en: 'Assistant settings', de: 'Assistent-Einstellungen' },
  settings: { path: '/settings', words: /\b(einstellungen|settings|optionen|options)\b/, en: 'Settings', de: 'Einstellungen' },
  topic_stats: { path: '/topic-stats', words: null, en: 'Topic', de: 'Thema' },
}

const OPEN = /^(?:bitte |kannst du |can you |please )?(oeffne\w*|open|geh\w* (?:zu[mr]?|in (?:den|die|das)|ins|auf (?:den|die|das)?)|go to|navigate to|take me to|bring mich (?:zu[mr]?|in (?:den|die))|wechsel\w* (?:zu[mr]?|in (?:den|die))|switch to|zeig\w* (?:mir )?|show (?:me )?)\s*(.*)$/

registerIntent({
  id: 'open_screen',
  describe: 'Open a screen of the app: home, calendar (optionally on a day), topics, one topic\'s statistics, exams, statistics, settings',
  slots: {
    screen: slot('enum:home|calendar|topics|topic_stats|exams|statistics|settings|assistant_settings', 'which screen', { required: true, primary: true }),
    date: slot('date', 'day to show in the calendar'),
    topic: slot('ref:topic', 'topic for topic_stats'),
  },
  command: ['open', 'go'],
  examples: ['Open the calendar on Friday', 'Öffne die Statistik von Anatomie'],
  completions: {
    de: ['Öffne den Kalender {day}', 'Zeig mir die Statistik von {topic}', 'Geh zu den Einstellungen'],
    en: ['Open the calendar {day}', 'Show me {topic} stats', 'Go to settings'],
  },
  match(text, { today, raw, api }) {
    const m = text.match(OPEN)
    if (!m) return null
    const verb = m[1]
    const target = m[2].replace(/^(?:den|die|das|dem|der|the|my|meine\w*|mir)\s+/, '')
    if (/\b(todo|alles|everything|was|what|wann|when|wie|how|frei|free|zeit|time)\b/.test(target)) return null
    const strong = /^(oeffne|open|geh|go|navigate|take|bring|wechsel|switch)/.test(verb)
    const x = extract(target, today)
    const topic = api?.findTopicIn(raw ?? '') ?? null
    const statsWord = /\b(statistik\w*|statistics|stats|fortschritt|progress|seite|page)\b/.test(target)
    if (topic && (statsWord || strong)) return { score: strong ? 0.93 : 0.87, slots: { screen: 'topic_stats', topic: topic.name } }
    for (const [key, s] of Object.entries(SCREENS)) {
      if (!s.words) continue
      if (s.words.test(target) || (key === 'exams' && /\bexam\b/.test(target) && target.split(' ').length <= 2)) {
        // "Zeig mir die Woche / meine Prüfungen" are questions other intents answer better.
        if (!strong && key === 'exams') return null
        return { score: strong ? 0.93 : 0.86, slots: { screen: key, date: key === 'calendar' ? x.date ?? x.range?.from ?? null : null } }
      }
    }
    return null
  },
  execute(slots, api) {
    const key = SCREENS[slots.screen] ? slots.screen : 'home'
    const s = SCREENS[key]
    const name = api.L(s.en, s.de)
    if (key === 'topic_stats') {
      const topic = slots.topic ? api.findTopic(slots.topic) : screenEntity(api, 'topic')
      if (!topic) return { title: api.L('Which topic?', 'Welches Thema?'), blocks: [{ type: 'topics', data: { items: api.topics.slice(0, 8).map(t => ({ topicId: t.id, reasons: [] })), date: api.today } }] }
      api.navigate('/topic-stats', { topicId: topic.id })
      return { title: topic.name, blocks: [{ type: 'text', data: { text: api.L(`Opened ${topic.name}.`, `${topic.name} geöffnet.`) } }], meta: { entities: [{ type: 'topic', id: topic.id }] } }
    }
    if (key === 'calendar' && slots.date) {
      api.navigate(`/calendar?d=${slots.date}`, { date: slots.date })
      return { title: name, blocks: [{ type: 'text', data: { text: api.L(`Calendar on ${api.fmtDay(slots.date)}.`, `Kalender am ${api.fmtDay(slots.date)}.`) } }] }
    }
    api.navigate(s.path)
    return { title: name, blocks: [{ type: 'text', data: { text: api.L(`Opened ${name}.`, `${name} geöffnet.`) } }] }
  },
})

registerIntent({
  id: 'start_session',
  mutates: true,
  describe: 'Start a study session (exercises with a timer) for a topic',
  slots: { topic: slot('ref:topic', 'topic to study', { primary: true }) },
  command: ['session', 'study'],
  examples: ['Start a session for anatomy', 'Starte eine Session für Anatomie'],
  completions: {
    de: ['Starte eine Session für {topic}', 'Lass uns {topic} lernen'],
    en: ['Start a session for {topic}', "Let's study {topic}"],
  },
  match(text, { raw, api }) {
    const start = /\b(start\w*|beginn\w*|begin|los ?legen|leg\w* los|lass uns|let'?s)\b/.test(text)
    const session = /\b(session|lernsession|sitzung|uebung\w*|practice|quiz|abfrage|study)\b/.test(text)
    if (!start || !session) return null
    if (/\b(wann|when|wie ?viel|how much|how many|zuletzt|last|gelernt|studied|plan\w*|eintrag\w*|schedule|add)\b/.test(text)) return null
    const topic = api?.findTopicIn(raw ?? '') ?? null
    if (topic) return { score: 0.9, slots: { topic: topic.name } }
    const ref = api ? contextRef(api, ['topic']) : null
    if (ref && (isDeictic(text) || api.screen?.screen === 'topic-stats')) return { score: 0.9, slots: { topic: ref.token } }
    return { score: 0.7, slots: {} }
  },
  execute(slots, api) {
    const topic = slots.topic ? api.findTopic(slots.topic) : screenEntity(api, 'topic')
    if (!topic) {
      return {
        title: api.L('Which topic?', 'Welches Thema?'),
        blocks: [
          { type: 'text', data: { text: api.L('Pick a topic to start — ▶ starts right away.', 'Wähle ein Thema — ▶ startet sofort.') } },
          { type: 'topics', data: { items: api.topics.slice(0, 8).map(t => ({ topicId: t.id, reasons: [] })), date: api.today } },
        ],
      }
    }
    api.navigate('/session', { topicId: topic.id })
    return { title: topic.name, blocks: [{ type: 'text', data: { text: api.L(`Session for ${topic.name} started.`, `Session für ${topic.name} gestartet.`) } }], meta: { entities: [{ type: 'topic', id: topic.id }] } }
  },
})

const EXPLAIN = /\b(was sehe ich(?: hier| da)?|was ist (?:das hier|hier los|auf dem bildschirm)|what am i (?:looking at|seeing)|what'?s (?:on )?(?:this|the) (?:screen|page)|was zeigt (?:mir )?(?:das|die seite|der bildschirm|diese seite)|fass\w* (?:mir )?(?:das|die seite|diese seite|den tag|das hier)? ?zusammen|zusammenfassung (?:davon|von dem hier|der seite)|summari[sz]e (?:this|the page|this page|that|the screen)|explain (?:this|the screen|this page)|erklaer\w* (?:mir )?(?:das|die seite|den bildschirm|das hier))\b/

registerIntent({
  id: 'explain_screen',
  describe: 'Explain or summarise what is on the current screen (the calendar day shown, the open topic, exams, statistics)',
  slots: {},
  examples: ['What am I looking at?', 'Fass das hier zusammen'],
  completions: {
    de: ['Was sehe ich hier?', 'Fass das zusammen'],
    en: ['What am I looking at?', 'Summarize this page'],
  },
  match(text) {
    return EXPLAIN.test(text) ? { score: 0.93, slots: {} } : null
  },
  async execute(_, api, ctx = {}) {
    const s = api.screen ?? {}
    const run = (id, slots) => getIntent(id)?.execute(slots, api, ctx)
    const combine = (title, results) => ({
      title,
      blocks: results.filter(Boolean).flatMap(r => [{ type: 'text', data: { text: r.title, heading: true } }, ...(r.blocks ?? [])]),
      followups: results.filter(Boolean).flatMap(r => r.followups ?? []).slice(0, 3),
    })
    switch (s.screen) {
      case 'calendar': {
        const date = screenDate(api) ?? api.today
        if (s.view === 'week' || s.view === 'month') return run('week_overview', { from: s.range?.from ?? date, to: s.range?.to ?? null })
        return combine(api.fmtDay(date), [await run('day_agenda', { date }), await run('free_time', { date })])
      }
      case 'topic-stats':
      case 'session': {
        const topic = screenEntity(api, 'topic')
        return topic ? run('topic_progress', { topic: `@topic:${topic.id}` }) : run('topic_progress', {})
      }
      case 'topics': return run('topic_progress', {})
      case 'exams': return run('exam_countdown', {})
      case 'statistics': return run('weekly_review', {})
      case 'home': return run('how_am_i_doing', {})
      default:
        return {
          title: api.L('This screen', 'Dieser Bildschirm'),
          blocks: [{ type: 'text', data: { text: api.L("I can't summarise this screen — ask me about your calendar, todos, topics or exams.", 'Diesen Bildschirm kann ich nicht zusammenfassen — frag mich zu Kalender, Todos, Themen oder Prüfungen.') } }],
          followups: [api.L('How am I doing?', 'Wie läuft es insgesamt?'), api.L("What's next?", 'Was ist als Nächstes?')],
        }
    }
  },
})
