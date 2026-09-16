// One index over everything the user can name: topics, todos, calendar entries
// (one per series), exams, calendars, places and people. Built once per data
// change and shared by every intent, the router and the model prompts, so
// "Chemie", "chemistry", "chem" and a taught short form all find the same row
// the same way.
//
// Two directions:
//   search(query)   the query's words are found in an entity  ("brunch" → "Brunch mit Anna")
//   mentions(text)  an entity's name is found in a sentence   ("hake Skript lesen ab" → todo "Skript lesen")
//
// Scores are lexicon.matchScore (share of words matched, in both languages),
// so thresholds mean what they always meant. An inverted token index only
// narrows the rows that get scored. Ties are broken by what the user is
// looking at (`focus`), open / upcoming rows, then the longer name.

import { fold, expandAliases } from './normalize.js'
import { tokensOf, searchWords, variants, matchScore, tokenHits } from './lexicon.js'
import { profileRevision } from './userStore.js'
import { addDays } from '../../utils/calendar/eventModel.js'
import { expandRange } from '../../utils/calendar/recurrence.js'

export const ENTITY_TYPES = ['topic', 'todo', 'event', 'exam', 'calendar', 'place', 'person']

const memo = new WeakMap()

export function getIndex(api) {
  const deps = [api.events, api.topics, api.exams, api.calendars, api.today, api.lang, profileRevision()]
  const hit = memo.get(api.todos)
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.index
  const index = buildIndex(api)
  memo.set(api.todos, { deps, index })
  return index
}

