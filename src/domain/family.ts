import type { Appearance, FamilyMember, Profile, Role, VoiceProfile } from './types';
import { region } from './region';

export const SKIN_TONES = ['#f6d3b3', '#e8b48a', '#c98e62', '#a86b45', '#7a4a2c', '#5a3520'];
export const HAIR_COLORS = ['#1e1a1a', '#4a2c1a', '#8a5a2b', '#d9a441', '#b8b8c0', '#c2453a'];
export const SHIRT_COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#f2c14e', '#8e5ea2', '#f28ab2', '#2b2d42', '#ffffff'];
export const PANTS_COLORS = ['#2b2d42', '#3d5a80', '#5c4033', '#6b705c', '#14213d'];

export const ROLE_LABELS: Record<Role, string> = {
  mother: 'Mother',
  father: 'Father',
  player: 'You',
  'older-sibling': 'Older sibling',
  'younger-sibling': 'Younger sibling',
  grandparent: 'Grandparent',
  guardian: 'Guardian',
  partner: 'Partner',
};

const DEFAULTS: Record<Exclude<Role, 'player'>, { name: string; appearance: Appearance }> = {
  mother: { name: 'Meera', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[0], hairStyle: 'bun', shirt: '#c0392b', pants: '#5c4033' } },
  father: { name: 'Raj', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[0], hairStyle: 'short', shirt: '#2e86ab', pants: '#2b2d42' } },
  'older-sibling': { name: 'Arjun', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[1], hairStyle: 'spiky', shirt: '#3bb273', pants: '#3d5a80' } },
  'younger-sibling': { name: 'Tara', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[1], hairStyle: 'long', shirt: '#f28ab2', pants: '#3d5a80' } },
  grandparent: { name: 'Dadi', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bun', shirt: '#8e5ea2', pants: '#6b705c' } },
  guardian: { name: 'Aunt Leela', appearance: { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'long', shirt: '#f2c14e', pants: '#14213d' } },
  partner: { name: 'Ananya', appearance: { skin: SKIN_TONES[1], hair: HAIR_COLORS[5], hairStyle: 'long', shirt: '#8e5ea2', pants: '#3d5a80' } },
};

/** Optional teen storyline: a girlfriend/boyfriend who is a classmate from across town (never in the house). */
export type PartnerChoice = 'girlfriend' | 'boyfriend' | null;

const PARTNER_LOOKS: Record<'girlfriend' | 'boyfriend', Appearance> = {
  girlfriend: { skin: SKIN_TONES[1], hair: HAIR_COLORS[5], hairStyle: 'long', shirt: '#8e5ea2', pants: '#3d5a80' },
  boyfriend: { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'spiky', shirt: '#2e86ab', pants: '#2b2d42' },
};

/** Region-aware default name for the partner. */
export function partnerName(kind: 'girlfriend' | 'boyfriend'): string {
  const n = region().names;
  return kind === 'girlfriend' ? n.partnerGirl : n.partnerBoy;
}

/** The partner as a profile member (id `partner-0`). */
export function partnerMember(kind: 'girlfriend' | 'boyfriend', name?: string): FamilyMember {
  return {
    id: 'partner-0',
    name: name?.trim() || partnerName(kind),
    role: 'partner',
    appearance: { ...PARTNER_LOOKS[kind] },
    trust: 60,
    voice: kind === 'girlfriend' ? { pitch: 1.2, rate: 1.08, kind: 'female' } : { pitch: 1, rate: 1.08, kind: 'male' },
  };
}

export interface FamilyPreset {
  id: string;
  label: string;
  roles: Exclude<Role, 'player'>[];
}

export const FAMILY_PRESETS: FamilyPreset[] = [
  { id: 'big', label: 'Big family (with grandparent & siblings)', roles: ['mother', 'father', 'older-sibling', 'younger-sibling', 'grandparent'] },
  { id: 'classic', label: 'Parents + younger sibling', roles: ['mother', 'father', 'younger-sibling'] },
  { id: 'single-mom', label: 'Single parent (Mother)', roles: ['mother', 'younger-sibling'] },
  { id: 'single-dad', label: 'Single parent (Father)', roles: ['father', 'younger-sibling'] },
  { id: 'guardian', label: 'Guardian + grandparent', roles: ['guardian', 'grandparent'] },
];

/** Default voice per role — players can change these in family setup. */
export const DEFAULT_VOICES: Record<Role, VoiceProfile> = {
  mother: { pitch: 1.1, rate: 1, kind: 'female' },
  father: { pitch: 0.85, rate: 0.95, kind: 'male' },
  player: { pitch: 1.05, rate: 1.05, kind: 'neutral' },
  'older-sibling': { pitch: 1, rate: 1.1, kind: 'male' },
  'younger-sibling': { pitch: 1.5, rate: 1.1, kind: 'child' },
  grandparent: { pitch: 0.95, rate: 0.82, kind: 'elder-female' },
  guardian: { pitch: 1.05, rate: 1, kind: 'female' },
  partner: { pitch: 1.2, rate: 1.08, kind: 'female' },
};

