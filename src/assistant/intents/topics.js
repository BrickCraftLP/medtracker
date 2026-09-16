// Topic settings by voice: target accuracy ("setz das Ziel von Anatomie auf
// 85 %"), weight ("Gewichtung von Chemie auf 70") and name.

import { registerIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { labelFrom } from '../engine/parse/index.js'
import { contextRef, isDeictic } from '../engine/references.js'

// A topic named in the sentence, else the one on screen / last shown.
function topicOf(api, text, raw) {
  const named = api.findTopicIn(raw ?? text)
  if (named) return { name: named.name, row: named }
  const ref = contextRef(api, ['topic'])
  return ref && (isDeictic(text) || api.screen?.screen === 'topic-stats' || !/\b(von|of|fuer|for)\s+\w/.test(text)) ? { name: ref.token, row: ref.row } : null
}

const NUMBER = /\b(\d{1,3}(?:[.,]\d+)?)\s*(%|prozent|percent)?(?=\s|$)/

registerIntent({
  id: 'set_topic_target',
  mutates: true,
  describe: "Set a topic's target accuracy in percent",
  slots: { topic: slot('ref:topic', 'the topic', { required: true, primary: true }), target: slot('percent', 'target accuracy 0-100', { required: true }) },
  examples: ["Set anatomy's target to 85%", 'Setz das Ziel von Anatomie auf 85 %'],
  completions: { de: ['Setz das Ziel von {topic} auf 85 %'], en: ['Set the target of {topic} to 85%'] },
  match(text, { raw, api }) {
    if (!api || !/\b(ziel\w*|target|goal|zielgenauigkeit|sollwert)\b/.test(text)) return null
    if (/\b(wie|what|welche\w*|which|erreicht|reached)\b/.test(text) || /\?\s*$/.test(raw ?? '')) return null
    const n = text.match(NUMBER)
    if (!n) return null
    const value = Number(n[1].replace(',', '.'))
    if (!(value > 0 && value <= 100)) return null
    const topic = topicOf(api, text, raw)
    return topic ? { score: 0.92, slots: { topic: topic.name, target: Math.round(value) } } : { score: 0.6, slots: { target: Math.round(value) } }
  },
  async execute(slots, api) {
    const topic = api.findTopic(slots.topic)
    const target = Math.round(Number(slots.target))
    if (!topic) return { title: api.L('Which topic?', 'Welches Thema?'), blocks: [{ type: 'topics', data: { items: api.topics.slice(0, 8).map(t => ({ topicId: t.id, reasons: [] })), date: api.today } }] }
    if (!(target > 0 && target <= 100)) return { title: api.L('Target must be 1–100 %', 'Ziel muss 1–100 % sein'), blocks: [] }
    const before = topic.target_accuracy ?? 80
    await api.upsertTopic({ ...topic, target_accuracy: target })
    return {
      title: topic.name,
      blocks: [{ type: 'text', data: { text: api.L(`🎯 Target ${before} % → ${target} %`, `🎯 Ziel ${before} % → ${target} %`) } }],
      followups: [api.L(`Is ${topic.name} improving?`, `Wird ${topic.name} besser?`)],
      meta: { entities: [{ type: 'topic', id: topic.id }] },
    }
  },
})

registerIntent({
  id: 'set_topic_weight',
  mutates: true,
  describe: "Set a topic's weight (how much it counts when suggesting what to study)",
  slots: { topic: slot('ref:topic', 'the topic', { required: true, primary: true }), weight: slot('int', 'weight, e.g. 50', { required: true }) },
  examples: ['Set the weight of chemistry to 70', 'Gewichtung von Chemie auf 70'],
  completions: { de: ['Gewichtung von {topic} auf 70'], en: ['Set the weight of {topic} to 70'] },
  match(text, { raw, api }) {
    if (!api || !/\b(gewicht\w*|weight\w*|ects|credits?)\b/.test(text)) return null
    if (/\b(wie|what|welche\w*|which)\b/.test(text) || /\?\s*$/.test(raw ?? '')) return null
    const n = text.match(NUMBER)
    if (!n) return null
    const topic = topicOf(api, text, raw)
    const value = Math.round(Number(n[1].replace(',', '.')) * 100) / 100
    return topic ? { score: 0.92, slots: { topic: topic.name, weight: value } } : null
  },
  async execute(slots, api) {
    const topic = api.findTopic(slots.topic)
    const weight = Number(slots.weight)
    if (!topic || !(weight > 0)) return { title: api.L('Which topic and weight?', 'Welches Thema und welche Gewichtung?'), blocks: [] }
    await api.upsertTopic({ ...topic, weight })
    return {
      title: topic.name,
      blocks: [{ type: 'text', data: { text: api.L(`⚖️ Weight ${topic.weight ?? 50} → ${weight}`, `⚖️ Gewichtung ${topic.weight ?? 50} → ${weight}`) } }],
      meta: { entities: [{ type: 'topic', id: topic.id }] },
    }
  },
})

registerIntent({
  id: 'rename_topic',
  mutates: true,
  describe: 'Rename a topic',
  slots: { topic: slot('ref:topic', 'the topic', { required: true, primary: true }), name: slot('text', 'new name', { required: true }) },
  examples: ['Rename topic cardio to cardiology', 'Benenne das Thema Kardio in Kardiologie um'],
  completions: { de: ['Benenne das Thema {topic} in {title} um'], en: ['Rename topic {topic} to {title}'] },
  match(text, { raw, api }) {
    if (!api) return null
    const m = text.match(/^(?:bitte )?(?:benenn\w*|rename|umbenenn\w*|aender\w* den namen von)\s+(?:das |the |mein\w* |my )?(?:thema|topic|fach)\s+(.+?)\s+(?:in|to|zu|into|nach)\s+(.+?)(?:\s+um)?$/)
    if (!m) return null
    const topic = /^(das|dies\w*|this|it)$/.test(m[1]) ? contextRef(api, ['topic'])?.row : api.findTopic(m[1])
    if (!topic) return null
    return { score: 0.95, slots: { topic: topic.name, name: labelFrom(raw ?? text, m[2], ['um']) || m[2] } }
  },
  async execute(slots, api) {
    const topic = api.findTopic(slots.topic)
    const name = String(slots.name ?? '').trim()
    if (!topic || !name) return { title: api.L('Which topic, and what name?', 'Welches Thema, und welcher Name?'), blocks: [] }
    await api.upsertTopic({ ...topic, name })
    return {
      title: api.L('Topic renamed', 'Thema umbenannt'),
      blocks: [{ type: 'text', data: { text: `„${topic.name}“ → „${name}“` } }],
      meta: { entities: [{ type: 'topic', id: topic.id }] },
    }
  },
})
