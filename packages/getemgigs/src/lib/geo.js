/**
 * Haversine formula for calculating great-circle distance between two GPS coordinates
 * @param {number} lat1 Latitude of point 1 in degrees
 * @param {number} lon1 Longitude of point 1 in degrees
 * @param {number} lat2 Latitude of point 2 in degrees
 * @param {number} lon2 Longitude of point 2 in degrees
 * @returns {number} Distance in meters
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Verifies if an attendee GPS fix is within the venue's geofenced perimeter.
 * Default radius is 150 meters (typical venue boundary).
 * @param {number} attendeeLat
 * @param {number} attendeeLon
 * @param {number} venueLat
 * @param {number} venueLon
 * @param {number} [maxDistanceMeters=150]
 * @returns {{ isVerified: boolean, distanceMeters: number, maxRadiusMeters: number, message: string }}
 */
export function verifyVenueCheckIn(attendeeLat, attendeeLon, venueLat, venueLon, maxDistanceMeters = 150) {
  if (
    typeof attendeeLat !== 'number' ||
    typeof attendeeLon !== 'number' ||
    typeof venueLat !== 'number' ||
    typeof venueLon !== 'number'
  ) {
    return {
      isVerified: false,
      distanceMeters: Infinity,
      maxRadiusMeters: maxDistanceMeters,
      message: 'Invalid coordinate payload provided for geolocation verification.',
    };
  }

  const distance = calculateDistanceMeters(attendeeLat, attendeeLon, venueLat, venueLon);
  const isVerified = distance <= maxDistanceMeters;

  return {
    isVerified,
    distanceMeters: distance,
    maxRadiusMeters: maxDistanceMeters,
    message: isVerified
      ? `Geolocation Verified! You are within ${distance}m of the venue (Radius: ${maxDistanceMeters}m).`
      : `Check-in Failed: You are ${distance}m away from the venue (Maximum allowed radius: ${maxDistanceMeters}m).`,
  };
}
