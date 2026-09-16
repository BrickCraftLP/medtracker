# Assistant command language

Every request the assistant carries out is one **command**. The parser turns a
sentence into one; a user can type one directly; the on-device model writes
one. All three go through the same checks (`engine/command.js`,
`engine/schema.js`), so a command means exactly the same thing whoever wrote it.

```
/move_event title:"Brunch mit Anna" date:2026-09-19 start:11:00
/search_all chemie
/day_agenda date:tomorrow ; /list_todos overdue:true
```

- `/action` is an intent id. An unambiguous prefix works (`/list_to`).
- Fields are written `key:value`. A value with spaces goes in quotes.
- Words without a key fill the action's primary field (`/search_all chemie`).
- Up to 3 commands can be chained with ` ; `. They run in order.
- A typed command runs without a "Did you mean …?". Deleting still shows its
  confirmation card. Commands the **model** writes that change data always
  need a tap.

## Values

These lines are the model's grammar primer, word for word (`TYPE_HELP` in
`engine/schema.js`; a test keeps this file in sync):

- date: YYYY-MM-DD copied from the date table (also today, tomorrow, fri, +3d, @screen = day on screen)
- time: HH:MM in 24h, e.g. 09:30 or 18:00
- minutes: whole minutes, e.g. 90 for 1.5 hours
- int: a whole number
- percent: a number 0-100, e.g. 85
- bool: true or false
- choice: exactly one of the listed words
- list: minutes before start in brackets, e.g. [30,1440]
- text: the user's own words, quoted when longer than one word
- name: copied exactly from KNOWN NAMES, or @screen (on screen) / @last (shown in the last answer)

More date forms the parser accepts: `-2d`, `+1w`, `next-fri`, `yesterday`,
and anything the sentence parser reads (`3.10.`, `freitag`, `übermorgen`).
More time forms: `now`, `+2h`, `+30m`, `15 uhr`, `3pm`.

### References

| Token | Means |
|---|---|
| `@screen` | What the current screen shows: the calendar day, the open topic, the entry being edited |
| `@last` | The first matching thing the last answer showed |
| `@todo:<id>`, `@event:<id>`, `@topic:<id>`, `@exam:<id>` | That exact row. The parser writes these when a sentence says "das", "it" or "this" |

## Actions

`?` marks an optional field. A choice lists its words, separated by `|`.

