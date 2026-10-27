/**
 * Live Speaker / Smart TV Takeover Detector Hook for RobOS Movie Player
 */

import { useState, useEffect } from 'react';

export function useSpeakerTakeover({
  castDevices = [],
  activeCastDevice = null,
  onExternalTakeover
} = {}) {
  const [takeoverBanner, setTakeoverBanner] = useState(null);

  useEffect(() => {
    if (!window.robosAudio || !window.robosAudio.speakerWatchConfigure) return;
    if (activeCastDevice) {
      window.robosAudio.speakerWatchConfigure({
        enabled: true,
        devices: [activeCastDevice]
      }).catch(() => {});
    } else if (castDevices.length > 0) {
      window.robosAudio.speakerWatchConfigure({
        enabled: true,
        devices: castDevices
      }).catch(() => {});
    }
  }, [activeCastDevice?.id, castDevices.length]);

  useEffect(() => {
    if (!window.robosAudio || !window.robosAudio.onSpeakerTakeover) return undefined;
    return window.robosAudio.onSpeakerTakeover((evt) => {
      if (!evt) return;
      setTakeoverBanner(evt);
      if (onExternalTakeover) onExternalTakeover(evt);
    });
  }, [onExternalTakeover]);

  return {
    takeoverBanner,
    dismissTakeover: () => setTakeoverBanner(null)
  };
}
