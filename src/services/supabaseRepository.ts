// Supabase adapter: local-first saves mirrored to the cloud.
//
// - save() ALWAYS writes localStorage first, then syncs to Supabase. Cloud
//   failures are reported (never thrown, never reported as success) and the
//   local copy keeps the player's progress.
// - Auth uses Supabase anonymous sign-in. Anonymous sign-ins must be enabled
//   in the Supabase dashboard (Authentication -> Sign In / Providers ->
//   Anonymous), otherwise every cloud save reports a clear error.
// - Everything written here (scores, XP, money) is client-computed and NOT
//   authoritative; see supabase/migrations/0001_lifequest_init.sql.
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Assignment, FamilyMember, GameState, MissionStatus } from '../domain/types';
import type { GameRepository, SaveResult } from './repository';
import type { LocalRepository } from './localRepository';
import { getSupabase } from './supabaseClient';

const FAMILY_KEY = 'lifequest.familyId';
/** Set while local is newer than the cloud (a cloud sync failed or is running). */
const PENDING_KEY = 'lifequest.cloudPending';
const TIMEOUT_MS = 12_000;
const FINISHED: MissionStatus[] = ['completed', 'incomplete'];

export function supabaseConfigured(): boolean {
  return getSupabase() !== null;
}

// ---------- small helpers ----------

class CloudError extends Error {}

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function getKey(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setKey(key: string, value: string | null) {
  try {
    const st = store();
    if (!st) return;
    if (value === null) st.removeItem(key);
    else st.setItem(key, value);
  } catch {
    /* storage full / blocked: non-fatal for cloud sync bookkeeping */
  }
}

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function text(value: string | undefined | null, fallback: string, max: number): string {
  const t = (value ?? '').trim().slice(0, max);
  return t || fallback;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function money(n: unknown): number {
  return finite(n) ? Math.round(n * 100) / 100 : 0;
}

function withTimeout<T>(p: PromiseLike<T>, context: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CloudError(`${context}: Supabase did not respond in time (offline?)`)), TIMEOUT_MS);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Turn Supabase / network errors into something a player can act on. */
function describe(err: unknown, context: string): string {
  if (err instanceof CloudError) return err.message;
  const e = (err ?? {}) as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : String(err);
  const lower = message.toLowerCase();

  if (code === 'anonymous_provider_disabled' || lower.includes('anonymous sign-ins are disabled'))
    return 'Anonymous sign-ins are disabled in the Supabase project (enable Authentication → Providers → Anonymous)';
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed'))
    return `${context}: could not reach Supabase (offline or wrong VITE_SUPABASE_URL)`;
  if (lower.includes('invalid api key') || lower.includes('no api key'))
    return 'Supabase rejected the anon key (check VITE_SUPABASE_ANON_KEY)';
  if (code === '42501' || lower.includes('row-level security'))
    return `${context}: blocked by row-level security (did the migration run?)`;
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || lower.includes('does not exist'))
    return `${context}: database tables missing (run supabase/migrations/0001_lifequest_init.sql)`;
  if (code === '23503') return `${context}: a linked record is missing (${message})`;
  if (code === '23514') return `${context}: data rejected by a database check (${message})`;
  return `${context}: ${message}`;
}

type Result = { data: unknown; error: unknown };

/** Await a Supabase query with a timeout; throw a readable CloudError on failure. */
async function run<T>(context: string, query: PromiseLike<Result>): Promise<T> {
  let res: Result;
  try {
    res = await withTimeout(query, context);
  } catch (e) {
    throw new CloudError(describe(e, context));
  }
  if (res.error) throw new CloudError(describe(res.error, context));
  return res.data as T;
}

// ---------- row shapes (only the columns we read back) ----------

interface FamilyRow {
  id: string;
  name: string;
}
interface MemberRow {
  id: string;
  character_config: { gameId?: unknown } | null;
}
interface TemplateRow {
  id: string;
  slug: string;
}
interface AssignedRow {
  id: string;
  state: { gameAssignmentId?: unknown } | null;
  assigned_at: string | null;
  completed_at: string | null;
}
interface SaveRow {
  save: GameState | null;
}

// ---------- adapter ----------

