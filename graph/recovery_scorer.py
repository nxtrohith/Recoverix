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
PRIORITY_URGENCY: dict[str, float] = {
    "critical": 1.0,
    "high": 0.85,
    "normal": 0.55,
    "low": 0.35,
}


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

    def to_dict(self) -> dict[str, Any]:
        """JSON-serialisable representation matching the SH-205 result shape."""
        out: dict[str, Any] = {
            "candidateId": self.candidate_id,
            "vehicleId": self.vehicle_id,
            "vehicleNumber": self.vehicle_number,
            "pickupCase": self.pickup_case,
            "path": self.path,
            "feasible": self.feasible,
            "rejectionReason": self.rejection_reason,
            "score": self.score,
            "explanation": self.explanation,
            "factorsHelped": self.factors_helped,
            "factorsHurt": self.factors_hurt,
        }
        if self.breakdown is not None:
            out["breakdown"] = {
                "time": round(self.breakdown.time, 4),
                "cost": round(self.breakdown.cost, 4),
                "capacity": round(self.breakdown.capacity, 4),
                "deadline": round(self.breakdown.deadline, 4),
                "priority": round(self.breakdown.priority, 4),
                "detour": round(self.breakdown.detour, 4),
                "connectivity": round(self.breakdown.connectivity, 4),
            }
        else:
            out["breakdown"] = None

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
    deadline: datetime | None, travel_min: float | None
) -> float | None:
    """Minutes of slack if delivery starts now and takes travel_min."""
    if deadline is None or travel_min is None:
        return None

    est = datetime.now(tz=timezone.utc) + timedelta(minutes=travel_min)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return (deadline - est).total_seconds() / 60.0


def _deadline_buffer_min(
    candidate: RecoveryCandidate, travel_min: float | None = None
) -> float | None:
    """
    Deadline buffer in minutes.

    Prefer recomputed travel_min (full recovery path) when provided so we
    do not inherit over-counted pickup+dest totals from candidate generation.
    """
    if travel_min is not None:
        return _deadline_buffer_from_travel(candidate.shipment_deadline, travel_min)
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
    G: nx.DiGraph, candidate: RecoveryCandidate
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
    # Prefer path-based travel time over candidate.deadline_feasible.
    buffer = _deadline_buffer_min(candidate, travel_min)
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
        deadline_buffer_min=_deadline_buffer_min(candidate, travel_min),
        detour_distance_km=detour_km,
        detour_time_min=detour_min,
        detour_available=detour_available,
        connectivity_degree=degree,
        connectivity_centrality=centrality,
        recovery_path=path,
    )


def _norm_higher_better(values: list[float | None], idx: int) -> float:
    """Min-max normalize so larger raw value → score closer to 1."""
    known = [v for v in values if v is not None]
    if not known:
        return 0.5
    lo, hi = min(known), max(known)
    v = values[idx]
    if v is None:
        return 0.5
    if hi == lo:
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
    if hi == lo:
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


def _score_feasible_set(
    candidates: list[RecoveryCandidate],
    metrics_list: list[CandidateMetrics],
    weights: dict[str, float],
) -> list[tuple[float, ScoreBreakdown, list[str], list[str]]]:
    """Return (total, breakdown, helped, hurt) for each feasible candidate."""
    times = [m.travel_time_min for m in metrics_list]
    costs = [m.cost for m in metrics_list]
    buffers = [m.deadline_buffer_min for m in metrics_list]
    # Capacity headroom ratio (weight-focused, volume as tie-breaker blend)
    cap_ratios: list[float | None] = []
    for c in candidates:
        need_w = max(c.shipment_weight, 1e-9)
        need_v = max(c.shipment_volume, 1e-9)
        ratio = 0.7 * (c.available_weight / need_w) + 0.3 * (
            c.available_volume / need_v
        )
        cap_ratios.append(ratio)

    detours: list[float | None] = []
    for m in metrics_list:
        if m.detour_available and m.detour_distance_km is not None:
            detours.append(m.detour_distance_km)
        else:
            detours.append(None)

    connectivities = [m.connectivity_centrality for m in metrics_list]

    results = []
    for i, c in enumerate(candidates):
        time_s = _norm_lower_better(times, i)
        cost_s = _norm_lower_better(costs, i)
        cap_s = _norm_higher_better(cap_ratios, i)
        # Missing deadline → neutral 0.5 (feasibility already passed)
        if buffers[i] is None:
            deadline_s = 0.5
        else:
            deadline_s = _norm_higher_better(buffers, i)
        # Missing detour baseline → neutral (do not invent)
        if detours[i] is None:
            detour_s = 0.5
        else:
            detour_s = _norm_lower_better(detours, i)
        conn_s = _norm_higher_better(connectivities, i)
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
        # Helped / hurt relative to mid-point, weighted by importance.
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
    if h:
        return f"{h}h {m}m"
    return f"{m}m"


