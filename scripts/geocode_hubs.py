"""Geocode Telangana hub cities and attach jittered lat/lon coordinates to each hub."""
import math
import random
import time
from pathlib import Path

import pandas as pd
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim

BASE_DIR = Path(__file__).resolve().parent.parent
NODES_CSV = BASE_DIR / "data" / "telangana_nodes.csv"
CACHE_CSV = BASE_DIR / "data" / "city_coordinates_cache.csv"
OUTPUT_CSV = BASE_DIR / "data" / "telangana_nodes_geocoded.csv"

USER_AGENT = "telangana_hub_graph"
NOMINATIM_SLEEP_SECONDS = 1
JITTER_SEED = 42
JITTER_MIN_DEG, JITTER_MAX_DEG = 0.01, 0.02

# Known abbreviations/aliases that refer to the same city under a different spelling.
CITY_ALIASES = {
    "Hyd": "Hyderabad",
}

# Small towns Nominatim couldn't resolve automatically; sourced manually from
# Wikipedia / India Post records. Checked before hitting the API so a from-scratch
# rerun of the pipeline doesn't need this manual step repeated.
MANUAL_COORDINATES = {
    "Bellmpalli": (19.0756, 79.4881),
    "Bijnapally": (16.5500, 78.2000),
    "Chinnur": (18.8535, 79.7826),
    "DhrmpuriTS": (18.9475, 79.0940),
    "JoguGadwal": (16.2350, 77.7956),
    "Kusumnchi": (17.2263, 79.9669),
}


def normalize_city(city: str) -> str:
    city = str(city).strip()
    return CITY_ALIASES.get(city, city)


def load_cache() -> dict:
    if not CACHE_CSV.exists():
        return {}
    cache_df = pd.read_csv(CACHE_CSV)
    cache = {}
    for _, row in cache_df.iterrows():
        if pd.notna(row["latitude"]) and pd.notna(row["longitude"]):
            cache[row["city"]] = (float(row["latitude"]), float(row["longitude"]))
    return cache


def save_cache(cache: dict):
    cache_df = pd.DataFrame(
        [{"city": city, "latitude": lat, "longitude": lon} for city, (lat, lon) in sorted(cache.items())]
    )
    cache_df.to_csv(CACHE_CSV, index=False)


def geocode_city(geolocator: Nominatim, city: str):
    query = f"{city}, Telangana, India"
    try:
        location = geolocator.geocode(query)
    except (GeocoderTimedOut, GeocoderServiceError) as exc:
        print(f"  [FAIL] {city!r} -> geocoding error: {exc}")
        return None
    finally:
        time.sleep(NOMINATIM_SLEEP_SECONDS)

    if location is None:
        print(f"  [FAIL] {city!r} -> no result from Nominatim for query {query!r}")
        return None

    return (location.latitude, location.longitude)


def jitter(lat: float, lon: float, rng: random.Random) -> tuple:
    angle = rng.uniform(0, 2 * math.pi)
    radius = rng.uniform(JITTER_MIN_DEG, JITTER_MAX_DEG)
    return lat + radius * math.cos(angle), lon + radius * math.sin(angle)


def main():
    nodes = pd.read_csv(NODES_CSV).fillna("")
    nodes["city_normalized"] = nodes["city"].apply(normalize_city)

    unique_cities = sorted(nodes["city_normalized"].unique())
    print(f"Unique cities to resolve: {len(unique_cities)}")

    cache = load_cache()
    cities_to_geocode = [c for c in unique_cities if c not in cache]

    if cities_to_geocode:
        geolocator = Nominatim(user_agent=USER_AGENT)
        print(f"Geocoding {len(cities_to_geocode)} new cities (cache had {len(cache)})...")
        for city in cities_to_geocode:
            if city in MANUAL_COORDINATES:
                cache[city] = MANUAL_COORDINATES[city]
                print(f"  [OK]   {city!r} -> {MANUAL_COORDINATES[city]} (manual fallback)")
                continue

            result = geocode_city(geolocator, city)
            if result is not None:
                cache[city] = result
                print(f"  [OK]   {city!r} -> {result}")
    else:
        print("All cities already present in cache; skipping API calls.")

    save_cache(cache)

    failed_cities = [c for c in unique_cities if c not in cache]

    # Assign coordinates + jitter, iterating in a stable, seeded order for reproducibility.
    rng = random.Random(JITTER_SEED)
    nodes_sorted = nodes.sort_values("hub_name").reset_index(drop=True)

    latitudes, longitudes = [], []
    for _, row in nodes_sorted.iterrows():
        coord = cache.get(row["city_normalized"])
        if coord is None:
            latitudes.append("")
            longitudes.append("")
        else:
            lat, lon = jitter(coord[0], coord[1], rng)
            latitudes.append(lat)
            longitudes.append(lon)

    nodes_sorted["latitude"] = latitudes
    nodes_sorted["longitude"] = longitudes

    output = nodes_sorted[["hub_name", "city", "facility_code", "hub_type", "state", "latitude", "longitude"]]
    output.to_csv(OUTPUT_CSV, index=False)

    print("=== Summary ===")
    print(f"Cities geocoded successfully: {len(unique_cities) - len(failed_cities)} / {len(unique_cities)}")
    print(f"Cities failed/skipped: {len(failed_cities)}")
    if failed_cities:
        print(f"  Failed cities: {failed_cities}")
    print(f"Saved cache to: {CACHE_CSV}")
    print(f"Saved geocoded nodes to: {OUTPUT_CSV}")

    hub_count = len(output)
    blank_hubs = int((output["latitude"] == "").sum())
    print(f"\n{hub_count - blank_hubs}/{hub_count} hubs geocoded, {blank_hubs} blank")

    print("\nSample rows:")
    print(output.head(5).to_string(index=False))


if __name__ == "__main__":
    main()
