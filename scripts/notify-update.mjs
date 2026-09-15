// Sends the "new version available" push to every opted-in device.
// Runs after `wrangler deploy` (see the deploy script in package.json).
//
//   node scripts/notify-update.mjs [version]
//
// Needs PUSH_DISPATCH_SECRET (same value as the CRON_SECRET Edge Function
// secret) in .env.local. Never prefix it with VITE_ — that would ship it in the
// bundle. A missing secret or a failed call never fails the deploy.

import { existsSync, readFileSync } from 'node:fs'

function loadEnv(file) {
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')])
  )
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...process.env }
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const secret = env.PUSH_DISPATCH_SECRET

if (!supabaseUrl || !secret) {
  console.log('[notify-update] PUSH_DISPATCH_SECRET or Supabase URL not set — skipping update push.')
  process.exit(0)
}

// BUILD_VERSION in SettingsScreen is what users see; package.json is the fallback.
const version =
  process.argv[2] ||
  readFileSync('src/screens/SettingsScreen.jsx', 'utf8').match(/BUILD_VERSION = '([^']+)'/)?.[1] ||
  JSON.parse(readFileSync('package.json', 'utf8')).version

try {
  const res = await fetch(`${supabaseUrl}/functions/v1/push-dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ kind: 'updates', version }),
  })
  const text = await res.text()
  if (res.ok) console.log(`[notify-update] ${version}: ${text}`)
  else console.error(`[notify-update] failed (${res.status}): ${text}`)
} catch (error) {
  console.error('[notify-update] failed:', error.message)
}
