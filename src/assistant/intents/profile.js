// What the assistant knows about the user, and teaching it more:
//   "Was weißt du über mich?"          → habits from the data + what was taught
//   "Merk dir: PK heißt Pharmakologie"  → short form, used by every search
//   "Brunch ist immer im Café Central"  → default place for new "Brunch" entries
//   "Mein Tag beginnt um 7"             → waking hours for free-time answers
//   "Vergiss PK"                        → removes it again
// Everything stays on this device (engine/userStore.js).

import { registerIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { extract } from '../engine/parse/index.js'
import { fmtMin } from '../engine/parse/times.js'
import { fold } from '../engine/normalize.js'
import { profileFacts, storedFacts, headWords } from '../engine/profile.js'
import { setAlias, setPlace, setPreference, addNote, forget, clearStoredProfile } from '../engine/userStore.js'
import { setLLMSettings } from '../llm/index.js'

// The user's own words for a normalised span: the raw tokens that fold to it.
function rawSpan(raw, normalizedPart) {
  const want = fold(normalizedPart).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)
  const toks = String(raw ?? '').split(/\s+/)
  const key = t => fold(t).replace(/[^a-z0-9]+/g, '')
  for (let i = 0; i + want.length <= toks.length; i++) {
    if (toks.slice(i, i + want.length).every((t, j) => key(t) === want[j])) return toks.slice(i, i + want.length).join(' ').replace(/[.,!?;:]+$/, '')
  }
  return normalizedPart
}

registerIntent({
  id: 'about_me',
  describe: 'What the assistant knows about the user: study habits, usual times and places, frequent people, and things the user taught it',
  slots: {},
  examples: ['What do you know about me?', 'Was weißt du über mich?'],
  completions: { de: ['Was weißt du über mich?'], en: ['What do you know about me?'] },
  match(text) {
    return /\b(was weisst du (?:alles )?(?:ueber mich|von mir)|what do you know about me|was hast du (?:ueber mich )?gelernt|mein profil|my profile|kennst du mich|do you know me|meine gewohnheiten|my habits|was merkst du dir)\b/.test(text)
      ? { score: 0.95, slots: {} }
      : null
  },
  execute(_, api) {
    const facts = profileFacts(api)
    const taught = storedFacts(api)
    const blocks = []
    if (facts.length) blocks.push({ type: 'stats', data: { label: api.L('From your data', 'Aus deinen Daten'), items: facts } })
    blocks.push({ type: 'text', data: { text: taught.length
      ? `${api.L('You told me:', 'Du hast mir gesagt:')}\n${taught.map(f => `• ${f.text}`).join('\n')}`
      : api.L('You have not taught me anything yet. Try “Remember: PK means pharmacology”.', 'Du hast mir noch nichts beigebracht. Probier „Merk dir: PK heißt Pharmakologie“.') } })
    blocks.push({ type: 'text', data: { text: api.L('All of this stays on this device. Delete it in Settings → Assistant, or say “forget …”.', 'Das bleibt alles auf diesem Gerät. Löschen unter Einstellungen → Assistent oder „vergiss …“.') } })
    return { title: api.L('What I know about you', 'Was ich über dich weiß'), blocks }
  },
})

