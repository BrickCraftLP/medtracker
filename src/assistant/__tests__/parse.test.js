// New parser forms. Today is Wednesday 2026-09-16, 10:00 (setup.js).
import { describe, expect, test } from 'vitest'
import { extract } from '../engine/parse/index.js'
import { normalize } from '../engine/normalize.js'
import { parseRecurrence } from '../engine/parse/recurrence.js'
import { parseReminders } from '../engine/parse/reminders.js'

const TODAY = '2026-09-16'
const x = s => extract(normalize(s), TODAY)

describe('dates and spans', () => {
  test.each([
    ['Ende der Woche', { date: '2026-09-18' }],
    ['bis Monatsende', { date: '2026-09-30' }],
    ['end of the month', { date: '2026-09-30' }],
  ])('%s', (s, want) => expect(x(s)).toMatchObject(want))

  test.each([
    ['übernächste Woche', { from: '2026-09-28', to: '2026-10-04' }],
    ['week after next', { from: '2026-09-28', to: '2026-10-04' }],
    ['vom 3. bis 5. Oktober', { from: '2026-10-03', to: '2026-10-05' }],
    ['vom 3 bis 5 Oktober', { from: '2026-10-03', to: '2026-10-05' }],
    ['3.-5.10.', { from: '2026-10-03', to: '2026-10-05' }],
    ['october 3 to 5', { from: '2026-10-03', to: '2026-10-05' }],
    ['Montag bis Freitag', { from: '2026-09-21', to: '2026-09-25' }],
    ['mo-fr', { from: '2026-09-21', to: '2026-09-25' }],
  ])('%s', (s, want) => {
    const r = x(s)
    expect(r.range ?? { from: r.date, to: r.date }).toMatchObject(want)
    expect(r.startMin).toBeNull()
  })
})

describe('relative times', () => {
  test('in 2 Stunden', () => expect(x('Habe ich in 2 Stunden Zeit')).toMatchObject({ date: TODAY, startMin: 12 * 60, relative: true }))
  test('in 30 min', () => expect(x('in 30 min')).toMatchObject({ date: TODAY, startMin: 10 * 60 + 30 }))
  test('in einer halben Stunde', () => expect(x('in einer halben Stunde')).toMatchObject({ startMin: 10 * 60 + 30 }))
  test('in 2 Wochen stays a date', () => expect(x('in 2 Wochen')).toMatchObject({ date: '2026-09-30', startMin: null }))
})

describe('recurrence', () => {
  test.each([
    ['jeden Montag', 'FREQ=WEEKLY;BYDAY=MO'],
    ['jeden Montag und Mittwoch', 'FREQ=WEEKLY;BYDAY=MO,WE'],
    ['every tuesday', 'FREQ=WEEKLY;BYDAY=TU'],
    ['immer donnerstags', 'FREQ=WEEKLY;BYDAY=TH'],
    ['werktags', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['täglich', 'FREQ=DAILY'],
    ['wöchentlich', 'FREQ=WEEKLY'],
    ['alle 2 Wochen', 'FREQ=WEEKLY;INTERVAL=2'],
    ['every other week', 'FREQ=WEEKLY;INTERVAL=2'],
    ['monatlich', 'FREQ=MONTHLY'],
    ['täglich bis 3.10.', 'FREQ=DAILY;UNTIL=2026-10-03'],
    ['jeden Freitag 10 mal', 'FREQ=WEEKLY;BYDAY=FR;COUNT=10'],
  ])('%s', (s, rrule) => expect(parseRecurrence(normalize(s), TODAY)?.rrule).toBe(rrule))

  test('the series starts on the next such day, title stays clean', () => {
    const r = x('Anatomie Tutorium jeden Montag um 10')
    expect(r).toMatchObject({ rrule: 'FREQ=WEEKLY;BYDAY=MO', date: '2026-09-21', startMin: 600 })
    expect(r.rest).toBe('anatomie tutorium')
  })
  test('an until date is no event date', () => {
    const r = x('Yoga täglich bis 3.10. um 7')
    expect(r).toMatchObject({ rrule: 'FREQ=DAILY;UNTIL=2026-10-03', startMin: 420, date: null })
  })
})

describe('reminders', () => {
  test.each([
    ['30 min vorher', [30]],
    ['a day before', [1440]],
    ['erinnere mich 1 Stunde davor', [60]],
    ['30 min und 1 Tag vorher', [30, 1440]],
    ['ohne Erinnerung', []],
  ])('%s', (s, want) => expect(parseReminders(normalize(s))?.reminders).toEqual(want))

  test('reminders are not a duration', () => {
    const r = x('Zahnarzt morgen um 15 Uhr 30 min vorher')
    expect(r).toMatchObject({ date: '2026-09-17', startMin: 900, minutes: null, reminders: [30] })
  })
})
