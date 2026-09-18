"""Telangana logistics NetworkX graph layer (MongoDB → in-memory DiGraph)."""

from graph.graph_builder import ValidationReport, build_graph, connect_mongo
from graph.graph_metrics import centrality, summary, top_hubs
from graph.graph_queries import (
    get_neighbors,
    get_node_connectivity,
    shortest_path,
    shortest_path_details,
)
from graph.shipment_state import (
    ShipmentState,
    apply_shipment_event,
    get_shipment_state,
    sync_expected_location,
)
from graph.vehicle_state import (
    VehicleState,
    filter_capable_vehicles,
    get_active_vehicles,
)
from graph.recovery_context import (
    GraphContext,
    RecoveryContext,
    get_recovery_context,
    get_recovery_context_from_state,
)
from graph.candidate_generator import RecoveryCandidate, generate_candidates
from graph.recovery_scorer import (
    DEFAULT_COST_PER_KM,
    DEFAULT_WEIGHTS,
    CandidateMetrics,
    RouteBaseline,
    ScoreBreakdown,
    ScoredCandidate,
    ScoringResult,
    check_feasibility,
    load_route_baselines,
    score_recovery_candidates,
)
from graph.graph_cache import (
    cache_status,
    clear_graph_cache,
    get_graph,
    refresh_graph,
)
from graph.recovery_orchestrator import (
    RecoveryError,
    RecoveryOrchestrator,
    analyze_shipment_recovery,
    print_recovery_summary,
)

__all__ = [
    # Graph builder
    "ValidationReport",
    "build_graph",
    "connect_mongo",
    # Metrics / queries
    "summary",
    "top_hubs",
    "centrality",
    "shortest_path",
    "shortest_path_details",
    "get_neighbors",
    "get_node_connectivity",
    # Shipment state
    "ShipmentState",
    "get_shipment_state",
    "apply_shipment_event",
    "sync_expected_location",
    # Vehicle state
    "VehicleState",
    "get_active_vehicles",
    "filter_capable_vehicles",
    # Recovery context
    "GraphContext",
    "RecoveryContext",
    "get_recovery_context",
    "get_recovery_context_from_state",
    # Candidate generation
    "RecoveryCandidate",
    "generate_candidates",
    # Scoring / optimization
    "DEFAULT_WEIGHTS",
    "DEFAULT_COST_PER_KM",
    "RouteBaseline",
    "CandidateMetrics",
    "ScoreBreakdown",
    "ScoredCandidate",
    "ScoringResult",
    "check_feasibility",
    "load_route_baselines",
    "score_recovery_candidates",
    # Graph cache
    "get_graph",
    "refresh_graph",
    "clear_graph_cache",
    "cache_status",
    # Orchestrator
    "RecoveryError",
    "RecoveryOrchestrator",
    "analyze_shipment_recovery",
    "print_recovery_summary",
]
