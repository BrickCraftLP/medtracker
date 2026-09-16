import { describe, expect, test } from 'vitest'
import { getProfile, habitFor, profileLine, profileFacts, storedFacts } from '../engine/profile.js'
import { setAlias, setPlace, addNote, forget, getStoredProfile, resetUserStoreCache } from '../engine/userStore.js'
import { normalize } from '../engine/normalize.js'
import { makeApi } from './fixtures/api.js'

describe('habits derived from data', () => {
  test('study rhythm', () => {
    const p = getProfile(makeApi())
    expect(p.study.window).toMatchObject({ from: 17, to: 20 })
    expect(p.study.topTopics[0].name).toBe('Anatomie')
    expect(p.study.medianMinutes).toBe(45)
  })
  test('what an entry called "Brunch" usually looks like', () => {
    expect(habitFor(makeApi(), 'Brunch mit Tom')).toMatchObject({ word: 'brunch', count: 2, minutes: 60, start: 600, location: 'Café Central', reminders: [30], calendarId: 'cal-priv' })
    expect(habitFor(makeApi(), 'Zahnarzt')).toBeNull()
  })
  test('one short line for prompts', () => {
    const line = profileLine(makeApi(), { title: 'Brunch' })
    expect(line.length).toBeLessThanOrEqual(200)
    expect(line).toMatch(/studies mostly 17-20h/)
    expect(line).toMatch(/"brunch" usually 10:00 60 min @ Café Central/)
  })
  test('facts for "what do you know about me"', () => {
    const labels = profileFacts(makeApi()).map(f => f.label)
    expect(labels).toContain('Übliche Lernzeit')
    expect(labels).toContain('„brunch“')
  })
})

describe('what the user taught', () => {
  test('stored on the device and read back', () => {
    setAlias('Anat', 'Anatomie')
    setPlace('zahnarzt', 'Praxis Huber')
    addNote('Prüfungsangst vor mündlichen Prüfungen')
    resetUserStoreCache()
    expect(getStoredProfile()).toMatchObject({ aliases: { anat: 'anatomie' }, places: { zahnarzt: 'Praxis Huber' } })
    expect(storedFacts(makeApi()).map(f => f.kind)).toEqual(['alias', 'place', 'note'])
  })
  test('aliases expand in every parser', () => {
    setAlias('pk', 'pharmakologie')
    expect(normalize('Wann ist PK?')).toBe('wann ist pharmakologie')
    expect(normalize('Spark')).toBe('spark')
  })
  test('forget by short form, meaning, place or note words', () => {
    setAlias('pk', 'pharmakologie')
    addNote('Mag keine Frühtermine')
    expect(forget('Pharmakologie')).toBe(1)
    expect(forget('frühtermine')).toBe(1)
    expect(getStoredProfile().aliases).toEqual({})
  })
})
