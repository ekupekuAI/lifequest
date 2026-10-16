// Runtime bridge: lets non-Phaser code (the 3D view, audio) find the live game
// and the active world scene without importing Phaser scenes directly.
import type Phaser from 'phaser';

let game: Phaser.Game | null = null;
const listeners = new Set<(g: Phaser.Game | null) => void>();

export function setGame(g: Phaser.Game | null) {
  game = g;
  listeners.forEach((l) => l(g));
}

export function getGame(): Phaser.Game | null {
  return game;
}

export function onGame(fn: (g: Phaser.Game | null) => void): () => void {
  listeners.add(fn);
  fn(game);
  return () => listeners.delete(fn);
}

/** Read-only view of a world scene for mirroring (see WorldScene.view3d()). */
export interface WorldView3D {
  key: string;
  location: string;
  outdoor: boolean;
  mapW: number;
  mapH: number;
  /** tile size in px */
  tile: number;
  /** tile index grid [row][col] (indices into the 'tiles' texture strip) */
  tiles: number[][];
  /** tile indices that are walls (wallTop / wallFace) and should be raised in 3D */
  wallTiles: number[];
  /** tile indices that are solid but not walls (hedge, water, fence…) */
  solidTiles: number[];
  /** the Phaser scene itself, to iterate `children.list` (images, sprites, particles) each frame */
  scene: Phaser.Scene;
  player: Phaser.GameObjects.Sprite;
  facing: 'down' | 'left' | 'right' | 'up';
  /** multiply-tint colour of the day/night overlay (0xRRGGBB), or null when not tinted */
  lightTint: number | null;
  /** objects the 3D view should never mirror (night overlay, guide graphics, prompt arrow) */
  ignore: Set<Phaser.GameObjects.GameObject>;
  /** guide target position in world px, if the guide arrow is showing */
  guide: { x: number; y: number } | null;
}

/** The active world scene's 3D view, or null (e.g. during Boot). */
export function activeWorldView(): WorldView3D | null {
  if (!game) return null;
  for (const s of game.scene.getScenes(true)) {
    const v = (s as unknown as { view3d?: () => WorldView3D | null }).view3d?.();
    if (v) return v;
  }
  return null;
}
