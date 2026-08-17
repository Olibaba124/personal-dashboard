// These two values are meant to ship in the browser — they are NOT secrets.
// Supabase's anon/publishable key only grants what Row Level Security policies
// allow; real protection happens server-side in Postgres, not by hiding this key.
// The service_role key (which bypasses RLS) must never appear here or anywhere
// in front-end code — see CLAUDE.md section 3.
const SUPABASE_URL = "https://altnaaajgygspiekmhtn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9KLGeatohQh407PG5q_JgA_EtjEI6X0";
