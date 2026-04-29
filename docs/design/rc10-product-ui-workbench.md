# RC-10 Product UI Workbench

## Goal

Turn the RC-9 Event Signal Console into a locally usable product workbench. This is a UI and
interaction slice only. It does not change strategy claims, add trading capability, add wallet
integration, add private/authenticated endpoints, or add new live data dependencies.

## UI Research Notes

Targeted product/UI research on 2026-04-29 was limited to layout and interaction organization:

1. TradingView Lightweight Charts supports candlestick series and series markers; markers should be
   attached to the candle series rather than hand-positioned over the canvas.
2. TradingView-style terminals keep the chart central and use compact side panels for current
   state, not long explanatory prose above the chart.
3. Product pages such as bqbot/CoinPred organize the workflow as controls, K-line, indicators,
   explanation, and backtest sections.
4. Prediction-market pages emphasize the market/status context near the top, while deeper evidence
   is lower on the page.
5. Dense financial tools use high-contrast cards and small labels; the strongest state should be
   the current signal, not the marketing title.
6. A visible refresh affordance is useful for local live mode, but it must not imply automatic
   trading or polling.
7. Veto and fail-closed reasons need a dedicated area so `NO_SIGNAL` is visibly intentional.
8. Backtest should remain folded behind user action and be labelled small-sample diagnostics.
9. Marker count should be visible to users so the chart does not look like it is hiding a full
   replay workflow.
10. Any public discussion about indicators or dashboards is treated as weak product signal only,
   not evidence of strategy validity.

## Wireframe

```text
Header
  Event Probability Terminal | symbol | horizon | source | refresh | backtest toggle

Signal Hero
  Direction badge | total score | confidence | freshness | source | research-only flags

Main Workbench
  Left: recent K-line chart with <=20 markers
  Right: current signal, reasons, veto/fail-closed/warnings

Bottom Workbench
  Confluence score cards
  Risk filter cards
  On-demand backtest drawer
  Local API/system status
```

## Constraints

- No buy/sell/order output.
- No leverage, position size, real entry, wallet, or private/authenticated endpoint.
- No live X/news/macro feed.
- No full-history marker overlay.
- No default backtest execution.
- CI remains fixture-backed and deterministic.
