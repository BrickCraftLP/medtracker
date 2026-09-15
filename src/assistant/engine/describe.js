// One readable line for "intent + slots", used on choice cards ("Did you mean
// …?", "Should I do this?") so the user sees exactly what a tap will do.

import { getIntent } from './registry.js'

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

export function describeAction(api, id, s = {}) {
  const L = api.L
  const q = v => (v ? ` „${v}“` : '')
  const day = d => (d ? api.fmtDay(d) : '')
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
    default: {
      const intent = getIntent(id)
      return intent?.examples?.[api.lang === 'de' ? 1 : 0] ?? intent?.examples?.[0] ?? id
    }
  }
}
