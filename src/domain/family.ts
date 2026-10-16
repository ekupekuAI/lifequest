import type { Appearance, FamilyMember, Profile, Role } from './types';

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
};

const DEFAULTS: Record<Exclude<Role, 'player'>, { name: string; appearance: Appearance }> = {
  mother: { name: 'Meera', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[0], hairStyle: 'bun', shirt: '#c0392b', pants: '#5c4033' } },
  father: { name: 'Raj', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[0], hairStyle: 'short', shirt: '#2e86ab', pants: '#2b2d42' } },
  'older-sibling': { name: 'Arjun', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[1], hairStyle: 'spiky', shirt: '#3bb273', pants: '#3d5a80' } },
  'younger-sibling': { name: 'Tara', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[1], hairStyle: 'long', shirt: '#f28ab2', pants: '#3d5a80' } },
  grandparent: { name: 'Dadi', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bun', shirt: '#8e5ea2', pants: '#6b705c' } },
  guardian: { name: 'Aunt Leela', appearance: { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'long', shirt: '#f2c14e', pants: '#14213d' } },
};

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

export function defaultMember(role: Exclude<Role, 'player'>, index = 0): FamilyMember {
  const d = DEFAULTS[role];
  return { id: `${role}-${index}`, name: d.name, role, appearance: { ...d.appearance }, trust: 60 };
}

export function buildProfile(
  playerName: string,
  playerLook: Appearance,
  preset: FamilyPreset,
  overrides: Partial<Record<string, string>> = {},
): Profile {
  const members: FamilyMember[] = [
    { id: 'player', name: playerName || 'Alex', role: 'player', appearance: playerLook, trust: 100 },
    ...preset.roles.map((r, i) => {
      const m = defaultMember(r, i);
      if (overrides[r]) m.name = overrides[r]!;
      return m;
    }),
  ];
  return { playerName: playerName || 'Alex', familyName: 'Family', members };
}

export const DEFAULT_PLAYER_LOOK: Appearance = {
  skin: SKIN_TONES[1],
  hair: HAIR_COLORS[1],
  hairStyle: 'short',
  shirt: SHIRT_COLORS[3],
  pants: PANTS_COLORS[1],
};

/** Townsfolk & service NPCs. */
export const NPC_LOOKS: Record<string, { name: string; appearance: Appearance; kind?: 'child' | 'elder' }> = {
  cashier: { name: 'Cashier Priya', appearance: { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'long', shirt: '#3bb273', pants: '#2b2d42' } },
  stocker: { name: 'Store helper Vikram', appearance: { skin: SKIN_TONES[4], hair: HAIR_COLORS[0], hairStyle: 'short', shirt: '#3bb273', pants: '#2b2d42' } },
  sharma: { name: 'Mr. Sharma', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bald', shirt: '#f2c14e', pants: '#5c4033' } },
  cutter: { name: 'Man in a hurry', appearance: { skin: SKIN_TONES[1], hair: HAIR_COLORS[2], hairStyle: 'short', shirt: '#e4572e', pants: '#14213d' } },
  elder: { name: 'Elderly lady', appearance: { skin: SKIN_TONES[2], hair: HAIR_COLORS[4], hairStyle: 'bun', shirt: '#8e5ea2', pants: '#6b705c' }, kind: 'elder' },
  receptionist: { name: 'Receptionist Anita', appearance: { skin: SKIN_TONES[3], hair: HAIR_COLORS[0], hairStyle: 'bun', shirt: '#ffffff', pants: '#3d5a80' } },
};
