// The `api` facade every intent, flow and prompt runs against. Built from live
// data by AssistantProvider on each render; tests build it from fixtures. Kept
// free of React so both share exactly the same lookups.

import { getLocale } from '../i18n/index.js'
import { dayKey, parseDayKey } from '../utils/calendar/eventModel.js'
import { expandRange } from '../utils/calendar/recurrence.js'
import { defaultCalendarFor } from '../utils/calendar/calendarScope.js'
import { calcTopicUrgency } from '../utils/calculations/todoPriorityCalcs.js'
import { getIndex } from './engine/entityIndex.js'
import { getStoredProfile } from './engine/userStore.js'
import { focusKeys, resolveToken } from './engine/references.js'

const noop = async () => null

export function createAssistantApi({
  data,
  lang: language = 'de',
  activeWorkspaceId = null,
  urgency = null,
  settings = {},
  screen = null,
  recent = [],
  navigate = null,
  today = dayKey(),
}) {
  const lang = language === 'en' ? 'en' : 'de'
  const locale = getLocale(lang)
  const topics = data.topics ?? []
  const prefs = getStoredProfile().preferences ?? {}
  const merged = {
    ...settings,
    dayStart: settings.dayStart ?? 8 * 60,
    dayEnd: settings.dayEnd ?? 22 * 60,
    // "Meine Lernblöcke dauern 45 Minuten" (profile intents).
    studyMinutes: prefs.studyMinutes ?? null,
  }

  const api = {
    today,
    now: () => new Date(),
    lang,
    L: (en, de) => (lang === 'en' ? en : de),
    fmtDay: key => parseDayKey(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
    settings: merged,
    topics,
    todos: data.todos ?? [],
    events: data.events ?? [],
    exams: data.exams ?? [],
    sessions: data.recentSessions ?? data.sessions ?? [],
    calendars: data.calendars ?? [],
    urgency: urgency ?? calcTopicUrgency(topics, data.recentSessions ?? data.sessions ?? []),
    occurrences: (from, to) => expandRange(data.events ?? [], from, to),
    // What the user is looking at when the question was asked (screenContext.js).
    screen: screen ?? { screen: null },
    // Entities of the last answers, newest first (references.js entitiesOf).
    recent,
    defaultCalendarId: () => defaultCalendarFor(data.calendars ?? [], activeWorkspaceId)?.id ?? null,
    upsertTodo: data.upsertTodo ?? noop,
    upsertTodos: data.upsertTodos ?? noop,
    removeTodo: data.removeTodo ?? noop,
    upsertEvent: data.upsertEvent ?? noop,
    removeEvent: data.removeEvent ?? noop,
    upsertExam: data.upsertExam ?? noop,
    removeExam: data.removeExam ?? noop,
    upsertTopic: data.upsertTopic ?? noop,
    navigate: navigate ?? (() => {}),
  }

  // Name lookups go through the entity index (aliases, both languages, typos).
  api.index = () => getIndex(api)
  api.focus = () => focusKeys(api)
  api.findTopic = name => {
    if (!name) return null
    if (String(name).startsWith('@')) return resolveToken(api, 'topic', name)
    return api.index().best(name, { types: ['topic'], min: 0.5, focus: api.focus() })?.row ?? null
  }
  // A topic named somewhere inside free text ("read cardio chapter" → Cardio).
  api.findTopicIn = text => (text ? api.index().mentionOf(text, 'topic', { min: 1 })?.row ?? null : null)
  return api
}
