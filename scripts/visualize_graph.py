"""Render data/telangana_graph.graphml as an interactive pyvis HTML visualization."""
from pathlib import Path

import networkx as nx
from pyvis.network import Network

BASE_DIR = Path(__file__).resolve().parent.parent
GRAPH_PATH = BASE_DIR / "data" / "telangana_graph.graphml"
OUTPUT_HTML = BASE_DIR / "data" / "telangana_graph_visual.html"

RED = "#e74c3c"     # major hub
YELLOW = "#f39c12"  # regional hub
BLUE = "#3498db"    # spoke / local hub

MIN_NODE_SIZE, MAX_NODE_SIZE = 15, 60
MIN_EDGE_WIDTH, MAX_EDGE_WIDTH = 1, 10


def tier_color(degree: int) -> str:
    if degree >= 10:
        return RED
    if degree >= 4:
        return YELLOW
    return BLUE


def short_label(city: str, facility_code: str) -> str:
    if facility_code:
        return f"{city}_{facility_code}"
    return city


def scale(value, lo, hi, out_lo, out_hi):
    if hi <= lo:
        return (out_lo + out_hi) / 2
    return out_lo + (value - lo) / (hi - lo) * (out_hi - out_lo)


LEGEND_HTML = """
<div style="background-color:#111111;color:#ffffff;font-family:Arial,Helvetica,sans-serif;
            padding:16px 24px;border-bottom:1px solid #333;">
  <h2 style="margin:0 0 6px 0;">Telangana Shipment Hub Network</h2>
  <div style="font-size:14px;line-height:1.6;">
    Node size = connectivity (in-degree + out-degree). Edge thickness = observed trip count.
    <br/>
    <span style="color:%s;font-weight:bold;">&#9679; Red</span> — Major hub (degree &ge; 10) &nbsp;&nbsp;
    <span style="color:%s;font-weight:bold;">&#9679; Yellow</span> — Regional hub (degree 4&ndash;9) &nbsp;&nbsp;
    <span style="color:%s;font-weight:bold;">&#9679; Blue</span> — Spoke / local hub (degree &lt; 4)
  </div>
</div>
""" % (RED, YELLOW, BLUE)


def main():
    graph = nx.read_graphml(GRAPH_PATH)

    degrees = dict(graph.degree())
    min_deg = min(degrees.values())
    max_deg = max(degrees.values())

    trip_counts = [d.get("trips", 1) for _, _, d in graph.edges(data=True)]
    min_trips, max_trips = min(trip_counts), max(trip_counts)

    net = Network(
        directed=True,
        bgcolor="#111111",
        font_color="white",
        height="900px",
        width="100%",
        select_menu=True,
        filter_menu=True,
        cdn_resources="in_line",
    )
    net.barnes_hut(gravity=-3000, central_gravity=0.3, spring_length=150, spring_strength=0.01, damping=0.09)

    tier_counts = {"red": 0, "yellow": 0, "blue": 0}

    for node, attrs in graph.nodes(data=True):
        degree = degrees[node]
        color = tier_color(degree)
        tier_counts["red" if color == RED else "yellow" if color == YELLOW else "blue"] += 1

        city = attrs.get("city", "")
        facility_code = attrs.get("facility_code", "")
        hub_type = attrs.get("hub_type", "Unknown")

        size = scale(degree, min_deg, max_deg, MIN_NODE_SIZE, MAX_NODE_SIZE)
        label = short_label(city, facility_code)
        title = (
            f"<b>{node}</b><br/>"
            f"Hub type: {hub_type}<br/>"
            f"Degree: {degree} (in+out)"
        )

        net.add_node(node, label=label, title=title, size=size, color=color)

    for source, target, attrs in graph.edges(data=True):
        distance = attrs.get("distance", 0.0)
        time_min = attrs.get("time", 0.0)
        trips = attrs.get("trips", 1)

        width = scale(trips, min_trips, max_trips, MIN_EDGE_WIDTH, MAX_EDGE_WIDTH)
        title = (
            f"Distance: {distance:.2f} km<br/>"
            f"Time: {time_min:.1f} min<br/>"
            f"Trips observed: {trips}"
        )

        net.add_edge(source, target, width=width, title=title, color="#888888")

    net.set_options("""
    {
      "interaction": {"hover": true, "tooltipDelay": 100},
      "edges": {"smooth": {"type": "dynamic"}, "arrows": {"to": {"enabled": true, "scaleFactor": 0.5}}},
      "physics": {"stabilization": {"iterations": 200}}
    }
    """)

    # Build the HTML in memory (rather than net.save_graph, whose internal file write
    # uses the platform default encoding and fails on Windows for inlined JS assets)
    # and inject a title/legend banner at the top of the page.
    html = net.generate_html(notebook=False)
    html = html.replace("<body>", f"<body>\n{LEGEND_HTML}", 1)

    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_HTML.write_text(html, encoding="utf-8")

    print("=== Summary ===")
    print(f"Node count: {graph.number_of_nodes()}")
    print(f"Edge count: {graph.number_of_edges()}")
    print(f"Red (major hub, degree >= 10): {tier_counts['red']}")
    print(f"Yellow (regional hub, degree 4-9): {tier_counts['yellow']}")
    print(f"Blue (spoke/local hub, degree < 4): {tier_counts['blue']}")
    print(f"Saved visualization to: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()
