// Supabase connection (publishable key is safe in browser code; never use a secret/service_role key here)
const SUPABASE_URL = "https://baopjcffpxpymkycqrem.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Lycbq26UZmcWbgr8jz9Raw_ZMfZ57RN";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