registerIntent({
  id: 'remember',
  describe: 'Remember something about the user: a short form ("PK means pharmacology"), the usual place of an entry, when the day starts or ends, their name, study block length, or a free note',
  slots: {
    kind: slot('enum:alias|place|day_start|day_end|name|study_minutes|note', 'what kind of fact', { required: true }),
    key: slot('text', 'short form, or entry word for a place', { primary: true }),
    value: slot('text', 'meaning, place, time HH:MM, name, minutes or note text', { required: true }),
  },
  command: ['merk', 'remember'],
  examples: ['Remember: PK means pharmacology', 'Merk dir: PK heißt Pharmakologie'],
  completions: {
    de: ['Merk dir: {title} heißt {topic}', 'Mein Tag beginnt um {clock}', '{event} ist immer im {title}'],
    en: ['Remember: {title} means {topic}', 'My day starts at {clock}'],
  },
  match(text, { raw, today, api }) {
    const lead =/^(?:bitte )?(?:merk\w* (?:dir|mal)|remember(?: that)?|notier\w* dir|speicher\w* dir|lern\w*|learn)[:,]?\s+(?:dass |that )?/
    const hasLead = lead.test(text)
    const body = text.replace(lead, '').trim()
    let m

    // Waking hours
    if ((m = body.match(/^(?:mein|my) (?:tag|day) (beginnt|startet|faengt|starts|begins|endet|hoert|ends|finishes)\b(.*)$/))) {
      const x = extract(` ${m[2]} `, today)
      if (x.startMin == null) return null
      const kind = /^(endet|hoert|ends|finishes)/.test(m[1]) ? 'day_end' : 'day_start'
      return { score: 0.93, slots: { kind, value: fmtMin(x.startMin) } }
    }
    if ((m = body.match(/^(?:ich (?:stehe|steh) (?:um|meist um|immer um) (.+?) auf|i (?:get up|wake up) at (.+))$/))) {
      const x = extract(` ${m[1] ?? m[2]} `, today)
      return x.startMin != null ? { score: 0.9, slots: { kind: 'day_start', value: fmtMin(x.startMin) } } : null
    }
    // Name
    if ((m = body.match(/^(?:nenn mich|call me|ich heisse|my name is|mein name ist)\s+([a-z][a-z-]{1,30})$/))) {
      return { score: 0.93, slots: { kind: 'name', value: rawSpan(raw, m[1]) } }
    }
    // Study block length
    if ((m = body.match(/^(?:meine lernbloecke (?:sind|dauern)|my study (?:blocks|sessions) (?:are|last)|ich lerne (?:immer|meist(?:ens)?|am liebsten)) (?:je |immer )?(\d{2,3}) ?(?:min\w*|minutes?)(?: lang)?$/))) {
      return { score: 0.92, slots: { kind: 'study_minutes', value: m[1] } }
    }
    // Usual place: "Brunch ist immer im Café Central"
    if ((m = body.match(/^(?:der |die |das |my |mein\w* )?([a-z][a-z ]{2,30}?) (?:ist|sind|is|are) (?:immer|meistens|meist|always|usually) (?:im|in der|in dem|in|bei|beim|at the|at|@) (.{2,40})$/))) {
      return { score: 0.9, slots: { kind: 'place', key: m[1], value: rawSpan(raw, m[2]) } }
    }
    // Short form: "PK heißt Pharmakologie", "mit Anat meine ich Anatomie"
    if ((m = body.match(/^([a-z0-9][a-z0-9 .-]{0,15}?) (?:heisst|bedeutet|steht fuer|ist kurz fuer|means|stands for|is short for|=) (.{2,40})$/))
      || (m = body.match(/^(?:mit|with|by) ([a-z0-9][a-z0-9 .-]{0,15}?) (?:meine ich|i mean) (.{2,40})$/))) {
      if (m[1].split(' ').length > 2) return hasLead ? { score: 0.85, slots: { kind: 'note', value: rawSpan(raw, body) } } : null
      // Without "merk dir" only a real short form of something that exists
      // ("PK heißt Pharmakologie"), never a rename ("X heißt jetzt Y").
      if (!hasLead) {
        const known = api?.index().best(m[2], { types: ['topic', 'event', 'exam', 'calendar'], min: 1 })
        if (/\b(jetzt|nun|now|ab jetzt)\b/.test(body) || m[1].includes(' ') || m[1].length > 8 || !known) return null
      }
      return { score: hasLead ? 0.94 : 0.86, slots: { kind: 'alias', key: m[1], value: rawSpan(raw, m[2]) } }
    }
    if (hasLead && body.split(' ').length >= 2) return { score: 0.85, slots: { kind: 'note', value: rawSpan(raw, body) } }
    return null
  },
  execute(slots, api) {
    const L = api.L
    const value = String(slots.value ?? '').trim()
    const toMin = v => { const [h, mi] = String(v).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (mi || 0) : null }
    let text
    switch (slots.kind) {
      case 'alias': {
        const saved = setAlias(slots.key, value)
        text = saved ? L(`Got it: “${slots.key}” means “${value}”.`, `Alles klar: „${slots.key}“ heißt „${value}“.`) : L('That short form does not work.', 'Diese Abkürzung geht nicht.')
        break
      }
      case 'place': {
        const word = headWords(slots.key)[0] ?? slots.key
        setPlace(word, value)
        text = L(`Got it: new “${word}” entries will be at ${value}.`, `Alles klar: neue „${word}“-Termine sind bei ${value}.`)
        break
      }
      case 'day_start':
      case 'day_end': {
        const min = toMin(value)
        if (min == null) return { title: L('Which time?', 'Welche Uhrzeit?'), blocks: [] }
        // Same setting as Settings → Assistant → waking hours.
        setLLMSettings(slots.kind === 'day_start' ? { dayStart: min } : { dayEnd: min })
        text = slots.kind === 'day_start' ? L(`Your day starts at ${fmtMin(min)} — free-time answers use that.`, `Dein Tag beginnt um ${fmtMin(min)} — Freizeit-Antworten richten sich danach.`) : L(`Your day ends at ${fmtMin(min)}.`, `Dein Tag endet um ${fmtMin(min)}.`)
        break
      }
      case 'name':
        setPreference('name', value)
        text = L(`Nice to meet you, ${value}!`, `Freut mich, ${value}!`)
        break
      case 'study_minutes': {
        const n = Number(value)
        if (!(n >= 10 && n <= 300)) return { title: L('How many minutes?', 'Wie viele Minuten?'), blocks: [] }
        setPreference('studyMinutes', n)
        text = L(`Study plans will use ${n}-minute blocks.`, `Lernpläne nutzen jetzt ${n}-Minuten-Blöcke.`)
        break
      }
      default:
        addNote(value)
        text = L(`Noted: “${value}”.`, `Gemerkt: „${value}“.`)
    }
    return {
      title: L('Remembered', 'Gemerkt'),
      blocks: [{ type: 'text', data: { text } }],
      followups: [L('What do you know about me?', 'Was weißt du über mich?')],
    }
  },
})

