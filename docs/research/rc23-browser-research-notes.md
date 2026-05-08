# RC-23 Browser Research Notes

Date: 2026-05-08 Asia/Shanghai.

Research method: Codex Chrome Extension public browsing only. No login, no account pages, no
private messages, no cookies/tokens, and no order confirmation flows were inspected. These pages are
UI/rule references only; production data for RC-23 remains Binance Spot public market data or local
store data.

## Visited Public Pages

| Page | Purpose | Notes |
| --- | --- | --- |
| https://www.binance.com/en/academy/articles/a-guide-to-binance-wallet-prediction-markets | Binance Wallet Prediction Markets overview | Public Binance Academy page. It describes Binance Wallet Prediction Markets as an access layer integrating third-party Predict.fun on BNB Smart Chain, with YES/NO shares and settlement after event resolution. It does not confirm programmable BTC/ETH 5m/10m/15m Up/Down API rules for this project. |
| https://help.kalshi.com/en/articles/13823838-crypto-markets | Comparable crypto event-market settlement reference | Public Kalshi help page. It states crypto markets settle using a 60-second average of CFB Real-Time Indexes. This supports a configurable `END_AVG_GTE_START_AVG` template, not a Binance/HiBit rule. |
| https://www.coinbase.com/en-nl/predictions/event/KXBTC15M-26FEB112230 | Coinbase prediction-market UI reference | Redirected to public Coinbase Predictions page in Chrome. Observed prediction-market category/list UI and 15m-style event naming from URL/search context, but did not verify exact settlement rule from this page. |
| https://forsee.market/ | Short-window crypto Up/Down UI reference | Public third-party page showed 1m/5m/15m rounds, fixed open price, Up/Down direction, live markets, and scanner-style layout. Used only as UI/terminology reference. |
| https://predi.trade/ | Prediction dashboard UI reference | Public third-party page showed cross-platform dashboard language, score/confidence cards, platform sync, and signal-driver style panels. Used only as UI reference. |
| https://www.google.com/search?q=HiBit+prediction+market+BTC+Up+Down+official | HiBit public-rule search | Public search results did not surface a reliable official HiBit event-contract rule page. |
| https://www.google.com/search?q=HIBIT+crypto+prediction+market+official+rules | HiBit public-rule search | Public search results did not surface reliable official HiBit BTC/ETH short-window Up/Down settlement documentation. |

Google Play for the HiBit app was attempted through Chrome and blocked by the browser client. It is
not used as verified evidence.

## UI Elements Observed

- Binary event-market language: YES/NO and Up/Down.
- Round/timeframe selectors: 1m, 5m, 15m on third-party short-window UI.
- Fixed open/reference price concept for short rounds.
- Countdown/live status indicators around active rounds.
- Directional panels with probability/score/confidence-like summaries.
- Risk/context panels and scanner-style historical lists.
- Market cards showing asset, timeframe, and live state.

## Rule Assumptions Observed

Verified:

- Binance Wallet Prediction Markets are presented by Binance as a Wallet access layer over a
  third-party protocol, not as a direct Binance-created market or confirmed developer API.
- Kalshi-style crypto markets can use a 60-second averaged external index reference. This supports
  configurable settlement-rule modeling.

Unverified:

- Exact Binance Wallet / Predict.fun BTC/ETH 5m/10m/15m Up/Down settlement formula.
- Whether Binance Wallet exposes a public programmable event-contract API for these short windows.
- Exact HiBit BTC/ETH short-window event-contract rules or public API.
- Whether a venue uses instantaneous start/end price, start/end average, an index provider, oracle
  value, tie-to-Up, tie-to-Down, or unresolved tie behavior.

## Product Mapping

- RC-23 implements `ShortWindowContractRule` templates instead of hard-coding venue truth.
- `proxy-generic` uses Binance Spot public data as a proxy and must display "Unverified Rule /
  Proxy Model."
- `binance-wallet-prediction` and `hibit` default to `UNKNOWN_MANUAL_REFERENCE` until reliable
  public documentation confirms rules.
- `END_AVG_GTE_START_AVG` exists as a configurable template because public Kalshi-style docs show
  time-averaged crypto references, but it is not treated as Binance or HiBit truth.
- UI adopts terminal-style panels: realtime price, active window, countdown, start reference,
  directional signal card, K-line chart, rule warning, and historical proxy win-rate section.

## Boundary

- Browser pages are not production data sources.
- No account, wallet, credential, balance, position, order, cancellation, or private endpoint was
  inspected or integrated.
- RC-23 output remains research-only manual decision support and must not claim guaranteed
  profitability or official venue settlement unless a rule is verified in a reliable public source.
