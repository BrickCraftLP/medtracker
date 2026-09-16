// A real assistant `api` over fixture data. Writes and navigations are
// recorded (`writes`, `navigations`) instead of touching any store.
import { createAssistantApi } from '../../api.js'
import { fixtureData } from './data.js'

export function makeApi({ lang = 'de', screen = null, recent = [], data = fixtureData(), navigate = null } = {}) {
  const writes = []
  const upsert = key => async row => {
    writes.push({ op: `upsert:${key}`, row })
    return { ...row, id: row.id ?? `new-${key}-${writes.length}` }
  }
  const remove = key => async id => { writes.push({ op: `remove:${key}`, id }) }
  const navigations = []
  const api = createAssistantApi({
    data: {
      ...data,
      upsertTodo: upsert('todos'),
      upsertTodos: async rows => Promise.all(rows.map(upsert('todos'))),
      removeTodo: remove('todos'),
      upsertEvent: upsert('events'),
      removeEvent: remove('events'),
      upsertExam: upsert('exams'),
      removeExam: remove('exams'),
      upsertTopic: upsert('topics'),
    },
    lang,
    activeWorkspaceId: 'ws1',
    settings: { backend: 'off', dayStart: 8 * 60, dayEnd: 22 * 60 },
    screen,
    recent,
    navigate: navigate ?? ((path, state) => navigations.push({ path, state })),
  })
  return Object.assign(api, { writes, navigations, data })
}