registerIntent({
  id: 'forget',
  describe: 'Forget something the user taught the assistant (a short form, place, preference or note), or everything',
  slots: { what: slot('text', 'what to forget, or "all"', { required: true, primary: true }) },
  examples: ['Forget PK', 'Vergiss PK'],
  completions: { de: ['Vergiss {title}'], en: ['Forget {title}'] },
  match(text, { raw }) {
    const m = text.match(/^(?:bitte )?(?:vergiss|forget|loesch\w* (?:die notiz|das alias|die abkuerzung|den ort))\s+(?:dass |that |about )?(.+)$/)
    if (!m) return null
    if (/^(alles|everything|all)(?: (?:ueber mich|about me|was du weisst))?$/.test(m[1])) return { score: 0.93, slots: { what: 'all' } }
    return { score: 0.9, slots: { what: rawSpan(raw, m[1]) } }
  },
  execute(slots, api, ctx = {}) {
    const what = String(slots.what ?? '').trim()
    if (what === 'all') {
      if (ctx.confirmed !== 'card') {
        return {
          title: api.L('Forget everything you taught me?', 'Alles vergessen, was du mir beigebracht hast?'),
          blocks: [{ type: 'confirm', data: { prompt: storedFacts(api).map(f => `• ${f.text}`).join('\n') || api.L('Nothing stored.', 'Nichts gespeichert.'), actions: [{ intent: 'forget', slots: { what: 'all' }, label: api.L('Forget all', 'Alles vergessen') }], confirmLabel: api.L('Forget', 'Vergessen'), danger: true } }],
        }
      }
      clearStoredProfile()
      return { title: api.L('Forgotten', 'Vergessen'), blocks: [{ type: 'text', data: { text: api.L('Everything you taught me is gone. Habits from your data stay, since they come from your entries.', 'Alles, was du mir beigebracht hast, ist weg. Gewohnheiten aus deinen Daten bleiben, weil sie aus deinen Einträgen kommen.') } }] }
    }
    const n = forget(what)
    return {
      title: n ? api.L('Forgotten', 'Vergessen') : api.L('Nothing to forget', 'Nichts zu vergessen'),
      blocks: [{ type: 'text', data: { text: n ? api.L(`Forgot “${what}”.`, `„${what}“ vergessen.`) : api.L(`I have nothing stored about “${what}”.`, `Zu „${what}“ habe ich nichts gespeichert.`) } }],
    }
  },
})
