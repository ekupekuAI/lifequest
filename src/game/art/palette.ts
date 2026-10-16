// LifeQuest shared pixel-art palette.
// Every ramp runs darkest -> lightest (5 tones). Shadows lean toward cool
// purple, highlights toward warm yellow, so materials feel cohesive under the
// warm top-left "evening sun" light source used across the game.

export type Ramp = readonly [string, string, string, string, string];

export const OUTLINE = '#1b1325';
export const INK = '#2a1f33';
export const WHITE = '#fffcf5';
export const SHADOW = 'rgba(27,19,37,0.35)';

export const PAL = {
  // woods
  wood: ['#3d2219', '#5e3424', '#844b31', '#a8673f', '#c98b57'] as Ramp,
  oak: ['#5a3a26', '#8a5a3a', '#b07d50', '#cfa070', '#e6c393'] as Ramp,
  wicker: ['#5e3e22', '#8c6236', '#b8894c', '#d8ad68', '#efd293'] as Ramp,
  // interior surfaces
  cream: ['#8c7a68', '#b8a48c', '#dccab0', '#eee0c6', '#faf1de'] as Ramp,
  plaster: ['#3a2430', '#4e3038', '#66403f', '#7e5448', '#9a6c58'] as Ramp,
  // nature
  leaf: ['#1d3a2c', '#2b5a36', '#3f7d3e', '#63a448', '#9fcf63'] as Ramp,
  grass: ['#2e5a2f', '#3d7436', '#4f8c3c', '#68a746', '#8cc25a'] as Ramp,
  dirt: ['#5a3c2a', '#7d5636', '#a07a4c', '#c09c68', '#dcc08e'] as Ramp,
  water: ['#1a2c55', '#24477d', '#2f6aa6', '#4f98cc', '#9fd4ec'] as Ramp,
  // built
  stone: ['#3b3a48', '#5b5a68', '#82808a', '#aaa6a8', '#d4cfc8'] as Ramp,
  paver: ['#5c5550', '#7e766c', '#a0968a', '#bdb3a4', '#d8cfbf'] as Ramp,
  asphalt: ['#20202a', '#2a2a35', '#34343f', '#3f3f4b', '#4c4c59'] as Ramp,
  terra: ['#5a2224', '#7f3229', '#a8462f', '#cb6640', '#e8915e'] as Ramp,
  slate: ['#1f2740', '#2e3a5c', '#435582', '#5f78a6', '#8ea6c8'] as Ramp,
  // colours
  red: ['#5c1a2a', '#8c2433', '#c0393b', '#e0604a', '#f59a72'] as Ramp,
  orange: ['#6b2e1c', '#a24a24', '#d8702e', '#f0984a', '#fbc27a'] as Ramp,
  yellow: ['#6e4a1c', '#a8742a', '#d9a83a', '#f2cf5a', '#fbe89a'] as Ramp,
  green: ['#173d2a', '#1f6038', '#2e8a48', '#4fb35a', '#8ad67e'] as Ramp,
  teal: ['#173d44', '#1f6060', '#2e8a7e', '#4fb39a', '#8ad6b8'] as Ramp,
  blue: ['#1d2b4f', '#2b4a7a', '#3b6fa6', '#5aa0cf', '#94cfe8'] as Ramp,
  pink: ['#6b2c4a', '#9e4466', '#cf6a8a', '#ee97ac', '#fac6cf'] as Ramp,
  purple: ['#2e2347', '#4a3568', '#6b4f8c', '#9474b0', '#c2a6d4'] as Ramp,
  white: ['#8a8496', '#b4aebb', '#d8d3d6', '#efebe6', '#fffcf5'] as Ramp,
  metal: ['#2b2e3a', '#4a4f5e', '#717888', '#9aa2ae', '#cdd3d8'] as Ramp,
  glass: ['#1e3346', '#2c5470', '#457e9c', '#78b4c8', '#c2e6ee'] as Ramp,
  dark: ['#120d1a', '#1b1325', '#2a2236', '#3a3148', '#4d4360'] as Ramp,
  paper: ['#9a8c7a', '#c4b8a4', '#e4dccb', '#f4eee0', '#fffcf5'] as Ramp,
  cork: ['#5e3a22', '#87562e', '#b07a42', '#cc9a5c', '#e2bb80'] as Ramp,
} as const;

/** Evening sky used in windows. */
export const SKY = ['#3b3266', '#6a4a86', '#c0607a', '#f08a62', '#fbc27a'] as const;

/** Glow colour for night lamps. */
export const GLOW = '#ffd27a';
