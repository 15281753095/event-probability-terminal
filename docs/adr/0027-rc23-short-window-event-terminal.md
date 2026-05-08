# ADR 0027: RC-23 Short-Window Event Contract Terminal

Date: 2026-05-08

## Status

Accepted for RC-23.

## Context

RC-17 through RC-22 made the product a Polymarket-first research terminal with Binance Spot public
realtime price, fair-value markers, replay, Strategy Lab, and a local research store. The next
product need is different: a local operator wants a short-window BTC/ETH event-contract terminal
for 5m, 10m, and 15m Up/Down-style decisions.

Public browser research in `docs/research/rc23-browser-research-notes.md` found useful UI and rule
references, but it did not verify a reliable public programmable Binance Wallet or HiBit
short-window BTC/ETH event-contract API or exact settlement rule. Binance Academy describes Binance
Wallet Prediction Markets as an access layer to third-party Predict.fun. Kalshi-style crypto docs
show a 60-second averaged index settlement pattern, but that is not evidence for Binance or HiBit.

## Decision

RC-23 adds a short-window event-contract domain and terminal centered on:

- `BTC` and `ETH`;
- `5m`, `10m`, and `15m` event windows;
- configurable rule templates;
- Binance Spot public market data as a proxy/reference data source;
- research-only signal generation;
- proxy replay and win-rate metrics;
- a new `/short-window` terminal page and `/short-window/current` plus `/short-window/replay` API.

Polymarket remains intact but is not the RC-23 main path.

## Rule Templates

The domain uses `ShortWindowContractRule`:

- `END_PRICE_GTE_START_PRICE`
- `END_AVG_GTE_START_AVG`
- `UNKNOWN_MANUAL_REFERENCE`

`proxy-generic` defaults to `END_PRICE_GTE_START_PRICE` over Binance Spot public proxy data with
`isVerifiedRule=false` and `ruleConfidence="low"`.

`binance-wallet-prediction` and `hibit` default to `UNKNOWN_MANUAL_REFERENCE` with
`ruleConfidence="unknown"` until reliable public documentation verifies exact rules.

An averaged-reference template exists for Kalshi/Coinbase-style research comparison, but it remains
configurable proxy logic unless the exact venue rule is verified.

## Signal Method

The first signal engine is explainable and intentionally simple. It uses:

- current price versus window start reference;
- short-term candle momentum;
- realized volatility;
- latest candle body;
- bid/ask spread;
- freshness/latency checks;
- phase checks, including forming, decision zone, and no-entry zone.

Signals can be `LONG_UP`, `LONG_DOWN`, `WAIT`, or `REJECTED`. Unknown settlement rules fail closed
to `REJECTED`. Proxy rules can produce low-confidence research signals, but UI must show the proxy
rule warning.

## Replay

Short-window replay:

- splits historical Binance Spot public candles into 5m/10m/15m windows;
- generates signals using only candles available at signal time;
- labels outcomes with the same rule template;
- excludes `WAIT` and `REJECTED` from the win-rate denominator;
- marks unverified live rules with `proxyBacktest=true`;
- returns warnings rather than fabricated statistics when data is insufficient.

## Boundaries

RC-23 does not:

- perform real-money trading;
- place or cancel orders;
- read or store wallet/private key/API key/secret/passphrase data;
- call signed/private/account/order endpoints;
- inspect balances, positions, fills, or account state;
- use browser pages as production data;
- claim profitability or certainty.

The terminal is manual decision support only. It may say "Not Trading Advice" and "Manual action
only"; it must not emit execution instructions.

## Browser Research Use

Codex Chrome Extension was used to inspect public Binance Academy, Kalshi Help, Coinbase public
prediction-market pages, Forsee, Predi.trade, and public HiBit search results. The research informs
UI and configurable rule modeling only. Production data remains the existing Binance Spot public
REST/WebSocket adapters or local store data.

## Consequences

- RC-23 broadens the product beyond Polymarket without damaging existing Polymarket features.
- The new terminal gives useful local short-window signals while keeping settlement uncertainty
  visible.
- Any future Binance Wallet, HiBit, Predict.fun, or other event-contract adapter must update the
  source registry and API docs first, then implement an adapter boundary with verified public docs.
