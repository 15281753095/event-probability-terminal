# ADR 0022: RC-18 Polymarket Market Odds Binding

Date: 2026-05-05

## Status

Accepted for RC-18.

## Decision

RC-18 adds read-only Polymarket active market odds before any further strategy work. The terminal now needs real event-contract market state: active question text, outcome labels, CLOB token IDs, Yes/No prices, midpoint, spread, order-book-derived liquidity diagnostics, and event timing.

Gamma public endpoints are used for discovery. CLOB public market-data endpoints are used for order book, price, midpoint, and spread diagnostics. Binance Spot public realtime/REST price remains the underlying BTC/ETH reference used to bind event contracts to BTCUSDT or ETHUSDT.

## Rationale

Strategy work without real event-contract odds would only optimize against incomplete underlying-price data. Polymarket odds, token IDs, spread, and liquidity are prerequisites for any later research. This slice therefore focuses on truthful market binding and data sufficiency instead of expanding signal logic.

## Binding Rules

The first implementation binds by conservative text evidence:

- Bitcoin/BTC text binds to BTCUSDT.
- Ethereum/ETH text binds to ETHUSDT.
- BTC and ETH together is ambiguous.
- Missing BTC/ETH evidence is unsupported.

Missing binary outcomes, CLOB token IDs, event end time, or confirmed resolution source/rule makes the market research-ineligible. It can still be displayed as public market data.

## Boundaries

RC-18 is public market data only. It does not use Polymarket authenticated trading endpoints, private keys, API keys, secrets, passphrases, wallet state, balances, positions, order placement, cancellation, or trade execution.

No Polymarket market is converted into a buy/sell instruction. No profitability claim is made.

## Consequences

CLOB failures do not erase Gamma discovery. The API keeps the market row and marks odds as fail-closed or fallback-derived. Smoke tests use deterministic mock fixtures and do not call Polymarket or Binance.