def _build_explanation(
    candidate: RecoveryCandidate,
    metrics: CandidateMetrics,
    breakdown: ScoreBreakdown,
    helped: list[str],
    hurt: list[str],
) -> str:
    """Deterministic plain-language explanation from score components."""
    parts: list[str] = []
    vlabel = candidate.vehicle_number or candidate.vehicle_id

    parts.append(
        f"Vehicle {vlabel} ({candidate.pickup_case.replace('_', ' ')}) "
        f"provides {metrics.available_capacity_weight:.0f} kg / "
        f"{metrics.available_capacity_volume:.1f} m³ available capacity"
    )

    if metrics.deadline_buffer_min is not None:
        buf = int(round(metrics.deadline_buffer_min))
        parts.append(
            f"reaches the destination with a {buf}-minute deadline buffer"
            if buf >= 0
            else "is estimated past the deadline"
        )
    elif candidate.shipment_deadline is None:
        parts.append("has no shipment deadline to enforce")

    if metrics.detour_available and metrics.detour_distance_km is not None:
        if metrics.detour_distance_km < 1:
            parts.append("requires essentially no detour vs its normal route")
        else:
            detour_t = (
                f" / {_fmt_min(metrics.detour_time_min)}"
                if metrics.detour_time_min is not None
                else ""
            )
            parts.append(
                f"requires a {metrics.detour_distance_km:.1f} km{detour_t} detour"
            )
    else:
        parts.append("has no normal-route baseline for detour comparison")

    if metrics.connectivity_degree is not None:
        hub = candidate.shipment_current_node
        parts.append(
            f"picks up at hub '{hub}' with degree {metrics.connectivity_degree} "
            f"(centrality {metrics.connectivity_centrality:.3f})"
        )

    if helped:
        parts.append(f"strongest factors: {', '.join(helped[:3])}")
    if hurt:
        parts.append(f"weakest factors: {', '.join(hurt[:3])}")

    # Join into 1–2 readable sentences.
    if len(parts) == 1:
        return parts[0] + "."
    if len(parts) == 2:
        return f"{parts[0]}, {parts[1]}."
    return f"{parts[0]}, " + ", ".join(parts[1:-1]) + f", and {parts[-1]}."


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

    shipment_id = candidates[0].shipment_id if candidates else "unknown"

    scored: list[ScoredCandidate] = []
    feasible_raw: list[RecoveryCandidate] = []
    feasible_metrics: list[CandidateMetrics] = []
    feasible_indices: list[int] = []

    # Pass 1 — feasibility + metrics for feasible set
    for cand in candidates:
        cid = candidate_id_for(cand)
        ok, reason, recovery_path, travel_min = check_feasibility(G, cand)
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
                cand, sc.metrics, breakdown, helped, hurt
            )

    # Select highest-scoring feasible candidate
    feasible_scored = [c for c in scored if c.feasible and c.score is not None]
    selected: ScoredCandidate | None = None
    if feasible_scored:
        selected = max(feasible_scored, key=lambda c: c.score or 0.0)
        selection_explanation = (
            f"Selected {selected.vehicle_number or selected.vehicle_id} "
            f"(score={selected.score:.4f}) because it has the highest "
            f"weighted score among {len(feasible_scored)} feasible candidate(s). "
            f"{selected.explanation}"
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
