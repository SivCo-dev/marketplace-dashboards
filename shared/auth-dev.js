// Shared authorization helper for the dev rollout of Step 5 (Daily / Monthly / Monthly v2).
// One Supabase Auth session, shared via localStorage across all pages on this origin.
// Server-side access checks (security.assert_tenant_access_v1 inside the *-auth-dev
// edge functions) are the real boundary; this module only wires the client to them —
// it never decides who can see what on its own.
import { getSupabase } from "./supabase-client-dev.js";

const LOGIN_PATH = "/shared/login-dev.html";

function loginUrl(returnTo) {
  const url = new URL(LOGIN_PATH, location.origin);
  url.searchParams.set("return", returnTo || location.pathname + location.search);
  return url.toString();
}

function goToLogin(returnTo) {
  location.href = loginUrl(returnTo);
}

// Resolves with the session, or redirects to the login page and never resolves
// (navigation is in flight) if there isn't one. Call this before any private fetch.
export async function ensureSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    goToLogin();
    return new Promise(() => {}); // page is navigating away
  }
  return data.session;
}

export async function getAccessToken() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function getUserEmail() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.email || null;
}

export function onAuthChange(callback) {
  getSupabase().then((supabase) => {
    supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  });
}

// Clears the Supabase session AND any page-local cache of private data
// (so a logged-out viewer can't recover a prior tenant's data from
// localStorage/sessionStorage/in-memory globals), then sends the user to login.
export async function logout({ extraCleanup } = {}) {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith("sivco-") || key.startsWith("monthlyImport") || key.startsWith("dashboard-")) {
          store.removeItem(key);
        }
      }
    }
  } catch { /* storage may be unavailable (private mode) */ }
  if (typeof extraCleanup === "function") {
    try { extraCleanup(); } catch { /* best-effort */ }
  }
  goToLogin("/daily/");
}

// Drop-in replacement for fetch() that attaches the current access token and
// treats AUTH_REQUIRED / TENANT_ACCESS_DENIED as distinct, user-facing outcomes
// rather than generic HTTP errors. On AUTH_REQUIRED (session expired/invalid)
// it logs out and redirects, since a stale client-side session is not real access.
export function makeAuthedFetch({ onAccessDenied } = {}) {
  return async function authedFetch(url, options = {}) {
    const token = await getAccessToken();
    if (!token) {
      await logout();
      return new Promise(() => {});
    }
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + token);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      // Session looked valid locally but the server rejected it (expired/revoked) — re-auth.
      await logout();
      return new Promise(() => {});
    }
    if (response.status === 403) {
      let body = {};
      try { body = await response.clone().json(); } catch { /* non-JSON error body */ }
      if (typeof onAccessDenied === "function") onAccessDenied(body, response);
    }
    return response;
  };
}

// Small fixed badge: who's signed in + a logout button. Import-and-call once per page.
export async function mountAuthBadge() {
  const email = await getUserEmail();
  if (!email) return;
  const bar = document.createElement("div");
  bar.setAttribute("data-auth-badge-dev", "1");
  bar.style.cssText = "position:fixed;top:0;right:0;z-index:99999;display:flex;gap:8px;align-items:center;" +
    "background:#1c1c1c;color:#eee;font:12px/1.4 system-ui,sans-serif;padding:4px 10px;border-radius:0 0 0 6px;opacity:.92";
  const label = document.createElement("span");
  label.textContent = email;
  const btn = document.createElement("button");
  btn.textContent = "Выйти";
  btn.style.cssText = "background:#444;color:#fff;border:0;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit";
  btn.addEventListener("click", () => logout());
  bar.append(label, btn);
  document.body.appendChild(bar);
}
