// A sentence with everything the parser recognised labelled, for the model:
//
//   "Verschieb den Brunch auf Samstag 11 Uhr"
//   → "verschieb den [event:Brunch mit Anna] auf [date:2026-09-19 Sat] [time:11:00]"
//
// Small models pick actions and copy values far more reliably from labelled
// text than from the raw message.

import { normalize } from './normalize.js'
import { tokensOf } from './lexicon.js'
import { parseTimeRange, parseTime, fmtMin } from './parse/times.js'
import { parseDuration } from './parse/durations.js'
import { parseDate, parseDateRange } from './parse/dates.js'
import { parseDayKey } from '../../utils/calendar/eventModel.js'

const wd = key => parseDayKey(key).toLocaleDateString('en-US', { weekday: 'short' })

export function tagQuery(raw, api) {
  const text = normalize(raw)
  let s = ` ${text} `
  const labels = new Map()
  const mark = (m, label) => {
    if (!m?.match) return m
    const id = `qq${labels.size}qq`
    labels.set(id, label(m))
    s = s.replace(m.match, ` ${id} `)
    return m
  }
  const range = mark(parseTimeRange(s), m => `[time:${fmtMin(m.start)}-${fmtMin(m.end)}]`)
  mark(parseDuration(s), m => `[duration:${m.minutes}min]`)
  if (!range) mark(parseTime(s), m => `[time:${fmtMin(m.minutes)}${m.fuzzy ? '?' : ''}]`)
  mark(parseDateRange(s, api.today), m => `[dates:${m.from}..${m.to}]`)
  mark(parseDate(s, api.today), m => `[date:${m.date} ${wd(m.date)}]`)

  const toks = tokensOf(s)
  const mentions = api.index().tagged(s, { focus: api.focus?.() })
  const out = []
  for (let i = 0; i < toks.length; i++) {
    const m = mentions.find(x => x.span[0] === i)
    if (m) {
      out.push(`[${m.entity.type}:${m.entity.name}]`)
      i = m.span[1]
      continue
    }
    out.push(labels.get(toks[i]) ?? toks[i])
  }
  return { normalized: text, tagged: out.join(' '), mentions }
}
