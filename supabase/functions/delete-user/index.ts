import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the caller's JWT and extract their user ID
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use the admin client (service role) to delete the user
    // This also cascades to auth-managed tables
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Revoke the Google grant at Google before its token row goes away with the
    // account — otherwise the app keeps access to the user's Google data.
    // Best effort: an already-revoked or expired token must not block deletion.
    const { data: google } = await supabaseAdmin
      .from('google_oauth_tokens').select('refresh_token').eq('user_id', user.id).maybeSingle()
    if (google?.refresh_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: google.refresh_token }),
        })
      } catch { /* network failure: proceed with deletion */ }
    }

    // Delete user data first
    await Promise.all([
      supabaseAdmin.from('todos').delete().eq('user_id', user.id),
      supabaseAdmin.from('topics').delete().eq('user_id', user.id),
      supabaseAdmin.from('sessions').delete().eq('user_id', user.id),
      supabaseAdmin.from('widget_configs').delete().eq('user_id', user.id),
      supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id),
      supabaseAdmin.from('notification_prefs').delete().eq('user_id', user.id),
      supabaseAdmin.from('active_sessions').delete().eq('user_id', user.id),
      supabaseAdmin.from('push_log').delete().eq('user_id', user.id),
      supabaseAdmin.from('google_oauth_tokens').delete().eq('user_id', user.id),
    ])

    // Delete the auth account
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
