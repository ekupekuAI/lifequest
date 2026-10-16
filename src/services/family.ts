// Family multiplayer service — CONTRACT. Implemented against Supabase
// (supabase/migrations/0003_family_multiplayer.sql). UI and game code depend only on this file.
//
// Model: a family has two join codes. The FAMILY code lets children join; the
// PARENT code lets other parents/guardians join (so a child can't claim "parent").
// No passwords: each device signs in anonymously and claims one family member.
//
// Notes for callers:
// - Every async function throws a readable Error when Supabase isn't configured,
//   the device is offline, or the server refuses — except pushStatus (never throws).
// - Without a family session the fetch functions resolve to null / [].
// - fetchMessages returns messages oldest → newest (chat order).
// - Seats are tied to this device's anonymous Supabase session. If the browser's
//   site data is wiped, a parent must free the seat (releaseSeat) before it can be re-claimed.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Appearance, Assignment, CustomMissionSpec, GameState, LocationId, MissionStatus, Profile, Reward, Role, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { REGIONS, type RegionId } from '../domain/region';
import { getSupabase } from './supabaseClient';

export type SeatKind = 'parent' | 'child';

export interface FamilySession {
  familyId: string;
  familyName: string;
  /** family_members.id (uuid) of the member this device plays as */
  memberId: string;
  /** game-side member id, e.g. 'player', 'mother-0', 'child-2' */
  gameMemberId: string;
  role: Role;
  displayName: string;
  kind: SeatKind;
  familyCode: string;
  /** only known to parents */
  parentCode?: string;
}

export interface FamilySeat {
  memberId: string;
  gameMemberId: string;
  name: string;
  role: Role;
  kind: SeatKind;
  /** another device already plays this seat */
  claimed: boolean;
  /** the character's look from the family profile (for portraits) */
  appearance?: Appearance;
}

export interface FamilyPreview {
  familyName: string;
  /** which kind of seats this code can join */
  kind: SeatKind;
  seats: FamilySeat[];
  regionFlag?: string;
}

/** What a child's game publishes for the parent dashboard (small, throttled). */
export interface LiveStatus {
  gameMemberId: string;
  name: string;
  updatedAt: string; // ISO
  online: boolean;
  location: LocationId;
  clock: { day: number; minutes: number };
  wallet: number;
  currency: string; // e.g. '₹'
  energy: number;
  mission: null | {
    id: string;
    title: string;
    icon: string;
    objectivesDone: number;
    objectivesTotal: number;
    nextObjective: string | null;
    timeLeft: number | null;
    budget: number | null;
    spent: number;
  };
  lastResult: null | { title: string; outcome: string; overall: number; day: number; feedback: string };
  reflections: { day: number; mood: string; wentWell: string; improve: string }[];
  skills: Record<string, number>;
  xp: number;
}

export interface FamilyMessage {
  id: string;
  fromGameMemberId: string;
  fromName: string;
  toGameMemberId: string | null; // null = whole family
  text: string;
  createdAt: string;
  /** voice message: storage path in the private `family-voice` bucket (play via voiceUrl) */
  audioPath?: string;
  durationMs?: number;
}

export interface FamilyHandlers {
  onStatus?(s: LiveStatus): void;
  onAssignment?(a: Assignment & { toGameMemberId: string }): void;
  onMessage?(m: FamilyMessage): void;
  onSeats?(seats: FamilySeat[]): void;
}

// =============================================================================
// Pure helpers (no network) — exported for tests and UI input handling
// =============================================================================

/** Unambiguous code alphabet: no 0/O/1/I/L. Must match the SQL migration. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Family-code words (64 = 6 bits). Must match lq_new_family_code() in the migration. */
export const CODE_WORDS: readonly string[] = [
  'SUNNY', 'HAPPY', 'BRAVE', 'CLEVER', 'MANGO', 'TIGER', 'PANDA', 'RIVER',
  'MAPLE', 'CORAL', 'EMBER', 'FROST', 'HONEY', 'JOLLY', 'KOALA', 'LEMON',
  'MAGIC', 'NOBLE', 'OCEAN', 'PEARL', 'QUICK', 'ROBIN', 'STORM', 'TULIP',
  'UNITY', 'VIVID', 'WHALE', 'ZEBRA', 'AMBER', 'BERRY', 'CEDAR', 'DAISY',
  'EAGLE', 'FABLE', 'GRAPE', 'HAZEL', 'IVORY', 'JADE', 'KITE', 'LOTUS',
  'MELON', 'NOVA', 'OLIVE', 'PIXEL', 'QUILT', 'RAVEN', 'SPARK', 'THYME',
  'URBAN', 'VELVET', 'WILLOW', 'YONDER', 'ZESTY', 'ACORN', 'BLOOM', 'COMET',
  'DREAM', 'FLAME', 'GLOW', 'HAVEN', 'ISLAND', 'JUMBO', 'KARMA', 'LUCKY',
];

const RAND_CLASS = `[${CODE_ALPHABET}]`;
const FAMILY_RE = new RegExp(`^([A-Z]{4,6})(${RAND_CLASS}{8})$`);
const PARENT_RE = new RegExp(`^P(${RAND_CLASS}{10})$`);