export class SupabaseRepository implements GameRepository {
  kind = 'supabase' as const;
  /** Serialises cloud syncs so two quick saves can't create two families. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private local: LocalRepository) {}

  hasSave() {
    return this.local.hasSave();
  }

  async load(): Promise<GameState | null> {
    const sb = getSupabase();
    const familyId = getKey(FAMILY_KEY);
    if (!sb || !familyId) return this.local.load();
    // Local is newer than the cloud (last sync failed): don't roll back progress.
    if (getKey(PENDING_KEY) && this.local.hasSave()) return this.local.load();
    try {
      const { data, error } = await withTimeout(sb.auth.getSession(), 'Session');
      if (error || !data.session) return this.local.load();
      const row = await run<SaveRow | null>(
        'Cloud load',
        sb.from('game_saves').select('save').eq('family_id', familyId).maybeSingle(),
      );
      const save = row?.save;
      if (save && typeof save === 'object' && save.version === 1) return save;
      return this.local.load();
    } catch (e) {
      console.warn('[LifeQuest] Cloud load failed, using local save.', e);
      return this.local.load();
    }
  }

  async save(state: GameState): Promise<SaveResult> {
    const localRes = await this.local.save(state);
    const sb = getSupabase();
    if (!sb) return localRes;

    const next = this.chain.then(() => this.syncCloud(sb, state));
    this.chain = next.catch(() => undefined);
    let cloud: SaveResult;
    try {
      cloud = await next;
    } catch (e) {
      cloud = { ok: false, error: describe(e, 'Cloud save') };
    }
    if (!cloud.ok && !localRes.ok) return { ok: false, error: `${cloud.error}; local save also failed (${localRes.error})` };
    return cloud;
  }

  clear() {
    this.local.clear();
    setKey(FAMILY_KEY, null);
    setKey(PENDING_KEY, null);
  }

  // ---------- cloud sync steps ----------

  private async syncCloud(sb: SupabaseClient, state: GameState): Promise<SaveResult> {
    setKey(PENDING_KEY, '1');
    try {
      const user = await this.ensureUser(sb);
      const familyId = await this.ensureFamily(sb, user, state);

      // Full snapshot first: it is what load() restores from.
      await run(
        'Cloud save',
        sb.from('game_saves').upsert(
          { family_id: familyId, save: state, client_version: state.version },
          { onConflict: 'family_id' },
        ),
      );

      const memberIds = await this.syncMembers(sb, user, familyId, state.profile.members);

      const player = state.profile.members.find((m) => m.role === 'player');
      const playerRowId = player ? memberIds.get(player.id) : undefined;
      if (playerRowId) {
        await run(
          'Player stats',
          sb.from('player_stats').upsert(
            {
              family_member_id: playerRowId,
              experience: finite(state.stats.xp) ? Math.max(0, Math.floor(state.stats.xp)) : 0,
              skill_levels: state.stats.skills ?? {},
              money_balance: money(state.wallet.balance),
            },
            { onConflict: 'family_member_id' },
          ),
        );
        await run(
          'Player inventory',
          sb.from('player_inventory').upsert(
            { family_member_id: playerRowId, items: state.inventory.items ?? {} },
            { onConflict: 'family_member_id' },
          ),
        );
      }

      await this.syncAssignments(sb, familyId, state.assignments ?? [], memberIds);

      setKey(PENDING_KEY, null);
      return { ok: true, where: 'cloud' };
    } catch (e) {
      return { ok: false, error: describe(e, 'Cloud save') };
    }
  }

  private async ensureUser(sb: SupabaseClient): Promise<User> {
    let session;
    try {
      session = await withTimeout(sb.auth.getSession(), 'Sign-in');
    } catch (e) {
      throw new CloudError(describe(e, 'Sign-in'));
    }
    if (session.error) throw new CloudError(describe(session.error, 'Sign-in'));
    if (session.data.session?.user) return session.data.session.user;

    // Requires "Allow anonymous sign-ins" in the Supabase dashboard.
    let signIn;
    try {
      signIn = await withTimeout(sb.auth.signInAnonymously(), 'Sign-in');
    } catch (e) {
      throw new CloudError(describe(e, 'Sign-in'));
    }
    if (signIn.error) throw new CloudError(describe(signIn.error, 'Sign-in'));
    if (!signIn.data.user) throw new CloudError('Sign-in: Supabase returned no user');
    return signIn.data.user;
  }

  private async ensureFamily(sb: SupabaseClient, user: User, state: GameState): Promise<string> {
    const name = text(state.profile.familyName, 'My family', 80);
    const cached = getKey(FAMILY_KEY);
    if (cached) {
      const row = await run<FamilyRow | null>(
        'Family lookup',
        sb.from('families').select('id, name').eq('id', cached).maybeSingle(),
      );
      if (row) {
        if (row.name !== name) await run('Family rename', sb.from('families').update({ name }).eq('id', row.id));
        return row.id;
      }
      // Not visible to this user (e.g. the anonymous session was lost): start a new family.
      setKey(FAMILY_KEY, null);
    }

    // The auth trigger normally creates the profile; this covers users created
    // before the migration ran. ON CONFLICT DO NOTHING.
    await run('Profile', sb.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true }));

    const created = await run<FamilyRow>(
      'Create family',
      sb.from('families').insert({ name, created_by: user.id }).select('id, name').single(),
    );
    setKey(FAMILY_KEY, created.id);
    return created.id;
  }

  /** Upserts members, matched on character_config.gameId. Returns gameId -> row id. */
  private async syncMembers(
    sb: SupabaseClient,
    user: User,
    familyId: string,
    members: FamilyMember[],
  ): Promise<Map<string, string>> {
    const existing = await run<MemberRow[]>(
      'Family members lookup',
      sb.from('family_members').select('id, character_config').eq('family_id', familyId),
    );
    const byGameId = new Map<string, string>();
    for (const r of existing ?? []) {
      const gid = r.character_config?.gameId;
      if (typeof gid === 'string' && !byGameId.has(gid)) byGameId.set(gid, r.id);
    }

    const ids = new Map<string, string>();
    // the optional teen partner is not a household member (and not a valid family_members role)
    const rows = members.filter((m) => m.role !== 'partner').map((m) => {
      const id = byGameId.get(m.id) ?? newId();
      ids.set(m.id, id);
      return {
        id,
        family_id: familyId,
        // the signed-in account plays as the player character
        profile_id: m.role === 'player' ? user.id : null,
        display_name: text(m.name, 'Family member', 80),
        role: m.role,
        character_config: { gameId: m.id, appearance: m.appearance },
        trust: finite(m.trust) ? Math.min(100, Math.max(0, Math.round(m.trust))) : 50,
      };
    });
    if (rows.length) await run('Family members', sb.from('family_members').upsert(rows, { onConflict: 'id' }));
    return ids;
  }

