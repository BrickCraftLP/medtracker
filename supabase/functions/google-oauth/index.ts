// Google OAuth for Calendar and Tasks sync — the server half of
// src/services/googleAuth.js.
//
// The browser runs Google's popup and gets back a one-time code; this function
// swaps it for tokens using the client secret and keeps the refresh token in
// google_oauth_tokens, a table no client policy can read. From then on the
// browser asks here for a fresh access token whenever it needs one — no popup,
// on any device, until the user disconnects or revokes access at Google.
//
// Actions (POST JSON { action, ... }), always for the signed-in caller:
//   status   → { connected, scopes, email }
//   exchange → { code } → { access_token, expires_in, scopes, email }
//   token    → { access_token, expires_in, scopes }
//   revoke   → { ok }
// Expected failures (not connected, grant revoked) come back as 200 with
// { error }, so the client can tell them apart from a broken function.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

const scopeList = (scope?: string) => (scope ? scope.split(' ').filter(Boolean) : [])

// The id_token came straight from Google's token endpoint over TLS, so its
// payload is read without verifying the signature — it only supplies a
// login hint, never an identity decision.
function emailOf(idToken?: string): string | null {
  try {
    const part = idToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4)
    return JSON.parse(atob(padded)).email ?? null
  } catch {
    return null
  }
}

async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth header' }, 401)

    // Verify the caller's JWT and extract their user ID
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) return json({ error: 'not_configured' }, 500)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const table = () => admin.from('google_oauth_tokens')
    const load = async () => {
      const { data, error } = await table()
        .select('refresh_token, scopes, email')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return data
    }
    const drop = () => table().delete().eq('user_id', user.id)

    const { action, code } = await req.json().catch(() => ({}))

    if (action === 'status') {
      const row = await load()
      return json({ connected: !!row, scopes: row?.scopes ?? [], email: row?.email ?? null })
    }

    if (action === 'exchange') {
      if (!code) return json({ error: 'missing_code' }, 400)
      // 'postmessage' is the redirect URI of Google's popup code flow.
      const { ok, body } = await postForm(TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      })
      if (!ok) return json({ error: body.error ?? 'exchange_failed' })

      const row = await load()
      const refreshToken = body.refresh_token ?? row?.refresh_token
      if (!refreshToken) {
        // Google only sends a refresh token along with a fresh consent. This
        // account granted the app before one was ever stored (the old
        // browser-only flow), so end that grant; the next Connect asks again
        // and gets one.
        await postForm(REVOKE_URL, { token: body.access_token })
        return json({ error: 'no_refresh_token' })
      }

      // A new refresh token carries every granted scope (include_granted_scopes);
      // an old one kept alongside a narrower grant keeps what it had.
      const scopes = [...new Set([
        ...scopeList(body.scope),
        ...(body.refresh_token ? [] : row?.scopes ?? []),
      ])]
      const email = emailOf(body.id_token) ?? row?.email ?? null
      const { error } = await table().upsert({
        user_id: user.id,
        refresh_token: refreshToken,
        scopes,
        email,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      return json({ access_token: body.access_token, expires_in: body.expires_in, scopes, email })
    }

    if (action === 'token') {
      const row = await load()
      if (!row) return json({ error: 'not_connected' })
      const { ok, body } = await postForm(TOKEN_URL, {
        refresh_token: row.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      })
      if (!ok) {
        // Revoked at Google, expired (7 days while the app is in Testing), or
        // the password changed: the stored grant is dead either way.
        if (body.error === 'invalid_grant') {
          await drop()
          return json({ error: 'revoked' })
        }
        return json({ error: body.error ?? 'refresh_failed' }, 502)
      }
      const scopes = body.scope ? scopeList(body.scope) : (row.scopes ?? [])
      if ([...scopes].sort().join(' ') !== [...(row.scopes ?? [])].sort().join(' ')) {
        await table().update({ scopes, updated_at: new Date().toISOString() }).eq('user_id', user.id)
      }
      return json({ access_token: body.access_token, expires_in: body.expires_in, scopes })
    }

    if (action === 'revoke') {
      const row = await load()
      if (row) await postForm(REVOKE_URL, { token: row.refresh_token })
      await drop()
      return json({ ok: true })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (error) {
    return json({ error: (error as Error)?.message ?? String(error) }, 500)
  }
})