/** Upper-case and drop everything except A–Z / 0–9 (spaces, dashes, dots…). */
export function normalizeCode(code: string): string {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Which kind of seat a code can join, judged by its shape only. null = not a valid code. */
export function codeKind(code: string): SeatKind | null {
  const n = normalizeCode(code);
  if (PARENT_RE.test(n)) return 'parent';
  if (FAMILY_RE.test(n)) return 'child';
  return null;
}

/** Pretty-print a code as typed by a user: SUNNY-7KD2-Q9XM / P-7KD2Q-9XMRT. Unknown shapes are returned normalised. */
export function formatCode(code: string): string {
  const n = normalizeCode(code);
  const p = PARENT_RE.exec(n);
  if (p) return `P-${p[1].slice(0, 5)}-${p[1].slice(5)}`;
  const f = FAMILY_RE.exec(n);
  if (f) return `${f[1]}-${f[2].slice(0, 4)}-${f[2].slice(4)}`;
  return n;
}

type RandomBytes = (n: number) => Uint8Array;

function cryptoBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) throw new Error('Secure random numbers are not available');
  c.getRandomValues(out);
  return out;
}

/** n characters from CODE_ALPHABET, unbiased (rejection sampling). */
export function randomCodeChars(n: number, rand: RandomBytes = cryptoBytes): string {
  let s = '';
  while (s.length < n) {
    for (const b of rand(Math.max(4, n * 2))) {
      if (b >= 248) continue; // 248 = 31 * 8
      s += CODE_ALPHABET[b % 31];
      if (s.length >= n) break;
    }
  }
  return s;
}

/** Client mirror of the server generator (codes are created server-side; used for tests/previews). */
export function generateFamilyCode(rand: RandomBytes = cryptoBytes): string {
  const word = CODE_WORDS[rand(1)[0] % CODE_WORDS.length];
  return `${word}-${randomCodeChars(4, rand)}-${randomCodeChars(4, rand)}`;
}
export function generateParentCode(rand: RandomBytes = cryptoBytes): string {
  return `P-${randomCodeChars(5, rand)}-${randomCodeChars(5, rand)}`;
}

/** Bits of entropy of each generated code kind (documentation / tests). */
export const CODE_ENTROPY_BITS = {
  family: Math.log2(CODE_WORDS.length) + 8 * Math.log2(CODE_ALPHABET.length),
  parent: 10 * Math.log2(CODE_ALPHABET.length),
};

/** A status older than this is shown as offline even if the device said "online". */
export const STATUS_STALE_MS = 45_000;

// Record<LocationId, …> so a new location is a compile error here until added
const LOCATION_IDS: Record<LocationId, true> = { home: true, town: true, grocery: true, clinic: true, city: true, library: true };
const LOCATIONS = new Set<string>(Object.keys(LOCATION_IDS));

function str(v: unknown, fallback: string, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Turn untrusted status JSON (from the DB or about to be pushed) into a safe,
 * bounded LiveStatus. `meta` (seat identity / row timestamp) wins over the payload.
 * Pass `now` to mark stale statuses offline.
 */
export function shapeStatus(
  raw: unknown,
  meta: { gameMemberId?: string; name?: string; updatedAt?: string } = {},
  now?: number,
): LiveStatus {
  const r = obj(raw) ?? {};
  const clock = obj(r.clock) ?? {};
  const m = obj(r.mission);
  const lr = obj(r.lastResult);
  const updatedAt = meta.updatedAt ?? str(r.updatedAt, new Date(0).toISOString(), 40);
  const loc = str(r.location, 'home', 24);
  let online = r.online === true;
  if (online && now !== undefined) {
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t) || now - t > STATUS_STALE_MS) online = false;
  }
  const skills: Record<string, number> = {};
  const rawSkills = obj(r.skills);
  if (rawSkills) {
    for (const [k, v] of Object.entries(rawSkills).slice(0, 24)) {
      if (typeof v === 'number' && Number.isFinite(v)) skills[k.slice(0, 32)] = v;
    }
  }
  const reflections = Array.isArray(r.reflections)
    ? r.reflections
        .slice(0, 10)
        .flatMap((x) => {
          const o = obj(x);
          return o
            ? [{ day: num(o.day), mood: str(o.mood, '', 24), wentWell: str(o.wentWell, '', 280), improve: str(o.improve, '', 280) }]
            : [];
        })
        .slice(0, 3)
    : [];
  return {
    gameMemberId: meta.gameMemberId ?? str(r.gameMemberId, '', 64),
    name: meta.name ?? str(r.name, '', 80),
    updatedAt,
    online,
    location: (LOCATIONS.has(loc) ? loc : 'home') as LocationId,
    clock: { day: Math.max(1, Math.floor(num(clock.day, 1))), minutes: Math.max(0, Math.floor(num(clock.minutes))) },
    wallet: Math.round(num(r.wallet) * 100) / 100,
    currency: str(r.currency, '', 4),
    energy: Math.max(0, Math.min(100, Math.round(num(r.energy, 100)))),
    mission: m
      ? {
          id: str(m.id, '', 64),
          title: str(m.title, '', 120),
          icon: str(m.icon, '', 16),
          objectivesDone: Math.max(0, Math.floor(num(m.objectivesDone))),
          objectivesTotal: Math.max(0, Math.floor(num(m.objectivesTotal))),
          nextObjective: typeof m.nextObjective === 'string' ? m.nextObjective.slice(0, 160) : null,
          timeLeft: numOrNull(m.timeLeft),
          budget: numOrNull(m.budget),
          spent: num(m.spent),
        }
      : null,
    lastResult: lr
      ? {
          title: str(lr.title, '', 120),
          outcome: str(lr.outcome, '', 24),
          overall: num(lr.overall),
          day: num(lr.day),
          feedback: str(lr.feedback, '', 280),
        }
      : null,
    reflections,
    skills,
    xp: Math.max(0, Math.floor(num(r.xp))),
  };
}

// =============================================================================
// Session storage
// =============================================================================

