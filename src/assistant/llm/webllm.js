// In-browser inference through WebLLM. The package (and the model weights,
// cached by the browser after the first download) only load when this backend
// is actually used.

import { getLLMSettings, setLLMSettings, WEBLLM_MODELS, AUTO_MODEL, LLM_SESSION, isIOS } from './index.js'

const HF = 'https://huggingface.co/'
const GH = 'https://raw.githubusercontent.com/'

let enginePromise = null
let engineKey = null
let readyKey = null        // engineKey once its engine finished loading
let sessionSource = null   // what 'auto' settled on for this app session
const loadedIds = new Set()  // models loaded successfully in this page load

async function gpuInfo() {
  if (!navigator.gpu) return { ok: false, reason: 'navigator.gpu missing (no WebGPU)' }
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) return { ok: false, reason: 'WebGPU adapter unavailable' }
  return {
    ok: true,
    f16: adapter.features.has('shader-f16'),
    maxBuffer: adapter.limits?.maxBufferSize ?? 0,
    maxStorage: adapter.limits?.maxStorageBufferBindingSize ?? 0,
  }
}

// q4f16 builds need the `shader-f16` GPU feature, which many iPhone/iPad GPUs
// do not expose — the q4f32 build of the same model runs there.
export async function resolveModel(model) {
  const gpu = await gpuInfo()
  if (!gpu.ok) throw new Error(`WebGPU: ${gpu.reason}`)
  return !gpu.f16 && model.includes('q4f16') ? model.replace('q4f16', 'q4f32') : model
}

// Same model list, but every file is fetched through this app's own origin
// (worker/index.js in production, the Vite dev proxy locally).
export function proxiedAppConfig(appConfig) {
  const origin = location.origin
  return {
    ...appConfig,
    model_list: appConfig.model_list.map(r => ({
      ...r,
      model: r.model.replace(HF, `${origin}/hf/`),
      model_lib: r.model_lib.replace(GH, `${origin}/ghraw/`),
    })),
  }
}

const withSlash = u => (u.endsWith('/') ? u : `${u}/`)

async function probe(url, ms = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const r = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// 'direct' | 'proxy'. Auto tries Hugging Face directly once per session and
// falls back to the app server when it is unreachable.
async function pickSource(record) {
  const setting = getLLMSettings().downloadSource ?? 'auto'
  if (setting === 'direct' || setting === 'proxy') return setting
  if (sessionSource) return sessionSource
  sessionSource = (await probe(`${withSlash(record.model)}resolve/main/mlc-chat-config.json`)) ? 'direct' : 'proxy'
  return sessionSource
}

// ── Device check → model choice ────────────────────────────────────────────

const MB = 1048576

// Naive 256×256 matrix multiply on the GPU; returns GFLOPS. Compiles once
// (warm-up), then times five rounds. Gives integrated vs. discrete GPUs and
// phones a comparable number without downloading anything.
async function gpuBenchmark(adapter) {
  const device = await adapter.requestDevice()
  try {
    const N = 256
    const code = `
      @group(0) @binding(0) var<storage, read> a: array<f32>;
      @group(0) @binding(1) var<storage, read> b: array<f32>;
      @group(0) @binding(2) var<storage, read_write> c: array<f32>;
      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let n = ${N}u;
        if (id.x >= n || id.y >= n) { return; }
        var sum = 0.0;
        for (var k = 0u; k < n; k++) { sum += a[id.y * n + k] * b[k * n + id.x]; }
        c[id.y * n + id.x] = sum;
      }`
    const data = new Float32Array(N * N).map(() => Math.random())
    const buffer = init => {
      const buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE, mappedAtCreation: !!init })
      if (init) { new Float32Array(buf.getMappedRange()).set(init); buf.unmap() }
      return buf
    }
    const buffers = [buffer(data), buffer(data), buffer(null)]
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } })
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: buffers.map((b, binding) => ({ binding, resource: { buffer: b } })) })
    const round = async () => {
      const enc = device.createCommandEncoder()
      const pass = enc.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.dispatchWorkgroups(Math.ceil(N / 8), Math.ceil(N / 8))
      pass.end()
      device.queue.submit([enc.finish()])
      await device.queue.onSubmittedWorkDone()
    }
    await round()
    const rounds = 5
    const t0 = performance.now()
    for (let i = 0; i < rounds; i++) await round()
    const seconds = (performance.now() - t0) / rounds / 1000
    return Math.round((N ** 3 / seconds / 1e9) * 10) / 10
  } finally {
    device.destroy?.()
  }
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// Index into WEBLLM_MODELS. Thresholds are deliberately cautious: a model
// that is too big crashes the tab, one that is too small only answers worse.
function pickTier(d) {
  if (!d.webgpu || d.fallback) return 0
  const free = d.freeGB ?? 99
  const score = d.gpuScore ?? 0
  // iPhone/iPad report no RAM. WebGPU's storage-buffer limit is ~1024 MB on
  // every iOS device regardless of chip (an OS cap, not a hardware one), so it
  // cannot tell devices apart — GPU speed and free storage do that instead.
  // Recent Pro-class chips (iPhone 15 Pro and later) score above ~10 GFLOPS on
  // the benchmark here. If a model is still too big, iOS kills the tab —
  // detected on the next start (pendingLoad in index.js), then the next
  // smaller model is used.
  if (d.ios) {
    if (score >= 10 && free >= 4) return 2
    if (score >= 4 && free >= 2) return 1
    return 0
  }
  const memory = d.memoryGB ?? 8          // deviceMemory is Chromium-only and capped at 8
  if (memory >= 8 && d.maxStorageMB >= 1000 && free >= 4 && score >= 3) return 2
  if (memory >= 4 && d.maxStorageMB >= 500 && free >= 2 && score >= 0.8) return 1
  return 0
}

