// A small, realistic data set for assistant tests. "Today" is Wednesday
// 2026-09-16 (see setup.js).

const at = (day, hour, min = 0) => new Date(2026, 8, day, hour, min).toISOString()
const session = (id, topic_id, day, hour, minutes, total, correct) => ({
  id, topic_id, started_at: at(day, hour), ended_at: at(day, hour, minutes), duration_seconds: minutes * 60, total_exercises: total, correct,
})

export function fixtureData() {
  return {
    calendars: [
      { id: 'cal-uni', name: 'Uni', workspace_id: 'ws1', is_default: true },
      { id: 'cal-priv', name: 'Privat', workspace_id: 'ws1' },
    ],
    topics: [
      { id: 't-anat', name: 'Anatomie', target_accuracy: 80, weight: 50 },
      { id: 't-chem', name: 'Chemie', target_accuracy: 85, weight: 40 },
      { id: 't-pharm', name: 'Pharmakologie', target_accuracy: 80, weight: 60 },
      { id: 't-card', name: 'Kardiologie', target_accuracy: 75, weight: 30 },
    ],
    todos: [
      { id: 'td-skript', text: 'Skript lesen', due_date: '2026-09-18', completed: false },
      { id: 'td-kittel', text: 'Kittel kaufen', completed: false },
      { id: 'td-anat3', text: 'Anatomie Kapitel 3 wiederholen', topic_id: 't-anat', due_date: '2026-09-15', completed: false },
      { id: 'td-buch', text: 'Bücher zurückbringen', completed: true },
    ],
    events: [
      { id: 'ev-chem', calendar_id: 'cal-uni', kind: 'class', title: 'Einführung in die Chemie NP', start_date: '2026-09-01', end_date: '2026-09-01', start_time: '08:15:00', end_time: '09:45:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', location: 'HS 1' },
      { id: 'ev-gen', calendar_id: 'cal-uni', kind: 'class', title: 'Genetik VO', start_date: '2026-09-03', end_date: '2026-09-03', start_time: '10:00:00', end_time: '12:00:00', rrule: 'FREQ=WEEKLY;BYDAY=TH', location: 'Hörsaal 3' },
      { id: 'ev-brunch', calendar_id: 'cal-priv', kind: 'event', title: 'Brunch mit Anna', start_date: '2026-09-18', end_date: '2026-09-18', start_time: '10:00:00', end_time: '11:00:00', location: 'Café Central', reminders: [30] },
      { id: 'ev-brunch-old', calendar_id: 'cal-priv', kind: 'event', title: 'Brunch mit Lisa', start_date: '2026-09-05', end_date: '2026-09-05', start_time: '10:00:00', end_time: '11:00:00', location: 'Café Central', reminders: [30] },
      { id: 'ev-dent', calendar_id: 'cal-priv', kind: 'event', title: 'Zahnarzt', start_date: '2026-09-21', end_date: '2026-09-21', start_time: '15:00:00', end_time: '16:00:00' },
      { id: 'ev-study', calendar_id: 'cal-uni', kind: 'study', title: 'Lernen: Anatomie', topic_id: 't-anat', start_date: '2026-09-17', end_date: '2026-09-17', start_time: '18:00:00', end_time: '19:30:00' },
      { id: 'ev-exam', calendar_id: 'cal-uni', kind: 'exam', title: 'Anatomie Prüfung', topic_id: 't-anat', start_date: '2026-10-05', end_date: '2026-10-05', start_time: '09:00:00', end_time: '11:00:00' },
    ],
    exams: [
      { id: 'x-pharm', title: 'Pharmakologie Klausur', exam_date: '2026-10-12', topic_id: 't-pharm', calendar_id: 'cal-uni' },
    ],
    recentSessions: [
      session('s1', 't-anat', 1, 18, 45, 40, 26),
      session('s2', 't-chem', 1, 19, 30, 20, 15),
      session('s3', 't-anat', 3, 18, 50, 40, 28),
      session('s4', 't-chem', 3, 19, 30, 20, 16),
      session('s5', 't-anat', 8, 18, 40, 40, 30),
      session('s6', 't-pharm', 9, 17, 60, 50, 30),
      session('s7', 't-anat', 10, 18, 45, 40, 31),
      session('s8', 't-chem', 10, 19, 25, 20, 17),
      session('s9', 't-anat', 14, 18, 50, 40, 33),
      session('s10', 't-pharm', 15, 17, 55, 50, 34),
    ],
  }
}
