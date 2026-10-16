import type { GameState } from '../domain/types';
import type { GameRepository, SaveResult } from './repository';

const KEY = 'lifequest.save.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class LocalRepository implements GameRepository {
  kind = 'local' as const;

  hasSave() {
    return !!storage()?.getItem(KEY);
  }

  async load(): Promise<GameState | null> {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as GameState;
      return s.version === 1 ? s : null;
    } catch {
      return null;
    }
  }

  async save(state: GameState): Promise<SaveResult> {
    const st = storage();
    if (!st) return { ok: false, error: 'Browser storage is unavailable (private mode?)' };
    try {
      st.setItem(KEY, JSON.stringify(state));
      return { ok: true, where: 'local' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not write local save' };
    }
  }

  clear() {
    storage()?.removeItem(KEY);
  }
}
