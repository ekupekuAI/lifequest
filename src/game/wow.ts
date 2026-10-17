// Wires the "wow" layers into every walkable scene (called from WorldScene.create).
import type Phaser from 'phaser';
import { bindCinematic } from './cinematic';
import { attachTwists } from './twistLayer';
import { attachRewindFx } from './rewindFx';

export function attachWow(scene: Phaser.Scene) {
  bindCinematic(scene);
  attachTwists(scene);
  attachRewindFx(scene);
}
