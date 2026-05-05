# Event-Contract Strategy Registry

Status: RC-17 research-only registry. These candidates are not production signals, not trade advice, and not claims of profit.

All online, Twitter/X, chat, or community strategy ideas must enter this registry first. They cannot directly drive live signals. Any backtest must record fees, slippage, spread, liquidity, data range, sample count, and anti-look-ahead checks.

## Candidate Categories

### Cross-venue arbitrage / price discrepancy
- Hypothesis: prediction-market prices may diverge from underlying venue-implied probabilities.
- Required data: event contract quote, underlying price, settlement rule, fees, spread, liquidity.
- Signal placeholder: `contract_mid - fair_probability_proxy`.
- Backtest requirement: synchronized timestamps and executable bid/ask assumptions.
- Known risks: stale quotes, non-executable size, settlement mismatch.
- Why not production-ready: fair probability and execution assumptions are unvalidated.

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
