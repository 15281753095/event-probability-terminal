# Event-Contract Strategy Registry

Status: RC-21 research-only registry plus replay metrics and Strategy Lab validation. These candidates are not production
signals, not trade advice, and not claims of profit.

RC-18 adds real Polymarket active market odds as required research context. Registry candidates must
consume those odds only after data sufficiency checks: active market status, binary outcomes, CLOB
token IDs, event end time, resolution source/rule evidence, spread, liquidity, fees, and slippage.
The odds binding does not make any registry candidate production-ready.

RC-19 adds the first fair-value chart-marker candidate. It is research-only and limited to eligible
BTC/ETH terminal price-threshold markets. The eligibility gate is mandatory: ambiguous BTC+ETH
markets, missing threshold, missing Yes/No tokens, missing odds, excessive spread, unknown
liquidity, unclear resolution rules, expired markets, and path-dependent/vague `hit` markets are
rejected before any probability or edge is computed.

RC-20 does not add a new strategy. It adds replay, outcome labeling, and win-rate metrics for the
existing fair-value v1 marker candidate. Replay metrics must keep `PENDING`, `UNRESOLVED`,
`REJECTED`, and `NO_SIGNAL` outside the realized win-rate denominator. A high win rate with low
sample count remains non-actionable and must show `LOW_SAMPLE_SIZE`.

RC-21 still does not add a new strategy. It adds Strategy Lab parameter sweep and walk-forward
validation for `fair-value-v1` so parameter candidates can be compared before any further strategy
expansion. Strategy Lab candidates must remain research-only and must be rejected as top candidates
when they have null win rate, too few actionable samples, negative theoretical PnL, high overfit
risk, or low walk-forward consistency. In-sample train windows may choose parameters; out-of-sample
test windows may only validate them.

All online, Twitter/X, chat, or community strategy ideas must enter this registry first. They cannot directly drive live signals. Any backtest must record fees, slippage, spread, liquidity, data range, sample count, and anti-look-ahead checks.

## Candidate Categories

### Cross-venue arbitrage / price discrepancy
- Hypothesis: prediction-market prices may diverge from underlying venue-implied probabilities.
- Required data: event contract quote, underlying price, settlement rule, fees, spread, liquidity.
- Signal placeholder: `realized_vol_terminal_probability_v1 - market_probability`, after buffers.
- Backtest requirement: synchronized timestamps and executable bid/ask assumptions.
- Known risks: stale quotes, non-executable size, settlement mismatch.
- Why not production-ready: fair probability, settlement extraction, and execution assumptions are
  unvalidated.

### Order book imbalance
- Hypothesis: bid/ask depth imbalance may precede short-window repricing.
- Required data: public order book snapshots, trade prints, event metadata.
- Signal placeholder: `(bid_depth - ask_depth) / total_depth`.
- Backtest requirement: point-in-time books and queue/slippage model.
- Known risks: spoofing, thin books, rapid cancellation.
- Why not production-ready: no execution simulator or queue model.

### Momentum around underlying price
- Hypothesis: short underlying BTC/ETH momentum may affect Up/Down event repricing.
- Required data: pre-entry OHLCV, event start/end, reference price.
- Signal placeholder: `close_t / close_t-n - 1`.
- Backtest requirement: only candles available before entry.
- Known risks: reversal, noisy short windows, settlement-source mismatch.
- Why not production-ready: baseline is not calibrated to event-contract rules.

### Volatility breakout near event window
- Hypothesis: volatility expansion near a window may change directional odds.
- Required data: OHLCV, ATR/realized volatility, event window boundaries.
- Signal placeholder: `atr_zscore > threshold`.
- Backtest requirement: pre-entry volatility only.
- Known risks: direction ambiguity and overfitting thresholds.
- Why not production-ready: no robust threshold validation.

### Mean reversion after overreaction
- Hypothesis: extreme moves may revert before event resolution.
- Required data: OHLCV, deviation bands, event timing.
- Signal placeholder: `zscore(close)`.
- Backtest requirement: out-of-sample thresholds and no future bands.
- Known risks: trend continuation can dominate.
- Why not production-ready: regime filter is unvalidated.

### Time decay / last-window repricing
- Hypothesis: contract prices may reprice rapidly as resolution nears.
- Required data: contract quotes, time to resolution, underlying price.
- Signal placeholder: `time_to_close_weight * price_gap`.
- Backtest requirement: exact event close and settlement timestamps.
- Known risks: clock mismatch and liquidity collapse.
- Why not production-ready: settlement timing is not fully normalized.

### Liquidity vacuum / spread widening
- Hypothesis: widening spread and declining liquidity may warn against signals.
- Required data: bid/ask spread, depth, volume, trade frequency.
- Signal placeholder: `spread_pct > max_spread`.
- Backtest requirement: executable quote snapshots.
- Known risks: sparse data and unfilled orders.
- Why not production-ready: this is more veto than alpha.

### Event resolution rule edge
- Hypothesis: edge may exist only when official resolution rules differ from market assumptions.
- Required data: official rule text, oracle/source, reference price, tie rule.
- Signal placeholder: rule-specific, must be manually reviewed.
- Backtest requirement: documented rule extraction and settlement evidence.
- Known risks: legal/rule interpretation errors.
- Why not production-ready: rules are not yet machine-verified.

## Required Controls

- Prevent look-ahead bias and future functions.
- Reject signals generated after resolution data is known.
- Require `entryTime < outcomeTime`.
- Reject insufficient data.
- Warn on small samples.
- Never mark high win rate with insufficient samples as viable.
- Never use resolution-after-entry data or future candles to create a marker.
- Never compute edge for a market that failed eligibility.
- Show method, assumptions, warnings, and limits with every fair-value marker.
- In replay, generate signals from pre-signal candles only.
- Use resolution/expiry data only for outcome labeling.
- Treat theoretical replay PnL as hypothetical, not real trading performance.
- Do not add another strategy until fair-value v1 replay results are interpretable and auditable.
- Do not use the same full historical window for both parameter selection and validation.
- Keep Strategy Lab top candidates as research candidates only, not production settings.
- Penalize low sample, high pending rate, low coverage, drawdown, and train/test degradation.
