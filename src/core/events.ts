// Tiny typed event bus used between independent systems and the Phaser world.
// React reads state through the store subscription instead of these events.
import type { GameEvent } from '../missions/types';
import type { LocationId } from '../domain/types';

export interface BusEvents {
  game: GameEvent;
  /** kind = any fx texture key (heart, cloud, sparkle, coin, steam, smoke, bubble, check, music…) */
  fx: { kind: string; target?: string; x?: number; y?: number };
  scene: { goto: LocationId; spawn?: string };
  /** a short report for whoever assigned the current task (sent to the parent's dashboard in family mode) */
  report: { text: string; tone: 'good' | 'neutral' | 'bad'; toMemberId?: string };
  /**
   * A family member comes over to deal with something (fight, too much phone, napping through a task…).
   * The scene that owns that NPC sets `handled = true` synchronously, walks them to the player and calls
   * `arrive()` when they get there. If no scene handles it, conduct.ts calls arrive() itself (phone call).
   */
  conduct: { type: 'intervene'; memberId: string; reason: string; handled?: boolean; arrive: () => void };
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