export async function checkDevice() {
  const d = {
    webgpu: false, fallback: false, f16: false, maxBufferMB: 0, maxStorageMB: 0, vendor: '',
    memoryGB: navigator.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null,
    ios: isIOS(), freeGB: null, gpuScore: null,
  }
  try {
    const est = await navigator.storage?.estimate?.()
    if (est?.quota) d.freeGB = Math.round(((est.quota - (est.usage ?? 0)) / 1073741824) * 10) / 10
  } catch { /* no estimate */ }
  const adapter = navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null) : null
  if (adapter) {
    d.webgpu = true
    d.fallback = !!(adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter)
    d.f16 = adapter.features.has('shader-f16')
    d.maxBufferMB = Math.round((adapter.limits?.maxBufferSize ?? 0) / MB)
    d.maxStorageMB = Math.round((adapter.limits?.maxStorageBufferBindingSize ?? 0) / MB)
    d.vendor = [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(' ')
    try { d.gpuScore = await withTimeout(gpuBenchmark(adapter), 5000) } catch (e) { console.warn('[assistant] GPU benchmark', e) }
  }
  // Never pick a model that already crashed or ran out of memory here.
  const tooBig = getLLMSettings().tooBig ?? []
  let tier = pickTier(d)
  while (tier > 0 && tooBig.includes(WEBLLM_MODELS[tier].id)) tier--
  return { ...d, model: WEBLLM_MODELS[tier].id, at: Date.now() }
}

// The model 'auto' stands for; checks the device the first time.
export async function ensureAutoModel({ force = false } = {}) {
  const s = getLLMSettings()
  if (!force && s.autoModel) return s.autoModel
  // Checking again on purpose gives models that were too big another chance
  // (e.g. after closing other apps).
  if (force && s.tooBig?.length) setLLMSettings({ tooBig: [] })
  const check = await checkDevice()
  setLLMSettings({ autoModel: check.model, deviceCheck: check })
  return check.model
}

export const resolveWebLLMModel = model => (model === AUTO_MODEL ? ensureAutoModel() : Promise.resolve(model))

// 'auto' loads the checked model and steps down to a smaller one when the
// device runs out of memory, remembering the step for next time.
export async function loadWebLLM(model, onProgress) {
  if (model !== AUTO_MODEL) return loadExact(model, onProgress)
  let id = await ensureAutoModel()
  for (;;) {
    // Marked before the first load of this page, so a tab killed mid-load is
    // noticed on the next start. Already-loaded engines skip the bookkeeping.
    const firstLoad = !loadedIds.has(id)
    if (firstLoad) setLLMSettings({ pendingLoad: { id, session: LLM_SESSION } })
    try {
      const engine = await loadExact(id, onProgress)
      loadedIds.add(id)
      if (firstLoad) setLLMSettings({ pendingLoad: null })
      return engine
    } catch (e) {
      if (firstLoad) setLLMSettings({ pendingLoad: null })
      const idx = WEBLLM_MODELS.findIndex(m => m.id === id)
      if (idx <= 0 || !/memory|device (?:was )?lost|out of|allocat|buffer size|exceeds/i.test(String(e?.message ?? e))) throw e
      const smaller = WEBLLM_MODELS[idx - 1].id
      console.warn('[assistant] model too big for this device, stepping down to', smaller, e)
      setLLMSettings({ autoModel: smaller, tooBig: [...new Set([...(getLLMSettings().tooBig ?? []), id])] })
      id = smaller
    }
  }
}

