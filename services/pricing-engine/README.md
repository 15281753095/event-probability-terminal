# Pricing Engine

Minimal Python service for the Phase 1 pricing contract.

## Current Behavior

The service exposes a placeholder-only HTTP contract:

- `GET /healthz`
- `POST /v0/fair-value`

Run from the repository root:

```bash
PYTHONPATH=services/pricing-engine/src .venv/bin/python -m pricing_engine.main --serve
```

CLI health and quote helpers are also available for local checks:

```bash
PYTHONPATH=services/pricing-engine/src .venv/bin/python -m pricing_engine.main --healthz
PYTHONPATH=services/pricing-engine/src .venv/bin/python -m pricing_engine.main --quote-placeholder < request.json
```

## Contract

`POST /v0/fair-value` accepts one normalized binary `EventMarket` shape with `outcomes.primary` and `outcomes.secondary`.

The response returns `fairValue` with:

- `fairProbabilityByOutcome.primary.probability: null`
- `fairProbabilityByOutcome.secondary.probability: null`
- `confidence: null`
- `modelVersion: "pricing-engine-v0-placeholder"`
- `isPlaceholder: true`
- `reasons`
- `inputFeatures`

## Boundary

No real fair probability, edge calculation, strategy decision, venue adapter, paper broker, replay engine, or external API call is implemented in this phase.
