// Thin React wrappers over the procedural pixel-art generators. Every call is
// guarded so a missing sprite never takes down the UI — we fall back to a tile.
import { useMemo } from 'react';
import type { Appearance, Role } from '../domain/types';
import { NPC_LOOKS, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS } from '../domain/family';
import { ITEMS } from '../domain/items';
import { store } from '../core/store';
import { iconUrl, portraitUrl, characterPreviewUrl } from '../game/art/icons';
import { kindForRole } from '../game/art/characters';

type Kind = 'adult' | 'child' | 'elder';

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function kindOf(role: Role): Kind {
  return (safe(() => kindForRole(role)) as Kind | null) ?? (role === 'grandparent' ? 'elder' : role.includes('sibling') || role === 'player' ? 'child' : 'adult');
}

/** Resolve a portrait key (member id or `npc:<key>`) to an appearance. */
export function resolvePortrait(key: string): { appearance: Appearance; kind: Kind; name: string } | null {
  if (key.startsWith('npc:')) {
    const npc = NPC_LOOKS[key.slice(4)];
    if (!npc) return null;
    return { appearance: npc.appearance, kind: npc.kind ?? 'adult', name: npc.name };
  }
  const m = store.member(key);
  if (!m) return null;
  return { appearance: m.appearance, kind: kindOf(m.role), name: m.name };
}

/** Deterministic look for anonymous queue customers. */
export function crowdLook(n: number): Appearance {
  const styles: Appearance['hairStyle'][] = ['short', 'long', 'bun', 'spiky', 'bald'];
  return {
    skin: SKIN_TONES[(n * 7 + 2) % SKIN_TONES.length],
    hair: HAIR_COLORS[(n * 3) % HAIR_COLORS.length],
    hairStyle: styles[(n * 5 + 1) % styles.length],
    shirt: SHIRT_COLORS[(n * 5 + 3) % SHIRT_COLORS.length],
    pants: PANTS_COLORS[n % PANTS_COLORS.length],
  };
}

function Fallback({ label, size, className }: { label: string; size: number; className?: string }) {
  return (
    <span className={`px-fallback ${className ?? ''}`} style={{ width: size, height: size, fontSize: Math.max(8, size / 3) }} aria-hidden>
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Portrait({
  id,
  appearance,
  kind,
  size = 48,
  className,
  alt,
}: {
  id: string;
  appearance?: Appearance;
  kind?: Kind;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const resolved = appearance ? { appearance, kind: kind ?? 'adult', name: alt ?? '' } : resolvePortrait(id);
  const sig = resolved ? JSON.stringify(resolved.appearance) + resolved.kind : '';
  const url = useMemo(() => (resolved ? safe(() => portraitUrl(id, resolved.appearance, resolved.kind as Kind, 3)) : null), [id, sig]);
  if (!url) return <Fallback label={alt ?? resolved?.name ?? '?'} size={size} className={className} />;
  return <img className={`px ${className ?? ''}`} src={url} width={size} height={size} alt={alt ?? resolved?.name ?? ''} draggable={false} />;
}

export function ItemIcon({ id, size = 32, className, title }: { id: string; size?: number; className?: string; title?: string }) {
  const url = useMemo(() => safe(() => iconUrl(id, 3)), [id]);
  const name = title ?? ITEMS[id]?.name ?? id;
  if (!url) return <Fallback label={name} size={size} className={className} />;
  return <img className={`px ${className ?? ''}`} src={url} width={size} height={size} alt={name} title={name} draggable={false} />;
}

export function CharacterPreview({ appearance, kind, height = 128, className }: { appearance: Appearance; kind: Kind; height?: number; className?: string }) {
  const sig = JSON.stringify(appearance) + kind;
  const url = useMemo(() => safe(() => characterPreviewUrl(appearance, kind, 4)), [sig]);
  if (!url) return <Fallback label="?" size={height} className={className} />;
  return <img className={`px ${className ?? ''}`} src={url} style={{ height, width: 'auto' }} alt="Character preview" draggable={false} />;
}
