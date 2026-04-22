from pricing_engine.main import health_payload
from pricing_engine.placeholder import MODEL_VERSION, quote_placeholder


def test_health_payload() -> None:
    assert health_payload() == {
        "ok": True,
        "service": "pricing-engine",
        "mode": "placeholder",
        "modelVersion": MODEL_VERSION,
    }


def test_quote_placeholder_consumes_binary_outcomes() -> None:
    payload = {
        "requestedAt": "2026-04-22T12:00:00Z",
        "market": {
            "id": "polymarket:mkt-btc-1h-demo",
            "outcomeType": "binary",
            "outcomes": {
                "primary": {
                    "role": "primary",
                    "label": "Up",
                    "tokenId": "token-up",
                },
                "secondary": {
                    "role": "secondary",
                    "label": "Down",
                    "tokenId": "token-down",
                },
            },
            "metrics": {
                "bestBid": 0.49,
                "bestAsk": 0.52,
                "spread": 0.03,
                "liquidity": 12000,
            },
        },
    }

    result = quote_placeholder(payload)
    fair_value = result["fairValue"]

    assert fair_value["marketId"] == "polymarket:mkt-btc-1h-demo"
    assert fair_value["modelVersion"] == MODEL_VERSION
    assert fair_value["isPlaceholder"] is True
    assert fair_value["confidence"] is None
    assert fair_value["fairProbabilityByOutcome"]["primary"] == {
        "outcomeRole": "primary",
        "outcomeLabel": "Up",
        "probability": None,
        "isPlaceholder": True,
    }
    assert fair_value["fairProbabilityByOutcome"]["secondary"]["outcomeLabel"] == "Down"
    assert fair_value["inputFeatures"]["observedMidpoint"] == 0.505
