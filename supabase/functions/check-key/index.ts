// ============================================================
// Edge Function: check-key
// The "gatekeeper" — validates an incoming API key against the
// hashed keys stored in the database, then returns data only
// on a match.
//
// IMPORTANT: In this function's settings in the Supabase
// dashboard, "Verify JWT" must be turned OFF. This function
// does its own custom auth check via the x-api-key header
// instead of Supabase's built-in JWT check.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key')

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // Hash the incoming key the same way it was hashed at generation time (SHA-256)
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  // Service role key bypasses RLS — required here since we're checking
  // keys across all users, not just one. This function runs server-side
  // only; the service role key must never be exposed to a client/browser.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single()

  if (!keyRow) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // Key is valid — do the actual work here.
  // Replace this with a real query once you have a data table, e.g.:
  //   const { data: results } = await supabase.from('properties').select('*').limit(20)
  return new Response(JSON.stringify({ message: 'Your API key is valid!' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
