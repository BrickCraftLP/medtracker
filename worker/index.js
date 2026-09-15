// Cloudflare Worker in front of the static assets.
//
// Only /hf/* and /ghraw/* reach this code (see run_worker_first in
// wrangler.toml); every other request is served straight from ./dist.
//
// Those two prefixes proxy the on-device assistant's model files from
// Hugging Face and GitHub through the app's own origin. Some devices and
// networks (content blockers, DNS filters, Private Relay) cannot reach
// huggingface.co directly, but can always reach the app itself.

const ROUTES = [
  {
    prefix: '/hf/',
    upstream: 'https://huggingface.co/',
    // mlc-ai/<model>/resolve/<rev>/<file>
    allow: /^mlc-ai\/[\w.-]+\/resolve\/[\w.-]+\/[\w./-]+$/,
  },
  {
    prefix: '/ghraw/',
    upstream: 'https://raw.githubusercontent.com/',
    allow: /^mlc-ai\/binary-mlc-llm-libs\/[\w./-]+$/,
  },
]

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const route = ROUTES.find(r => url.pathname.startsWith(r.prefix))
    if (!route) return env.ASSETS.fetch(request)

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    const path = decodeURIComponent(url.pathname.slice(route.prefix.length))
    if (path.includes('..') || !route.allow.test(path)) {
      return new Response('Forbidden', { status: 403 })
    }

    const headers = new Headers()
    const range = request.headers.get('range')
    if (range) headers.set('range', range)

    let upstream
    try {
      upstream = await fetch(route.upstream + path, {
        method: request.method,
        headers,
        redirect: 'follow',
        // Whole files are immutable per revision: let the edge cache them.
        cf: range ? undefined : { cacheEverything: true, cacheTtl: 31536000 },
      })
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e?.message ?? e}`, { status: 502 })
    }

    const out = new Headers()
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) out.set(name, value)
    }
    out.set('cache-control', upstream.ok ? 'public, max-age=31536000, immutable' : 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers: out })
  },
}
