PNPM ?= npx --yes pnpm@10.0.0
PYTHON ?= .venv/bin/python
API_GATEWAY_PORT ?= 4000
PRICING_ENGINE_PORT ?= 4100

.PHONY: install infra-up infra-down dev-web dev-api dev-pricing pricing-health health typecheck build test test-js test-python lint lint-js lint-python format-python

install:
	$(PNPM) install
	python -m venv .venv
	.venv/bin/pip install -e ".[dev]"

infra-up:
	docker compose up -d postgres redis

infra-down:
	docker compose down

dev-web:
	$(PNPM) dev:web

dev-api:
	$(PNPM) dev:api

dev-pricing:
	PYTHONPATH=services/pricing-engine/src $(PYTHON) -m pricing_engine.main --serve --host 127.0.0.1 --port $(PRICING_ENGINE_PORT)

pricing-health:
	@curl -fsS http://localhost:$(PRICING_ENGINE_PORT)/healthz 2>/dev/null || PYTHONPATH=services/pricing-engine/src $(PYTHON) -m pricing_engine.main --healthz

health:
	@echo "pricing-engine:"
	@curl -fsS http://localhost:$(PRICING_ENGINE_PORT)/healthz || echo "pricing-engine not running on :$(PRICING_ENGINE_PORT)"
	@echo "api-gateway:"
	@curl -fsS http://localhost:$(API_GATEWAY_PORT)/healthz || echo "api-gateway not running on :$(API_GATEWAY_PORT)"

typecheck:
	$(PNPM) typecheck

build:
	$(PNPM) build

test: test-js test-python

test-js:
	$(PNPM) test:js

test-python:
	PYTHONPATH=services/pricing-engine/src $(PYTHON) -m pytest services/pricing-engine/tests

lint: lint-js lint-python

lint-js:
	$(PNPM) lint

lint-python:
	$(PYTHON) -m ruff check services/pricing-engine
	$(PYTHON) -m mypy services/pricing-engine/src

format-python:
	$(PYTHON) -m ruff format services/pricing-engine
