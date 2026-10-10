// Shared Supabase client for the dev authorization rollout (Step 5).
// Same project the dashboards already read from; the anon/publishable key is
// intentionally public (protection model is RLS/grants, not secrecy) and is
// the key Supabase Auth itself requires on the client for sign-in/session calls.
export const SUPABASE_URL = "https://tcefrvybgulcwwsdarcw.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZWZydnliZ3VsY3d3c2RhcmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDE4MjYsImV4cCI6MjEwNTA3NzgyNn0.MbpagnH8fJCgNusLjsV6WIbmIj3QUmzga_l-dGmb_5Q";

let clientPromise = null;

// Loaded once per page from a pinned CDN build; no bundler in this repo.
export async function getSupabase() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2.45.4").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: "sivco-dashboards-auth-dev",
        },
      })
    );
  }
  return clientPromise;
}
