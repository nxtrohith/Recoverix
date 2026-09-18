"""Build a directed hub graph from the Telangana edges/nodes tables and save as GraphML."""
from pathlib import Path

import networkx as nx
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
EDGES_CSV = BASE_DIR / "data" / "telangana_edges.csv"
NODES_CSV = BASE_DIR / "data" / "telangana_nodes.csv"
GRAPH_PATH = BASE_DIR / "data" / "telangana_graph.graphml"


def main():
    edges = pd.read_csv(EDGES_CSV)
    nodes = pd.read_csv(NODES_CSV).fillna("")

    graph = nx.DiGraph()

    for _, row in edges.iterrows():
        graph.add_edge(
            row["source_name"],
            row["destination_name"],
            distance=float(row["avg_distance_km"]),
            time=float(row["avg_time_min"]),
            trips=int(row["trip_count"]),
        )

    node_attrs = nodes.set_index("hub_name")[["city", "facility_code", "hub_type", "state"]].to_dict("index")
    nx.set_node_attributes(graph, node_attrs)

    GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
    nx.write_graphml(graph, GRAPH_PATH)

    self_loops = list(nx.selfloop_edges(graph))
    duplicate_edges = len(edges) - edges.drop_duplicates(subset=["source_name", "destination_name"]).shape[0]

    degrees = sorted(graph.degree(), key=lambda x: x[1], reverse=True)[:5]

    print("=== Summary ===")
    print(f"Node count: {graph.number_of_nodes()}")
    print(f"Edge count: {graph.number_of_edges()}")
    print("Top 5 hubs by degree:")
    for hub, deg in degrees:
        print(f"  {hub}: degree {deg}")
    print(f"Self-loops: {len(self_loops)} ({'none' if not self_loops else self_loops})")
    print(f"Duplicate (source, destination) rows in edges CSV: {duplicate_edges}")
    print(f"Saved graph to: {GRAPH_PATH}")


if __name__ == "__main__":
    main()
