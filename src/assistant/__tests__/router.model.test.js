// The model path with a scripted model: it writes a command, the parser
// checks it, objections go back once for a repair.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { makeApi } from './fixtures/api.js'

const settings = { current: { backend: 'webllm', webllmModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC' } }
const replies = []

vi.mock('../llm/index.js', async orig => ({
  ...(await orig()),
  getLLMSettings: () => settings.current,
  llmReady: async () => false,
  chatLLM: vi.fn(async (messages, opts) => {
    const next = replies.shift()
    const reply = typeof next === 'function' ? next(messages, opts) : next
    const raw = JSON.stringify(reply ?? {})
    return { raw, parsed: reply ?? null, ms: 1, model: 'mock' }
  }),
}))

const { runQuery } = await import('../engine/router.js')
const { chatLLM } = await import('../llm/index.js')

beforeEach(() => {
  replies.length = 0
  chatLLM.mockClear()
})

describe('small model: classify → compose → repair', () => {
  test('an invalid date is repaired, the change still needs a tap', async () => {
    settings.current = { backend: 'webllm', webllmModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC' }
    replies.push(
      { intent: 'edit_todo', confidence: 'high' },
      { text: 'Skript lesen', due_date: 'soon', command: '/edit_todo text:"Skript lesen" due_date:soon' },
      (messages) => {
        expect(messages.at(-1).content).toMatch(/due_date: "soon" is not a date/)
        return { text: 'Skript lesen', due_date: '2026-09-18', command: '/edit_todo text:"Skript lesen" due_date:2026-09-18' }
      },
    )
    const api = makeApi()
    const res = await runQuery('Könntest du bei Skript lesen das Datum auf übermorgen ändern', api)
    expect(res.meta.trace.llm.map(e => e.kind)).toEqual(['classify', 'compose', 'repair'])
    expect(res.meta.trace.decision).toBe('model-proposed-change')
    const option = res.blocks.find(b => b.type === 'choices').data.options[0]
    expect(option).toMatchObject({ intent: 'edit_todo', slots: { text: 'Skript lesen', due_date: '2026-09-18' } })
    expect(api.writes).toHaveLength(0)
  })

  test('the compose prompt teaches the command language step by step', async () => {
    settings.current = { backend: 'webllm', webllmModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC' }
    let prompt = null
    let schema = null
    replies.push(
      { intent: 'edit_todo', confidence: 'high' },
      (messages, opts) => { prompt = messages[0].content; schema = opts.schema; return { text: 'Skript lesen', due_date: '2026-09-18', command: '' } },
    )
    await runQuery('Könntest du bei Skript lesen das Datum auf übermorgen ändern', makeApi({ recent: [{ intent: 'list_todos', entities: [{ type: 'todo', id: 'td-skript' }] }] }))
    expect(prompt).toMatch(/\/edit_todo text:ref:todo new_text:text\? due_date:date\?/)
    expect(prompt).toMatch(/Command format: \/action field:value/)
    expect(prompt).toMatch(/day after tomorrow = Friday 2026-09-18/)
    expect(prompt).toMatch(/todos: "Skript lesen"/)
    expect(prompt).toMatch(/Recognised in the message: .*\[date:2026-09-18 Fri\]/)
    expect(prompt).toMatch(/Before: last answer answered list_todos; showed todo "Skript lesen"/)
    // Fields in fill order, the command last.
    expect(Object.keys(schema.properties)[0]).toBe('text')
    expect(Object.keys(schema.properties).at(-1)).toBe('command')
  })

  test('nothing usable: the model answers from the data', async () => {
    settings.current = { backend: 'webllm', webllmModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC' }
    replies.push({ intent: 'none', confidence: 'low' }, { answer: 'Am Freitag.', found: true })
    const res = await runQuery('Blubber blabber?', makeApi())
    expect(res.meta.source).toBe('llm-answer')
  })
})

describe('capable model: planner', () => {
  test('writes the command in one step', async () => {
    settings.current = { backend: 'ollama', ollamaModel: 'llama3.2' }
    replies.push({ intent: 'free_time', command: '/free_time date:tomorrow minutes:120' })
    const res = await runQuery('Gibts morgen ein Loch von zwei Stunden', makeApi())
    expect(res.meta.trace.llm.map(e => e.kind)).toEqual(['plan'])
    const option = res.blocks.find(b => b.type === 'choices')?.data.options[0] ?? { intent: res.meta.intent, slots: res.meta.slots }
    expect(option).toMatchObject({ intent: 'free_time', slots: { date: '2026-09-17', minutes: 120 } })
  })

  test('a wrong field goes back once', async () => {
    settings.current = { backend: 'ollama', ollamaModel: 'llama3.2' }
    replies.push(
      { intent: 'set_topic_target', command: '/set_topic_target topic:Anatomie goal:85' },
      { intent: 'set_topic_target', command: '/set_topic_target topic:Anatomie target:85' },
    )
    const res = await runQuery('Anatomie soll künftig 85 erreichen', makeApi())
    expect(res.meta.trace.llm.map(e => e.kind)).toEqual(['plan', 'repair'])
    expect(res.meta.trace.llm[1].error).toBeUndefined()
    const option = res.blocks.find(b => b.type === 'choices').data.options[0]
    expect(option).toMatchObject({ intent: 'set_topic_target', slots: { topic: 'Anatomie', target: 85 } })
  })
})