const SESSION_KEY = 'lifequest.family.v1';
const TIMEOUT_MS = 12_000;
const KINDS: SeatKind[] = ['parent', 'child'];

let sessionCache: FamilySession | null | undefined;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isSession(v: unknown): v is FamilySession {
  const o = obj(v);
  return (
    !!o &&
    typeof o.familyId === 'string' &&
    typeof o.memberId === 'string' &&
    typeof o.gameMemberId === 'string' &&
    typeof o.familyCode === 'string' &&
    KINDS.includes(o.kind as SeatKind)
  );
}

function writeSession(s: FamilySession | null) {
  sessionCache = s;
  try {
    const st = storage();
    if (!st) return;
    if (s) st.setItem(SESSION_KEY, JSON.stringify({ v: 1, session: s }));
    else st.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

/** true when Supabase is configured (multiplayer possible). */
export function multiplayerAvailable(): boolean {
  return getSupabase() !== null;
}

/** The family session stored on this device, if any. */
export function currentSession(): FamilySession | null {
  if (sessionCache !== undefined) return sessionCache;
  sessionCache = null;
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (raw) {
      const parsed = obj(JSON.parse(raw));
      if (parsed && isSession(parsed.session)) sessionCache = parsed.session;
    }
  } catch {
    sessionCache = null;
  }
  return sessionCache;
}

// =============================================================================
// Supabase plumbing
// =============================================================================

class FamilyError extends Error {}

function client(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new FamilyError('Family play needs an online connection to the LifeQuest server (Supabase is not configured on this build).');
  return sb;
}

function requireSession(kind?: SeatKind): FamilySession {
  const s = currentSession();
  if (!s) throw new FamilyError('This device has not joined a family yet.');
  if (kind && s.kind !== kind) throw new FamilyError(kind === 'parent' ? 'Only a parent can do that.' : 'Only a child seat can do that.');
  return s;
}

function withTimeout<T>(p: PromiseLike<T>, context: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FamilyError(`${context}: network problem — the server did not respond in time. Are you offline?`)), TIMEOUT_MS);
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

