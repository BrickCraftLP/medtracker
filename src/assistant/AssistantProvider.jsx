// Assistant state: open/closed, the chat thread of this opening, and the
// `api` facade the intents run against. The facade is rebuilt from live data
// on every render and read through a ref, so a result's buttons always act on
// current rows. Closing the pill ends the chat; reopening starts a new one.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import { getLocale } from '../i18n/index.js'
import { dayKey, parseDayKey } from '../utils/calendar/eventModel.js'
import { expandRange } from '../utils/calendar/recurrence.js'
import { defaultCalendarFor } from '../utils/calendar/calendarScope.js'
import { calcTopicUrgency } from '../utils/calculations/todoPriorityCalcs.js'
import { fold } from './engine/normalize.js'
import { matchScore } from './engine/lexicon.js'
import { rememberQuery } from './engine/suggest.js'
import { getLLMSettings, llmModelName } from './llm/index.js'
import { rateAnswer, learn } from './engine/feedbackLog.js'

export const AssistantContext = createContext(null)

export function AssistantProvider({ children }) {
  const data = useData()
  const { language } = useLanguage()
  const { activeWorkspaceId } = useWorkspace()

  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState([])     // [{ id, query, result, status, rated }]
  const threadRef = useRef(thread)
  threadRef.current = thread
  const [editor, setEditor] = useState(null)   // props for EventEditorModal
  const [flow, setFlow] = useState(null)       // guided event/todo creation (flows/)
  const [settingsTick, setSettingsTick] = useState(0)
  // Re-derives `today` while the assistant is open, so a tab left open past
  // midnight (or resumed from the background) never answers for yesterday.
  const [clockTick, setClockTick] = useState(0)

  useEffect(() => {
    const bump = () => setSettingsTick(n => n + 1)
    window.addEventListener('mt-assistant-settings', bump)
    return () => window.removeEventListener('mt-assistant-settings', bump)
  }, [])

  // Load a cached in-browser model while the pill opens, so the model can
  // double-check answers without making the first question wait.
  useEffect(() => {
    if (!open || getLLMSettings().backend !== 'webllm') return
    import('./llm/webllm.js').then(m => m.warmUpWebLLM()).catch(() => {})
  }, [open, settingsTick])

  useEffect(() => {
    const tick = () => setClockTick(n => n + 1)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    const id = open ? setInterval(tick, 60000) : null
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (id) clearInterval(id)
    }
  }, [open])

  const urgency = useMemo(() => calcTopicUrgency(data.topics, data.recentSessions), [data.topics, data.recentSessions])

  const api = useMemo(() => {
    const lang = language === 'en' ? 'en' : 'de'
    const locale = getLocale(lang)
    const findTopic = name => {
      const n = fold(name)
      return data.topics.find(t => fold(t.name) === n)
        ?? data.topics.map(t => ({ t, s: matchScore(name, t.name ?? '', { lang }).score })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s)[0]?.t
        ?? null
    }
    return {
      today: dayKey(),
      now: () => new Date(),
      lang,
      L: (en, de) => (lang === 'en' ? en : de),
      fmtDay: key => parseDayKey(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
      settings: getLLMSettings(),
      topics: data.topics,
      todos: data.todos,
      events: data.events,
      exams: data.exams,
      sessions: data.recentSessions ?? [],
      urgency,
      occurrences: (from, to) => expandRange(data.events, from, to),
      findTopic,
      // A topic named somewhere inside free text ("read cardio chapter" → Cardio),
      // also across languages ("chemistry" → Chemie).
      findTopicIn: text => {
        const t = fold(text)
        return data.topics.find(tp => tp.name && t.includes(fold(tp.name)))
          ?? data.topics.find(tp => tp.name && matchScore(tp.name, text ?? '', { lang }).score >= 1)
          ?? null
      },
      calendars: data.calendars,
      defaultCalendarId: () => defaultCalendarFor(data.calendars, activeWorkspaceId)?.id ?? null,
      upsertTodo: data.upsertTodo,
      upsertTodos: data.upsertTodos,
      removeTodo: data.removeTodo,
      upsertEvent: data.upsertEvent,
      removeEvent: data.removeEvent,
    }
  }, [data, language, activeWorkspaceId, urgency, settingsTick, clockTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const apiRef = useRef(api)
  apiRef.current = api
  const chatRef = useRef(0)   // bumped on close / new chat so late answers are dropped
  const seq = useRef(0)
  // Read synchronously by run/flowAction, so two quick taps never act on a stale flow.
  const flowRef = useRef(null)
  const setFlowState = useCallback(next => { flowRef.current = next; setFlow(next) }, [])

  const patchEntry = useCallback((id, patch) => {
    setThread(list => list.map(e => (e.id === id ? { ...e, ...patch } : e)))
  }, [])

  const run = useCallback(async query => {
    const chat = chatRef.current
    const alive = () => chat === chatRef.current
    const id = ++seq.current
    setThread(list => [...list, { id, query, result: null, status: 'thinking' }])
    try {
      // A running flow gets the message as its answer, unless it is clearly a new request.
      const current = flowRef.current
      if (current) {
        const { handleFlowInput } = await import('./flows/index.js')
        const out = await handleFlowInput(current, query, apiRef.current)
        if (!alive()) return
        if (!out.passthrough) {
          setFlowState(out.flow ?? null)
          patchEntry(id, { result: out.result ?? null, status: null })
          return
        }
        setFlowState(null)
      }
      const { runQuery } = await import('./engine/router.js')
      const res = await runQuery(query, apiRef.current, {
        onStatus: (s, p) => { if (alive()) patchEntry(id, { status: s === 'llm-loading' ? p : s }) },
        // A background model check may add a "Did you mean …?" card later.
        onBackground: update => {
          if (alive()) setThread(list => list.map(e => (e.id === id && e.result ? { ...e, result: update(e.result) } : e)))
        },
      })
      if (!alive()) return
      if (res?.startFlow) setFlowState(res.startFlow)
      patchEntry(id, { result: res, status: null })
      if (res?.meta?.source && !['ask', 'unknown'].includes(res.meta.source)) rememberQuery(query)
    } catch (e) {
      console.error('[assistant]', e)
      if (alive()) {
        patchEntry(id, {
          status: null,
          result: { title: apiRef.current.L('Something went wrong', 'Etwas ist schiefgelaufen'), blocks: [{ type: 'text', data: { text: String(e?.message ?? e) } }] },
        })
      }
    }
  }, [patchEntry])

  // Taps in the flow composer. Silent actions (toggling a reminder) only update
  // the flow; the rest add a bubble with `label` and the next question.
  const flowAction = useCallback(async (action, payload = null, label = null) => {
    const current = flowRef.current
    if (!current) return
    const chat = chatRef.current
    try {
      const { handleFlowAction } = await import('./flows/index.js')
      const out = await handleFlowAction(current, action, payload, apiRef.current)
      if (chat !== chatRef.current || flowRef.current !== current) return
      setFlowState(out.flow ?? null)
      if (!out.silent) setThread(list => [...list, { id: ++seq.current, query: label ?? '…', result: out.result, status: null }])
    } catch (e) {
      console.error('[assistant] flow', e)
      setThread(list => [...list, { id: ++seq.current, query: label ?? '…', status: null, result: { title: apiRef.current.L('Something went wrong', 'Etwas ist schiefgelaufen'), blocks: [{ type: 'text', data: { text: String(e?.message ?? e) } }] } }])
    }
  }, [setFlowState])

  // Start a flow from a block (a tapped free slot, "add anyway", "Plan").
  const startFlow = useCallback(async (next, label) => {
    const { questionFor } = await import('./flows/index.js')
    setFlowState(next)
    setThread(list => [...list, { id: ++seq.current, query: label ?? '…', result: questionFor(next, apiRef.current), status: null }])
  }, [setFlowState])

  // Runs one intent with known slots — a tapped "Did you mean …?" option or a
  // picked todo. `query` is the original question: the choice is remembered
  // for that phrasing (feedbackLog learned).
  const runIntent = useCallback(async (intentId, slots, label, { query = null } = {}) => {
    const chat = chatRef.current
    const alive = () => chat === chatRef.current
    const id = ++seq.current
    setThread(list => [...list, { id, query: label ?? '…', result: null, status: 'thinking' }])
    try {
      await import('./intents/index.js')
      const { getIntent } = await import('./engine/registry.js')
      const intent = getIntent(intentId)
      if (!intent) throw new Error(`Unknown intent ${intentId}`)
      const api = apiRef.current
      if (query) learn(query, intentId, slots)
      const res = await intent.execute(slots ?? {}, api, { raw: query ?? label ?? '', today: api.today, lang: api.lang, api, confirmed: true })
      if (!alive()) return
      if (res?.startFlow) setFlowState(res.startFlow)
      patchEntry(id, {
        status: null,
        result: res ? { ...res, meta: { ...(res.meta ?? {}), source: 'choice', intent: intentId, slots, trace: { decision: 'user-choice', query } } } : null,
      })
    } catch (e) {
      console.error('[assistant] choice', e)
      if (alive()) patchEntry(id, { status: null, result: { title: apiRef.current.L('Something went wrong', 'Etwas ist schiefgelaufen'), blocks: [{ type: 'text', data: { text: String(e?.message ?? e) } }] } })
    }
  }, [patchEntry, setFlowState])

  // 👍 / 👎 on one answer; stored with the whole conversation up to that point
  // (not just that one prompt) so a bad rating keeps the context that led to
  // it, plus its trace, for export (Settings → Assistant).
  const rateEntry = useCallback((id, rating, extra = {}) => {
    const list = threadRef.current
    const idx = list.findIndex(e => e.id === id)
    const entry = list[idx]
    if (!entry?.result) return
    const api = apiRef.current
    const thread = list.slice(0, idx + 1).filter(e => e.result).map(e => ({ query: e.query, result: e.result }))
    rateAnswer({ query: entry.query, result: entry.result, thread }, rating, {
      ...extra, lang: api.lang, today: api.today, flow: flowRef.current?.type ?? null, llmModel: llmModelName(),
    })
    patchEntry(id, { rated: rating })
  }, [patchEntry])

  const newChat = useCallback(() => { chatRef.current++; setThread([]); setFlowState(null) }, [setFlowState])
  const close = useCallback(() => {
    chatRef.current++
    setOpen(false)
    setThread([])
    setEditor(null)
    setFlowState(null)
  }, [setFlowState])
  const openAssistant = useCallback(() => { setClockTick(n => n + 1); setOpen(true) }, [])

  const last = thread[thread.length - 1] ?? null
  const value = useMemo(() => ({
    open, openAssistant, close, newChat, thread, run, api, apiRef, editor, setEditor,
    flow, flowAction, startFlow, runIntent, rateEntry,
    updateEntry: (id, result) => patchEntry(id, { result }),
    // The newest answer; blocks rendered inside an older entry get their own
    // result/setResult through a scoped provider in the overlay.
    result: last?.result ?? null,
    setResult: r => { if (last) patchEntry(last.id, { result: r }) },
    status: last?.status ?? null,
  }), [open, openAssistant, close, newChat, thread, run, api, editor, last, patchEntry, flow, flowAction, startFlow, runIntent, rateEntry])

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

// Null outside the provider so optional entry points (FAB) can render anywhere.
export const useAssistant = () => useContext(AssistantContext)
