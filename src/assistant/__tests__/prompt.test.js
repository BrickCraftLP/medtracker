import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import '../intents/index.js'
import { allIntents } from '../engine/registry.js'
import { classifyPrompt, composePrompt, plannerPrompt, answerPrompt, repairPrompt } from '../llm/prompt.js'
import { signature, TYPE_HELP, stepOrder } from '../engine/schema.js'
import { makeApi } from './fixtures/api.js'

const ctx = () => ({ api: makeApi({ screen: { screen: 'calendar', view: 'day', date: '2026-09-18' }, recent: [{ intent: 'day_agenda', date: '2026-09-18', entities: [{ type: 'event', id: 'ev-brunch', date: '2026-09-18' }] }] }), tagged: 'verschieb das auf [time:11:00]' })
const size = p => p.messages.reduce((n, m) => n + m.content.length, 0)

// Small models have ~4k tokens of context (~3 characters per token here).
describe('prompt budgets', () => {
  test('compose stays small for every action', () => {
    for (const intent of allIntents()) {
      const p = composePrompt('verschieb das auf 11 uhr', intent.id, ctx())
      expect(size(p), intent.id).toBeLessThan(4200)
    }
  })
  test('classify', () => expect(size(classifyPrompt('x', ['move_event', 'edit_todo', 'free_time', 'search_all', 'day_agenda', 'event_info'], ctx()))).toBeLessThan(3500))
  test('planner with 12 actions', () => {
    const ids = allIntents().slice(0, 12).map(i => i.id)
    expect(size(plannerPrompt('verschieb das auf 11 uhr', ids, ctx()))).toBeLessThan(7500)
  })
  test('answer', () => expect(size(answerPrompt('was ist am freitag', ctx().api))).toBeLessThan(6000))
})

describe('compose builds the command step by step', () => {
  test('schema fields follow the fill order, command last', () => {
    for (const intent of allIntents()) {
      const p = composePrompt('x', intent.id, ctx())
      expect(Object.keys(p.schema.properties)).toEqual([...stepOrder(intent).map(s => s.key), 'command'])
      expect(p.schema.required).toEqual(Object.keys(p.schema.properties))
    }
  })
  test('what it acts on comes first, then when', () => {
    expect(stepOrder(allIntents().find(i => i.id === 'move_event')).map(s => s.key)).toEqual(['title', 'from_date', 'date', 'start'])
  })
  test('screen, last answer and names are in the prompt', () => {
    const text = composePrompt('verschieb das auf 11 uhr', 'move_event', ctx()).messages[0].content
    expect(text).toMatch(/On screen: screen: calendar \(day view\), showing 2026-09-18 \(@screen\)/)
    expect(text).toMatch(/last answer answered day_agenda for 2026-09-18; showed event "Brunch mit Anna" on 2026-09-18/)
    expect(text).toMatch(/calendar entries: "Brunch mit Anna"/)
  })
  test('repair appends the reply and the objections', () => {
    const p = composePrompt('x', 'move_event', ctx())
    const r = repairPrompt(p, '{"command":"/move_event"}', '- title is required')
    expect(r.messages.slice(-2).map(m => m.role)).toEqual(['assistant', 'user'])
    expect(r.messages.at(-1).content).toMatch(/title is required/)
    expect(r.schema).toBe(p.schema)
  })
})

describe('PARSER_GUIDE.md stays in sync', () => {
  const guide = readFileSync(new URL('../llm/PARSER_GUIDE.md', import.meta.url), 'utf8')
  test('every value rule, word for word', () => {
    for (const line of Object.values(TYPE_HELP)) expect(guide).toContain(`- ${line}`)
  })
  test('every action with its current signature', () => {
    for (const intent of allIntents()) expect(guide, intent.id).toContain(`\`${signature(intent).replace(/\|/g, '\\|')}\``)
  })
})
