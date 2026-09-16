import { describe, expect, test } from 'vitest'
import { suggest } from '../engine/suggest.js'
import { makeApi } from './fixtures/api.js'

describe('command autocomplete', () => {
  test('action ids with their signature', () => {
    const out = suggest('/move', makeApi())
    expect(out.map(s => s.value)).toEqual(['/move_event ', '/move_exam '])
    expect(out[0].label).toBe('/move_event title:ref:event from_date:date? date:date? start:time?')
  })
  test('fields not used yet, required first', () => {
    const out = suggest('/move_event ', makeApi())
    expect(out[0].value).toBe('/move_event title:')
    expect(suggest('/move_event title:x d', makeApi()).map(s => s.value)).toEqual(['/move_event title:x date:'])
  })
  test('values: real names, quoted', () => {
    const out = suggest('/complete_todo text:Sk', makeApi())
    expect(out[0].value).toBe('/complete_todo text:"Skript lesen" ')
  })
  test('values: the day on screen', () => {
    const out = suggest('/day_agenda date:', makeApi(), { screen: { screen: 'calendar', date: '2026-09-20' } })
    expect(out[0].value).toBe('/day_agenda date:@screen ')
  })
  test('complete commands can be sent', () => {
    expect(suggest('/move_event title:Brunch date:fri', makeApi())[0]).toMatchObject({ submit: true })
  })
})

describe('screen starters', () => {
  test('a topic screen suggests questions about that topic', () => {
    const out = suggest('', makeApi(), { screen: { screen: 'topic-stats', topicId: 't-chem' } })
    expect(out.slice(0, 2).map(s => s.value)).toEqual(['Wird Chemie besser?', 'Starte eine Session für Chemie'])
  })
})
