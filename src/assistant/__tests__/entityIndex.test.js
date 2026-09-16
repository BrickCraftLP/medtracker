import { describe, expect, test } from 'vitest'
import { makeApi } from './fixtures/api.js'
import { tagQuery } from '../engine/tagger.js'
import { setAlias } from '../engine/userStore.js'

describe('search: query words found in an entity', () => {
  test('across languages and inflections', () => {
    const idx = makeApi().index()
    expect(idx.best('chemistry', { types: ['event'] }).row.id).toBe('ev-chem')
    expect(idx.best('Vorlesungen Genetik', { types: ['event'], min: 0.5 }).row.id).toBe('ev-gen')
    expect(idx.best('dentist', { types: ['event'] }).row.id).toBe('ev-dent')
  })
  test('umlauts and exact names score 2', () => {
    const hit = makeApi().index().best('bücher zurückbringen', { types: ['todo'] })
    expect(hit).toMatchObject({ score: 2, row: { id: 'td-buch' } })
  })
  test('places and people are entities', () => {
    const idx = makeApi().index()
    expect(idx.best('Café Central', { types: ['place'] }).row.eventIds).toEqual(['ev-brunch', 'ev-brunch-old'])
    expect(idx.best('anna', { types: ['person'] }).entity.name).toBe('Anna')
  })
  test('what is on screen wins a tie', () => {
    const plain = makeApi().index().best('brunch', { types: ['event'] })
    const api = makeApi({ screen: { screen: 'calendar', openEventId: 'ev-brunch-old' } })
    const focused = api.index().best('brunch', { types: ['event'], focus: api.focus() })
    expect(plain.row.id).toBe('ev-brunch')
    expect(focused.row.id).toBe('ev-brunch-old')
  })
  test('taught short forms', () => {
    setAlias('PK', 'Pharmakologie')
    const api = makeApi()
    expect(api.findTopic('pk')?.id).toBe('t-pharm')
    expect(api.findTopicIn('wie läuft pk')?.id).toBe('t-pharm')
  })
})

describe('mentions: entity names inside a sentence', () => {
  test('the longest complete name wins, with its span', () => {
    const [m] = makeApi().index().mentions('ändere das datum von anatomie kapitel 3 wiederholen auf montag', { types: ['todo', 'topic'] })
    expect(m.row.id).toBe('td-anat3')
    expect(m.span).toEqual([4, 7])
  })
  test('the index is rebuilt only when data changes', () => {
    const api = makeApi()
    expect(api.index()).toBe(api.index())
  })
})

describe('tagging for the model', () => {
  test('entities, dates and times are labelled', () => {
    const { tagged } = tagQuery('Verschieb den Brunch mit Anna auf Samstag 11 Uhr', makeApi())
    // ("verschieb" is typo-corrected to the known verb "verschiebe")
    expect(tagged).toBe('verschiebe den [event:Brunch mit Anna] auf [date:2026-09-19 Sat] [time:11:00]')
  })
  test('durations and spans', () => {
    const { tagged } = tagQuery('Wann kann ich nächste Woche 2 Stunden Anatomie lernen', makeApi())
    expect(tagged).toContain('[duration:120min]')
    expect(tagged).toContain('[dates:2026-09-21..2026-09-27]')
    // "Anatomie lernen" names both the topic and the study entry "Lernen: Anatomie"; either label helps.
    expect(tagged).toMatch(/\[(?:topic|event):(?:Lernen: )?Anatomie\]/)
  })
})
