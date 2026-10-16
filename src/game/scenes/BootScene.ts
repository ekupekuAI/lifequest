// Generates every texture at runtime from the procedural pixel-art module, then
// starts the scene for the player's current location.
import Phaser from 'phaser';
import { store } from '../../core/store';
import { NPC_LOOKS, HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES } from '../../domain/family';
import { ITEMS } from '../../domain/items';
import type { Appearance, HairStyle } from '../../domain/types';
import { drawTileset } from '../art/tiles';
import { PROPS, drawProp } from '../art/props';
import { drawItemIcon } from '../art/items';
import { drawFx } from '../art/fx';
import { drawCharacterSheet, kindForRole, FRAME_W, FRAME_H, type CharKind } from '../art/characters';
import { SCENE_FOR } from './WorldScene';
import { mulberry32 } from '../../core/systems';

const FX = ['heart', 'cloud', 'sparkle', 'coin', 'exclaim', 'prompt', 'shadow', 'raindrop', 'zzz'];
const DIRS = ['down', 'left', 'right', 'up'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  private addCanvas(key: string, canvas: HTMLCanvasElement) {
    if (this.textures.exists(key)) this.textures.remove(key);
    return this.textures.addCanvas(key, canvas)!;
  }

  private addCharacter(key: string, a: Appearance, kind: CharKind) {
    const tex = this.addCanvas(key, drawCharacterSheet(a, kind));
    for (let r = 0; r < 4; r++)
      for (let col = 0; col < 4; col++) tex.add(r * 4 + col, 0, col * FRAME_W, r * FRAME_H, FRAME_W, FRAME_H);
    DIRS.forEach((d, r) => {
      const animKey = `${key}:walk-${d}`;
      if (this.anims.exists(animKey)) this.anims.remove(animKey);
      this.anims.create({
        key: animKey,
        frames: [1, 0, 3, 2].map((col) => ({ key, frame: r * 4 + col })),
        frameRate: 8,
        repeat: -1,
      });
    });
  }

  create() {
    this.addCanvas('tiles', drawTileset());
    for (const key of Object.keys(PROPS)) this.addCanvas(key, drawProp(key));
    for (const id of Object.keys(ITEMS)) this.addCanvas(`item:${id}`, drawItemIcon(id));
    for (const k of FX) this.addCanvas(`fx:${k}`, drawFx(k));

    for (const m of store.state.profile.members) this.addCharacter(m.role === 'player' ? 'char:player' : `char:${m.id}`, m.appearance, kindForRole(m.role));
    for (const [k, v] of Object.entries(NPC_LOOKS)) this.addCharacter(`char:npc:${k}`, v.appearance, v.kind ?? 'adult');
    // townsfolk with deterministic varied looks
    const rnd = mulberry32(42);
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
    const styles: HairStyle[] = ['short', 'long', 'bun', 'spiky', 'bald'];
    for (let i = 0; i < 8; i++) {
      this.addCharacter(
        `char:folk:${i}`,
        { skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS), hairStyle: pick(styles), shirt: pick(SHIRT_COLORS), pants: pick(PANTS_COLORS) },
        i === 5 ? 'elder' : i === 7 ? 'child' : 'adult',
      );
    }
    this.scene.start(SCENE_FOR[store.state.location] ?? 'Home', { spawn: 'default' });
  }
}
