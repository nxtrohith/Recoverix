"""Filter the Delhivery dataset down to intra-Telangana trips and build edge/node tables."""
import re
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = BASE_DIR / "delhivery_data.csv"
EDGES_CSV = BASE_DIR / "data" / "telangana_edges.csv"
NODES_CSV = BASE_DIR / "data" / "telangana_nodes.csv"

HUB_TYPE_MAP = {
    "H": "Hub",
    "I": "Intermediate",
    "D": "Delivery",
    "DC": "Distribution Center",
    "C": "Collection",
}


def parse_hub_name(hub_name: str) -> dict:
    """Parse a hub string like 'Hyderabad_Shamshbd_H (Telangana)' into components."""
    match = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", hub_name)
    if match:
        name_part, state = match.group(1), match.group(2)
    else:
        name_part, state = hub_name, ""

    parts = name_part.split("_")
    # Trailing numeric variant suffix (e.g. "..._D_1") is not part of the type code.
    if len(parts) > 1 and parts[-1].isdigit():
        parts = parts[:-1]

    city = parts[0] if parts else name_part
    type_code = parts[-1] if len(parts) > 1 else ""
    facility_code = "_".join(parts[1:-1]) if len(parts) > 2 else ""
    hub_type = HUB_TYPE_MAP.get(type_code.upper(), "Unknown")

    return {
        "hub_name": hub_name,
        "city": city,
        "facility_code": facility_code,
        "hub_type": hub_type,
        "state": state,
    }


def main():
    print(f"Loading {RAW_CSV} ...")
    df = pd.read_csv(
        RAW_CSV,
        usecols=[
            "source_name",
            "destination_name",
            "trip_uuid",
            "route_type",
            "actual_distance_to_destination",
            "actual_time",
        ],
    )
    total_raw_rows = len(df)

    df = df.dropna(subset=["source_name", "destination_name"])
    telangana_mask = df["source_name"].str.contains("Telangana", na=False) & df[
        "destination_name"
    ].str.contains("Telangana", na=False)
    tg = df[telangana_mask].copy()
    raw_rows_filtered = len(tg)

    # A single trip_uuid can pass through multiple source_name/destination_name pairs
    # (multi-hop trips via an intermediate hub). Collapse cumulative checkpoints within
    # each (trip_uuid, source_name, destination_name) leg separately, not per trip_uuid alone.
    final_idx = tg.groupby(["trip_uuid", "source_name", "destination_name"])[
        "actual_distance_to_destination"
    ].idxmax()
    legs = tg.loc[final_idx].copy()
    unique_legs = len(legs)

    # Group by (source_name, destination_name) pair across all legs from all trips.
    def collect_route_types(s):
        return sorted(s.unique().tolist())

    edges = (
        legs.groupby(["source_name", "destination_name"])
        .agg(
            avg_distance_km=("actual_distance_to_destination", "mean"),
            avg_time_min=("actual_time", "mean"),
            trip_count=("trip_uuid", "nunique"),
            route_types=("route_type", collect_route_types),
        )
        .reset_index()
    )
    edges["route_types"] = edges["route_types"].apply(lambda lst: "|".join(lst))

    EDGES_CSV.parent.mkdir(parents=True, exist_ok=True)
    edges.to_csv(EDGES_CSV, index=False)

    unique_hubs = sorted(set(edges["source_name"]).union(set(edges["destination_name"])))
    nodes = pd.DataFrame([parse_hub_name(h) for h in unique_hubs])
    nodes.to_csv(NODES_CSV, index=False)

    print("=== Summary ===")
    print(f"Total raw rows filtered (Telangana source & destination): {raw_rows_filtered}")
    print(f"Unique legs after collapsing (trip_uuid, source_name, destination_name max checkpoint): {unique_legs}")
    print(f"Unique hubs: {len(unique_hubs)}")
    print(f"Unique edges (source_name -> destination_name pairs): {len(edges)}")
    print(f"Saved edges to: {EDGES_CSV}")
    print(f"Saved nodes to: {NODES_CSV}")


if __name__ == "__main__":
    main()
