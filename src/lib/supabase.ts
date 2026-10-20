import { createClient } from '@supabase/supabase-js'

const url = 'https://aowceqpaawxeugalapgx.supabase.co'
const key = 'sb_publishable_kLC7Rk8RdDodDxl0ZD_sbQ_zgoDCM20'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})