  /** Upserts assignments whose mission id matches a seeded template slug. */
  private async syncAssignments(
    sb: SupabaseClient,
    familyId: string,
    assignments: Assignment[],
    memberIds: Map<string, string>,
  ): Promise<void> {
    if (!assignments.length) return;
    const slugs = [...new Set(assignments.map((a) => a.missionId))];
    const templates = await run<TemplateRow[]>(
      'Mission templates lookup',
      sb.from('mission_templates').select('id, slug').in('slug', slugs),
    );
    const templateIds = new Map((templates ?? []).map((t) => [t.slug, t.id] as const));
    if (!templateIds.size) return; // seed.sql not run yet: snapshot still holds them

    const existing = await run<AssignedRow[]>(
      'Assigned missions lookup',
      sb.from('assigned_missions').select('id, state, assigned_at, completed_at').eq('family_id', familyId),
    );
    const byGameId = new Map<string, AssignedRow>();
    for (const r of existing ?? []) {
      const gid = r.state?.gameAssignmentId;
      if (typeof gid === 'string' && !byGameId.has(gid)) byGameId.set(gid, r);
    }

    const now = new Date().toISOString();
    const rows = [];
    for (const a of assignments) {
      const templateId = templateIds.get(a.missionId);
      const assignedTo = memberIds.get(a.assignedTo);
      if (!templateId || !assignedTo) continue;
      const prev = byGameId.get(a.id);
      const finished = FINISHED.includes(a.status);
      rows.push({
        id: prev?.id ?? newId(),
        family_id: familyId,
        assigned_to_member_id: assignedTo,
        assigned_by_member_id: memberIds.get(a.assignedBy) ?? null,
        template_id: templateId,
        status: a.status,
        deadline_minutes: finite(a.deadlineMinutes) && a.deadlineMinutes > 0 ? Math.round(a.deadlineMinutes) : null,
        budget: finite(a.budget) && a.budget >= 0 ? money(a.budget) : null,
        note: a.note ? a.note.slice(0, 500) : null,
        state: { gameAssignmentId: a.id, createdAt: a.createdAt, resultId: a.resultId ?? null },
        assigned_at: prev?.assigned_at ?? now,
        completed_at: finished ? (prev?.completed_at ?? now) : null,
      });
    }
    if (rows.length) await run('Assigned missions', sb.from('assigned_missions').upsert(rows, { onConflict: 'id' }));
  }
}
