"""
Recoverix explainable recovery judgments (TypeSafe Jev + code assembly).

Hard constraints stay in the scorer/generator. This module:
  - builds structured ``explanationTrace`` steps
  - optionally asks Jev for soft judgments (urgency, selection among top-K)
  - maps typed answers into operator-facing summaries
"""

from __future__ import annotations

import logging
from typing import Any

from graph.services.typesafe_client import (
    ask_system_one,
    judgment_from_choice,
    typesafe_enabled,
)

logger = logging.getLogger(__name__)

# Below this Choice confidence, keep the deterministic score winner.
SELECT_CONFIDENCE_FLOOR = 0.45
TOP_K_SELECT = 5

URGENCY_LABELS = {
    "critical": "Critical — recover immediately before further misrouting",
    "high": "High — prioritize recovery on the next capable vehicle",
    "medium": "Medium — schedule recovery without delaying other high-priority loads",
    "low": "Low — recover when capacity is available",
}


def make_step(
    *,
    step_id: str,
    title: str,
    outcome: str,
    summary: str,
    details: dict[str, Any] | None = None,
    judgments: list[dict[str, Any]] | None = None,
    source: str = "code",
) -> dict[str, Any]:
    step: dict[str, Any] = {
        "id": step_id,
        "title": title,
        "outcome": outcome,
        "summary": summary,
        "source": source,
    }
    if details:
        step["details"] = details
    if judgments:
        step["judgments"] = judgments
    return step


def build_simulate_step(
    *,
    hub_name: str | None,
    expected_name: str | None,
    tracking: str | None,
    vehicle_id: str | None,
    used_nearby_vehicle: bool,
) -> dict[str, Any]:
    """Code + optional Jev urgency judgment for incident simulation."""
    expected = expected_name or "unknown expected hub"
    actual = hub_name or "unknown actual hub"
    summary = (
        f"Shipment {tracking or ''} marked misplaced: expected at {expected}, "
        f"actually at {actual} (recovery pickup). Reason: wrong_hub."
    ).strip()
    details: dict[str, Any] = {
        "reason": "wrong_hub",
        "expectedHub": expected_name,
        "actualHub": hub_name,
        "trackingNumber": tracking,
        "lateDetectionVehicleId": str(vehicle_id) if vehicle_id else None,
        "usedNearbyVehicleFallback": used_nearby_vehicle,
    }

    judgments: list[dict[str, Any]] = []
    source = "code"
    if typesafe_enabled():
        try:
            from typesafe_sdk import Choice

            state = {
                "incident": {
                    "type": "MISPLACED_SHIPMENT",
                    "reason": "wrong_hub",
                    "expectedHub": expected_name,
                    "actualHub": hub_name,
                    "trackingNumber": tracking,
                }
            }
            response = ask_system_one(
                state,
                {
                    "urgency": Choice(
                        instructions=(
                            "Given this misplaced-shipment incident state, "
                            "how urgent is initiating piggyback recovery?"
                        ),
                        criteria={
                            "critical": "Package is actively moving away; immediate action",
                            "high": "Clear hub mismatch; recover on next capable vehicle",
                            "medium": "Mismatch known; can wait briefly for better capacity",
                            "low": "Low operational impact; recover when convenient",
                        },
                    )
                },
            )
            j = judgment_from_choice(response, "urgency")
            if j:
                judgments.append(j)
                label = str(j.get("value") or "")
                urgency_text = URGENCY_LABELS.get(label, f"Urgency judged as {label}")
                summary = f"{summary} {urgency_text}."
                source = "hybrid"
                details["typesafeUrgency"] = label
        except Exception as exc:
            logger.warning("[XAI] simulate urgency judgment failed: %s", exc)

    return make_step(
        step_id="simulate",
        title="Incident simulation",
        outcome="accepted",
        summary=summary,
        details=details,
        judgments=judgments or None,
        source=source,
    )


def build_context_step(
    *,
    active_count: int,
    relevant_count: int,
    excluded: list[dict[str, str]],
    graph_nodes: int,
    graph_edges: int,
) -> dict[str, Any]:
    if relevant_count == 0:
        outcome = "rejected"
        summary = (
            f"No capable vehicles with a known graph location "
            f"({active_count} active checked; {len(excluded)} excluded)."
        )
    else:
        outcome = "accepted"
        summary = (
            f"Recovery context ready: {relevant_count} capable vehicle(s) "
            f"with known location from {active_count} active "
            f"({len(excluded)} excluded). Graph {graph_nodes} nodes / {graph_edges} edges."
        )
    return make_step(
        step_id="context",
        title="Recovery context",
        outcome=outcome,
        summary=summary,
        details={
            "activeVehicles": active_count,
            "relevantVehicles": relevant_count,
            "excludedVehicles": excluded[:40],
            "excludedCount": len(excluded),
            "graphNodes": graph_nodes,
            "graphEdges": graph_edges,
        },
        source="code",
    )


