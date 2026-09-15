// German ↔ English search vocabulary, so "chemistry" finds "Einführung in die
// Chemie NP" and "Zahnarzt" finds "Dentist". Offline. Words that are not
// listed still match across languages when they share a long stem
// (anatomy/anatomie, physics/physik); the local model can add translations
// for the rest (llm/index.js translateTerms).

import { fold } from './normalize.js'

// One concept per line: 'german | … : english | …', folded (ä → ae), singular.
// Also covers the canonical words normalize() rewrites to (exam, study, event).
const PAIRS = `
chemie|chemisch : chemistry|chemical|chem
biochemie : biochemistry|biochem
organische chemie : organic chemistry
anorganische chemie : inorganic chemistry
physik|physikalisch : physics|physical
biophysik : biophysics
biologie|biologisch : biology|biological|bio
zellbiologie : cell biology
anatomie : anatomy
physiologie : physiology
pathophysiologie : pathophysiology
pathologie : pathology
pharmakologie|pharma : pharmacology|pharma
toxikologie : toxicology
histologie : histology
embryologie : embryology
mikrobiologie : microbiology
virologie : virology
immunologie : immunology
genetik : genetics
molekularbiologie : molecular biology
psychologie : psychology
psychiatrie : psychiatry
neurologie : neurology
neuroanatomie : neuroanatomy
kardiologie|kardio|herz : cardiology|cardio|heart
innere medizin : internal medicine
chirurgie : surgery
paediatrie|kinderheilkunde : pediatrics|paediatrics
gynaekologie : gynecology|gynaecology
dermatologie : dermatology
radiologie : radiology
anaesthesie : anesthesia|anaesthesia
notfallmedizin : emergency medicine
allgemeinmedizin : general practice|family medicine
epidemiologie : epidemiology
hygiene : hygiene
medizin|medizinisch : medicine|medical
terminologie : terminology
ethik : ethics
mathematik|mathe : mathematics|math|maths
statistik : statistics|stats
biostatistik : biostatistics
informatik : computer science|informatics
wirtschaft : economics|business
recht|jus : law
geschichte : history
englisch : english
deutsch : german
latein : latin
einfuehrung : introduction|intro
grundlagen : basics|fundamentals|foundations
vertiefung : advanced
vorlesung : lecture
uebung|tutorium : exercise|tutorial|practice
seminar : seminar
praktikum : practical|internship|lab course
labor : lab|laboratory
kurs : course|class
pruefung|klausur|test|examen : exam|examination|test
nachpruefung|wiederholungspruefung : resit|retake
muendliche pruefung : oral exam
abgabe : submission|deadline|due
hausaufgabe|hausuebung : homework|assignment
protokoll : protocol|report|lab report
referat|praesentation|vortrag : presentation|talk
skript|unterlagen : script|notes|handout
kapitel : chapter
wiederholung : review|revision|repetition
zusammenfassung : summary
karteikarten : flashcards
lernen|studieren|study : study|learn|studying
lerngruppe : study group
bibliothek|bib : library
mensa : cafeteria|canteen
hoersaal : lecture hall
sprechstunde : office hours
termin|event|eintrag : appointment|event|entry
besprechung|meeting|sitzung : meeting
treffen : meet|meetup|meeting
zahnarzt : dentist
arzt|aerztin|doktor : doctor|physician
hausarzt : gp|general practitioner
krankenhaus|klinik|spital : hospital|clinic
apotheke : pharmacy
physiotherapie|physio : physiotherapy|physio
friseur : hairdresser|haircut
fruehstueck : breakfast
brunch : brunch
mittagessen : lunch
abendessen : dinner
essen : food|meal|eat
kaffee : coffee
geburtstag : birthday
hochzeit : wedding
party|feier : party
freunde|friends : friends
familie : family
eltern : parents
training|sport : workout|training|sport
fitnessstudio|gym : gym
laufen|joggen : running|jogging|run
schwimmen : swimming
radfahren : cycling
yoga : yoga
arbeit|job : work|job
schicht|dienst : shift
nachtdienst : night shift
famulatur : clerkship|elective
einkaufen|einkauf : shopping|groceries
putzen : cleaning
waesche : laundry
umzug : moving|move
reise|urlaub : trip|travel|vacation|holiday
flug : flight
zug : train
auto : car
rechnung : bill|invoice
bank : bank
versicherung : insurance
anmeldung|registrierung : registration|sign up
bewerbung : application
vorbereitung : preparation|prep
lesen : read|reading
schreiben : write|writing
`

