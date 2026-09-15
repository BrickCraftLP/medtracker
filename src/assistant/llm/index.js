// Local-only LLM fallback. Two backends, both on the user's own hardware:
//   webllm  — model runs in the browser tab via WebGPU (@mlc-ai/web-llm)
//   ollama  — a local Ollama server (desktop), e.g. http://localhost:11434
// Nothing is sent to a cloud service.

const KEY = 'mt_assistant_llm'
// Identifies this page load; a model load marked by an older one never finished.
export const LLM_SESSION = Math.random().toString(36).slice(2)
export const DEFAULT_WEBLLM_MODEL = 'SmolLM2-360M-Instruct-q4f16_1-MLC'
// iPhone/iPad: every iOS browser (Chrome included) is WebKit, with a small
// per-tab memory cap — only the smallest models survive there.
export const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// 'auto' picks one of these after a device check (webllm.js checkDevice).
export const AUTO_MODEL = 'auto'

// Weakest first — the auto choice steps down this list when a load runs out of memory.
export const WEBLLM_MODELS = [
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2 360M', size: '~0.3 GB' },   // phones; mostly English
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.9 GB' },   // mid-range; German supported
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '~1.6 GB' },   // strong GPUs; good German and JSON
]

const DEFAULTS = {
  backend: 'off',               // 'off' | 'webllm' | 'ollama'
  webllmModel: AUTO_MODEL,      // 'auto' | one of WEBLLM_MODELS
  autoModel: null,              // what the device check chose
  deviceCheck: null,            // its measurements, shown in settings
  tooBig: [],                   // models that crashed or ran out of memory on this device
  pendingLoad: null,            // { id, session } while 'auto' loads a model
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  downloadSource: 'auto',       // 'auto' | 'direct' (Hugging Face) | 'proxy' (app server)
  dayStart: 8 * 60,             // waking hours used by free-time answers
  dayEnd: 22 * 60,
}

export function getLLMSettings() {
  let s
  try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { s = { ...DEFAULTS } }
  // Settings saved before the device check existed stored SmolLM2 only because
  // it was the default then: move them to 'auto' once.
  if ((s.v ?? 1) < 2) { s.webllmModel = AUTO_MODEL; s.v = 2 }
  // Older settings may still point at a model that is no longer offered.
  if (s.webllmModel !== AUTO_MODEL && !WEBLLM_MODELS.some(m => m.id === s.webllmModel)) s.webllmModel = AUTO_MODEL
  if (s.autoModel && !WEBLLM_MODELS.some(m => m.id === s.autoModel)) s.autoModel = null
  // A load that never finished in an earlier page load: the browser killed the
  // tab — iOS does that instead of throwing when a model needs too much memory.
  // Remember the model as too big and fall back to the next smaller one.
  if (s.pendingLoad && s.pendingLoad.session !== LLM_SESSION) {
    const crashed = s.pendingLoad.id
    const idx = WEBLLM_MODELS.findIndex(m => m.id === crashed)
    s.tooBig = [...new Set([...(s.tooBig ?? []), crashed])]
    if (s.autoModel === crashed) s.autoModel = WEBLLM_MODELS[Math.max(0, idx - 1)].id
    s.pendingLoad = null
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }
  return s
}

// Browser errors on a failed model load are opaque ("Load failed",
// "QuotaExceededError"). Turn them into something a user can act on.
export function explainLoadError(e, lang = 'de') {
  const msg = String(e?.message ?? e ?? '')
  const L = (en, de) => (lang === 'en' ? en : de)
  if (/webgpu/i.test(msg)) return L('This browser has no WebGPU. On iPhone it needs iOS 26 or newer.', 'Dieser Browser hat kein WebGPU. Auf dem iPhone ist iOS 26 oder neuer nötig.')
  if (/quota|storage|space/i.test(msg)) return L('Not enough storage for the model. Free some space or pick a smaller model.', 'Nicht genug Speicher für das Modell. Speicher freigeben oder kleineres Modell wählen.')
  // Raw message kept in brackets so a failure can be reported precisely.
  const raw = msg ? ` (${msg.slice(0, 160)})` : ''
  if (/import|module script|dynamically imported/i.test(msg)) return L('The app update is incomplete. Close the app fully and reopen it, then try again.', 'Das App-Update ist unvollständig. App ganz schließen, neu öffnen und erneut versuchen.') + raw
  if (/^\[proxy\]/.test(msg)) return L('Download via the app server failed too. Is the latest version deployed (npm run deploy)?', 'Auch der Download über den App-Server ist fehlgeschlagen. Ist die neueste Version deployed (npm run deploy)?') + raw
  if (/load failed|failed to fetch|network/i.test(msg)) return L('Download failed. Check the connection and try again.', 'Download fehlgeschlagen. Verbindung prüfen und erneut versuchen.') + raw
  if (/memory|device lost|out of/i.test(msg)) return L('The device ran out of memory. Pick a smaller model.', 'Dem Gerät ging der Speicher aus. Kleineres Modell wählen.') + raw
  return msg
}

