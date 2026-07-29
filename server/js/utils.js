// ============================================================
// Shared Utilities
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Initialize Supabase client
let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;
  
  // Load Supabase from CDN if not already loaded
  if (!window.supabase) {
    throw new Error("Supabase client not loaded. Make sure the CDN script is included.");
  }
  
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return _supabase;
}

// ============================================================
// API Helpers
// ============================================================

export async function apiCall(url, options = {}) {
  const defaultHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    // Response was not valid JSON (e.g., HTML error page from Supabase)
    throw new Error("پاسخ سرور نامعتبر است (کد " + response.status + ")");
  }

  if (!response.ok) {
    const errorMsg = data.error || data.message || `خطای سرور (کد ${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

export async function apiCallWithAuth(url, options = {}) {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("احراز هویت لازم است");
  }

  return apiCall(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
}

// ============================================================
// UI Helpers
// ============================================================

export function showLoading(button) {
  if (!button) return;
  button.dataset.originalText = button.innerHTML;
  button.innerHTML = '<span class="spinner"></span>';
  button.disabled = true;
}

export function hideLoading(button) {
  if (!button) return;
  button.innerHTML = button.dataset.originalText || button.innerHTML;
  button.disabled = false;
}

export function showError(message, container) {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-error">${escapeHtml(message)}</div>`;
  container.classList.add("visible");
}

export function showSuccess(message, container) {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-success">${escapeHtml(message)}</div>`;
  container.classList.add("visible");
}

export function hideAlert(container) {
  if (!container) return;
  container.innerHTML = "";
  container.classList.remove("visible");
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// Clipboard
// ============================================================

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// ============================================================
// Auth State
// ============================================================

export function onAuthStateChange(callback) {
  const supabase = getSupabase();
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function signOut() {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

// ============================================================
// Admin Auth
// ============================================================

const ADMIN_TOKEN_KEY = "vless_admin_token";
const ADMIN_USER_KEY = "vless_admin_user";

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token, admin) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_USER_KEY));
  } catch {
    return null;
  }
}

export function isAdminLoggedIn() {
  return !!getAdminToken();
}

// ============================================================
// Formatters
// ============================================================

export function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "همین الان";
  if (diffMins < 60) return `${diffMins} دقیقه پیش`;
  if (diffHours < 24) return `${diffHours} ساعت پیش`;
  return `${diffDays} روز پیش`;
}

// ============================================================
// Theme Toggle (shared across all pages)
// ============================================================

export function initTheme() {
  const saved = localStorage.getItem('vless-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('vless-theme', next);
}

// Auto-init on import
initTheme();
