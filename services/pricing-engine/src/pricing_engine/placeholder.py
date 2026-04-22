from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

MODEL_VERSION = "pricing-engine-v0-placeholder"


def quote_placeholder(payload: dict[str, Any]) -> dict[str, Any]:
    market = _dict_value(payload.get("market"), "market")
    outcomes = _dict_value(market.get("outcomes"), "market.outcomes")
    primary = _dict_value(outcomes.get("primary"), "market.outcomes.primary")
    secondary = _dict_value(outcomes.get("secondary"), "market.outcomes.secondary")
    metrics = _optional_dict(market.get("metrics"))
    requested_at = _optional_string(payload.get("requestedAt")) or _now_iso()
    market_id = _string_value(market.get("id"), "market.id")
    outcome_type = _string_value(market.get("outcomeType"), "market.outcomeType")
    if outcome_type != "binary":
        raise ValueError("market.outcomeType must be binary")

    primary_label = _string_value(primary.get("label"), "market.outcomes.primary.label")
    secondary_label = _string_value(secondary.get("label"), "market.outcomes.secondary.label")

    return {
        "fairValue": {
            "marketId": market_id,
            "outcomeType": "binary",
            "fairProbabilityByOutcome": {
                "primary": {
                    "outcomeRole": "primary",
                    "outcomeLabel": primary_label,
                    "probability": None,
                    "isPlaceholder": True,
                },
                "secondary": {
                    "outcomeRole": "secondary",
                    "outcomeLabel": secondary_label,
                    "probability": None,
                    "isPlaceholder": True,
                },
            },
            "confidence": None,
            "reasons": [
                "pricing-engine v0 is a placeholder contract only; "
                "no fair probability is computed.",
                "Binary outcomes were consumed from market.outcomes.primary "
                "and market.outcomes.secondary.",
            ],
            "inputFeatures": _input_features(metrics, primary_label, secondary_label),
            "modelVersion": MODEL_VERSION,
            "isPlaceholder": True,
            "createdAt": requested_at,
        }
    }


def health_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "pricing-engine",
        "mode": "placeholder",
        "modelVersion": MODEL_VERSION,
    }


def _input_features(
    metrics: dict[str, Any],
    primary_label: str,
    secondary_label: str,
) -> dict[str, Any]:
    features: dict[str, Any] = {
        "outcomeLabels": {
            "primary": primary_label,
            "secondary": secondary_label,
        }
    }
    for key in ("bestBid", "bestAsk", "spread", "liquidity", "volume"):
        value = _optional_number(metrics.get(key))
        if value is not None:
            features[key] = value

    best_bid = _optional_number(metrics.get("bestBid"))
    best_ask = _optional_number(metrics.get("bestAsk"))
    if best_bid is not None and best_ask is not None:
        features["observedMidpoint"] = (best_bid + best_ask) / 2

    return features


def _dict_value(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be an object")
    return value


def _optional_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_value(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")
    return value


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_number(value: Any) -> float | int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return value
    return None


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