| Signature | What it does |
|---|---|
| `/study_suggestion date:date? after:ref:topic?` | Suggest which topics to study on a day, based on exams, accuracy, trend, recency and which topics the user usually studies back to back |
| `/free_time date:date? from:date? to:date? minutes:minutes? purpose:study\|meet\|friends\|meal\|sport? with:text? scan:bool?` | When is the user free? Checks one day, a range, or the next 7 days for a free window (optionally of a given length and purpose) |
| `/day_agenda date:date?` | Show what's in the calendar on a day (events, exams, todos due) |
| `/add_event title:text? date:date? start:time? end:time? minutes:minutes? all_day:bool? kind:class\|study\|assignment\|exam\|deadline\|event\|other? topic:ref:topic? location:text? calendar:ref:calendar? reminders:list:minutes? repeat:text? notes:text?` | Create a calendar event. Asks step by step for what is missing (day, time, place, calendar, reminder, todos); with title, day and time given it shows a review card to save |
| `/move_event title:ref:event from_date:date? date:date? start:time?` | Move / reschedule an existing calendar event to another date and/or time **(changes data)** |
| `/delete_event title:ref:event date:date?` | Delete / cancel a calendar event (asks for confirmation) |
| `/add_todo text:text? due_date:date? due_time:time? topic:ref:topic? priority:int?` | Create a todo/task, optionally with due date/time, priority and topic. Opens the todo settings above the input |
| `/list_todos date:date? overdue:bool?` | Show open todos, optionally only those due by a date or overdue |
| `/complete_todo text:ref:todo` | Mark a todo as done **(changes data)** |
| `/edit_todo text:ref:todo new_text:text? due_date:date? due_time:time? priority:int? topic:ref:topic?` | Change an existing todo: rename it, or set its due date, due time, priority or topic **(changes data)** |
| `/delete_todo text:ref:todo` | Delete a todo (asks for confirmation) |
| `/check_overlap date:date start:time end:time? minutes:minutes? title:text?` | Check whether a specific date + time is free or overlaps existing entries; suggests nearest free alternatives |
| `/current_time` | Tell the current time, date, weekday or calendar week |
| `/next_event` | The user's next calendar entry, with a countdown, and what is running right now |
| `/week_overview from:date? to:date?` | Overview of a week (or other span): per day how many entries, booked vs free hours, exams and todos due |
| `/exam_countdown query:text?` | Upcoming exams: days left and how ready the linked topic is (accuracy vs target, trend) |
| `/study_stats topic:ref:topic? from:date? to:date? all:bool?` | Study history: total study time, sessions, study days, streak, last time studied and usual time of day — overall or for one topic, for a period |
| `/topic_progress topic:ref:topic?` | Is a topic (or are topics overall) getting better or worse: accuracy now vs before, target, sessions, last practised |
| `/next_occurrence query:text mode:next\|days? from:date? to:date?` | When / on which days the user has a calendar entry matching a name or subject (searches titles, notes, places, calendars and topics in German and English), with related todos |
| `/search_all query:text` | Find calendar entries, todos and exams by words in their title, notes, place, calendar or topic (German and English) |
| `/event_info query:text field:location\|start\|end\|duration\|notes\|calendar\|recurrence\|count from:date? to:date?` | A detail of a calendar entry found by name: where it is (place/room), when it starts or ends, how long it takes, its notes, calendar, how often it repeats, or how many dates are left |
| `/day_bounds date:date? mode:first\|last\|both?` | The first and/or last calendar entry of a day: when the day starts or when the user is done |
| `/open_screen screen:home\|calendar\|topics\|topic_stats\|exams\|statistics\|settings\|assistant_settings date:date? topic:ref:topic?` | Open a screen of the app: home, calendar (optionally on a day), topics, one topic's statistics, exams, statistics, settings |
| `/start_session topic:ref:topic?` | Start a study session (exercises with a timer) for a topic **(changes data)** |
| `/explain_screen` | Explain or summarise what is on the current screen (the calendar day shown, the open topic, exams, statistics) |
| `/add_exam title:text date:date topic:ref:topic? calendar:ref:calendar?` | Add an exam to the Exams list with its date (and topic) |
| `/move_exam exam:ref:exam date:date` | Move an exam of the Exams list to another date **(changes data)** |
| `/delete_exam exam:ref:exam` | Delete an exam from the Exams list (asks for confirmation) |
| `/set_topic_target topic:ref:topic target:percent` | Set a topic's target accuracy in percent **(changes data)** |
| `/set_topic_weight topic:ref:topic weight:int` | Set a topic's weight (how much it counts when suggesting what to study) **(changes data)** |
| `/rename_topic topic:ref:topic name:text` | Rename a topic **(changes data)** |
| `/weekly_review` | Review of the last 7 days against the week before: study time, sessions, accuracy per topic, todos done and overdue, planned study that did not happen |
| `/workload_forecast days:int?` | Forecast of the coming days (default 14): booked hours per day, crunch days, exams and todos due, overdue backlog |
| `/exam_plan exam:text? sessions:int?` | Study plan for an exam (the next one, or one named by exam or topic): days left, accuracy gap, how many sessions, and free windows to put them in |
| `/how_am_i_doing` | The big picture: streak, study time, strongest and weakest topic, neglected topics, overdue todos, next exam, and one concrete next step |
| `/about_me` | What the assistant knows about the user: study habits, usual times and places, frequent people, and things the user taught it |
| `/remember kind:alias\|place\|day_start\|day_end\|name\|study_minutes\|note key:text? value:text` | Remember something about the user: a short form ("PK means pharmacology"), the usual place of an entry, when the day starts or ends, their name, study block length, or a free note |
| `/forget what:text` | Forget something the user taught the assistant (a short form, place, preference or note), or everything |

## How the model uses it (`llm/prompt.js`)

The model never acts directly. It writes a command, the parser checks every
value, and a change still needs a tap.

1. **classify** (small models): choose one of up to 6 candidate actions. The
   message comes pre-labelled by `engine/tagger.js`, e.g.
   `verschieb den [event:Brunch mit Anna] auf [date:2026-09-19 Sat] [time:11:00]`.
2. **compose**: build the command for that action. The JSON schema lists the
   action's fields in fill order: what it acts on, then day, time, length,
   everything else, and `command` last. A grammar-constrained model fills them
   in that order, so even a 360M model builds the command step by step. The
   prompt carries the signature, the value rules above, a date table to copy
   from, the screen and last answer, real names from the entity index, and one
   line about the user's habits.
3. **repair**: if the parser rejects the command, its error hints go back once,
   e.g. `due_date: "soon" is not a date — use YYYY-MM-DD, today, tomorrow, +3d,
   fri or a value from the date table`.
4. **planner** (Qwen 1.5B and Ollama models, `modelTier() ≥ 2`): steps 1 and 2 in one prompt
   with up to 12 signatures; it falls back to compose when its command is still
   invalid after the repair.
5. **answer**: nothing fits, so the model answers from the rows that match the
   question.

Every answer's `meta.trace` records the prompt version, the candidates, the
canonical command and each model reply. A rated answer can be exported and
replayed from those.

## Adding an action

1. Register an intent under `intents/`: `id`, `describe`, typed `slots`
   (`slot('date', 'new due day', { required, primary })`), `examples`,
   `completions`, `match`, `execute`. Set `mutates: true` when it changes data
   without its own confirmation card.
2. Add a label for choice cards in `engine/describe.js`.
3. Add its row to the table above. `prompt.test.js` fails until you do.
