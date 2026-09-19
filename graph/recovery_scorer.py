"""
Recovery scoring / optimization engine.

OPTIMIZATION layer — takes raw RecoveryCandidate objects and:

  1. Filters clearly infeasible candidates (with rejection reasons)
  2. Scores feasible candidates with configurable weighted components
  3. Selects the highest-scoring feasible option
  4. Produces deterministic, explainable breakdowns

Does NOT persist to MongoDB, call an LLM, or use ML/OR libraries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import networkx as nx

from graph.candidate_generator import RecoveryCandidate


# ---------------------------------------------------------------------------
# Configurable defaults (easy to tweak for demos)
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS: dict[str, float] = {
    "time": 0.25,
    "cost": 0.15,
    "capacity": 0.15,
    "deadline": 0.20,
    "priority": 0.10,
    "detour": 0.10,
    "connectivity": 0.05,
}

# Transparent cost proxy — edge data has no INR cost yet.
DEFAULT_COST_PER_KM: float = 28.0

# Priority → how strongly we reward fast / buffered options.
# Keys cover both schema values (urgent/medium) and legacy aliases.
PRIORITY_URGENCY: dict[str, float] = {
    "critical": 1.0,
    "urgent": 1.0,
    "high": 0.85,
    "medium": 0.55,
    "normal": 0.55,
    "low": 0.35,
}

# Soften connectivity component so it stays a minor tie-breaker
# (weight is already 0.05; compress variance toward neutral 0.5).
_CONNECTIVITY_BLEND: float = 0.4



# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RouteBaseline:
    """
    Vehicle's normal/planned route metrics from MongoDB (Route collection).

    Used only for detour comparison.  If a vehicle has no currentRoute or
    the route lacks distance/duration, leave these as None — do not invent.
    """

    vehicle_id: str
    route_id: str | None
    route_code: str | None
    distance_km: float | None
    duration_min: float | None


@dataclass
class ScoreBreakdown:
    time: float
    cost: float
    capacity: float
    deadline: float
    priority: float
    detour: float
    connectivity: float


@dataclass
class CandidateMetrics:
    distance_km: float | None
    travel_time_min: float | None
    cost: float | None
    available_capacity_weight: float
    available_capacity_volume: float
    deadline_buffer_min: float | None
    detour_distance_km: float | None
    detour_time_min: float | None
    detour_available: bool
    connectivity_degree: int | None
    connectivity_centrality: float | None
    recovery_path: list[str]


@dataclass
class ScoredCandidate:
    candidate_id: str
    vehicle_id: str
    vehicle_number: str
    pickup_case: str
    path: list[str]
    feasible: bool
    rejection_reason: str | None
    score: float | None
    breakdown: ScoreBreakdown | None
    metrics: CandidateMetrics | None
    explanation: str
    factors_helped: list[str] = field(default_factory=list)
    factors_hurt: list[str] = field(default_factory=list)
    # Path segments from candidate_generator — map/UI only; not recomputed here.
    existing_route_nodes: list[str] = field(default_factory=list)
    vehicle_to_pickup_path: list[str] = field(default_factory=list)
    vehicle_to_destination_path: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """JSON-serialisable representation matching the Recoverix result shape."""
        out: dict[str, Any] = {
            "candidateId": self.candidate_id,
            "vehicleId": self.vehicle_id,
            "vehicleNumber": self.vehicle_number,
            "pickupCase": self.pickup_case,
            "path": self.path,
            "feasible": self.feasible,
            "feasibility": self.feasible,
            "rejectionReason": self.rejection_reason,
            "score": self.score,
            "totalScore": self.score,
            "explanation": self.explanation,
            "factorsHelped": self.factors_helped,
            "factorsHurt": self.factors_hurt,
            "existingRouteNodes": list(self.existing_route_nodes),
            "vehicleToPickupPath": list(self.vehicle_to_pickup_path),
            "vehicleToDestinationPath": list(self.vehicle_to_destination_path),
        }
        if self.breakdown is not None:
            component_scores = {
                "time": round(self.breakdown.time, 4),
                "cost": round(self.breakdown.cost, 4),
                "capacity": round(self.breakdown.capacity, 4),
                "deadline": round(self.breakdown.deadline, 4),
                "priority": round(self.breakdown.priority, 4),
                "detour": round(self.breakdown.detour, 4),
                "connectivity": round(self.breakdown.connectivity, 4),
            }
            out["breakdown"] = component_scores
            out["componentScores"] = component_scores
        else:
            out["breakdown"] = None
            out["componentScores"] = None

        if self.metrics is not None:
            m = self.metrics
            out["metrics"] = {
                "distance": m.distance_km,
                "travelTime": m.travel_time_min,
                "cost": m.cost,
                "availableCapacity": {
                    "weight": m.available_capacity_weight,
                    "volume": m.available_capacity_volume,
                },
                "deadlineBuffer": m.deadline_buffer_min,
                "detourDistanceKm": m.detour_distance_km,
                "detourTimeMin": m.detour_time_min,
                "detourAvailable": m.detour_available,
                "connectivityDegree": m.connectivity_degree,
                "connectivityCentrality": m.connectivity_centrality,
            }
        else:
            out["metrics"] = None
        return out


@dataclass
class ScoringResult:
    shipment_id: str
    weights: dict[str, float]
    candidates: list[ScoredCandidate]
    selected_option: ScoredCandidate | None
    selection_explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "shipmentId": self.shipment_id,
            "weights": self.weights,
            "candidates": [c.to_dict() for c in self.candidates],
            "selectedOption": (
                self.selected_option.to_dict() if self.selected_option else None
            ),
            "selectionExplanation": self.selection_explanation,
        }


# ---------------------------------------------------------------------------
# Path / metric helpers
# ---------------------------------------------------------------------------

def _path_weight(G: nx.DiGraph, path: list[str], weight: str) -> float | None:
    if len(path) < 2:
        return 0.0 if len(path) == 1 else None
    try:
        return float(nx.path_weight(G, path, weight=weight))
    except Exception:
        return None


def _shortest(G: nx.DiGraph, src: str, dst: str) -> list[str]:
    try:
        return list(nx.shortest_path(G, src, dst, weight="avg_distance_km"))
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


def _compose_recovery_path(
    G: nx.DiGraph, candidate: RecoveryCandidate
) -> list[str]:
    """
    Full recovery movement: vehicle → pickup → destination.

    Reuses candidate path segments when they already form a valid chain;
    otherwise recomputes shortest segments on the graph.
    """
    v = candidate.vehicle_current_node
    pickup = candidate.shipment_current_node
    dest = candidate.destination_node

    if pickup is None:
        # No known pickup — fall back to vehicle → destination only.
        return list(candidate.vehicle_to_destination_path) or _shortest(G, v, dest)

    if candidate.pickup_case == "at_node":
        # Already at pickup; destination leg is vehicle→dest.
        path = list(candidate.vehicle_to_destination_path)
        if path and path[0] == pickup:
            return path
        return _shortest(G, pickup, dest)

    if candidate.pickup_case == "pass_through":
        # Destination path already visits the pickup node.
        path = list(candidate.vehicle_to_destination_path)
        if pickup in path:
            return path
        # Fallback: stitch vehicle→pickup + pickup→dest.
        a = list(candidate.vehicle_to_pickup_path) or _shortest(G, v, pickup)
        b = _shortest(G, pickup, dest)
        if a and b:
            return a + b[1:]
        return []

    # detour / none: stitch vehicle→pickup + pickup→dest (avoid double-counting).
    to_pickup = list(candidate.vehicle_to_pickup_path) or _shortest(G, v, pickup)
    to_dest = _shortest(G, pickup, dest)
    if not to_pickup or not to_dest:
        return []
    if to_pickup[-1] != to_dest[0]:
        return []
    return to_pickup + to_dest[1:]


def _deadline_buffer_from_travel(
    deadline: datetime | None,
    travel_min: float | None,
    *,
    now: datetime | None = None,
) -> float | None:
    """Minutes of slack if delivery starts at ``now`` and takes travel_min."""
    if deadline is None or travel_min is None:
        return None

    origin = now or datetime.now(tz=timezone.utc)
    if origin.tzinfo is None:
        origin = origin.replace(tzinfo=timezone.utc)
    est = origin + timedelta(minutes=travel_min)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return (deadline - est).total_seconds() / 60.0


def _deadline_buffer_min(
    candidate: RecoveryCandidate,
    travel_min: float | None = None,
    *,
    now: datetime | None = None,
) -> float | None:
    """
    Deadline buffer in minutes.

    Prefer recomputed travel_min (full recovery path) when provided so we
    do not inherit over-counted pickup+dest totals from candidate generation.
    """
    if travel_min is not None:
        return _deadline_buffer_from_travel(
            candidate.shipment_deadline, travel_min, now=now
        )
    if candidate.shipment_deadline is None or candidate.estimated_delivery_at is None:
        return None
    deadline = candidate.shipment_deadline
    est = candidate.estimated_delivery_at
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if est.tzinfo is None:
        est = est.replace(tzinfo=timezone.utc)
    return (deadline - est).total_seconds() / 60.0


def _hub_connectivity(
    G: nx.DiGraph, hub: str | None
) -> tuple[int | None, float | None, int]:
    """
    Return (degree, degree_centrality, reachable_neighbor_count).

    Neighbor count = unique successors ∪ predecessors (1-hop flexibility).
    """
    if hub is None or hub not in G:
        return None, None, 0
    degree = int(G.degree(hub))
    n = max(G.number_of_nodes(), 1)
    # degree_centrality for DiGraph is (in+out)/(n-1)
    centrality = degree / max(n - 1, 1)
    neighbors = set(G.successors(hub)) | set(G.predecessors(hub))
    return degree, centrality, len(neighbors)


def candidate_id_for(candidate: RecoveryCandidate) -> str:
    return (
        f"{candidate.shipment_id}:"
        f"{candidate.vehicle_id}:"
        f"{candidate.pickup_case}"
    )


# ---------------------------------------------------------------------------
# Feasibility
# ---------------------------------------------------------------------------

def check_feasibility(
    G: nx.DiGraph,
    candidate: RecoveryCandidate,
    *,
    now: datetime | None = None,
) -> tuple[bool, str | None, list[str], float | None]:
    """
    Hard filters.  Rejected candidates are not scored.

    Returns (feasible, rejection_reason, recovery_path, travel_min).
    """
    if not candidate.capacity_feasible:
        return False, "Insufficient vehicle capacity", [], None

    if candidate.shipment_current_node is None:
        return False, "Invalid shipment location (unknown graph node)", [], None

    if candidate.shipment_current_node not in G:
        return False, "Invalid shipment location (node not in graph)", [], None

    if candidate.vehicle_current_node not in G:
        return False, "Invalid vehicle location (node not in graph)", [], None

    if candidate.destination_node not in G:
        return False, "Invalid destination (node not in graph)", [], None

    if candidate.pickup_case == "none":
        return False, "Impossible/missing route (pickup path unknown)", [], None

    recovery_path = _compose_recovery_path(G, candidate)
    if not recovery_path:
        return False, "Invalid graph path (no recovery route)", [], None

    if (
        len(recovery_path) < 2
        and candidate.shipment_current_node != candidate.destination_node
    ):
        return False, "Invalid graph path (incomplete recovery route)", [], None

    travel_min = _path_weight(G, recovery_path, "avg_time_min")

    # Deadline: cannot meet → reject (not merely low score).
    buffer = _deadline_buffer_min(candidate, travel_min, now=now)
    if buffer is not None and buffer < 0:
        return False, "Cannot meet shipment deadline", recovery_path, travel_min
    if buffer is None and candidate.deadline_feasible is False:
        return False, "Cannot meet shipment deadline", recovery_path, travel_min

    return True, None, recovery_path, travel_min


# ---------------------------------------------------------------------------
# Metrics + scoring
# ---------------------------------------------------------------------------

def _compute_metrics(
    G: nx.DiGraph,
    candidate: RecoveryCandidate,
    route_baseline: RouteBaseline | None,
    cost_per_km: float,
    recovery_path: list[str] | None = None,
    travel_min: float | None = None,
    *,
    now: datetime | None = None,
) -> CandidateMetrics:
    path = recovery_path or _compose_recovery_path(G, candidate)
    dist = _path_weight(G, path, "avg_distance_km")
    if travel_min is None:
        travel_min = _path_weight(G, path, "avg_time_min")

    cost = (dist * cost_per_km) if dist is not None else None

    # Detour vs normal route — only when DB baseline exists.
    detour_available = False
    detour_km: float | None = None
    detour_min: float | None = None
    if (
        route_baseline is not None
        and route_baseline.distance_km is not None
        and dist is not None
    ):
        detour_available = True
        detour_km = max(0.0, dist - route_baseline.distance_km)
        if route_baseline.duration_min is not None and travel_min is not None:
            detour_min = max(0.0, travel_min - route_baseline.duration_min)
        else:
            detour_min = None  # distance known, time baseline missing
    # else: leave unavailable — do not fabricate a "normal" route

    degree, centrality, _ = _hub_connectivity(G, candidate.shipment_current_node)

    return CandidateMetrics(
        distance_km=dist,
        travel_time_min=travel_min,
        cost=cost,
        available_capacity_weight=candidate.available_weight,
        available_capacity_volume=candidate.available_volume,
        deadline_buffer_min=_deadline_buffer_min(candidate, travel_min, now=now),
        detour_distance_km=detour_km,
        detour_time_min=detour_min,
        detour_available=detour_available,
        connectivity_degree=degree,
        connectivity_centrality=centrality,
        recovery_path=path,
    )


# Treat near-equal raw values as ties so tiny clock/FP noise cannot invert ranks.
_NORM_TIE_EPS: float = 1e-6


def _norm_higher_better(values: list[float | None], idx: int) -> float:
    """Min-max normalize so larger raw value → score closer to 1."""
    known = [v for v in values if v is not None]
    if not known:
        return 0.5
    lo, hi = min(known), max(known)
    v = values[idx]
    if v is None:
        return 0.5
    if hi - lo <= _NORM_TIE_EPS:
        return 1.0
    return (v - lo) / (hi - lo)


def _norm_lower_better(values: list[float | None], idx: int) -> float:
    """Min-max normalize so smaller raw value → score closer to 1."""
    known = [v for v in values if v is not None]
    if not known:
        return 0.5
    lo, hi = min(known), max(known)
    v = values[idx]
    if v is None:
        return 0.5
    if hi - lo <= _NORM_TIE_EPS:
        return 1.0
    return (hi - v) / (hi - lo)


def _priority_component(
    candidate: RecoveryCandidate,
    time_score: float,
    deadline_score: float,
) -> float:
    """
    Priority is a shipment property, but ranking still needs differentiation.

    Urgent shipments reward candidates that are already strong on time +
    deadline buffer.  Low-priority shipments get a milder blend so cost/
    capacity can compete more fairly.
    """
    urgency = PRIORITY_URGENCY.get(
        (candidate.shipment_priority or "normal").lower(), 0.55
    )
    # Blend: urgent → almost entirely time/deadline; low → more neutral base.
    quality = 0.6 * time_score + 0.4 * deadline_score
    return urgency * quality + (1.0 - urgency) * 0.55


def _additional_movement_km(
    candidate: RecoveryCandidate, metrics: CandidateMetrics
) -> float | None:
    """
    Extra km beyond an existing compatible movement.

    Prefer RouteBaseline-derived detour when available (never invent a
    baseline). Otherwise use candidate piggyback facts:

      at_node / pass_through → 0 additional km
      detour                 → candidate.detour_distance_km / pickup leg

    Returns None only when no honest signal exists → neutral component.
    """
    if metrics.detour_available and metrics.detour_distance_km is not None:
        return float(metrics.detour_distance_km)

    if candidate.pickup_case in ("at_node", "pass_through"):
        return float(candidate.detour_distance_km or 0.0)

    if candidate.detour_distance_km is not None:
        return float(candidate.detour_distance_km)
    if candidate.vehicle_to_pickup_km is not None:
        return float(candidate.vehicle_to_pickup_km)
    return None


def _capacity_headroom_ratio(candidate: RecoveryCandidate) -> float:
    """Higher residual capacity relative to shipment need is better."""
    need_w = max(candidate.shipment_weight, 1e-9)
    need_v = max(candidate.shipment_volume, 1e-9)
    return 0.7 * (candidate.available_weight / need_w) + 0.3 * (
        candidate.available_volume / need_v
    )


def _usable_capacity_pct(candidate: RecoveryCandidate) -> float | None:
    """Residual capacity remaining after loading this shipment (weight)."""
    free = max(0.0, candidate.available_weight)
    if free <= 0:
        return None
    after = max(0.0, free - candidate.shipment_weight)
    return 100.0 * after / free


def _soften_connectivity(raw: float) -> float:
    """Pull connectivity toward 0.5 so it cannot dominate route compatibility."""
    return 0.5 + _CONNECTIVITY_BLEND * (raw - 0.5)


def _score_feasible_set(
    candidates: list[RecoveryCandidate],
    metrics_list: list[CandidateMetrics],
    weights: dict[str, float],
) -> list[tuple[float, ScoreBreakdown, list[str], list[str]]]:
    """Return (total, breakdown, helped, hurt) for each feasible candidate."""
    times = [m.travel_time_min for m in metrics_list]
    costs = [m.cost for m in metrics_list]
    buffers = [m.deadline_buffer_min for m in metrics_list]
    cap_ratios = [_capacity_headroom_ratio(c) for c in candidates]
    extras = [
        _additional_movement_km(c, m)
        for c, m in zip(candidates, metrics_list)
    ]
    connectivities = [m.connectivity_centrality for m in metrics_list]

    results = []
    for i, c in enumerate(candidates):
        time_s = _norm_lower_better(times, i)
        cost_s = _norm_lower_better(costs, i)
        cap_s = _norm_higher_better(cap_ratios, i)

        if buffers[i] is None:
            deadline_s = 0.5
        else:
            deadline_s = _norm_higher_better(buffers, i)

        # Missing additional-movement signal → neutral (do not invent baseline)
        if extras[i] is None:
            detour_s = 0.5
        else:
            detour_s = _norm_lower_better(extras, i)

        if connectivities[i] is None:
            conn_s = 0.5
        else:
            conn_s = _soften_connectivity(_norm_higher_better(connectivities, i))

        priority_s = _priority_component(c, time_s, deadline_s)

        breakdown = ScoreBreakdown(
            time=time_s,
            cost=cost_s,
            capacity=cap_s,
            deadline=deadline_s,
            priority=priority_s,
            detour=detour_s,
            connectivity=conn_s,
        )

        total = (
            weights["time"] * time_s
            + weights["cost"] * cost_s
            + weights["capacity"] * cap_s
            + weights["deadline"] * deadline_s
            + weights["priority"] * priority_s
            + weights["detour"] * detour_s
            + weights["connectivity"] * conn_s
        )

        components = {
            "time": time_s,
            "cost": cost_s,
            "capacity": cap_s,
            "deadline": deadline_s,
            "priority": priority_s,
            "detour": detour_s,
            "connectivity": conn_s,
        }
        helped = sorted(
            [k for k, v in components.items() if v >= 0.65],
            key=lambda k: -components[k] * weights[k],
        )
        hurt = sorted(
            [k for k, v in components.items() if v <= 0.35],
            key=lambda k: components[k] * weights[k],
        )
        results.append((total, breakdown, helped, hurt))
    return results


def _fmt_min(v: float | None) -> str:
    if v is None:
        return "unknown time"
    h, m = divmod(int(round(v)), 60)
    if h and m:
        return f"{h}h {m}m"
    if h:
        return f"{h}h"
    return f"{m}m"


def _fmt_buffer_hours(buffer_min: float | None) -> str | None:
    if buffer_min is None:
        return None
    hours = buffer_min / 60.0
    if abs(hours) >= 1:
        return f"{hours:.1f}h"
    return f"{int(round(buffer_min))}m"


def _build_explanation(
    candidate: RecoveryCandidate,
    metrics: CandidateMetrics,
    breakdown: ScoreBreakdown,
    helped: list[str],
    hurt: list[str],
    *,
    score: float | None = None,
) -> str:
    """
    Deterministic explanation answering why this vehicle is a strong
    (or weaker) piggyback recovery option.
    """
    vlabel = candidate.vehicle_number or candidate.vehicle_id
    lines: list[str] = [vlabel]
    if score is not None:
        lines.append(f"Score: {score:.2f}")
    lines.append("")

    case = candidate.pickup_case
    if case == "at_node":
        lines.append("✓ Already at pickup hub")
    elif case == "pass_through":
        lines.append("✓ Compatible existing route")
        route_label = candidate.existing_route_code or candidate.existing_route_id
        if route_label:
            lines.append(f"✓ On route {route_label}")
    elif case == "detour":
        extra = _additional_movement_km(candidate, metrics)
        if extra is not None and extra > 0:
            lines.append(f"△ Requires diversion ({extra:.1f} km extra)")
        else:
            lines.append("△ Requires diversion from current movement")
    else:
        lines.append("△ Pickup path incomplete")

    usable = _usable_capacity_pct(candidate)
    if usable is not None:
        lines.append(f"✓ {usable:.0f}% usable residual capacity after pickup")
    else:
        lines.append(
            f"✓ {metrics.available_capacity_weight:.0f} kg / "
            f"{metrics.available_capacity_volume:.1f} m³ residual capacity"
        )

    buf_label = _fmt_buffer_hours(metrics.deadline_buffer_min)
    if buf_label is not None:
        if (metrics.deadline_buffer_min or 0) >= 0:
            lines.append(f"✓ {buf_label} deadline buffer")
        else:
            lines.append(f"✗ Past deadline by {buf_label.lstrip('-')}")
    elif candidate.shipment_deadline is None:
        lines.append("· No shipment deadline to enforce")

    extra = _additional_movement_km(candidate, metrics)
    if extra is not None:
        if extra < 1:
            lines.append("✓ Low additional distance")
        elif case == "detour":
            lines.append(f"△ Additional distance {extra:.1f} km")
        else:
            lines.append(f"· Additional distance {extra:.1f} km")
    elif not metrics.detour_available:
        lines.append("· No normal-route baseline for detour comparison")

    if metrics.travel_time_min is not None:
        lines.append(f"· Estimated recovery travel {_fmt_min(metrics.travel_time_min)}")

    if helped:
        lines.append(f"· Strongest score factors: {', '.join(helped[:3])}")
    if hurt:
        lines.append(f"· Weakest score factors: {', '.join(hurt[:3])}")

    return "\n".join(lines)


def _contrast_reason(
    selected: ScoredCandidate,
    other: ScoredCandidate,
) -> str:
    """One short clause explaining why selected ranked above other."""
    if not other.feasible:
        return f"{other.vehicle_number} rejected ({other.rejection_reason})"
    if selected.breakdown is None or other.breakdown is None:
        return f"higher total score than {other.vehicle_number}"

    if (
        selected.pickup_case in ("at_node", "pass_through")
        and other.pickup_case == "detour"
    ):
        return (
            f"{other.vehicle_number} needs a larger diversion while "
            f"{selected.vehicle_number} uses an existing compatible movement"
        )

    deltas = {
        "time": selected.breakdown.time - other.breakdown.time,
        "cost": selected.breakdown.cost - other.breakdown.cost,
        "capacity": selected.breakdown.capacity - other.breakdown.capacity,
        "deadline": selected.breakdown.deadline - other.breakdown.deadline,
        "detour": selected.breakdown.detour - other.breakdown.detour,
        "priority": selected.breakdown.priority - other.breakdown.priority,
    }
    best = max(deltas, key=deltas.get)
    if deltas[best] <= 0.02:
        return f"higher weighted total than {other.vehicle_number}"
    labels = {
        "time": "faster recovery",
        "cost": "lower recovery cost",
        "capacity": "more residual capacity",
        "deadline": "larger deadline buffer",
        "detour": "less additional movement",
        "priority": "better priority fit",
    }
    return f"{labels[best]} than {other.vehicle_number}"


def _build_selection_explanation(
    selected: ScoredCandidate,
    feasible_scored: list[ScoredCandidate],
) -> str:
    others = [
        c for c in feasible_scored if c.candidate_id != selected.candidate_id
    ]
    header = (
        f"Selected {selected.vehicle_number or selected.vehicle_id} "
        f"(score={selected.score:.4f}) as the best piggyback option among "
        f"{len(feasible_scored)} feasible candidate(s)."
    )
    if not others:
        return f"{header}\n\n{selected.explanation}"

    ranked = sorted(others, key=lambda c: -(c.score or 0.0))
    contrasts = [_contrast_reason(selected, o) for o in ranked[:3]]
    why_lower = " Why others ranked lower: " + "; ".join(contrasts) + "."
    return f"{header}{why_lower}\n\n{selected.explanation}"


def _normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    missing = [k for k in DEFAULT_WEIGHTS if k not in weights]
    if missing:
        raise ValueError(f"weights missing keys: {missing}")
    total = sum(weights[k] for k in DEFAULT_WEIGHTS)
    if total <= 0:
        raise ValueError("weights must sum to a positive value")
    return {k: weights[k] / total for k in DEFAULT_WEIGHTS}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_recovery_candidates(
    G: nx.DiGraph,
    candidates: list[RecoveryCandidate],
    *,
    weights: dict[str, float] | None = None,
    route_baselines: dict[str, RouteBaseline] | None = None,
    cost_per_km: float = DEFAULT_COST_PER_KM,
) -> ScoringResult:
    """
    Filter, score, and select among recovery candidates.

    Parameters
    ----------
    G :
        Telangana logistics DiGraph.
    candidates :
        Raw candidates from ``generate_candidates``.
    weights :
        Component weights (auto-normalized to sum to 1).  Defaults to
        ``DEFAULT_WEIGHTS``.
    route_baselines :
        Optional map vehicle_id → RouteBaseline for detour comparison.
        Missing entries mark detour as unavailable (not fabricated).
    cost_per_km :
        Transparent INR/km proxy used because edges have no cost attribute.

    Returns
    -------
    ScoringResult
        Full explainable result with ``selected_option`` or null.
    """
    w = _normalize_weights(weights or dict(DEFAULT_WEIGHTS))
    baselines = route_baselines or {}
    # Single clock for the whole scoring pass — avoids tiny now() drift
    # flipping deadline-buffer ranks among otherwise equal candidates.
    now = datetime.now(tz=timezone.utc)

    shipment_id = candidates[0].shipment_id if candidates else "unknown"

    scored: list[ScoredCandidate] = []
    feasible_raw: list[RecoveryCandidate] = []
    feasible_metrics: list[CandidateMetrics] = []
    feasible_indices: list[int] = []

    # Pass 1 — feasibility + metrics for feasible set
    for cand in candidates:
        cid = candidate_id_for(cand)
        ok, reason, recovery_path, travel_min = check_feasibility(
            G, cand, now=now
        )
        route_segments = dict(
            existing_route_nodes=list(cand.existing_route_nodes),
            vehicle_to_pickup_path=list(cand.vehicle_to_pickup_path),
            vehicle_to_destination_path=list(cand.vehicle_to_destination_path),
        )
        if not ok:
            scored.append(
                ScoredCandidate(
                    candidate_id=cid,
                    vehicle_id=cand.vehicle_id,
                    vehicle_number=cand.vehicle_number,
                    pickup_case=cand.pickup_case,
                    path=recovery_path or list(cand.vehicle_to_destination_path),
                    feasible=False,
                    rejection_reason=reason,
                    score=None,
                    breakdown=None,
                    metrics=None,
                    explanation=f"Rejected: {reason}.",
                    **route_segments,
                )
            )
            continue

        baseline = baselines.get(cand.vehicle_id)
        metrics = _compute_metrics(
            G,
            cand,
            baseline,
            cost_per_km,
            recovery_path=recovery_path,
            travel_min=travel_min,
            now=now,
        )
        feasible_indices.append(len(scored))
        feasible_raw.append(cand)
        feasible_metrics.append(metrics)
        # Placeholder — filled after relative normalization
        scored.append(
            ScoredCandidate(
                candidate_id=cid,
                vehicle_id=cand.vehicle_id,
                vehicle_number=cand.vehicle_number,
                pickup_case=cand.pickup_case,
                path=metrics.recovery_path,
                feasible=True,
                rejection_reason=None,
                score=None,
                breakdown=None,
                metrics=metrics,
                explanation="",
                **route_segments,
            )
        )

    # Pass 2 — relative scoring among feasible candidates
    if feasible_raw:
        scored_parts = _score_feasible_set(feasible_raw, feasible_metrics, w)
        for idx, cand, (total, breakdown, helped, hurt) in zip(
            feasible_indices, feasible_raw, scored_parts
        ):
            sc = scored[idx]
            assert sc.metrics is not None
            sc.score = round(total, 6)
            sc.breakdown = breakdown
            sc.factors_helped = helped
            sc.factors_hurt = hurt
            sc.explanation = _build_explanation(
                cand, sc.metrics, breakdown, helped, hurt, score=sc.score
            )

    # Select highest-scoring feasible candidate
    feasible_scored = [c for c in scored if c.feasible and c.score is not None]
    selected: ScoredCandidate | None = None
    if feasible_scored:
        selected = max(feasible_scored, key=lambda c: c.score or 0.0)
        selection_explanation = _build_selection_explanation(
            selected, feasible_scored
        )
    else:
        rejection_summary: dict[str, int] = {}
        for c in scored:
            if c.rejection_reason:
                rejection_summary[c.rejection_reason] = (
                    rejection_summary.get(c.rejection_reason, 0) + 1
                )
        if not candidates:
            selection_explanation = (
                "No recovery candidates were generated for this shipment."
            )
        else:
            reasons = ", ".join(
                f"{reason} ({count})" for reason, count in rejection_summary.items()
            )
            selection_explanation = (
                f"No feasible recovery option. All {len(scored)} candidate(s) "
                f"were rejected. Reasons: {reasons or 'unknown'}."
            )

    # Sort: feasible by score desc, then infeasible
    scored.sort(
        key=lambda c: (
            0 if c.feasible else 1,
            -(c.score or 0.0),
            c.vehicle_number,
        )
    )

    return ScoringResult(
        shipment_id=shipment_id,
        weights=w,
        candidates=scored,
        selected_option=selected,
        selection_explanation=selection_explanation,
    )


def load_route_baselines(
    db: Any, vehicle_ids: list[str]
) -> dict[str, RouteBaseline]:
    """
    Load normal-route distance/duration for vehicles that have currentRoute set.

    Vehicles without a route (or with incomplete route fields) are omitted so
    the scorer marks detour as unavailable rather than inventing values.
    """
    from bson import ObjectId

    if not vehicle_ids:
        return {}

    oids = []
    for vid in vehicle_ids:
        try:
            oids.append(ObjectId(vid))
        except Exception:
            continue

    vehicles = list(
        db["vehicles"].find(
            {"_id": {"$in": oids}},
            {"_id": 1, "currentRoute": 1},
        )
    )
    route_ids = [v["currentRoute"] for v in vehicles if v.get("currentRoute")]
    routes_by_id: dict[Any, dict] = {}
    if route_ids:
        for r in db["routes"].find(
            {"_id": {"$in": route_ids}},
            {
                "_id": 1,
                "routeCode": 1,
                "distanceKm": 1,
                "estimatedDurationMinutes": 1,
            },
        ):
            routes_by_id[r["_id"]] = r

    baselines: dict[str, RouteBaseline] = {}
    for v in vehicles:
        vid = str(v["_id"])
        rid = v.get("currentRoute")
        if rid is None:
            continue
        route = routes_by_id.get(rid)
        if route is None:
            continue
        dist = route.get("distanceKm")
        dur = route.get("estimatedDurationMinutes")
        if dist is None and dur is None:
            continue
        baselines[vid] = RouteBaseline(
            vehicle_id=vid,
            route_id=str(rid),
            route_code=route.get("routeCode"),
            distance_km=float(dist) if dist is not None else None,
            duration_min=float(dur) if dur is not None else None,
        )
    return baselines