async function loadExact(model, onProgress) {
  const resolved = await resolveModel(model)
  const lib = await import('@mlc-ai/web-llm')
  const record = lib.prebuiltAppConfig.model_list.find(m => m.model_id === resolved)
  if (!record) throw new Error(`${resolved} is not in the WebLLM model list`)
  const source = await pickSource(record)

  const key = `${resolved}|${source}`
  if (enginePromise && engineKey === key) return enginePromise
  engineKey = key
  // Ask for persistent storage so a multi-GB model is not evicted (iOS PWAs).
  try { await navigator.storage?.persist?.() } catch { /* ignore */ }

  const baseConfig = source === 'proxy' ? proxiedAppConfig(lib.prebuiltAppConfig) : lib.prebuiltAppConfig
  enginePromise = (async () => {
    const create = cacheBackend => lib.CreateMLCEngine(resolved, {
      appConfig: { ...baseConfig, cacheBackend },
      initProgressCallback: r => onProgress?.({ progress: r.progress ?? 0, text: r.text }),
    })
    // Cache API is WebLLM's best-tested store; some browsers refuse multi-GB
    // entries there, so try IndexedDB and OPFS before giving up.
    let lastErr
    for (const backend of ['cache', 'indexeddb', 'opfs']) {
      try {
        const engine = await create(backend)
        readyKey = key
        return engine
      } catch (e) {
        lastErr = e
        console.warn(`[assistant] WebLLM load (${source}, ${backend}) failed`, e)
        if (!/load failed|quota|cache|storage|indexeddb|opfs|fetch|network|abort/i.test(String(e?.message ?? e))) break
      }
    }
    // A direct download that dies mid-way: retry once through the app server.
    if (source === 'direct' && (getLLMSettings().downloadSource ?? 'auto') === 'auto' && /load failed|fetch|network/i.test(String(lastErr?.message ?? lastErr))) {
      sessionSource = 'proxy'
      enginePromise = null
      engineKey = null
      return loadExact(model, onProgress)
    }
    throw source === 'proxy' ? new Error(`[proxy] ${lastErr?.message ?? lastErr}`) : lastErr
  })().catch(e => { enginePromise = null; engineKey = null; throw e })
  return enginePromise
}

// Unload the engine and remove the model's weights, config and wasm from every
// cache backend a load may have used (both q4f16 and q4f32 builds).
export async function deleteWebLLM(model) {
  const lib = await import('@mlc-ai/web-llm')
  if (enginePromise) {
    try { await (await enginePromise).unload() } catch { /* ignore */ }
  }
  enginePromise = null
  engineKey = null
  readyKey = null
  // 'auto' may have downloaded any of the offered models over time: remove all.
  const targets = model === AUTO_MODEL ? WEBLLM_MODELS.map(m => m.id) : [model]
  const ids = [...new Set(targets.flatMap(id => [id, id.replace('q4f16', 'q4f32')]))]
    .filter(id => lib.prebuiltAppConfig.model_list.some(m => m.model_id === id))
  for (const config of [lib.prebuiltAppConfig, proxiedAppConfig(lib.prebuiltAppConfig)]) {
    for (const cacheBackend of ['cache', 'indexeddb', 'opfs']) {
      for (const id of ids) {
        try { await lib.deleteModelAllInfoInCache(id, { ...config, cacheBackend }) } catch (e) { console.warn(`[assistant] delete ${id} (${cacheBackend})`, e) }
      }
    }
  }
}

// A loaded engine answers without downloading or compiling anything.
export const webllmReady = () => !!readyKey && readyKey === engineKey

// Stops a generation that ran past its timeout, so the next question is not
// queued behind it.
export async function interruptWebLLM() {
  try { (await enginePromise)?.interruptGenerate?.() } catch { /* nothing running */ }
}

// Loads the model in the background when its weights are already cached, so
// the first question does not wait for it. Never starts a download.
export async function warmUpWebLLM() {
  const s = getLLMSettings()
  if (enginePromise || s.backend !== 'webllm' || s.pendingLoad) return
  const id = s.webllmModel === AUTO_MODEL ? s.autoModel : s.webllmModel
  if (!id) return
  try {
    const resolved = await resolveModel(id)
    const lib = await import('@mlc-ai/web-llm')
    let cached = false
    for (const config of [lib.prebuiltAppConfig, proxiedAppConfig(lib.prebuiltAppConfig)]) {
      cached = cached || await lib.hasModelInCache(resolved, { ...config, cacheBackend: 'cache' }).catch(() => false)
    }
    if (cached) await loadWebLLM(s.webllmModel)
  } catch (e) {
    console.warn('[assistant] model warm-up', e)
  }
}

