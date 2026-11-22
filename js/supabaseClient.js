// Paste your own values from Supabase > Project Settings > API
const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY"; // anon/public key ONLY, never service_role

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
