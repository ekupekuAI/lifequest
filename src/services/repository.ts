import type { GameState } from '../domain/types';
import { LocalRepository } from './localRepository';
import { SupabaseRepository, supabaseConfigured } from './supabaseRepository';

export type SaveResult = { ok: true; where: 'local' | 'cloud' } | { ok: false; error: string };

/** Persistence port. Local adapter for demo mode, Supabase adapter when configured. */
export interface GameRepository {
  kind: 'local' | 'supabase';
  hasSave(): boolean;
  load(): Promise<GameState | null>;
  save(state: GameState): Promise<SaveResult>;
  clear(): void;
}

export function createRepository(): GameRepository {
  const local = new LocalRepository();
  if (supabaseConfigured()) return new SupabaseRepository(local);
  return local;
}
