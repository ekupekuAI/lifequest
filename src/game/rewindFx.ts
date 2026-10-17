// In-world half of the VHS rewind (the DOM overlay is ui/RewindOverlay.tsx): while a rewind
// plays, the active scene desaturates, the camera judders like a chewed tape and every visible
// character leaves ghost copies sliding backwards. Also boots the cinematic director.
import Phaser from 'phaser';
import { rewindPhase } from '../core/rewind';
import { reducedMotion } from './cinematic';
import { startCinematicDirector } from './cinematicDirector';

export function attachRewindFx(scene: Phaser.Scene) {
  startCinematicDirector();
  let running = false;
  let lastGhost = 0;
  let lastJitter = 0;
  let color: Phaser.FX.ColorMatrix | null = null;
  let tint: Phaser.GameObjects.Rectangle | null = null;
  let baseOffset: { x: number; y: number } | null = null;
  const ghosts = new Set<Phaser.GameObjects.Image>();
  const cam = () => scene.cameras?.main;

  const tick = () => {
    if (!running) return;
    const t = performance.now();
    const c = cam();
    if (!c) return;
    const p = rewindPhase.get();
    const k = Math.min(1, (t - p.startedAt) / 2000);
    // tape judder: horizontal tracking jumps (skipped for reduced motion)
    if (!reducedMotion() && t - lastJitter > 55 && baseOffset) {
      lastJitter = t;
      const amp = 2 + 5 * Math.sin(k * Math.PI);
      c.followOffset.set(baseOffset.x + (Math.random() * 2 - 1) * amp, baseOffset.y + (Math.random() < 0.15 ? (Math.random() * 2 - 1) * amp : 0));
    }
    if (color) {
      color.reset();
      color.saturate(-0.85 * Math.min(1, k * 3));
      color.hue(Math.sin(t / 90) * 6, true);
    }
    if (t - lastGhost > 110 && !reducedMotion()) {
      lastGhost = t;
      spawnGhosts();
    }
  };

  const spawnGhosts = () => {
    const c = cam();
    if (!c) return;
    const view = c.worldView;
    let n = 0;
    for (const o of scene.children.list) {
      if (n >= 18) break;
      if (!(o instanceof Phaser.GameObjects.Sprite) || !o.visible || o.scrollFactorX !== 1) continue;
      if (!view.contains(o.x, o.y)) continue;
      const frame = o.frame;
      if (!frame || !frame.texture || frame.texture.key === '__MISSING') continue;
      n++;
      const g = scene.add
        .image(o.x, o.y, frame.texture.key, frame.name)
        .setOrigin(o.originX, o.originY)
        .setScale(o.scaleX, o.scaleY)
        .setFlipX(o.flipX)
        .setDepth(o.depth - 0.5)
        .setAlpha(0.45)
        .setTint(Math.random() < 0.5 ? 0x7fd8ff : 0xff7fb0)
        .setBlendMode(Phaser.BlendModes.ADD);
      ghosts.add(g);
      // ghosts slide "backwards" (against the facing) and fade — like frames running in reverse
      const dir = o.flipX ? 1 : -1;
      const start = performance.now();
      const step = () => {
        const kk = (performance.now() - start) / 360;
        if (!g.active || kk >= 1) {
          scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
          ghosts.delete(g);
          g.destroy();
          return;
        }
        g.setPosition(o.x + dir * 14 * kk, o.y - 2 * kk);
        g.setAlpha(0.45 * (1 - kk));
      };
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
    }
  };

  const start = () => {
    if (running || !scene.sys?.isActive()) return;
    const c = cam();
    if (!c) return;
    running = true;
    baseOffset = { x: c.followOffset.x, y: c.followOffset.y };
    try {
      if (scene.renderer.type === Phaser.WEBGL && c.postFX) color = c.postFX.addColorMatrix() as unknown as Phaser.FX.ColorMatrix;
    } catch {
      color = null;
    }
    if (!color) {
      // canvas renderer: a cold wash instead of a real desaturate
      tint = scene.add.rectangle(0, 0, c.width * 4, c.height * 4, 0x9aa7c0, 0.35).setOrigin(0.5).setScrollFactor(0).setDepth(29900).setBlendMode(Phaser.BlendModes.MULTIPLY);
      tint.setPosition(c.width / 2, c.height / 2);
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    const c = cam();
    if (c && baseOffset) c.followOffset.set(baseOffset.x, baseOffset.y);
    baseOffset = null;
    if (color && c?.postFX) {
      try {
        c.postFX.remove(color as unknown as Phaser.FX.Controller);
      } catch {
        /* gone */
      }
    }
    color = null;
    tint?.destroy();
    tint = null;
    ghosts.forEach((g) => g.destroy());
    ghosts.clear();
  };

  const unsub = rewindPhase.subscribe(() => (rewindPhase.get().active ? start() : stop()));
  // the rewind may have just swapped maps: keep the effect going on the new scene
  if (rewindPhase.get().active) start();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    stop();
    unsub();
  });
}