export function setLLMSettings(patch) {
  const next = { ...getLLMSettings(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('mt-assistant-settings'))
  return next
}

export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu

// The model actually answering, for traces and feedback exports.
export function llmModelName(s = getLLMSettings()) {
  if (s.backend === 'ollama') return s.ollamaModel
  if (s.backend === 'webllm') return s.webllmModel === AUTO_MODEL ? (s.autoModel ?? AUTO_MODEL) : s.webllmModel
  return null
}

// True when a question can go to the model without first downloading or
// loading it — background checks only run then.
export async function llmReady() {
  const s = getLLMSettings()
  if (s.backend === 'ollama') return true
  if (s.backend !== 'webllm') return false
  const { webllmReady } = await import('./webllm.js')
  return webllmReady()
}

export function parseReply(text) {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { answer: text.trim() }
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return typeof obj === 'object' && obj ? obj : null
  } catch {
    return null
  }
}

class LLMTimeout extends Error {
  constructor(ms) { super(`LLM timeout after ${ms} ms`); this.name = 'LLMTimeout' }
}

// Requests run one at a time (an in-browser engine cannot answer two at
// once). A background request gives way when a question the user is waiting
// for is queued.
let queue = Promise.resolve()
let waitingForeground = 0

// One request to whichever local backend is on. `schema` (a JSON schema
// object) constrains the reply where the backend supports it. The timeout
// covers answering only — a first model load may take much longer and is not
// cut off. → { raw, parsed, ms, backend, model } | null when the model is off.
export function chatLLM(messages, opts = {}) {
  const background = !!opts.background
  if (!background) waitingForeground++
  const run = async () => {
    if (!background) waitingForeground--
    else if (waitingForeground > 0) throw new Error('skipped: a question is waiting')
    return runChat(messages, opts)
  }
  const p = queue.then(run, run)
  queue = p.catch(() => {})
  return p
}

async function runChat(messages, { schema = null, maxTokens = 300, timeoutMs = 20000, onProgress } = {}) {
  const settings = getLLMSettings()
  const t0 = performance.now()
  let raw
  if (settings.backend === 'webllm') {
    const web = await import('./webllm.js')
    if (!web.webllmReady()) await web.loadWebLLM(settings.webllmModel, onProgress)
    let timer
    try {
      raw = await Promise.race([
        web.chatWebLLM(messages, settings.webllmModel, onProgress, { schema, maxTokens }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new LLMTimeout(timeoutMs)), timeoutMs) }),
      ])
    } catch (e) {
      if (e instanceof LLMTimeout) web.interruptWebLLM()
      throw e
    } finally {
      clearTimeout(timer)
    }
  } else if (settings.backend === 'ollama') {
    const { chatOllama } = await import('./ollama.js')
    raw = await chatOllama(messages, settings, { schema, maxTokens, timeoutMs })
  } else {
    return null
  }
  return { raw, parsed: parseReply(raw), ms: Math.round(performance.now() - t0), backend: settings.backend, model: llmModelName(getLLMSettings()) }
}

// Search words the built-in vocabulary did not know, translated by the local
// model into German and English (plus close synonyms). [] when no model is on
// or the answer is unusable.
export async function translateTerms(words, lang = 'de') {
  const settings = getLLMSettings()
  if (settings.backend === 'off' || !words?.length) return []
  const messages = [
    { role: 'system', content: 'You help a calendar search. Reply with ONE JSON object {"terms":["..."]} containing German and English translations and close synonyms of the given words, lowercase, at most 6 terms. No other text.' },
    { role: 'user', content: words.join(' ') },
  ]
  try {
    const out = await chatLLM(messages, {
      schema: { type: 'object', properties: { terms: { type: 'array', items: { type: 'string' } } }, required: ['terms'] },
      maxTokens: 80,
      timeoutMs: 15000,
    })
    const obj = out?.parsed
    return Array.isArray(obj?.terms) ? obj.terms.map(String).map(s => s.trim()).filter(Boolean).slice(0, 6) : []
  } catch (e) {
    console.warn(`[assistant] translateTerms (${lang})`, e)
    return []
  }
}