// `schema` constrains the reply to a JSON schema (an object, e.g. an enum of
// intent ids), which small models need to answer reliably.
export async function chatWebLLM(messages, model, onProgress, { schema = null, maxTokens = 450 } = {}) {
  const engine = await loadWebLLM(model, onProgress)
  const request = { messages, temperature: 0.1, max_tokens: maxTokens }
  let res
  try {
    // The schema must be a string: this web-llm build hands `schema` straight to
    // the grammar compiler, and a missing one fails with "Cannot pass non-string
    // to std::string".
    res = await engine.chat.completions.create({ ...request, response_format: { type: 'json_object', schema: JSON.stringify(schema ?? { type: 'object' }) } })
  } catch (e) {
    if (!/grammar|response.?format|std::string|schema/i.test(String(e?.message ?? e))) throw e
    // Some models cannot build the JSON grammar at all; parseReply copes with free text.
    console.warn('[assistant] JSON grammar unavailable, retrying without it', e)
    res = await engine.chat.completions.create(request)
  }
  return res.choices?.[0]?.message?.content ?? ''
}

// Step-by-step check of everything a model download needs, so a failure can
// be pinned to one cause instead of a bare "Load failed". Hugging Face is
// checked both directly and through the app server.
export async function diagnoseWebLLM(model) {
  if (model === AUTO_MODEL) model = await ensureAutoModel()
  const out = []
  const step = async (name, fn) => {
    try { out.push({ name, ok: true, detail: (await fn()) ?? 'ok' }) } catch (e) { out.push({ name, ok: false, detail: String(e?.message ?? e) }) }
  }
  const gb = n => (n / 1073741824).toFixed(2)
  const MB4 = { headers: { range: 'bytes=0-4194303' }, cache: 'no-store' }
  let lib = null
  let resolved = model
  let rec = null

  await step('WebGPU', async () => {
    const g = await gpuInfo()
    if (!g.ok) throw new Error(g.reason)
    return `shader-f16: ${g.f16 ? 'yes' : 'no'} · maxBuffer ${Math.round(g.maxBuffer / 1048576)} MB · maxStorageBinding ${Math.round(g.maxStorage / 1048576)} MB`
  })
  await step('Model build', async () => { resolved = await resolveModel(model); return resolved })
  await step('App runtime file', async () => { lib = await import('@mlc-ai/web-llm'); return 'loaded' })
  await step('Model entry', async () => {
    rec = lib?.prebuiltAppConfig.model_list.find(m => m.model_id === resolved)
    if (!rec) throw new Error(`${resolved} not in WebLLM list`)
    return rec.model
  })

  const checkSource = async (label, base, libUrl) => {
    let shard = null
    await step(`Model config — ${label}`, async () => {
      const r = await fetch(`${base}resolve/main/mlc-chat-config.json`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await r.json()
      return 'reachable'
    })
    await step(`Weights index — ${label}`, async () => {
      const r = await fetch(`${base}resolve/main/ndarray-cache.json`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      shard = j.records?.[0]?.dataPath ?? null
      const bytes = (j.records ?? []).reduce((n, x) => n + (x.nbytes ?? 0), 0)
      return `${j.records?.length ?? 0} shards · ${gb(bytes)} GB`
    })
    await step(`Weight shard (4 MB) — ${label}`, async () => {
      if (!shard) throw new Error('skipped (no index)')
      const r = await fetch(`${base}resolve/main/${shard}`, MB4)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const b = await r.arrayBuffer()
      return `${(b.byteLength / 1048576).toFixed(1)} MB received`
    })
    await step(`Model library (wasm) — ${label}`, async () => {
      const r = await fetch(libUrl, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const b = await r.arrayBuffer()
      return `${Math.round(b.byteLength / 1024)} KB`
    })
  }

  if (rec) {
    await checkSource('direct', withSlash(rec.model), rec.model_lib)
    const proxied = proxiedAppConfig({ model_list: [rec] }).model_list[0]
    await checkSource('via app server', withSlash(proxied.model), proxied.model_lib)
    await step('Download source used', async () => {
      const setting = getLLMSettings().downloadSource ?? 'auto'
      sessionSource = null
      return `${setting} → ${await pickSource(rec)}`
    })
  }

  await step('Storage', async () => {
    const est = await navigator.storage?.estimate?.()
    const persisted = await navigator.storage?.persisted?.()
    if (!est) return 'no estimate API'
    return `${gb(est.usage ?? 0)} / ${gb(est.quota ?? 0)} GB used${persisted ? ' · persistent' : ''}`
  })
  for (const [name, test] of [
    ['Cache API write 64 MB', async () => { const c = await caches.open('mt-diag'); await c.put('/__mt_diag', new Response(new Uint8Array(64 * 1048576))); await caches.delete('mt-diag') }],
    ['IndexedDB write 64 MB', () => new Promise((resolve, reject) => {
      const req = indexedDB.open('mt-diag', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('s')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('s', 'readwrite')
        tx.objectStore('s').put(new Blob([new Uint8Array(64 * 1048576)]), 'x')
        tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase('mt-diag'); resolve() }
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('aborted'))
      }
    })],
  ]) {
    await step(name, async () => { await test(); return 'ok' })
  }
  return out
}
