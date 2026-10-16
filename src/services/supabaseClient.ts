// Browser Supabase client. Only ever uses the public ANON (publishable) key;
// data access is protected by row-level security (supabase/migrations).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

function env(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value: unknown = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Refuse keys that would bypass RLS if they ever ended up in the bundle. */
function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

/** Returns the shared client, or null when Supabase is not (correctly) configured. */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY');
  if (!url || !key || !validUrl(url)) {
    cached = null;
    return cached;
  }
  if (isPrivilegedKey(key)) {
    console.error('[LifeQuest] VITE_SUPABASE_ANON_KEY looks like a service-role/secret key. Refusing to use it in the browser; staying in local mode.');
    cached = null;
    return cached;
  }
  try {
    cached = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch (e) {
    console.error('[LifeQuest] Could not create Supabase client; staying in local mode.', e);
    cached = null;
  }
  return cached;
}
