import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { TownScene } from './scenes/TownScene';
import { StoreScene } from './scenes/StoreScene';
import { ClinicScene } from './scenes/ClinicScene';
import { CityScene } from './scenes/CityScene';
import { LibraryScene } from './scenes/LibraryScene';

/** Hosts the single Phaser instance. Created once on mount, destroyed on unmount. */
export default function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!host.current || game.current) return;
    game.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: '#14112a',
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      physics: { default: 'arcade', arcade: { debug: false } },
      input: { keyboard: { target: window }, touch: true },
      audio: { noAudio: true },
      scene: [BootScene, HomeScene, TownScene, StoreScene, ClinicScene, CityScene, LibraryScene],
      banner: false,
    });
    (window as any).__phaser = game.current;
    return () => {
      game.current?.destroy(true);
      game.current = null;
    };
  }, []);

  return <div ref={host} className="game-canvas" style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />;
}