def build_generate_step(
    *,
    candidate_count: int,
    skips: list[dict[str, str]],
) -> dict[str, Any]:
    if candidate_count == 0:
        outcome = "rejected"
        summary = (
            f"No piggyback candidates generated"
            + (f" ({len(skips)} vehicle(s) skipped)." if skips else ".")
        )
    else:
        outcome = "accepted"
        summary = (
            f"Generated {candidate_count} candidate(s); "
            f"{len(skips)} vehicle(s) skipped during classification."
        )
    return make_step(
        step_id="generate",
        title="Candidate generation",
        outcome=outcome,
        summary=summary,
        details={
            "candidateCount": candidate_count,
            "skipped": skips[:40],
            "skippedCount": len(skips),
        },
        source="code",
    )


def build_feasibility_step(scored_candidates: list[Any]) -> dict[str, Any]:
    feasible = [c for c in scored_candidates if getattr(c, "feasible", False)]
    rejected = [c for c in scored_candidates if not getattr(c, "feasible", False)]
    reason_counts: dict[str, int] = {}
    for c in rejected:
        r = getattr(c, "rejection_reason", None) or "Unknown"
        reason_counts[r] = reason_counts.get(r, 0) + 1

    if not scored_candidates:
        outcome = "skipped"
        summary = "Feasibility check skipped — no candidates to evaluate."
    elif not feasible:
        outcome = "rejected"
        parts = [f"{r} ({n})" for r, n in reason_counts.items()]
        summary = (
            f"All {len(scored_candidates)} candidate(s) failed hard feasibility. "
            f"Reasons: {', '.join(parts) or 'unknown'}."
        )
    else:
        outcome = "accepted"
        summary = (
            f"{len(feasible)} of {len(scored_candidates)} candidate(s) passed "
            f"hard feasibility (capacity, path, deadline)."
        )
        if reason_counts:
            parts = [f"{r} ({n})" for r, n in reason_counts.items()]
            summary += f" Rejected: {', '.join(parts)}."

    return make_step(
        step_id="feasibility",
        title="Hard feasibility",
        outcome=outcome,
        summary=summary,
        details={
            "feasibleCount": len(feasible),
            "rejectedCount": len(rejected),
            "rejectionCounts": reason_counts,
        },
        source="code",
    )


def build_score_step(
    *,
    weights: dict[str, float],
    feasible_count: int,
    selected: Any | None,
) -> dict[str, Any]:
    if feasible_count == 0:
        return make_step(
            step_id="score",
            title="Weighted scoring",
            outcome="skipped",
            summary="Scoring skipped — no feasible candidates.",
            details={"weights": weights},
            source="code",
        )
    top = getattr(selected, "vehicle_number", None) if selected else None
    score = getattr(selected, "score", None) if selected else None
    summary = (
        f"Ranked {feasible_count} feasible candidate(s) with configured weights. "
        f"Top by score: {top or 'n/a'}"
        + (f" ({score:.3f})." if isinstance(score, (int, float)) else ".")
    )
    return make_step(
        step_id="score",
        title="Weighted scoring",
        outcome="accepted",
        summary=summary,
        details={
            "weights": weights,
            "feasibleCount": feasible_count,
            "topVehicle": top,
            "topScore": score,
        },
        source="code",
    )


def _candidate_state_row(scored: Any) -> dict[str, Any]:
    m = getattr(scored, "metrics", None)
    return {
        "candidateId": scored.candidate_id,
        "vehicleNumber": scored.vehicle_number,
        "pickupCase": scored.pickup_case,
        "score": scored.score,
        "distanceKm": getattr(m, "distance_km", None) if m else None,
        "travelTimeMin": getattr(m, "travel_time_min", None) if m else None,
        "cost": getattr(m, "cost", None) if m else None,
        "detourKm": getattr(m, "detour_km", None) if m else None,
        "factorsHelped": list(getattr(scored, "factors_helped", None) or []),
        "factorsHurt": list(getattr(scored, "factors_hurt", None) or []),
        "explanation": scored.explanation,
    }