function describe(err: unknown, context: string): string {
  if (err instanceof FamilyError) return err.message;
  const e = (obj(err) ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : String(err);
  const lower = message.toLowerCase();
  if (code === 'anonymous_provider_disabled' || lower.includes('anonymous sign-ins are disabled'))
    return 'Anonymous sign-ins are disabled in the Supabase project (Authentication → Providers → Anonymous).';
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed') || lower.includes('fetch failed'))
    return `${context}: network problem — could not reach the server. Are you offline?`;
  if (lower.includes('invalid api key') || lower.includes('no api key')) return 'The server rejected this app\'s key (check VITE_SUPABASE_ANON_KEY).';
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883')
    return `${context}: family play isn't set up on the server yet (run supabase/migrations/0003_family_multiplayer.sql).`;
  if (lower.includes('row-level security') || lower.includes('permission denied'))
    return `${context}: not allowed for this family seat.`;
  // messages raised by our RPCs are written for players — show them as-is
  if (code === 'P0001' || code === '42501' || code === '22023') return message;
  if (code === '23514') return `${context}: the server rejected the data (${message}).`;
  return `${context}: ${message}`;
}

type Result = { data: unknown; error: unknown };

async function run<T>(context: string, query: PromiseLike<Result>): Promise<T> {
  let res: Result;
  try {
    res = await withTimeout(query, context);
  } catch (e) {
    throw new FamilyError(describe(e, context));
  }
  if (res.error) throw new FamilyError(describe(res.error, context));
  return res.data as T;
}

let authPromise: Promise<string> | null = null;

/** Reuse this device's anonymous session, or create one. Returns the auth uid. */
async function ensureAuth(sb: SupabaseClient): Promise<string> {
  if (!authPromise) {
    authPromise = (async () => {
      let got;
      try {
        got = await withTimeout(sb.auth.getSession(), 'Sign-in');
      } catch (e) {
        throw new FamilyError(describe(e, 'Sign-in'));
      }
      if (got.error) throw new FamilyError(describe(got.error, 'Sign-in'));
      let token = got.data.session?.access_token;
      let uid = got.data.session?.user?.id;
      if (!uid) {
        let res;
        try {
          res = await withTimeout(sb.auth.signInAnonymously(), 'Sign-in');
        } catch (e) {
          throw new FamilyError(describe(e, 'Sign-in'));
        }
        if (res.error) throw new FamilyError(describe(res.error, 'Sign-in'));
        uid = res.data.user?.id;
        token = res.data.session?.access_token;
        if (!uid) throw new FamilyError('Sign-in: the server returned no user');
      }
      try {
        if (token) await sb.realtime.setAuth(token);
      } catch {
        /* realtime picks the token up on its own as well */
      }
      return uid;
    })();
    authPromise.catch(() => {
      authPromise = null; // retry next time (e.g. came back online)
    });
  }
  return authPromise;
}

// ---------- seats cache (member uuid <-> game member id) ----------

interface MemberRow {
  id: string;
  display_name: string;
  role: Role;
  kind: SeatKind | null;
  game_member_id: string | null;
  claimed_by: string | null;
  character_config: { gameId?: unknown; appearance?: unknown } | null;
}

interface SeatInfo extends FamilySeat {
  playable: boolean;
}

let seatCache: { familyId: string; byId: Map<string, SeatInfo>; byGame: Map<string, SeatInfo> } | null = null;

function rowToSeat(r: MemberRow): SeatInfo {
  const gid = r.game_member_id ?? (typeof r.character_config?.gameId === 'string' ? r.character_config.gameId : r.id);
  const seat: SeatInfo = {
    memberId: r.id,
    gameMemberId: gid,
    name: r.display_name,
    role: r.role,
    kind: r.kind ?? 'child',
    claimed: r.claimed_by !== null,
    playable: r.kind !== null,
  };
  const look = obj(r.character_config?.appearance);
  if (look && Object.keys(look).length) seat.appearance = look as unknown as Appearance;
  return seat;
}

async function loadSeats(sb: SupabaseClient, familyId: string): Promise<NonNullable<typeof seatCache>> {
  const rows = await run<MemberRow[]>(
    'Family members',
    sb
      .from('family_members')
      .select('id, display_name, role, kind, game_member_id, claimed_by, character_config')
      .eq('family_id', familyId)
      .order('created_at'),
  );
  const byId = new Map<string, SeatInfo>();
  const byGame = new Map<string, SeatInfo>();
  for (const r of rows ?? []) {
    const seat = rowToSeat(r);
    byId.set(seat.memberId, seat);
    if (!byGame.has(seat.gameMemberId)) byGame.set(seat.gameMemberId, seat);
  }
  seatCache = { familyId, byId, byGame };
  return seatCache;
}

async function seats(sb: SupabaseClient, familyId: string, needId?: string, needGame?: string) {
  const c = seatCache?.familyId === familyId ? seatCache : null;
  if (c && (!needId || c.byId.has(needId)) && (!needGame || c.byGame.has(needGame))) return c;
  return loadSeats(sb, familyId);
}

function publicSeats(c: NonNullable<typeof seatCache>): FamilySeat[] {
  return [...c.byId.values()].filter((s) => s.playable).map(({ playable: _p, ...s }) => s);
}

// ---------- row mapping ----------

interface SessionJson {
  family_id: string;
  family_name: string;
  member_id: string;
  game_member_id: string | null;
  role: Role;
  display_name: string;
  kind: SeatKind;
  family_code: string;
  parent_code: string | null;
}

function toSession(j: SessionJson): FamilySession {
  const s: FamilySession = {
    familyId: j.family_id,
    familyName: j.family_name,
    memberId: j.member_id,
    gameMemberId: j.game_member_id ?? j.member_id,
    role: j.role,
    displayName: j.display_name,
    kind: j.kind,
    familyCode: j.family_code,
  };
  if (j.kind === 'parent' && j.parent_code) s.parentCode = j.parent_code;
  return s;
}

interface AssignmentRow {
  id: string;
  assigned_to_member_id: string;
  assigned_by_member_id: string | null;
  mission_id: string | null;
  game_assignment_id: string | null;
  status: MissionStatus;
  deadline_minutes: number | null;
  budget: number | string | null;
  note: string | null;
  state: { createdAt?: unknown; resultId?: unknown; assignedBy?: unknown; missionId?: unknown; custom?: unknown } | null;
  result_id: string | null;
  assigned_at: string | null;
  mission_templates?: { slug?: string } | null;
}

const ASSIGNMENT_COLS =
  'id, assigned_to_member_id, assigned_by_member_id, mission_id, game_assignment_id, status, deadline_minutes, budget, note, state, result_id, assigned_at';

function toAssignment(r: AssignmentRow, c: NonNullable<typeof seatCache>): (Assignment & { toGameMemberId: string }) | null {
  const missionId =
    r.mission_id ?? r.mission_templates?.slug ?? (typeof r.state?.missionId === 'string' ? r.state.missionId : null);
  if (!missionId) return null;
  const to = c.byId.get(r.assigned_to_member_id)?.gameMemberId ?? r.assigned_to_member_id;
  const by =
    (r.assigned_by_member_id ? c.byId.get(r.assigned_by_member_id)?.gameMemberId : undefined) ??
    (typeof r.state?.assignedBy === 'string' ? r.state.assignedBy : 'mother-0');
  const created = typeof r.state?.createdAt === 'number' ? r.state.createdAt : Date.parse(r.assigned_at ?? '') || Date.now();
  const budget = r.budget === null || r.budget === undefined ? null : Number(r.budget);
  const a: Assignment & { toGameMemberId: string } = {
    id: r.game_assignment_id ?? r.id,
    missionId,
    assignedTo: to,
    assignedBy: by,
    budget: budget !== null && Number.isFinite(budget) ? budget : null,
    deadlineMinutes: r.deadline_minutes ?? null,
    status: r.status,
    createdAt: created,
    toGameMemberId: to,
  };
  if (r.note) a.note = r.note;
  const custom = customSpecOf(r.state?.custom);
  if (custom) a.custom = custom;
  const resultId = r.result_id ?? (typeof r.state?.resultId === 'string' ? r.state.resultId : null);
  if (resultId) a.resultId = resultId;
  return a;
}

/** Bounded copy of a parent's custom shopping list (full cleanup happens in missions/custom.ts). */
function customSpecOf(v: unknown): CustomMissionSpec | null {
  const o = obj(v);
  if (!o || !Array.isArray(o.items)) return null;
  const items = o.items.slice(0, 10).flatMap((x) => {
    const it = obj(x);
    if (!it || typeof it.name !== 'string' || !it.name.trim()) return [];
    const row: CustomMissionSpec['items'][number] = { name: it.name.slice(0, 32), qty: Math.max(1, Math.min(20, Math.round(Number(it.qty) || 1))) };
    if (typeof it.itemId === 'string' && /^[a-z0-9-]{1,40}$/.test(it.itemId)) row.itemId = it.itemId;
    if (typeof it.price === 'number' && Number.isFinite(it.price) && it.price > 0) row.price = Math.min(5000, it.price);
    return [row];
  });
  if (!items.length) return null;
  const store = o.store === 'kiosk' || o.store === 'market' ? o.store : 'grocery';
  const budget = Number(o.budget);
  const deadline = Number(o.deadlineMinutes);
  return {
    title: typeof o.title === 'string' ? o.title.slice(0, 60) : 'Family shopping list',
    items,
    store,
    budget: Number.isFinite(budget) && budget >= 0 ? budget : 0,
    deadlineMinutes: Number.isFinite(deadline) && deadline > 0 ? Math.min(480, Math.round(deadline)) : 90,
    note: typeof o.note === 'string' ? o.note.slice(0, 200) : '',
  };
}

interface MessageRow {
  id: string;
  from_member_id: string;
  to_member_id: string | null;
  text: string;
  created_at: string;
  audio_path?: string | null;
  duration_ms?: number | null;
}

function toMessage(r: MessageRow, c: NonNullable<typeof seatCache>): FamilyMessage {
  const from = c.byId.get(r.from_member_id);
  const m: FamilyMessage = {
    id: r.id,
    fromGameMemberId: from?.gameMemberId ?? r.from_member_id,
    fromName: from?.name ?? 'Family',
    toGameMemberId: r.to_member_id ? (c.byId.get(r.to_member_id)?.gameMemberId ?? r.to_member_id) : null,
    text: r.text,
    createdAt: r.created_at,
  };
  if (r.audio_path) {
    m.audioPath = r.audio_path;
    m.durationMs = r.duration_ms ?? 0;
  }
  return m;
}

interface StatusRow {
  member_id: string;
  status: unknown;
  updated_at: string;
}

// =============================================================================
// Public API
// =============================================================================

/** Create a family as a parent/guardian. `profile` is the family set up in FamilySetup. */
export async function createFamily(input: {
  familyName: string;
  profile: Profile;
  settings: Settings;
  /** game member id of the creating parent, e.g. 'mother-0' */
  asGameMemberId: string;
}): Promise<FamilySession> {
  const sb = client();
  await ensureAuth(sb);
  const res = await run<{ session: SessionJson } | null>(
    'Create family',
    sb.rpc('create_family', {
      p_name: (input.familyName || input.profile.familyName || 'My family').trim().slice(0, 80),
      p_profile: input.profile,
      p_settings: input.settings,
      p_parent_game_member_id: input.asGameMemberId,
    }),
  );
  if (!res?.session) throw new FamilyError('Create family: the server returned no family');
  const session = toSession(res.session);
  seatCache = null;
  writeSession(session);
  return session;
}

/** Look up a code (family or parent) without joining. null = no such code. */
export async function previewCode(code: string): Promise<FamilyPreview | null> {
  if (!codeKind(code)) return null; // not a code shape: don't spend a rate-limited lookup
  const sb = client();
  await ensureAuth(sb);
  const res = await run<{
    family_name: string;
    kind: SeatKind;
    region: string | null;
    seats: { member_id: string; game_member_id: string | null; name: string; role: Role; kind: SeatKind; claimed: boolean; appearance?: unknown }[];
  } | null>('Check code', sb.rpc('preview_code', { p_code: normalizeCode(code) }));
  if (!res) return null;
  const preview: FamilyPreview = {
    familyName: res.family_name,
    kind: res.kind,
    seats: (res.seats ?? []).map((s) => {
      const seat: FamilySeat = {
        memberId: s.member_id,
        gameMemberId: s.game_member_id ?? s.member_id,
        name: s.name,
        role: s.role,
        kind: s.kind,
        claimed: !!s.claimed,
      };
      const look = obj(s.appearance);
      if (look && Object.keys(look).length) seat.appearance = look as unknown as Appearance;
      return seat;
    }),
  };
  const flag = res.region && res.region in REGIONS ? REGIONS[res.region as RegionId].flag : undefined;
  if (flag) preview.regionFlag = flag;
  return preview;
}

/** Join with a code and claim a seat. `newChildName` adds a new child seat instead of claiming one. */
export async function joinFamily(code: string, seat: { memberId?: string; newChildName?: string }): Promise<FamilySession> {
  if (!codeKind(code)) throw new FamilyError('That is an invalid code. Check it and try again.');
  const name = seat.newChildName?.trim();
  if (!seat.memberId && !name) throw new FamilyError('Pick who you are, or enter your name.');
  const sb = client();
  await ensureAuth(sb);
  const res = await run<SessionJson | null>(
    'Join family',
    sb.rpc('join_family', {
      p_code: normalizeCode(code),
      p_member_id: seat.memberId ?? null,
      p_new_child_name: seat.memberId ? null : (name ?? null),
    }),
  );
  if (!res) throw new FamilyError("That is an invalid code — it doesn't match any family. Check it and try again.");
  const session = toSession(res);
  seatCache = null;
  writeSession(session);
  return session;
}

/** The shared family profile + settings (for a child device starting its game). */
export async function fetchFamilyProfile(): Promise<{ profile: Profile; settings: Settings } | null> {
  const s = currentSession();
  if (!s) return null;
  const sb = client();
  await ensureAuth(sb);
  const row = await run<{ name: string; profile: Profile | null; settings: Partial<Settings> | null } | null>(
    'Family profile',
    sb.from('families').select('name, profile, settings').eq('id', s.familyId).maybeSingle(),
  );
  if (!row?.profile || !Array.isArray(row.profile.members)) return null;
  const settings = { ...DEFAULT_SETTINGS, ...(obj(row.settings) ?? {}) } as Settings;
  return { profile: { ...row.profile, familyName: row.profile.familyName || row.name }, settings };
}

/** This member's own game save (each child has their own). */
export async function loadMemberSave(): Promise<GameState | null> {
  const s = currentSession();
  if (!s) return null;
  const sb = client();
  await ensureAuth(sb);
  const row = await run<{ save: GameState | null } | null>(
    'Load save',
    sb.from('member_saves').select('save').eq('member_id', s.memberId).maybeSingle(),
  );
  const save = row?.save;
  return save && typeof save === 'object' && save.version === 1 ? save : null;
}

export async function saveMemberSave(state: GameState): Promise<void> {
  const s = requireSession();
  const sb = client();
  await ensureAuth(sb);
  await run('Cloud save', sb.from('member_saves').upsert({ member_id: s.memberId, save: state }, { onConflict: 'member_id' }));
}

let statusInFlight: Promise<void> | null = null;
let statusQueued: LiveStatus | null = null;

/** Publish this device's live status (call throttled, ~every 10 s and on key events). Never throws. */
export async function pushStatus(status: LiveStatus): Promise<void> {
  const s = currentSession();
  const sb = getSupabase();
  if (!s || !sb) return;
  // coalesce: while one push is in flight, only the newest queued status is sent next
  if (statusInFlight) {
    statusQueued = status;
    return statusInFlight;
  }
  statusInFlight = (async () => {
    let next: LiveStatus | null = status;
    while (next) {
      const shaped = shapeStatus(next, { gameMemberId: s.gameMemberId, name: s.displayName, updatedAt: new Date().toISOString() });
      statusQueued = null;
      try {
        await ensureAuth(sb);
        await run(
          'Live status',
          sb.from('member_status').upsert({ member_id: s.memberId, family_id: s.familyId, status: shaped }, { onConflict: 'member_id' }),
        );
      } catch (e) {
        console.warn('[LifeQuest] Could not publish live status.', e instanceof Error ? e.message : e);
      }
      next = statusQueued;
    }
  })().finally(() => {
    statusInFlight = null;
  });
  return statusInFlight;
}

/** Latest status of every child in the family (parent dashboard initial load). */
export async function fetchStatuses(): Promise<LiveStatus[]> {
  const s = currentSession();
  if (!s) return [];
  const sb = client();
  await ensureAuth(sb);
  const [rows, c] = await Promise.all([
    run<StatusRow[]>('Family status', sb.from('member_status').select('member_id, status, updated_at').eq('family_id', s.familyId)),
    seats(sb, s.familyId),
  ]);
  const now = Date.now();
  const out: LiveStatus[] = [];
  for (const r of rows ?? []) {
    const seat = c.byId.get(r.member_id) ?? (await seats(sb, s.familyId, r.member_id)).byId.get(r.member_id);
    if (!seat || seat.kind === 'parent') continue;
    out.push(shapeStatus(r.status, { gameMemberId: seat.gameMemberId, name: seat.name, updatedAt: r.updated_at }, now));
  }
  return out;
}

const FINISHED: MissionStatus[] = ['completed', 'incomplete', 'cancelled'];

/** Parent → child task assignment (also delivered live to the child's device). */
export async function pushAssignment(a: Assignment, toGameMemberId: string): Promise<void> {
  const s = requireSession('parent');
  const sb = client();
  await ensureAuth(sb);
  const c = await seats(sb, s.familyId, undefined, toGameMemberId);
  const to = c.byGame.get(toGameMemberId);
  if (!to) throw new FamilyError(`Send task: ${toGameMemberId} is not in this family.`);
  const tpl = await run<{ id: string } | null>(
    'Send task',
    sb.from('mission_templates').select('id').eq('slug', a.missionId).maybeSingle(),
  );
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  await run(
    'Send task',
    sb.from('assigned_missions').upsert(
      {
        family_id: s.familyId,
        assigned_to_member_id: to.memberId,
        assigned_by_member_id: s.memberId,
        template_id: tpl?.id ?? null,
        mission_id: a.missionId,
        game_assignment_id: a.id,
        status: a.status,
        deadline_minutes: finite(a.deadlineMinutes) && a.deadlineMinutes > 0 ? Math.round(a.deadlineMinutes) : null,
        budget: finite(a.budget) && a.budget >= 0 ? Math.round(a.budget * 100) / 100 : null,
        note: a.note ? a.note.slice(0, 500) : null,
        state: { gameAssignmentId: a.id, createdAt: a.createdAt, assignedBy: a.assignedBy, ...(a.custom ? { custom: customSpecOf(a.custom) } : {}) },
        result_id: a.resultId ?? null,
      },
      { onConflict: 'family_id,game_assignment_id' },
    ),
  );
}

export async function updateAssignment(id: string, patch: Partial<Pick<Assignment, 'status' | 'resultId'>>): Promise<void> {
  const s = requireSession();
  const sb = client();
  await ensureAuth(sb);
  const row: Record<string, unknown> = {};
  if (patch.status) {
    row.status = patch.status;
    row.completed_at = FINISHED.includes(patch.status) ? new Date().toISOString() : null;
  }
  if (patch.resultId !== undefined) row.result_id = patch.resultId ?? null;
  if (!Object.keys(row).length) return;
  await run(
    'Update task',
    sb.from('assigned_missions').update(row).eq('family_id', s.familyId).eq('game_assignment_id', id),
  );
}

export async function fetchAssignments(): Promise<(Assignment & { toGameMemberId: string })[]> {
  const s = currentSession();
  if (!s) return [];
  const sb = client();
  await ensureAuth(sb);
  let q = sb
    .from('assigned_missions')
    .select(`${ASSIGNMENT_COLS}, mission_templates(slug)`)
    .eq('family_id', s.familyId)
    .order('assigned_at', { ascending: false })
    .limit(200);
  if (s.kind === 'child') q = q.eq('assigned_to_member_id', s.memberId).in('status', ['assigned', 'in-progress']);
  const [rows, c] = await Promise.all([run<AssignmentRow[]>('Tasks', q), seats(sb, s.familyId)]);
  return (rows ?? []).flatMap((r) => {
    const a = toAssignment(r, c);
    return a ? [a] : [];
  });
}

/** Family messages (nudges). */
export async function sendMessage(toGameMemberId: string | null, text: string): Promise<void> {
  const s = requireSession();
  const body = (text ?? '').trim().slice(0, 280);
  if (!body) throw new FamilyError('Write a message first.');
  const sb = client();
  await ensureAuth(sb);
  let to: string | null = null;
  if (toGameMemberId) {
    const c = await seats(sb, s.familyId, undefined, toGameMemberId);
    const seat = c.byGame.get(toGameMemberId);
    if (!seat) throw new FamilyError(`Send message: ${toGameMemberId} is not in this family.`);
    to = seat.memberId;
  }
  await run(
    'Send message',
    sb.from('family_messages').insert({ family_id: s.familyId, from_member_id: s.memberId, to_member_id: to, text: body }),
  );
}

export async function fetchMessages(limit = 50): Promise<FamilyMessage[]> {
  const s = currentSession();
  if (!s) return [];
  const sb = client();
  await ensureAuth(sb);
  const n = Math.max(1, Math.min(200, Math.floor(limit) || 50));
  const [rows, c] = await Promise.all([
    run<MessageRow[]>(
      'Messages',
      sb
        .from('family_messages')
        .select('id, from_member_id, to_member_id, text, created_at, audio_path, duration_ms')
        .eq('family_id', s.familyId)
        .order('created_at', { ascending: false })
        .limit(n),
    ),
    seats(sb, s.familyId),
  ]);
  return (rows ?? []).map((r) => toMessage(r, c)).reverse();
}

const VOICE_BUCKET = 'family-voice';
const VOICE_MAX_MS = 30_000;
const VOICE_MAX_BYTES = 2 * 1024 * 1024;

function audioExt(type: string): string {
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from(cryptoBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Voice nudge (<= 30 s): uploads the clip to the family's private folder, then posts a message pointing at it. */
export async function sendVoiceMessage(toGameMemberId: string | null, blob: Blob, durationMs: number): Promise<void> {
  const s = requireSession();
  if (!blob || !blob.size) throw new FamilyError('The recording is empty.');
  if (blob.size > VOICE_MAX_BYTES) throw new FamilyError('That recording is too large (max 2 MB).');
  const ms = Math.max(0, Math.min(VOICE_MAX_MS + 1000, Math.round(Number(durationMs) || 0)));
  const sb = client();
  await ensureAuth(sb);
  let to: string | null = null;
  if (toGameMemberId) {
    const c = await seats(sb, s.familyId, undefined, toGameMemberId);
    const seat = c.byGame.get(toGameMemberId);
    if (!seat) throw new FamilyError(`Send voice message: ${toGameMemberId} is not in this family.`);
    to = seat.memberId;
  }
  const type = (blob.type || 'audio/webm').split(';')[0];
  const path = `${s.familyId}/${randomId()}.${audioExt(type)}`;
  await run('Send voice message', sb.storage.from(VOICE_BUCKET).upload(path, blob, { contentType: type, upsert: false }));
  await run(
    'Send voice message',
    sb.from('family_messages').insert({
      family_id: s.familyId,
      from_member_id: s.memberId,
      to_member_id: to,
      text: `🎤 Voice message (${Math.max(1, Math.round(ms / 1000))} s)`,
      audio_path: path,
      duration_ms: ms,
    }),
  );
}

/** A short-lived (1 h) URL to play a voice message's audio. */
export async function voiceUrl(audioPath: string): Promise<string> {
  const sb = client();
  await ensureAuth(sb);
  const res = await run<{ signedUrl: string } | null>('Play voice message', sb.storage.from(VOICE_BUCKET).createSignedUrl(audioPath, 3600));
  if (!res?.signedUrl) throw new FamilyError('Play voice message: the clip is no longer available.');
  return res.signedUrl;
}

/** Live subscription for the current family. Returns an unsubscribe function. */
export function subscribeFamily(handlers: FamilyHandlers): () => void {
  const s = currentSession();
  const sb = getSupabase();
  if (!s || !sb) return () => {};
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const safe = (fn: () => Promise<void> | void) => {
    Promise.resolve()
      .then(fn)
      .catch((e) => console.warn('[LifeQuest] Family update could not be read.', e instanceof Error ? e.message : e));
  };

  void (async () => {
    try {
      await ensureAuth(sb);
      await seats(sb, s.familyId);
    } catch (e) {
      console.warn('[LifeQuest] Live family updates unavailable.', e instanceof Error ? e.message : e);
      return;
    }
    if (stopped) return;
    const filter = `family_id=eq.${s.familyId}`;
    channel = sb
      .channel(`family:${s.familyId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_status', filter }, (p) =>
        safe(async () => {
          const r = p.new as StatusRow | undefined;
          if (!r?.member_id || !handlers.onStatus) return;
          const seat = (await seats(sb, s.familyId, r.member_id)).byId.get(r.member_id);
          if (!seat) return;
          handlers.onStatus(shapeStatus(r.status, { gameMemberId: seat.gameMemberId, name: seat.name, updatedAt: r.updated_at }, Date.now()));
        }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assigned_missions', filter }, (p) =>
        safe(async () => {
          const r = p.new as AssignmentRow | undefined;
          if (!r?.id || !handlers.onAssignment) return;
          const c = await seats(sb, s.familyId, r.assigned_to_member_id);
          const a = toAssignment(r, c);
          if (a) handlers.onAssignment(a);
        }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'family_messages', filter }, (p) =>
        safe(async () => {
          const r = p.new as MessageRow | undefined;
          if (!r?.id || !handlers.onMessage) return;
          handlers.onMessage(toMessage(r, await seats(sb, s.familyId, r.from_member_id)));
        }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members', filter }, () =>
        safe(async () => {
          const c = await loadSeats(sb, s.familyId);
          handlers.onSeats?.(publicSeats(c));
        }),
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          console.warn(`[LifeQuest] Live family channel: ${status}`, err?.message ?? '');
      });
    if (stopped) void sb.removeChannel(channel);
  })();

  return () => {
    stopped = true;
    if (channel) void sb.removeChannel(channel);
    channel = null;
  };
}

/** All playable seats of the current family (parents' "devices" list). */
export async function fetchSeats(): Promise<FamilySeat[]> {
  const s = currentSession();
  if (!s) return [];
  const sb = client();
  await ensureAuth(sb);
  return publicSeats(await loadSeats(sb, s.familyId));
}

/** Remove a device/seat (parents only) and regenerate codes. */
export async function releaseSeat(memberId: string): Promise<void> {
  requireSession('parent');
  const sb = client();
  await ensureAuth(sb);
  await run('Free seat', sb.rpc('release_seat', { p_member_id: memberId }));
  seatCache = null;
}

export async function regenerateCodes(): Promise<{ familyCode: string; parentCode: string }> {
  const s = requireSession('parent');
  const sb = client();
  await ensureAuth(sb);
  const res = await run<{ family_code: string; parent_code: string } | null>(
    'New codes',
    sb.rpc('regenerate_codes', { p_family_id: s.familyId }),
  );
  if (!res) throw new FamilyError('New codes: the server returned nothing');
  writeSession({ ...s, familyCode: res.family_code, parentCode: res.parent_code });
  return { familyCode: res.family_code, parentCode: res.parent_code };
}

/** Forget the family on this device (doesn't delete anything). */
export function leaveFamilyOnThisDevice(): void {
  writeSession(null);
  seatCache = null;
  statusQueued = null;
}

// =============================================================================
// Family rewards board — stored in families.settings.rewards (guardians may update
// settings per RLS; every member can read). No schema change.
// =============================================================================

const REWARD_GOALS = ['tasksOnTime', 'savingsAtLeast', 'kindMemories', 'skillLevel', 'reflectionStreak', 'missionCompleted'];

/** Bounded, validated copy of untrusted reward JSON. */
export function shapeRewards(raw: unknown): Reward[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).flatMap((x) => {
    const r = obj(x);
    const g = obj(r?.goal);
    if (!r || !g || typeof r.id !== 'string' || typeof r.text !== 'string' || !REWARD_GOALS.includes(String(g.type))) return [];
    const target = Number(g.target);
    if (!Number.isFinite(target) || target <= 0) return [];
    const goal = { ...g, type: g.type, target: Math.min(1_000_000, target) } as Reward['goal'];
    for (const k of ['skill', 'missionId', 'kind'] as const) if (k in g && typeof g[k] !== 'string') return [];
    const out: Reward = {
      id: r.id.slice(0, 40),
      text: r.text.slice(0, 120),
      goal,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    };
    if (typeof r.emoji === 'string') out.emoji = r.emoji.slice(0, 8);
    if (typeof r.forMember === 'string') out.forMember = r.forMember.slice(0, 64);
    if (typeof r.createdBy === 'string') out.createdBy = r.createdBy.slice(0, 64);
    if (typeof r.reachedAt === 'number') out.reachedAt = r.reachedAt;
    if (typeof r.givenAt === 'number') out.givenAt = r.givenAt;
    return [out];
  });
}

/** The family's rewards board ([] without a session). */
export async function fetchFamilyRewards(): Promise<Reward[]> {
  const s = currentSession();
  if (!s) return [];
  const sb = client();
  await ensureAuth(sb);
  const row = await run<{ settings: Record<string, unknown> | null } | null>(
    'Rewards',
    sb.from('families').select('settings').eq('id', s.familyId).maybeSingle(),
  );
  return shapeRewards(obj(row?.settings)?.rewards);
}

/** Parent only: replace the rewards board (other settings are kept). */
export async function saveFamilyRewards(rewards: Reward[]): Promise<void> {
  const s = requireSession('parent');
  const sb = client();
  await ensureAuth(sb);
  const row = await run<{ settings: Record<string, unknown> | null } | null>(
    'Save rewards',
    sb.from('families').select('settings').eq('id', s.familyId).maybeSingle(),
  );
  const settings = { ...(obj(row?.settings) ?? {}), rewards: shapeRewards(rewards) };
  await run('Save rewards', sb.from('families').update({ settings }).eq('id', s.familyId));
}

/** Parent only: a child's game save (read-only), e.g. to show rewards progress. null when not found. */
export async function fetchChildSave(gameMemberId: string): Promise<GameState | null> {
  const s = requireSession('parent');
  const sb = client();
  await ensureAuth(sb);
  const c = await seats(sb, s.familyId, undefined, gameMemberId);
  const seat = c.byGame.get(gameMemberId);
  if (!seat) return null;
  const row = await run<{ save: GameState | null } | null>(
    'Child progress',
    sb.from('member_saves').select('save').eq('member_id', seat.memberId).maybeSingle(),
  );
  const save = row?.save;
  return save && typeof save === 'object' && save.version === 1 ? save : null;
}
