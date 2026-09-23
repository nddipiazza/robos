// Haversine great-circle distance and venue geofence verification.

export const CHECKIN_RADIUS_M = 150;
export const MAX_GPS_ACCURACY_M = 100;
// Check-in window relative to the gig start time.
export const WINDOW_OPENS_BEFORE_MS = 60 * 60 * 1000; // doors: 1h before start
export const WINDOW_CLOSES_AFTER_MS = 5 * 60 * 60 * 1000; // 5h after start

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function isValidCoord(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function checkInWindow(startsAt) {
  const start = new Date(startsAt).getTime();
  return {
    opensAt: new Date(start - WINDOW_OPENS_BEFORE_MS),
    closesAt: new Date(start + WINDOW_CLOSES_AFTER_MS),
  };
}

/**
 * Decide whether a GPS fix counts as attendance.
 * @returns {{ ok: boolean, distanceM: number|null, reason: string }}
 */
export function verifyCheckIn({ lat, lon, accuracy, venueLat, venueLon, startsAt, now = new Date() }) {
  if (!isValidCoord(lat, lon)) {
    return { ok: false, distanceM: null, reason: 'Invalid GPS coordinates.' };
  }
  const { opensAt, closesAt } = checkInWindow(startsAt);
  if (now < opensAt) {
    return { ok: false, distanceM: null, reason: `Check-in opens at doors (${opensAt.toISOString()}).` };
  }
  if (now > closesAt) {
    return { ok: false, distanceM: null, reason: 'The check-in window for this gig has closed.' };
  }
  if (typeof accuracy === 'number' && accuracy > MAX_GPS_ACCURACY_M) {
    return {
      ok: false,
      distanceM: null,
      reason: `GPS accuracy too low (±${Math.round(accuracy)}m). Step outside or enable precise location and try again.`,
    };
  }
  const d = distanceMeters(lat, lon, venueLat, venueLon);
  if (d > CHECKIN_RADIUS_M) {
    return { ok: false, distanceM: d, reason: `You are ${d}m from the venue. You must be within ${CHECKIN_RADIUS_M}m.` };
  }
  return { ok: true, distanceM: d, reason: `Verified ${d}m from the venue.` };
}
