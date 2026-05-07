# ADR 0026: RC-22 Research Data Store and Scheduled Snapshot Capture

Status: accepted

Date: 2026-05-07

## Context

RC-17 through RC-21 added realtime Binance public data, Polymarket public odds, fair-value v1
signals, replay metrics, and Strategy Lab validation. Those features were still mostly computed
from temporary live API calls or deterministic mock fixtures. As a result, live replay often had no
completed samples and Strategy Lab live mode frequently had too few samples to rank candidates.

Without durable local samples, win rate, walk-forward validation, and parameter optimization remain
dependent on whatever public APIs return during a single request. That makes sparse markets look
empty, creates repeated low-sample warnings, and prevents gradual accumulation of research
evidence.

## Decision

RC-22 adds a local research data store and manual/scheduled capture jobs before adding any new
strategy. The store records only public/read-only research data:

- Binance Spot public BTCUSDT/ETHUSDT candles.
- Polymarket public market snapshots and odds diagnostics.
- Fair-value v1 signal snapshots, including rejected markets.
- Replay metrics by symbol/window.
- Strategy Lab result summaries by symbol/window.
- Capture run health and warnings.

The default store is SQLite through Node's built-in `node:sqlite` when available. A JSONL fallback
is provided for environments where SQLite is unavailable or inappropriate. This avoids introducing
a native npm dependency or a service dependency such as Postgres, Redis, or Kafka.

The default database path is `.var/ept-research.sqlite`. Local database files, SQLite sidecar files,
and `.var/` are ignored and must not be committed.

Every stored row preserves source provenance. `sourceType=live`, `sourceType=mock`, and
`sourceType=fixture` must not be conflated. Mock capture is allowed only for CI/smoke and must be
stored as `sourceType=mock`.

Capture jobs are research capture jobs, not trading bots. They do not place orders, cancel orders,
read account state, manage positions, connect wallets, use private keys, or require API secrets.

## Consequences

Replay and Strategy Lab can now query stored results and display latest capture time/sample counts.
If stored data is missing or too thin, endpoints return warnings instead of fabricating win rates or
top candidates.

The system can gradually build local research coverage for `1d`, `3d`, `1w`, and `1m` windows.
Coverage is reported through `/store/status` and the Research Data Store UI.

Public live capture may still return zero Polymarket markets or low replay samples. That is a valid
research state and must be recorded as warnings or partial capture health, not patched with fake
samples.

## Non-Goals

- No new strategy.
- No real-money trading.
- No wallet, private key, API key, secret, passphrase, account, balance, position, order, cancel,
  or execution integration.
- No guaranteed-profit claims.
- No fake live records.
- No CI/smoke dependency on real Binance or Polymarket.

