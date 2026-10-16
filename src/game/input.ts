// Shared virtual input written by React touch controls and read by the Phaser player.
export const touchInput = {
  /** joystick vector, each axis in -1..1 */
  x: 0,
  y: 0,
  /** set true by the interact button; Phaser consumes and resets it */
  interact: false,
};
