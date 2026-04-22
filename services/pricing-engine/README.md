# Pricing Engine

Minimal Python shell for probability-pricing research.

## Current behavior

- `PYTHONPATH=services/pricing-engine/src .venv/bin/python -m pricing_engine.main --healthz` prints process health metadata from the repo root.

After `.venv/bin/pip install -e ".[dev]"`, this also works:

```bash
.venv/bin/python -m pricing_engine.main --healthz
.venv/bin/python -m pytest services/pricing-engine/tests
```

## Boundary

No pricing model, venue adapter, scanner, paper broker, replay engine, or external API call is implemented in this phase.