// Filler words of both languages that never carry meaning in a search.
export const STOP = new Set(`
der die das den dem des ein eine einen einem einer eines und oder in im ins an am auf aus bei beim mit von vom zu zum zur fuer ueber unter nach vor
ist sind war hat habe hab ich du er sie es wir ihr mein meine meinen meinem meiner dein deine noch schon mal wieder bitte auch nur
the a an and or of in on at to for with from by is are was be my your our this that it
`.trim().split(/\s+/))

const GROUPS = PAIRS.trim().split('\n').map(line => {
  const [de = '', en = ''] = line.split(':')
  const side = s => s.split('|').map(w => fold(w.trim())).filter(Boolean)
  return { de: side(de), en: side(en) }
})

const INDEX = new Map()   // word → [{ g, lang }]
for (const g of GROUPS) {
  for (const lang of ['de', 'en']) {
    for (const w of g[lang]) {
      if (!INDEX.has(w)) INDEX.set(w, [])
      INDEX.get(w).push({ g, lang })
    }
  }
}

function lookup(word) {
  if (INDEX.has(word)) return INDEX.get(word)
  // Plurals and inflections: "lectures", "vorlesungen", "chemischen".
  for (const cut of [1, 2, 3]) {
    const stem = word.slice(0, -cut)
    if (stem.length >= 4 && INDEX.has(stem)) return INDEX.get(stem)
  }
  return []
}

// The word itself, then its synonyms in the asking language, then the other
// language's translations.
export function variants(word, lang = 'de') {
  const w = fold(word)
  const out = [w]
  for (const { g, lang: own } of lookup(w)) {
    const other = own === 'de' ? 'en' : 'de'
    const order = lang === own ? [own, other] : [other, own]
    for (const l of order) for (const x of g[l]) if (!out.includes(x)) out.push(x)
  }
  return out
}

export const tokensOf = s => fold(s).split(/[^a-z0-9]+/).filter(Boolean)
export const searchWords = s => tokensOf(s).filter(w => w.length > 1 && !STOP.has(w))

function sharedPrefix(a, b) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

function hits(variant, hay, hayTokens) {
  if (variant.includes(' ')) return hay.includes(` ${variant} `) || hay.includes(` ${variant}`)
  if (variant.length <= 3) return hayTokens.some(t => t === variant || (variant.length === 3 && t.startsWith(variant)))
  if (hay.includes(variant)) return true
  return hayTokens.some(t => {
    const p = sharedPrefix(t, variant)
    return p >= 5 && p >= 0.7 * Math.min(t.length, variant.length)
  })
}

// Share of the query's meaningful words found in `haystack`, each in any
// language. `via` lists the translations that did the matching.
export function matchScore(query, haystack, { lang = 'de', extraTerms = [] } = {}) {
  const words = searchWords(query)
  const hayTokens = tokensOf(haystack)
  const hay = ` ${hayTokens.join(' ')} `
  let found = 0
  const via = []
  for (const w of words) {
    const hit = variants(w, lang).find(v => hits(v, hay, hayTokens))
    if (hit) {
      found++
      if (hit !== w) via.push(hit)
    }
  }
  let score = words.length ? found / words.length : 0
  for (const term of extraTerms) {
    const tw = searchWords(term)
    if (tw.length && tw.every(w => hits(w, hay, hayTokens))) {
      score = 1
      via.push(fold(term))
    }
  }
  return { score, via }
}
