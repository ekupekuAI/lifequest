// Frame-accurate timeline. 30 fps, 60 s. Music is 120 BPM → one beat every 15 frames,
// one bar every 60 frames. Every scene starts on a bar line so cuts land on the beat.
export const FPS = 30;
export const BEAT = 15; // frames per beat (120 BPM)
export const BAR = 60;
export const TOTAL_FRAMES = 1800;

export interface SceneSlot {
  id: string;
  from: number;
  duration: number;
  title: string;
}

export const SCENES: SceneSlot[] = [
  { id: 'S01', from: 0, duration: 120, title: 'Dawn — the neighbourhood wakes up' },
  { id: 'S02', from: 120, duration: 150, title: 'The Ask — Mum gives the errand' },
  { id: 'S03', from: 270, duration: 150, title: 'Step Out — into the living town' },
  { id: 'S04', from: 420, duration: 180, title: 'The Store — prices, basket, SOLD OUT' },
  { id: 'S05', from: 600, duration: 180, title: 'The Queue — time, patience, kindness' },
  { id: 'S06', from: 780, duration: 150, title: 'Weather & the wrong bus' },
  { id: 'S07', from: 930, duration: 210, title: 'Chaos montage — life happens' },
  { id: 'S08', from: 1140, duration: 180, title: 'Every choice counts — worldwide' },
  { id: 'S09', from: 1320, duration: 240, title: 'Payoff — results, family, pride' },
  { id: 'S10', from: 1560, duration: 240, title: 'Logo — LifeQuest, now live' },
];

/** Voice-over and key sound cues (absolute frames) — scenes animate to these. */
export const CUES = {
  momLine: 140, // "Beta, can you get milk…" (S02)
  coinDrop: 228,
  doorOpen: 285,
  soldOutStamp: 492, // S04 impact
  helperLine: 500, // "Sorry! Milk is sold out."
  queueFastForward: 660,
  heartPop: 735,
  thunder: 780,
  busArrive: 855,
  montageCuts: [930, 975, 1020, 1065, 1110], // S07 cuts every 3 beats
  siblingLine: 1022, // "Hey! Those are MY crayons!"
  narratorLine1: 1150, // "Real life doesn't come with a tutorial."
  choiceSlam: 1200,
  drop: 1320, // music drop / payoff
  grandmaLine: 1440, // "You did it! Well done!"
  logoHit: 1590,
  narratorLine2: 1620, // "LifeQuest. Real life. Your rules."
  finalSting: 1740,
};
