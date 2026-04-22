# Predict.fun API Notes

Verification date: 2026-04-21 Asia/Shanghai.

Source:

- https://dev.predict.fun/

## Verified facts

- Predict's official developer documentation labels the REST API as beta.
- The documentation covers REST, WebSocket, authorization, categories, markets, orders, accounts, positions, search, OAuth, and schemas.
- The documentation lists:
  - BNB Mainnet base URL: `https://api.predict.fun/`
  - BNB Testnet base URL: `https://api-testnet.predict.fun/`
- The documentation says BNB Mainnet requires an API key.
- The documentation says BNB Testnet does not require an API key.
- The documentation says Predict has TypeScript and Python SDKs.
- The documentation says the default mainnet API-key rate limit is 240 requests per minute, and testnet allows up to 240 requests per minute without an API key.

## Project decisions

- Predict.fun is a compatible secondary venue, not the first implementation target.
- Phase 1 will not create or cancel Predict.fun orders.
- Any Predict.fun support must be adapter-based and must start with read-only market discovery or market data only.

## Reasonable inferences

- Predict.fun may be relevant for Binance Wallet semantic comparison because Binance's product guide says Binance Wallet Prediction Markets integrate Predict.fun.
- Testnet may be useful for future adapter research, but testnet behavior must not be assumed to match mainnet without confirmation.

## Unconfirmed items

- TODO: Confirm exact endpoint paths, parameters, auth headers, signature requirements, response schemas, and WebSocket topic formats before coding.
- TODO: Confirm whether BTC/ETH 10m/1h markets exist and how they are identified.
- TODO: Confirm whether read-only market endpoints require API keys on mainnet.
- TODO: Confirm SDK package versions and supported operations from official SDK repositories before adding dependencies.

## Explicit non-goals now

- No Predict.fun adapter implementation.
- No order creation or cancellation.
- No wallet, account-abstraction, private-key, OAuth, or Smart Wallet integration.

