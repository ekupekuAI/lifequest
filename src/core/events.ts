// Tiny typed event bus used between independent systems and the Phaser world.
// React reads state through the store subscription instead of these events.
import type { GameEvent } from '../missions/types';
import type { LocationId } from '../domain/types';

export interface BusEvents {
  game: GameEvent;
  fx: { kind: 'heart' | 'cloud' | 'sparkle' | 'coin'; target?: string; x?: number; y?: number };
  scene: { goto: LocationId };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof BusEvents, Set<Handler<any>>>();

  on<K extends keyof BusEvents>(type: K, fn: Handler<BusEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]) {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
  }
}
