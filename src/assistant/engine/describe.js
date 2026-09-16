// One readable line for "intent + slots", used on choice cards ("Did you mean
// …?", "Should I do this?") so the user sees exactly what a tap will do.

import { getIntent } from './registry.js'
import { rowOf } from './references.js'

const FIELD = {
  location: ['Where is', 'Wo ist'],
  start: ['When does … start:', 'Wann beginnt'],
  end: ['When does … end:', 'Wann endet'],
  duration: ['How long is', 'Wie lange dauert'],
  notes: ['Notes of', 'Notizen zu'],
  calendar: ['Calendar of', 'Kalender von'],
  recurrence: ['How often is', 'Wie oft ist'],
  count: ['How many dates:', 'Wie viele Termine:'],
}

const SCREEN = {
  home: ['Home', 'Start'], calendar: ['Calendar', 'Kalender'], topics: ['Topics', 'Themen'], exams: ['Exams', 'Prüfungen'],
  statistics: ['Statistics', 'Statistik'], settings: ['Settings', 'Einstellungen'], assistant_settings: ['Assistant settings', 'Assistent-Einstellungen'],
}

export function describeAction(api, id, s = {}) {
  const L = api.L
  const q = v => (v ? ` „${v}“` : '')
  const day = d => (d ? api.fmtDay(d) : '')
  // "@todo:<id>" → the row's name, for labels.
  const name = v => {
    const m = String(v ?? '').match(/^@(\w+):(.+)$/)
    if (!m) return v === '@screen' || v === '@last' ? L('this', 'das') : v
    const row = rowOf(api, m[1], m[2])
    return row?.title ?? row?.text ?? row?.name ?? v
  }
  s = Object.fromEntries(Object.entries(s ?? {}).map(([k, v]) => [k, ['text', 'title', 'query'].includes(k) && typeof v === 'string' && v.startsWith('@') ? name(v) : v]))
  switch (id) {
    case 'edit_todo': {
      if (s.new_text) return L(`Rename todo${q(s.text)} to${q(s.new_text)}`, `Todo${q(s.text)} umbenennen in${q(s.new_text)}`)
      const parts = [
        s.due_date && L(`due ${day(s.due_date)}`, `fällig ${day(s.due_date)}`),
        s.due_time && L(`at ${s.due_time}`, `um ${s.due_time}`),
        s.priority !== undefined && s.priority !== '' && (s.priority == null || s.priority === 'null' ? L('no priority', 'keine Priorität') : L(`priority ${s.priority}`, `Priorität ${s.priority}`)),
      ].filter(Boolean).join(', ')
      return L(`Change todo${q(s.text)}${parts ? `: ${parts}` : ''}`, `Todo${q(s.text)} ändern${parts ? `: ${parts}` : ''}`)
    }
    case 'complete_todo': return L(`Mark${q(s.text)} as done`, `${q(s.text).trim() || 'Todo'} abhaken`)
    case 'delete_todo': return L(`Delete todo${q(s.text)}`, `Todo${q(s.text)} löschen`)
    case 'add_todo': return L(`New todo${q(s.text)}${s.due_date ? ` · ${day(s.due_date)}` : ''}`, `Neues Todo${q(s.text)}${s.due_date ? ` · ${day(s.due_date)}` : ''}`)
    case 'list_todos': return L('Show my todos', 'Meine Todos zeigen')
    case 'add_event': return L(`New event${q(s.title)}`, `Neuer Termin${q(s.title)}`) + [day(s.date), s.start].filter(Boolean).map(x => ` · ${x}`).join('')
    case 'move_event': return L(`Move${q(s.title)} to`, `${q(s.title).trim() || 'Termin'} verschieben auf`) + ` ${[day(s.date), s.start].filter(Boolean).join(' ')}`
    case 'delete_event': return L(`Delete event${q(s.title)}`, `Termin${q(s.title)} löschen`)
    case 'free_time': return L(`When am I free${s.date ? ` on ${day(s.date)}` : ''}?`, `Wann habe ich${s.date ? ` am ${day(s.date)}` : ''} Zeit?`)
    case 'day_agenda': return L(`What's on ${s.date ? day(s.date) : 'today'}?`, `Was steht ${s.date ? `am ${day(s.date)}` : 'heute'} an?`)
    case 'event_info': {
      const f = FIELD[s.field] ?? FIELD.location
      return `${L(f[0], f[1])}${q(s.query)}?`
    }
    case 'day_bounds': return s.mode === 'first' ? L(`First entry ${day(s.date) || 'today'}`, `Erster Termin ${day(s.date) || 'heute'}`) : L(`When am I done ${day(s.date) || 'today'}?`, `Wann bin ich ${day(s.date) || 'heute'} fertig?`)
    case 'next_occurrence': return L(`When is${q(s.query)} next?`, `Wann ist${q(s.query)} das nächste Mal?`)
    case 'search_all': return L(`Search${q(s.query)}`, `${q(s.query).trim() || 'Alles'} suchen`)
    case 'open_screen': return s.screen === 'topic_stats'
      ? L(`Open${q(name(s.topic))}`, `${q(name(s.topic)).trim() || 'Thema'} öffnen`)
      : L(`Open ${SCREEN[s.screen]?.[0] ?? s.screen}${s.date ? ` on ${day(s.date)}` : ''}`, `${SCREEN[s.screen]?.[1] ?? s.screen}${s.date ? ` am ${day(s.date)}` : ''} öffnen`)
    case 'start_session': return L(`Start a session${s.topic ? ` for${q(name(s.topic))}` : ''}`, `Session${s.topic ? ` für${q(name(s.topic))}` : ''} starten`)
    case 'explain_screen': return L('Summarise this screen', 'Diesen Bildschirm zusammenfassen')
    case 'add_exam': return L(`Add exam${q(s.title)}${s.date ? ` on ${day(s.date)}` : ''}`, `Prüfung${q(s.title)}${s.date ? ` am ${day(s.date)}` : ''} eintragen`)
    case 'move_exam': return L(`Move exam${q(name(s.exam))} to ${day(s.date)}`, `Prüfung${q(name(s.exam))} auf ${day(s.date)} verschieben`)
    case 'delete_exam': return L(`Delete exam${q(name(s.exam))}`, `Prüfung${q(name(s.exam))} löschen`)
    case 'set_topic_target': return L(`Set target of${q(name(s.topic))} to ${s.target} %`, `Ziel von${q(name(s.topic))} auf ${s.target} % setzen`)
    case 'set_topic_weight': return L(`Set weight of${q(name(s.topic))} to ${s.weight}`, `Gewichtung von${q(name(s.topic))} auf ${s.weight} setzen`)
    case 'rename_topic': return L(`Rename topic${q(name(s.topic))} to${q(s.name)}`, `Thema${q(name(s.topic))} in${q(s.name)} umbenennen`)
    case 'weekly_review': return L('Weekly review', 'Wochenrückblick')
    case 'workload_forecast': return L(`Forecast for the next ${s.days ?? 14} days`, `Prognose für die nächsten ${s.days ?? 14} Tage`)
    case 'exam_plan': return L(`Study plan${s.exam ? ` for${q(s.exam)}` : ''}`, `Lernplan${s.exam ? ` für${q(s.exam)}` : ''}`)
    case 'how_am_i_doing': return L('How am I doing overall?', 'Wie läuft es insgesamt?')
    case 'about_me': return L('What do you know about me?', 'Was weißt du über mich?')
    case 'remember': return s.kind === 'alias'
      ? L(`Remember:${q(s.key)} means${q(s.value)}`, `Merken:${q(s.key)} heißt${q(s.value)}`)
      : L(`Remember${q(s.value)}`, `Merken:${q(s.value)}`)
    case 'forget': return s.what === 'all' ? L('Forget everything', 'Alles vergessen') : L(`Forget${q(s.what)}`, `${q(s.what).trim()} vergessen`)
    default: {
      const intent = getIntent(id)
      return intent?.examples?.[api.lang === 'de' ? 1 : 0] ?? intent?.examples?.[0] ?? id
    }
  }
}