const PERSON = /\b(?:mit|with)\s+(\p{Lu}[\p{L}'-]{1,30})/gu
const NOT_PERSON = new Set(['freunden', 'friends', 'familie', 'family', 'kollegen', 'team', 'dem', 'der', 'den', 'the'])

function buildIndex(api) {
  const lang = api.lang
  const today = api.today
  const entities = []
  const topicName = new Map(api.topics.map(t => [t.id, t.name]))
  const calName = new Map((api.calendars ?? []).map(c => [c.id, c.name]))
  const eventTitle = new Map(api.events.map(e => [e.id, e.title]))

  const add = (type, id, name, hay, row, extra = {}) => {
    if (!name || !String(name).trim()) return null
    const ent = { type, id, key: `${type}:${id}`, name: String(name).trim(), hay: String(hay ?? name), row, order: entities.length, ...extra }
    entities.push(ent)
    return ent
  }

  for (const t of api.topics) add('topic', t.id, t.name, t.name, t)
  for (const td of api.todos) {
    add('todo', td.id, td.text, `${td.text ?? ''} ${td.notes ?? ''} ${topicName.get(td.topic_id) ?? ''} ${eventTitle.get(td.event_id) ?? ''}`, td, { open: !td.completed })
  }

  const overridesOf = new Map()
  for (const e of api.events) {
    if (!e.recurrence_parent_id) continue
    if (!overridesOf.has(e.recurrence_parent_id)) overridesOf.set(e.recurrence_parent_id, [])
    overridesOf.get(e.recurrence_parent_id).push(e)
  }
  const places = new Map()
  const people = new Map()
  for (const e of api.events) {
    if (e.recurrence_parent_id) continue
    const ent = add('event', e.id, e.title,
      `${e.title ?? ''} ${e.notes ?? ''} ${e.location ?? ''} ${calName.get(e.calendar_id) ?? ''} ${topicName.get(e.topic_id) ?? ''} ${e.kind === 'exam' ? 'pruefung exam' : ''}`,
      e, { kind: e.kind })
    if (!ent) continue
    // Next and last date, computed on first use only.
    let when = null
    ent.when = () => {
      if (!when) {
        const occ = expandRange([e, ...(overridesOf.get(e.id) ?? [])], addDays(today, -120), addDays(today, 365))
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))
        when = { next: occ.find(o => o.date >= today) ?? null, last: [...occ].reverse().find(o => o.date < today) ?? null, count: occ.filter(o => o.date >= today).length }
      }
      return when
    }
    if (e.location?.trim()) {
      const k = fold(e.location.trim())
      if (!places.has(k)) places.set(k, { name: e.location.trim(), events: [] })
      places.get(k).events.push(e.id)
    }
    for (const m of String(e.title ?? '').matchAll(PERSON)) {
      const k = fold(m[1])
      if (NOT_PERSON.has(k)) continue
      if (!people.has(k)) people.set(k, { name: m[1], events: [] })
      people.get(k).events.push(e.id)
    }
  }
  for (const x of api.exams) add('exam', x.id, x.title, `${x.title ?? ''} ${topicName.get(x.topic_id) ?? ''} pruefung exam`, x, { date: x.exam_date })
  for (const c of api.calendars ?? []) add('calendar', c.id, c.name, c.name, c)
  for (const [k, p] of places) add('place', k, p.name, p.name, { name: p.name, eventIds: p.events }, { events: p.events })
  for (const [k, p] of people) add('person', k, p.name, p.name, { name: p.name, eventIds: p.events }, { events: p.events })

  // ── Inverted index ──────────────────────────────────────────────────────
  const vocab = new Map()          // token → Set(entity index)
  const post = (map, k, i) => { let s = map.get(k); if (!s) map.set(k, (s = new Set())); s.add(i) }
  const prefix = new Map()         // '^abc' / '~abcde' → Set
  entities.forEach((ent, i) => {
    ent.tokens = tokensOf(ent.hay)
    ent.nameWords = searchWords(ent.name)
    ent.nameFold = fold(ent.name).replace(/[^a-z0-9]+/g, ' ').trim()
    ent.length = ent.name.split(/\s+/).length
    for (const t of new Set(ent.tokens)) {
      post(vocab, t, i)
      if (t.length >= 3) post(prefix, `^${t.slice(0, 3)}`, i)
      if (t.length >= 5) post(prefix, `~${t.slice(0, 5)}`, i)
    }
  })
  const byKey = new Map(entities.map(e => [e.key, e]))

  // Entity rows a word could match in either direction (a superset; scoring decides).
  const wordCache = new Map()
  function candidatesOfWord(word) {
    if (wordCache.has(word)) return wordCache.get(word)
    const out = new Set()
    const merge = s => { if (s) for (const i of s) out.add(i) }
    for (const variant of variants(word, lang)) {
      for (const v of variant.split(' ')) {
        if (!v) continue
        merge(vocab.get(v))
        if (v.length >= 3) merge(prefix.get(`^${v.slice(0, 3)}`))
        if (v.length >= 5) merge(prefix.get(`~${v.slice(0, 5)}`))
        if (v.length > 3) {
          for (const [tok, set] of vocab) {
            if (tok.length > 3 && tok !== v && (tok.includes(v) || v.includes(tok))) merge(set)
          }
        }
      }
    }
    wordCache.set(word, out)
    return out
  }

  function candidates(text, types) {
    const ids = new Set()
    for (const w of searchWords(text)) for (const i of candidatesOfWord(w)) ids.add(i)
    const list = [...ids].map(i => entities[i])
    return types ? list.filter(e => types.includes(e.type)) : list
  }

  const prepare = text => expandAliases(fold(text ?? ''))

  function compare(focus) {
    const f = e => (focus?.has?.(e.key) ? 1 : 0)
    const live = e => (e.type === 'todo' ? (e.open ? 1 : 0) : e.type === 'event' ? (e.when().next ? 1 : 0) : 0)
    return (a, b) => b.score - a.score || f(b.entity) - f(a.entity) || live(b.entity) - live(a.entity) || 0
  }

  // Entities whose text contains the query's words. Exact name = score 2.
  function search(query, { types = null, min = 0.5, limit = 20, focus = null } = {}) {
    const q = prepare(query).trim()
    if (!q) return []
    const exact = q.replace(/[^a-z0-9]+/g, ' ').trim()
    const out = []
    for (const entity of candidates(q, types)) {
      const score = entity.nameFold === exact ? 2 : matchScore(q, entity.hay, { lang }).score
      if (score >= min) out.push({ entity, row: entity.row, score })
    }
    // Rows the words did not reach can still be an exact name (e.g. only stop words).
    if (!out.length) {
      for (const entity of entities) {
        if ((!types || types.includes(entity.type)) && entity.nameFold && entity.nameFold === exact) out.push({ entity, row: entity.row, score: 2 })
      }
    }
    return out.sort((a, b) => compare(focus)(a, b) || a.entity.order - b.entity.order).slice(0, limit)
  }

  // Entities named inside a sentence, with the token span that names them.
  function mentions(text, { types = null, min = 0.75, focus = null, limit = 20 } = {}) {
    const t = prepare(text)
    const toks = tokensOf(t)
    const flat = ` ${toks.join(' ')} `
    const out = []
    for (const entity of candidates(t, types)) {
      if (!entity.nameWords.length) continue
      let score = matchScore(entity.name, t, { lang }).score
      if (entity.nameFold && flat.includes(` ${entity.nameFold} `)) score = Math.max(score, 1)
      if (score < min) continue
      out.push({ entity, row: entity.row, score, span: spanOf(entity, toks) })
    }
    return out
      .sort((a, b) => compare(focus)(a, b) || b.entity.length - a.entity.length || a.entity.order - b.entity.order)
      .slice(0, limit)
  }

  function spanOf(entity, toks) {
    const idx = []
    for (const w of entity.nameWords) {
      const vs = variants(w, lang).filter(v => !v.includes(' '))
      const i = toks.findIndex((tok, j) => !idx.includes(j) && vs.some(v => tokenHits(v, tok)))
      if (i >= 0) idx.push(i)
    }
    return idx.length ? [Math.min(...idx), Math.max(...idx)] : null
  }

  // Best non-overlapping mentions across types, for tagging a sentence.
  function tagged(text, { types = ['todo', 'event', 'topic', 'exam', 'calendar', 'place', 'person'], focus = null } = {}) {
    const all = mentions(text, { types, focus, limit: 40 }).filter(m => m.span)
    const taken = []
    const chosen = []
    const width = m => m.span[1] - m.span[0]
    for (const m of all.sort((a, b) => b.score - a.score || width(b) - width(a) || b.entity.length - a.entity.length)) {
      if (taken.some(([s, e]) => m.span[0] <= e && s <= m.span[1])) continue
      taken.push(m.span)
      chosen.push(m)
    }
    return chosen.sort((a, b) => a.span[0] - b.span[0])
  }

  // Names of one type, most similar to `text` first (for prompts and pickers).
  function ranked(type, text = '', { limit = 8, filter = null } = {}) {
    const list = entities.filter(e => e.type === type && (!filter || filter(e)))
    if (!text) return list.slice(0, limit)
    const t = prepare(text)
    return list
      .map(e => ({ e, s: matchScore(e.name, t, { lang }).score + matchScore(t, e.hay, { lang }).score * 0.5 }))
      .sort((a, b) => b.s - a.s || a.e.order - b.e.order)
      .slice(0, limit)
      .map(x => x.e)
  }

  return {
    entities,
    get: (type, id) => byKey.get(`${type}:${id}`) ?? null,
    byKey: key => byKey.get(key) ?? null,
    ofType: type => entities.filter(e => e.type === type),
    candidates,
    search,
    best: (query, opts = {}) => search(query, { ...opts, limit: 1 })[0] ?? null,
    mentions,
    mentionOf: (text, type, opts = {}) => mentions(text, { ...opts, types: [type], limit: 1 })[0] ?? null,
    tagged,
    ranked,
  }
}
