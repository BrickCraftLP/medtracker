// A local Ollama server. Browsers block cross-origin calls unless Ollama allows
// this origin: start it with OLLAMA_ORIGINS=* (or the app's origin).

// `schema` (a JSON schema object) is passed as Ollama's structured output format.
export async function chatOllama(messages, { ollamaUrl, ollamaModel }, { schema = null, maxTokens = 450, timeoutMs = 30000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, messages, stream: false, format: schema ?? 'json', options: { temperature: 0.1, num_predict: maxTokens } }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json()
    return data.message?.content ?? ''
  } finally {
    clearTimeout(timer)
  }
}

export async function pingOllama(url) {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`)
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const data = await res.json()
  return (data.models ?? []).map(m => m.name)
}
