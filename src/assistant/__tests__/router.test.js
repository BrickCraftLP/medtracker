// New understanding: typed commands, screen and conversation context,
// chained requests and the new intents. Today is Wed 2026-09-16, 10:00.
import { describe, expect, test } from 'vitest'
import { runQuery } from '../engine/router.js'
import { entitiesOf } from '../engine/references.js'
import { makeApi } from './fixtures/api.js'
import { getLLMSettings } from '../llm/index.js'

const ask = (q, opts = {}) => {
  const api = makeApi(opts)
  return runQuery(q, api).then(res => ({ res, api }))
}
const blockOf = (res, type) => res.blocks.find(b => b.type === type)

describe('typed commands', () => {
  test('run exactly, with habits filled in', async () => {
    const { res } = await ask('/add_event title:"Brunch" date:fri start:10:00')
    expect(res.meta.source).toBe('command')
    expect(res.startFlow.draft).toMatchObject({ title: 'Brunch', date: '2026-09-18', startMin: 600, endMin: 660, location: 'Café Central', reminders: [30] })
  })
  test('words without a key go to the primary field', async () => {
    const { res } = await ask('/search_all chemie')
    expect(res.meta).toMatchObject({ intent: 'search_all', slots: { query: 'chemie' } })
  })
  test('problems come back as hints', async () => {
    const { res } = await ask('/move_event date:someday')
    expect(res.meta.source).toBe('command-error')
    const text = res.blocks[0].data.text
    expect(text).toMatch(/not a date/)
    expect(text).toMatch(/title is required/)
  })
  test('chains run in order', async () => {
    const { res } = await ask('/day_agenda date:tomorrow ; /list_todos overdue:true')
    expect(res.blocks.filter(b => b.data?.heading)).toHaveLength(2)
  })
})

describe('what is on screen', () => {
  const calendarFriday = { screen: 'calendar', view: 'day', date: '2026-09-18' }
  test('"Was steht an?" means the day shown', async () => {
    const { res } = await ask('Was steht an?', { screen: calendarFriday })
    expect(res.meta).toMatchObject({ intent: 'day_agenda', slots: { date: '2026-09-18' } })
  })
  test('free time on the day shown', async () => {
    const { res } = await ask('Wann habe ich Zeit?', { screen: calendarFriday })
    expect(res.meta).toMatchObject({ intent: 'free_time', slots: { date: '2026-09-18' } })
  })
  test('"Wird das besser?" on a topic', async () => {
    const { res } = await ask('Wird das besser?', { screen: { screen: 'topic-stats', topicId: 't-anat' } })
    expect(res.meta.intent).toBe('topic_progress')
    expect(res.title).toBe('Anatomie')
  })
  test('start a session for the topic on screen', async () => {
    const { res, api } = await ask('Starte eine Session', { screen: { screen: 'topic-stats', topicId: 't-chem' } })
    expect(res.meta.intent).toBe('start_session')
    expect(api.navigations).toEqual([{ path: '/session', state: { topicId: 't-chem' } }])
  })
  test('summarise the screen', async () => {
    const { res } = await ask('Was sehe ich hier?', { screen: calendarFriday })
    expect(res.meta.intent).toBe('explain_screen')
    expect(res.blocks.some(b => b.type === 'slots')).toBe(true)
  })
})

describe('the last answer', () => {
  test('"und Freitag?" repeats the question for another day', async () => {
    const { res } = await ask('und Freitag?', { recent: [{ intent: 'day_agenda', slots: { date: '2026-09-17' }, entities: [] }] })
    expect(res.meta).toMatchObject({ intent: 'day_agenda', source: 'followup', slots: { date: '2026-09-18' } })
  })
  test('"und Chemie?" swaps the topic', async () => {
    const { res } = await ask('und Chemie?', { recent: [{ intent: 'topic_progress', slots: { topic: 'Anatomie' }, entities: [{ type: 'topic', id: 't-anat' }] }] })
    expect(res.meta).toMatchObject({ intent: 'topic_progress', slots: { topic: 'Chemie' } })
  })
  test('"verschieb das auf 11 Uhr" moves the entry shown', async () => {
    const recent = [{ intent: 'search_all', entities: [{ type: 'event', id: 'ev-brunch', date: '2026-09-18' }] }]
    const { res, api } = await ask('Verschieb das auf 11 Uhr', { recent })
    expect(res.meta).toMatchObject({ intent: 'move_event', slots: { title: '@event:ev-brunch' } })
    expect(api.writes[0].row).toMatchObject({ id: 'ev-brunch', start_date: '2026-09-18', start_time: '11:00:00', end_time: '12:00:00' })
  })
  test('"hake das ab" completes the todo shown', async () => {
    const recent = [{ intent: 'list_todos', entities: [{ type: 'todo', id: 'td-skript' }] }]
    const { res, api } = await ask('Hake das ab', { recent })
    expect(res.meta.intent).toBe('complete_todo')
    expect(api.writes[0].row).toMatchObject({ id: 'td-skript', completed: true })
  })
  test('entities are read back from an answer', async () => {
    const { res } = await ask('Suche alles zu Brunch')
    const turn = entitiesOf(res)
    expect(turn.entities).toContainEqual(expect.objectContaining({ type: 'event', id: 'ev-brunch' }))
  })
})

