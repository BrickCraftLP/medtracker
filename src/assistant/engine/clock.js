// The one place the assistant reads the wall clock. Small local models cannot
// do date arithmetic reliably, so the prompt gets a ready-made table of day
// names → day keys to copy from instead of calculating.

import { dayKey, addDays, parseDayKey } from '../../utils/calendar/eventModel.js'
import { getLocale } from '../../i18n/index.js'

const pad = n => String(n).padStart(2, '0')

// ISO 8601 week number (weeks start Monday, week 1 contains the first Thursday).
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export function clockInfo(lang = 'de', now = new Date()) {
  const locale = lang === 'en' ? 'en-US' : getLocale(lang)
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' } catch { /* ignore */ }
  return {
    now,
    today: dayKey(now),
    minutes: now.getHours() * 60 + now.getMinutes(),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekdayLong: now.toLocaleDateString(locale, { weekday: 'long' }),
    dateLong: now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    tz,
    week: isoWeek(now),
  }
}

// English on purpose: it is prompt text for the model, not UI.
export function dateTable(today) {
  const name = key => parseDayKey(key).toLocaleDateString('en-US', { weekday: 'long' })
  const rows = [
    `today = ${name(today)} ${today}`,
    `tomorrow = ${name(addDays(today, 1))} ${addDays(today, 1)}`,
    `day after tomorrow = ${name(addDays(today, 2))} ${addDays(today, 2)}`,
  ]
  for (let i = 1; i <= 7; i++) {
    const k = addDays(today, i)
    rows.push(`next ${name(k)} = ${k}`)
  }
  const dow = parseDayKey(today).getDay()
  const sat = dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow)
  rows.push(`this weekend = ${sat} to ${addDays(sat, 1)}`)
  const nextMon = addDays(today, ((8 - dow) % 7) || 7)
  rows.push(`next week = ${nextMon} (Monday) to ${addDays(nextMon, 6)} (Sunday)`)
  return rows.join('\n')
}
