// Mount point for the "wow" UI overlays (each owned by a different system).
import RewindOverlay from './RewindOverlay';
import TwistOverlay from './TwistOverlay';

export default function WowOverlays() {
  return (
    <>
      <TwistOverlay />
      <RewindOverlay />
    </>
  );
}