describe('several requests at once', () => {
  test('read-only parts run together', async () => {
    const { res } = await ask('Was steht morgen an und wie spät ist es')
    expect(res.meta.trace.decision).toBe('chain')
    expect(res.blocks.filter(b => b.data?.heading).map(b => b.data.text)).toHaveLength(2)
  })
  test('changes are confirmed in one card', async () => {
    const { res, api } = await ask('Hake Skript lesen ab und hake Kittel kaufen ab')
    const card = blockOf(res, 'confirm')
    expect(card.data.actions.map(a => a.intent)).toEqual(['complete_todo', 'complete_todo'])
    expect(api.writes).toHaveLength(0)
  })
})

describe('new commands', () => {
  test('add an exam (asks first)', async () => {
    const { res, api } = await ask('Trag die Klausur Pharma am 3.10. ein')
    expect(res.meta).toMatchObject({ intent: 'add_exam', slots: { title: 'Klausur Pharma', date: '2026-10-03', topic: 'Pharmakologie' } })
    expect(blockOf(res, 'confirm')).toBeTruthy()
    expect(api.writes).toHaveLength(0)
  })
  test('move an exam', async () => {
    const { res, api } = await ask('Verschiebe die Pharmakologie Klausur auf den 20.10.')
    expect(res.meta.intent).toBe('move_exam')
    expect(api.writes[0].row).toMatchObject({ id: 'x-pharm', exam_date: '2026-10-20' })
  })
  test('set a topic target', async () => {
    const { res, api } = await ask('Setz das Ziel von Anatomie auf 85 %')
    expect(res.meta.intent).toBe('set_topic_target')
    expect(api.writes[0].row).toMatchObject({ id: 't-anat', target_accuracy: 85 })
  })
  test('open the calendar on a day', async () => {
    const { res, api } = await ask('Öffne den Kalender am Freitag')
    expect(res.meta.intent).toBe('open_screen')
    expect(api.navigations[0].path).toBe('/calendar?d=2026-09-18')
  })
  test.each([
    ['Wochenrückblick', 'weekly_review'],
    ['Wie stressig werden die nächsten zwei Wochen?', 'workload_forecast'],
    ['Lernplan für die Anatomie Prüfung', 'exam_plan'],
    ['Wie läuft es insgesamt?', 'how_am_i_doing'],
    ['Was weißt du über mich?', 'about_me'],
  ])('%s', async (q, intent) => {
    const { res } = await ask(q)
    expect(res.meta.intent).toBe(intent)
    expect(res.blocks.length).toBeGreaterThan(0)
  })
  test('an exam plan proposes study windows before the exam', async () => {
    const { res } = await ask('Lernplan für die Anatomie Prüfung')
    const slots = blockOf(res, 'slots')
    expect(slots.data.topicId).toBe('t-anat')
    expect(slots.data.days.every(d => d.date > '2026-09-16' && d.date < '2026-10-05')).toBe(true)
  })
})

describe('parser upgrades in context', () => {
  test('after the lecture on Monday', async () => {
    const { res } = await ask('Trag Lernen nach der Vorlesung am Montag ein')
    expect(res.meta.slots).toMatchObject({ date: '2026-09-21', start: '09:45', kind: 'study' })
  })
  test('every Monday', async () => {
    const { res } = await ask('Trag jeden Montag um 10 Anatomie Tutorium ein')
    expect(res.meta.slots).toMatchObject({ date: '2026-09-21', start: '10:00', repeat: 'FREQ=WEEKLY;BYDAY=MO' })
    expect(res.startFlow.draft.rrule).toBe('FREQ=WEEKLY;BYDAY=MO')
  })
})

describe('personal understanding', () => {
  test('a taught short form works everywhere', async () => {
    const first = await ask('Merk dir: PK heißt Pharmakologie')
    expect(first.res.meta).toMatchObject({ intent: 'remember', slots: { kind: 'alias', key: 'pk' } })
    const { res } = await ask('Wird PK besser?')
    expect(res.meta).toMatchObject({ intent: 'topic_progress', slots: { topic: 'Pharmakologie' } })
  })
  test('a rename is not a short form', async () => {
    const { res } = await ask('Kittel kaufen heißt jetzt Kittel bestellen')
    expect(res.meta.intent).not.toBe('remember')
  })
  test('usual place for new entries', async () => {
    await ask('Zahnarzt ist immer in der Praxis Dr. Huber')
    const { res } = await ask('/add_event title:Zahnarzt date:fri start:15:00')
    expect(res.startFlow.draft.location).toBe('Praxis Dr. Huber')
  })
  test('waking hours are the same setting as in Settings → Assistant', async () => {
    const { res } = await ask('Mein Tag beginnt um 7')
    expect(res.meta).toMatchObject({ intent: 'remember', slots: { kind: 'day_start', value: '07:00' } })
    expect(getLLMSettings().dayStart).toBe(7 * 60)
  })
})
