"""Render the Telangana hub network on a real geographic map using folium."""
from pathlib import Path

import folium
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
NODES_CSV = BASE_DIR / "data" / "telangana_nodes_geocoded.csv"
EDGES_CSV = BASE_DIR / "data" / "telangana_edges.csv"
OUTPUT_HTML = BASE_DIR / "data" / "telangana_folium_map.html"

MAP_CENTER = (17.9, 79.6)
MAP_ZOOM_START = 7

HUB_TYPE_COLORS = {
    "Hub": "red",
    "Intermediate": "orange",
    "Delivery": "blue",
    "Distribution Center": "blue",
    "Collection": "green",
    "Unknown": "gray",
}

MIN_WEIGHT, MAX_WEIGHT = 1.5, 8
MIN_OPACITY, MAX_OPACITY = 0.35, 0.9

LEGEND_HTML = """
<div style="position: fixed; bottom: 30px; left: 30px; z-index: 9999;
            background-color: white; padding: 12px 16px; border: 2px solid #444;
            border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 13px;
            box-shadow: 2px 2px 6px rgba(0,0,0,0.3);">
  <b>Hub Type</b><br/>
  <span style="color:red;">&#9679;</span> Hub (H)<br/>
  <span style="color:orange;">&#9679;</span> Intermediate (I)<br/>
  <span style="color:blue;">&#9679;</span> Delivery / Distribution (D / DC)<br/>
  <span style="color:green;">&#9679;</span> Collection (C)<br/>
  <span style="color:gray;">&#9679;</span> Unknown
</div>
"""


def scale(value, lo, hi, out_lo, out_hi):
    if hi <= lo:
        return (out_lo + out_hi) / 2
    value = max(lo, min(hi, value))
    return out_lo + (value - lo) / (hi - lo) * (out_hi - out_lo)


def main():
    nodes = pd.read_csv(NODES_CSV)
    edges = pd.read_csv(EDGES_CSV)

    fmap = folium.Map(location=MAP_CENTER, zoom_start=MAP_ZOOM_START, tiles="OpenStreetMap")

    coord_by_hub = {}
    markers_plotted = 0
    hubs_skipped = 0

    for _, row in nodes.iterrows():
        hub_name = row["hub_name"]
        lat, lon = row["latitude"], row["longitude"]

        if pd.isna(lat) or pd.isna(lon):
            hubs_skipped += 1
            print(f"  [SKIP] {hub_name!r} -> missing coordinates")
            continue

        coord_by_hub[hub_name] = (lat, lon)
        color = HUB_TYPE_COLORS.get(row["hub_type"], "gray")
        short_name = hub_name.split(" (")[0]

        popup_html = (
            f"<b>{hub_name}</b><br/>"
            f"City: {row['city']}<br/>"
            f"Hub type: {row['hub_type']}<br/>"
            f"State: {row['state']}"
        )

        folium.CircleMarker(
            location=(lat, lon),
            radius=7,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.85,
            weight=1.5,
            popup=folium.Popup(popup_html, max_width=300),
            tooltip=short_name,
        ).add_to(fmap)
        markers_plotted += 1

    min_trips = edges["trip_count"].min()
    max_trips = edges["trip_count"].max()

    lines_drawn = 0
    lines_skipped = 0

    for _, row in edges.iterrows():
        src, dst = row["source_name"], row["destination_name"]
        if src not in coord_by_hub or dst not in coord_by_hub:
            lines_skipped += 1
            continue

        trips = row["trip_count"]
        weight = scale(trips, min_trips, max_trips, MIN_WEIGHT, MAX_WEIGHT)
        opacity = scale(trips, min_trips, max_trips, MIN_OPACITY, MAX_OPACITY)

        tooltip_text = (
            f"{src.split(' (')[0]} &rarr; {dst.split(' (')[0]}<br/>"
            f"Distance: {row['avg_distance_km']:.2f} km<br/>"
            f"Time: {row['avg_time_min']:.1f} min<br/>"
            f"Trips observed: {trips}"
        )

        folium.PolyLine(
            locations=[coord_by_hub[src], coord_by_hub[dst]],
            color="#3366cc",
            weight=weight,
            opacity=opacity,
            tooltip=tooltip_text,
            popup=folium.Popup(tooltip_text, max_width=250),
        ).add_to(fmap)
        lines_drawn += 1

    fmap.get_root().html.add_child(folium.Element(LEGEND_HTML))

    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    fmap.save(str(OUTPUT_HTML))

    print("=== Summary ===")
    print(f"Markers plotted: {markers_plotted}")
    print(f"Hubs skipped (missing coordinates): {hubs_skipped}")
    print(f"Route lines drawn: {lines_drawn}")
    print(f"Route lines skipped (endpoint missing coordinates): {lines_skipped}")
    if hubs_skipped == 0:
        print("Confirmed: no hub was skipped due to missing coordinates.")
    print(f"Saved map to: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()