/** Region-aware default name for a role. */
export function regionName(role: Exclude<Role, 'player'>): string {
  const n = region().names;
  const map: Record<Exclude<Role, 'player'>, string> = {
    mother: n.mother,
    father: n.father,
    'older-sibling': n.older,
    'younger-sibling': n.younger,
    grandparent: n.grandparent,
    guardian: n.guardian,
    partner: n.partnerGirl,
  };
  return map[role] ?? DEFAULTS[role].name;
}

export function defaultMember(role: Exclude<Role, 'player'>, index = 0): FamilyMember {
  const d = DEFAULTS[role];
  return { id: `${role}-${index}`, name: regionName(role), role, appearance: { ...d.appearance }, trust: 60, voice: { ...DEFAULT_VOICES[role] } };
}

export function buildProfile(
  playerName: string,
  playerLook: Appearance,
  preset: FamilyPreset,
  overrides: Partial<Record<string, string>> = {},
  partner: PartnerChoice = null,
): Profile {
  const members: FamilyMember[] = [
    { id: 'player', name: playerName || 'Alex', role: 'player', appearance: playerLook, trust: 100, voice: { ...DEFAULT_VOICES.player } },
    ...preset.roles.map((r, i) => {
      const m = defaultMember(r, i);
      if (overrides[r]) m.name = overrides[r]!;
      return m;
    }),
  ];
  if (partner) members.push(partnerMember(partner, overrides.partner));
  return { playerName: playerName || 'Alex', familyName: 'Family', members };
}

export const DEFAULT_PLAYER_LOOK: Appearance = {
  skin: SKIN_TONES[1],
  hair: HAIR_COLORS[1],
  hairStyle: 'short',
  shirt: SHIRT_COLORS[3],
  pants: PANTS_COLORS[1],
};

/** Townsfolk & service NPCs. Names follow the selected region. */
export interface NpcLook {
  readonly name: string;
  appearance: Appearance;
  kind?: 'child' | 'elder';
  voice: VoiceProfile;
}

const npc = (nameOf: () => string, appearance: Appearance, voice: VoiceProfile, kind?: 'child' | 'elder'): NpcLook => ({
  get name() {
    return nameOf();
  },
  appearance,
  kind,
  voice,
});

export const NPC_LOOKS: Record<string, NpcLook> = {
  cashier: npc(() => region().npc.cashier, { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'long', shirt: '#3bb273', pants: '#2b2d42' }, { pitch: 1.2, rate: 1.05, kind: 'female' }),
  stocker: npc(() => region().npc.stocker, { skin: SKIN_TONES[4], hair: HAIR_COLORS[0], hairStyle: 'short', shirt: '#3bb273', pants: '#2b2d42' }, { pitch: 0.95, rate: 1.05, kind: 'male' }),
  sharma: npc(() => region().npc.shopkeeper, { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bald', shirt: '#f2c14e', pants: '#5c4033' }, { pitch: 0.8, rate: 0.9, kind: 'elder-male' }),
  cutter: npc(() => 'Man in a hurry', { skin: SKIN_TONES[1], hair: HAIR_COLORS[2], hairStyle: 'short', shirt: '#e4572e', pants: '#14213d' }, { pitch: 0.9, rate: 1.3, kind: 'male' }),
  elder: npc(() => 'Elderly lady', { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bun', shirt: '#8e5ea2', pants: '#6b705c' }, { pitch: 1, rate: 0.8, kind: 'elder-female' }, 'elder'),
  receptionist: npc(() => region().npc.receptionist, { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'bun', shirt: '#ffffff', pants: '#3d5a80' }, { pitch: 1.15, rate: 1, kind: 'female' }),
  driver: npc(() => region().npc.driver, { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'short', shirt: '#2e86ab', pants: '#14213d' }, { pitch: 0.8, rate: 0.95, kind: 'male' }),
  librarian: npc(() => region().npc.librarian, { skin: SKIN_TONES[1], hair: HAIR_COLORS[4], hairStyle: 'bun', shirt: '#8e5ea2', pants: '#2b2d42' }, { pitch: 1.05, rate: 0.9, kind: 'elder-female' }),
  clerk: npc(() => region().npc.clerk, { skin: SKIN_TONES[4], hair: HAIR_COLORS[0], hairStyle: 'spiky', shirt: '#e4572e', pants: '#2b2d42' }, { pitch: 1, rate: 1.05, kind: 'male' }),
};
