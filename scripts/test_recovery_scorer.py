#!/usr/bin/env python3
"""
Recovery scorer checks — piggyback quality ranking + hard constraints.

Covers:
  1. Compatible existing route (pass_through) ranks above a worse detour
  2. Hard rejects: capacity, unreachable, deadline
  3. Weights unchanged from DEFAULT_WEIGHTS
  4. Transparent component scores + explanations
  5. Missing route baseline does not invent detour metrics

Usage:
  uv run python scripts/test_recovery_scorer.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import networkx as nx

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from graph.candidate_generator import RecoveryCandidate
from graph.recovery_scorer import (
    DEFAULT_WEIGHTS,
    RouteBaseline,
    check_feasibility,
    score_recovery_candidates,
)

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
_failures = 0

HYD, NZB, WGL, KRM = "Hyd", "Nizamabad", "Warangal", "Karimnagar"


def check(cond: bool, label: str) -> None:
    global _failures
    if cond:
        print(f"  {PASS} {label}")
    else:
        _failures += 1
        print(f"  {FAIL} {label}")


def _graph() -> nx.DiGraph:
    G = nx.DiGraph()
    edges = [
        (HYD, NZB, 100, 110),
        (NZB, KRM, 120, 130),
        (HYD, WGL, 140, 150),
        (WGL, KRM, 60, 70),
        (NZB, WGL, 90, 100),
    ]
    for u, v, km, mins in edges:
        G.add_edge(u, v, avg_distance_km=km, avg_time_min=mins)
    return G


def _cand(
    *,
    vid: str,
    number: str,
    case: str,
    v_node: str,
    pickup_path: list[str],
    dest_path: list[str],
    detour_km: float = 0.0,
    available_weight: float = 4500.0,
    deadline_hours: float = 12.0,
    capacity_ok: bool = True,
) -> RecoveryCandidate:
    pickup = NZB
    deadline = datetime.now(tz=timezone.utc) + timedelta(hours=deadline_hours)
    return RecoveryCandidate(
        shipment_id="ship-score",
        vehicle_id=vid,
        vehicle_number=number,
        vehicle_type="truck",
        driver_id=vid,
        driver_name=number,
        shipment_current_node=pickup,
        vehicle_current_node=v_node,
        destination_node=KRM,
        pickup_node=pickup,
        pickup_case=case,  # type: ignore[arg-type]
        existing_route_id=f"route-{vid}",
        existing_route_code=f"R-{number}",
        existing_route_nodes=list(dest_path) if case != "detour" else [HYD, WGL, KRM],
        vehicle_to_pickup_path=list(pickup_path),
        vehicle_to_pickup_km=float(detour_km) if case == "detour" else 0.0,
        vehicle_to_pickup_min=None,
        vehicle_to_destination_path=list(dest_path),
        vehicle_to_destination_km=None,
        vehicle_to_destination_min=None,
        pickup_path=list(pickup_path),
        destination_path=list(dest_path),
        detour_distance_km=float(detour_km) if case == "detour" else 0.0,
        available_weight=available_weight,
        available_volume=28.0,
        shipment_weight=100.0,
        shipment_volume=1.0,
        capacity_feasible=capacity_ok and available_weight >= 100.0,
        shipment_priority="high",
        shipment_deadline=deadline,
        estimated_total_min=None,
        estimated_delivery_at=None,
        deadline_feasible=None,
    )


def test_weights_unchanged() -> None:
    print("\nWeights preserved")
    expected = {
        "time": 0.25,
        "cost": 0.15,
        "capacity": 0.15,
        "deadline": 0.20,
        "priority": 0.10,
        "detour": 0.10,
        "connectivity": 0.05,
    }
    check(DEFAULT_WEIGHTS == expected, f"DEFAULT_WEIGHTS={DEFAULT_WEIGHTS}")


def test_pass_through_ranks_above_worse_detour() -> None:
    print("\nCase: compatible existing route ranks above worse detour")
    G = _graph()
    # Similar total travel; pass_through has 0 extra km, detour has large diversion.
    pass_c = _cand(
        vid="v-pass",
        number="TRK-PASS",
        case="pass_through",
        v_node=HYD,
        pickup_path=[HYD, NZB],
        dest_path=[HYD, NZB, KRM],
        detour_km=0.0,
    )
    detour_c = _cand(
        vid="v-det",
        number="TRK-DET",
        case="detour",
        v_node=HYD,
        pickup_path=[HYD, NZB],
        dest_path=[NZB, KRM],
        detour_km=100.0,
    )
    result = score_recovery_candidates(G, [detour_c, pass_c])
    check(result.weights == DEFAULT_WEIGHTS, "result weights == DEFAULT_WEIGHTS")
    check(result.selected_option is not None, "selected option present")
    assert result.selected_option is not None
    check(
        result.selected_option.vehicle_number == "TRK-PASS",
        f"selected={result.selected_option.vehicle_number}",
    )
    check(
        result.selected_option.pickup_case == "pass_through",
        "selected pickup_case=pass_through",
    )

    by_num = {c.vehicle_number: c for c in result.candidates if c.feasible}
    check(
        (by_num["TRK-PASS"].score or 0) > (by_num["TRK-DET"].score or 0),
        f"pass_through score {by_num['TRK-PASS'].score} > detour {by_num['TRK-DET'].score}",
    )
    check(
        by_num["TRK-PASS"].breakdown is not None
        and by_num["TRK-DET"].breakdown is not None
        and by_num["TRK-PASS"].breakdown.detour
        > by_num["TRK-DET"].breakdown.detour,
        "detour component favors pass_through (less additional movement)",
    )
    check(
        "Compatible existing route" in by_num["TRK-PASS"].explanation,
        "explanation mentions compatible existing route",
    )
    check(
        "Why others ranked lower" in result.selection_explanation
        or "diversion" in result.selection_explanation,
        "selection explains why detour ranked lower",
    )
    payload = by_num["TRK-PASS"].to_dict()
    check(payload.get("componentScores") is not None, "componentScores present")
    check(payload.get("totalScore") == by_num["TRK-PASS"].score, "totalScore alias")
    check(payload.get("feasibility") is True, "feasibility alias")


def test_at_node_beats_large_detour() -> None:
    print("\nCase: at_node ranks above large detour when both feasible")
    G = _graph()
    at = _cand(
        vid="v-at",
        number="TRK-AT",
        case="at_node",
        v_node=NZB,
        pickup_path=[NZB],
        dest_path=[NZB, KRM],
        detour_km=0.0,
    )
    det = _cand(
        vid="v-far",
        number="TRK-FAR",
        case="detour",
        v_node=HYD,
        pickup_path=[HYD, NZB],
        dest_path=[NZB, KRM],
        detour_km=100.0,
    )
    result = score_recovery_candidates(G, [det, at])
    assert result.selected_option is not None
    check(
        result.selected_option.vehicle_number == "TRK-AT",
        f"selected={result.selected_option.vehicle_number}",
    )
    check(
        "Already at pickup hub" in result.selected_option.explanation,
        "explanation mentions already at pickup",
    )


def test_hard_reject_capacity() -> None:
    print("\nHard reject: insufficient capacity")
    G = _graph()
    bad = _cand(
        vid="v-cap",
        number="TRK-FULL",
        case="at_node",
        v_node=NZB,
        pickup_path=[NZB],
        dest_path=[NZB, KRM],
        available_weight=10.0,
        capacity_ok=False,
    )
    ok, reason, _, _ = check_feasibility(G, bad)
    check(not ok, "infeasible")
    check(reason == "Insufficient vehicle capacity", f"reason={reason}")
    result = score_recovery_candidates(G, [bad])
    check(result.selected_option is None, "no selection")
    check(result.candidates[0].score is None, "rejected candidate unscored")


def test_hard_reject_deadline() -> None:
    print("\nHard reject: deadline miss")
    G = _graph()
    late = _cand(
        vid="v-late",
        number="TRK-LATE",
        case="detour",
        v_node=HYD,
        pickup_path=[HYD, NZB],
        dest_path=[NZB, KRM],
        detour_km=100.0,
        deadline_hours=0.01,  # ~36 seconds — travel needs hours
    )
    result = score_recovery_candidates(G, [late])
    check(result.selected_option is None, "no selection")
    check(
        result.candidates[0].rejection_reason == "Cannot meet shipment deadline",
        f"reason={result.candidates[0].rejection_reason}",
    )


def test_no_fabricated_baseline_metrics() -> None:
    print("\nMissing route baseline → detour metrics unavailable (not invented)")
    G = _graph()
    c = _cand(
        vid="v-nb",
        number="TRK-NB",
        case="detour",
        v_node=HYD,
        pickup_path=[HYD, NZB],
        dest_path=[NZB, KRM],
        detour_km=100.0,
    )
    # No route_baselines passed
    result = score_recovery_candidates(G, [c], route_baselines={})
    assert result.candidates[0].metrics is not None
    m = result.candidates[0].metrics
    check(m.detour_available is False, "detour_available=False without baseline")
    check(m.detour_distance_km is None, "detour_distance_km not fabricated")

    # With baseline, metrics populate honestly
    baselines = {
        "v-nb": RouteBaseline(
            vehicle_id="v-nb",
            route_id="r1",
            route_code="HYD-WGL-KRM",
            distance_km=200.0,
            duration_min=220.0,
        )
    }
    result2 = score_recovery_candidates(G, [c], route_baselines=baselines)
    m2 = result2.candidates[0].metrics
    assert m2 is not None
    check(m2.detour_available is True, "detour_available with baseline")
    check(m2.detour_distance_km is not None, "detour_distance_km from baseline delta")


def main() -> int:
    print("=" * 62)
    print("  recovery scorer — piggyback quality")
    print("=" * 62)
    test_weights_unchanged()
    test_pass_through_ranks_above_worse_detour()
    test_at_node_beats_large_detour()
    test_hard_reject_capacity()
    test_hard_reject_deadline()
    test_no_fabricated_baseline_metrics()
    print()
    if _failures:
        print(f"{_failures} failure(s)")
        return 1
    print("All checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
