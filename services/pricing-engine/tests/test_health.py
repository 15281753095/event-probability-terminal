from pricing_engine.main import health_payload


def test_health_payload() -> None:
    assert health_payload() == {
        "ok": True,
        "service": "pricing-engine",
    }

