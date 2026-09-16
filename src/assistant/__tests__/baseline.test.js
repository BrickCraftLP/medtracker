// Phrasings that worked before the parser rewrite must resolve to the same
// intent and slots (fixtures/baseline.json was recorded from the old parser).
import { describe, expect, test } from 'vitest'
import { runQuery } from '../engine/router.js'
import { makeApi } from './fixtures/api.js'
import baseline from './fixtures/baseline.json'

// Slots the old parser did not produce but the new one may add.
const pick = (slots, keys) => Object.fromEntries(keys.map(k => [k, slots?.[k] ?? null]))

describe('baseline phrasings', () => {
  for (const [phrase, want] of Object.entries(baseline)) {
    test(`${want.intent ?? want.decision}: ${phrase}`, async () => {
      const res = await runQuery(phrase, makeApi({ lang: want.lang }))
      const t = res?.meta?.trace
      if (want.intent) {
        expect(res?.meta?.intent).toBe(want.intent)
        const keys = Object.keys(want.slots ?? {})
        expect(pick(res.meta.slots, keys)).toEqual(pick(want.slots, keys))
      } else {
        expect(t?.decision).toBe(want.decision)
      }
    })
  }
})
