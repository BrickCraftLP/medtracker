import { describe, expect, test } from 'vitest'
import '../intents/index.js'
import { parseCommand, formatCommand, looksLikeCommand, resolveIntentId } from '../engine/command.js'
import { makeApi } from './fixtures/api.js'

const one = (s, opts) => parseCommand(s, makeApi(opts)).commands[0]

describe('parse', () => {
  test('fields, quotes and lists', () => {
    const c = one('/add_event title:"Brunch mit Anna" date:2026-09-18 start:10:00 minutes:1h30 reminders:[30,1440] all_day:false')
    expect(c.errors).toEqual([])
    expect(c.slots).toEqual({ title: 'Brunch mit Anna', date: '2026-09-18', start: '10:00', minutes: 90, reminders: [30, 1440], all_day: false })
  })
  test.each([
    ['today', '2026-09-16'], ['tomorrow', '2026-09-17'], ['+3d', '2026-09-19'], ['+1w', '2026-09-23'], ['-2d', '2026-09-14'],
    ['fri', '2026-09-18'], ['wed', '2026-09-16'], ['next-wed', '2026-09-23'], ['3.10.', '2026-10-03'], ['freitag', '2026-09-18'],
  ])('date %s', (v, want) => expect(one(`/day_agenda date:${v}`).slots.date).toBe(want))
  test.each([['14:30', '14:30'], ['9', '09:00'], ['now', '10:00'], ['+2h', '12:00'], ['3pm', '15:00'], ['"15 uhr"', '15:00']])('time %s', (v, want) => {
    expect(one(`/check_overlap date:today start:${v}`).slots.start).toBe(want)
  })
  test('primary field from free words', () => expect(one('/search_all alles zu chemie').slots.query).toBe('alles zu chemie'))
  test('unique prefix of an action', () => {
    expect(resolveIntentId('list_to')).toBe('list_todos')
    expect(one('/list_to overdue:true').intent).toBe('list_todos')
  })
  test('references', () => {
    const c = one('/complete_todo text:@last', { recent: [{ entities: [{ type: 'todo', id: 'td-kittel' }] }] })
    expect(c.errors).toEqual([])
    expect(c.slots.text).toBe('@last')
    expect(c.rows.text.id).toBe('td-kittel')
    expect(one('/day_agenda date:@screen', { screen: { screen: 'calendar', date: '2026-09-20' } }).slots.date).toBe('2026-09-20')
  })
  test('chains', () => {
    const { commands, errors } = parseCommand('/day_agenda date:fri ; /list_todos', makeApi())
    expect(errors).toEqual([])
    expect(commands.map(c => c.intent)).toEqual(['day_agenda', 'list_todos'])
  })
  test('a ";" inside quotes is no chain', () => {
    expect(parseCommand('/search_all query:"a;b"', makeApi()).commands).toHaveLength(1)
  })
  test('looksLikeCommand', () => {
    expect(looksLikeCommand('/day_agenda')).toBe(true)
    expect(looksLikeCommand('Was steht an / heute?')).toBe(false)
  })
})

describe('errors carry hints', () => {
  test.each([
    ['/nope', /unknown action "\/nope"/],
    ['/day_agenda date:someday', /date: "someday" is not a date/],
    ['/check_overlap date:today start:25:99', /is not a time/],
    ['/event_info query:genetik field:colour', /not one of location, start, end/],
    ['/day_agenda colour:red', /unknown field "colour" — day_agenda takes date/],
    ['/move_event date:fri', /title is required/],
    ['/complete_todo text:"Einkaufen gehen"', /no todo named "Einkaufen gehen"\. Known: /],
    ['/complete_todo text:@screen', /@screen points at no todo/],
    ['/set_topic_target topic:Anatomie target:150', /not a percentage between 0 and 100/],
    ['/day_agenda ; /day_agenda ; /day_agenda ; /day_agenda', /at most 3 commands/],
  ])('%s', (s, re) => {
    const { errors } = parseCommand(s, makeApi())
    expect(errors.map(e => e.message).join('\n')).toMatch(re)
  })
})

describe('format', () => {
  test('canonical order, quotes, lists, skips empty', () => {
    expect(formatCommand('add_event', { start: '10:00', title: 'Brunch mit Anna', date: '2026-09-18', location: null, reminders: [30], all_day: false }))
      .toBe('/add_event title:"Brunch mit Anna" date:2026-09-18 start:10:00 reminders:[30]')
  })
  test('round trip', () => {
    const api = makeApi()
    const slots = { text: 'Skript lesen', due_date: '2026-09-18', due_time: '09:00', priority: 3 }
    const again = parseCommand(formatCommand('edit_todo', slots), api).commands[0]
    expect(again.errors).toEqual([])
    expect(again.slots).toEqual(slots)
  })
})