def apply_jev_selection(
    scoring: Any,
    *,
    shipment_summary: dict[str, Any],
) -> tuple[Any | None, dict[str, Any]]:
    """
    Optionally re-select among top-K feasible via Jev Choice.

    Returns (selected_candidate, select_step).
    Low confidence or API failure keeps the score-ranked winner.
    """
    selected = scoring.selected_option
    feasible = [c for c in scoring.candidates if c.feasible and c.score is not None]
    feasible_sorted = sorted(feasible, key=lambda c: c.score or 0.0, reverse=True)
    top_k = feasible_sorted[:TOP_K_SELECT]

    if not top_k:
        return None, make_step(
            step_id="select",
            title="Plan selection",
            outcome="rejected",
            summary=scoring.selection_explanation
            or "No feasible recovery option to select.",
            source="code",
        )

    score_winner = top_k[0]
    if selected is None:
        selected = score_winner

    if len(top_k) == 1 or not typesafe_enabled():
        return selected, make_step(
            step_id="select",
            title="Plan selection",
            outcome="accepted",
            summary=(
                f"Selected {selected.vehicle_number} "
                f"({selected.pickup_case}) by weighted score rank. "
                f"{(selected.explanation or '').split(chr(10))[0]}"
            ).strip(),
            details={
                "selectedCandidateId": selected.candidate_id,
                "selectionMode": "score_rank",
                "topK": [_candidate_state_row(c) for c in top_k],
            },
            source="code",
        )

    try:
        from typesafe_sdk import Choice

        criteria = {
            c.candidate_id: (
                f"{c.vehicle_number} | {c.pickup_case} | score={c.score:.3f} | "
                f"{(c.explanation or '')[:180]}"
            )
            for c in top_k
        }
        state = {
            "shipment": shipment_summary,
            "candidates": [_candidate_state_row(c) for c in top_k],
            "scoreWinnerId": score_winner.candidate_id,
        }
        response = ask_system_one(
            state,
            {
                "best_recovery": Choice(
                    instructions=(
                        "Select the best piggyback recovery vehicle for this "
                        "misplaced shipment. Prefer lower detour and reliable "
                        "on-route pickup when scores are close; respect the "
                        "provided metrics and explanations."
                    ),
                    criteria=criteria,
                )
            },
        )
        j = judgment_from_choice(response, "best_recovery")
        if j is None:
            raise RuntimeError("missing best_recovery choice")

        chosen_id = str(j.get("value") or "")
        confidence = j.get("confidence")
        chosen = next((c for c in top_k if c.candidate_id == chosen_id), None)

        if chosen is None:
            return selected, make_step(
                step_id="select",
                title="Plan selection",
                outcome="accepted",
                summary=(
                    f"TypeSafe returned unknown option; keeping score winner "
                    f"{selected.vehicle_number}."
                ),
                details={
                    "selectedCandidateId": selected.candidate_id,
                    "selectionMode": "score_rank_fallback",
                    "topK": [_candidate_state_row(c) for c in top_k],
                },
                judgments=[j],
                source="hybrid",
            )

        conf_f = float(confidence) if confidence is not None else 0.0
        if conf_f < SELECT_CONFIDENCE_FLOOR and chosen.candidate_id != score_winner.candidate_id:
            return score_winner, make_step(
                step_id="select",
                title="Plan selection",
                outcome="accepted",
                summary=(
                    f"TypeSafe preferred {chosen.vehicle_number} but confidence "
                    f"{conf_f:.2f} is below {SELECT_CONFIDENCE_FLOOR:.2f}; "
                    f"keeping score winner {score_winner.vehicle_number}."
                ),
                details={
                    "selectedCandidateId": score_winner.candidate_id,
                    "typesafePreferredId": chosen.candidate_id,
                    "selectionMode": "score_rank_low_confidence",
                    "topK": [_candidate_state_row(c) for c in top_k],
                },
                judgments=[j],
                source="hybrid",
            )

        # Align selection explanation when Jev overrides score order
        if chosen.candidate_id != score_winner.candidate_id:
            scoring.selection_explanation = (
                f"Selected {chosen.vehicle_number} via TypeSafe Jev "
                f"(confidence {conf_f:.2f}) among top {len(top_k)} scored options. "
                f"Score leader was {score_winner.vehicle_number}.\n\n"
                f"{chosen.explanation}"
            )
            scoring.selected_option = chosen

        return chosen, make_step(
            step_id="select",
            title="Plan selection",
            outcome="accepted",
            summary=(
                f"Selected {chosen.vehicle_number} "
                f"({chosen.pickup_case}) via TypeSafe Jev "
                f"(confidence {conf_f:.2f})."
            ),
            details={
                "selectedCandidateId": chosen.candidate_id,
                "selectionMode": "typesafe_choice",
                "topK": [_candidate_state_row(c) for c in top_k],
            },
            judgments=[j],
            source="typesafe" if chosen.candidate_id != score_winner.candidate_id else "hybrid",
        )
    except Exception as exc:
        logger.warning("[XAI] Jev selection failed: %s", exc)
        return selected, make_step(
            step_id="select",
            title="Plan selection",
            outcome="accepted",
            summary=(
                f"Selected {selected.vehicle_number} by weighted score "
                f"(TypeSafe unavailable: {exc})."
            ),
            details={
                "selectedCandidateId": selected.candidate_id,
                "selectionMode": "score_rank_error_fallback",
                "topK": [_candidate_state_row(c) for c in top_k],
            },
            source="code",
        )


def assemble_analysis_trace(
    *,
    context_step: dict[str, Any],
    generate_step: dict[str, Any],
    feasibility_step: dict[str, Any],
    score_step: dict[str, Any],
    select_step: dict[str, Any],
    simulate_step: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if simulate_step:
        steps.append(simulate_step)
    steps.extend(
        [context_step, generate_step, feasibility_step, score_step, select_step]
    )
    return steps
