import { City } from "country-state-city";
import tzLookup from "tz-lookup";


function hasValidCoordinates(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  // Reject NaN, and reject (0,0) specifically — it's the dataset's known
  // "no data" placeholder, not a real location anyone's event is at.
  return Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0);
}

function offlineFallback(
  countryCode: string,
  stateCode: string,
  cityName: string
): string | null {
  const city = City.getCitiesOfState(countryCode, stateCode).find((c) => c.name === cityName);

  if (city && hasValidCoordinates(city.latitude, city.longitude)) {
    return tzLookup(Number(city.latitude), Number(city.longitude));
  }

  return null;
}

async function fetchFromGeoNames(
  cityName: string,
  countryCode: string
): Promise<string | null> {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) return null;

  try {
    const params = new URLSearchParams({
      name: cityName,
      country: countryCode,
      maxRows: "1",
      username,
    });

    const res = await fetch(
      `https://secure.geonames.org/searchJSON?${params.toString()}`,
      { signal: AbortSignal.timeout(4000) }
    );

    const data = await res.json();
    console.log("GEONAMES RAW RESPONSE:", JSON.stringify(data)); // TEMPORARY

    if (!res.ok) return null;

    const place = data?.geonames?.[0];
    const directTimezone = place?.timezone?.timeZoneId;
    if (typeof directTimezone === "string" && directTimezone) {
      return directTimezone;
    }

    // searchJSON commonly returns coordinates but not the timezone object.
    // Ask GeoNames' timezone endpoint for the timezone at those coordinates.
    const latitude = Number(place?.lat);
    const longitude = Number(place?.lng);
    if (!hasValidCoordinates(latitude, longitude)) return null;

    const timezoneParams = new URLSearchParams({
      lat: String(latitude),
      lng: String(longitude),
      username,
    });
    const timezoneResponse = await fetch(
      `https://secure.geonames.org/timezoneJSON?${timezoneParams.toString()}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!timezoneResponse.ok) return null;

    const timezoneData = await timezoneResponse.json();
    const timezone = timezoneData?.timezoneId;
    return typeof timezone === "string" && timezone ? timezone : null;
  } catch (err) {
    console.log("GEONAMES ERROR:", err); // TEMPORARY
    return null;
  }
}

export async function resolveEventTimezone(
  countryCode: string,
  stateCode: string,
  cityName: string
): Promise<string | null> {
  const country = countryCode.trim().toUpperCase();
  const state = stateCode.trim().toUpperCase();
  const city = cityName.trim();

  if (!country || !state || !city) {
    return null;
  }

  // 1. FIRST: offline coordinates + tz-lookup (lower-confidence fallback)
  const offline = offlineFallback(country, state, city);
  console.log("resolveEventTimezone: offline fallback gave:", offline); // TEMPORARY
  if (offline) {
    return offline;
  }

  // 2. SECOND: GeoNames — curated timezone data, not derived from
  //    potentially-corrupted coordinates.
  const fromGeoNames = await fetchFromGeoNames(city, country);
  console.log("resolveEventTimezone: GeoNames gave:", fromGeoNames);
  return fromGeoNames;
}
