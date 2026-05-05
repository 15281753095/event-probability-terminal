import { expect, test } from "@playwright/test";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";

test("home renders the real-data terminal and labels smoke mock data as DEV", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("minimal-prediction-terminal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PREDICT TERMINAL" })).toBeVisible();
  await expect(page.getByText("BTCUSDT").first()).toBeVisible();
  await expect(page.getByText("Binance public").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ETH" })).toBeVisible();
  await expect(page.getByRole("link", { name: "5m" })).toBeVisible();
  await expect(page.getByRole("link", { name: "10m" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Binance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coinbase" })).toBeVisible();
  await expect(page.getByTestId("data-source-badge")).toHaveText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-BTC")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-ETH")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-value-BTC")).toContainText(/\$[0-9,]+\.[0-9]{2}/);
  await expect(page.getByTestId("realtime-price-value-ETH")).toContainText(/\$[0-9,]+\.[0-9]{2}/);
  await expect(page.getByTestId("realtime-price-status-BTC")).toContainText(/open|stale|connecting/i);
  await expect(page.getByTestId("realtime-price-latency-BTC")).toContainText(/ms|Pending/);
  await expect(page.getByTestId("live-badge")).toHaveCount(0);
  await expect(page.getByTestId("terminal-header").getByText(/\$[0-9,]+\.[0-9]{2}/)).toBeVisible();
  await expect(page.getByText("Price updated")).toBeVisible();
  await expect(page.getByText("Candle freshness")).toBeVisible();
  await expect(page.getByRole("link", { name: "Refresh" })).toBeVisible();
  await expect(page.getByTestId("prediction-card")).toContainText(/LONG bias|SHORT bias|NO_SIGNAL/);
  await expect(page.getByTestId("prediction-card")).toContainText("Confidence");
  await expect(page.getByTestId("prediction-card")).toContainText("Score");
  await expect(page.getByTestId("prediction-card")).toContainText("Resolve time");
  await expect(page.getByTestId("prediction-card")).toContainText("Reference");
  await expect(page.getByTestId("prediction-card")).toContainText("Current");
  await expect(page.getByTestId("prediction-card")).toContainText("Distance");
  await expect(page.getByTestId("event-signal-chart")).toBeVisible();
  await expect(page.getByText("Strategy Confluence")).toBeVisible();
  await expect(page.getByText("Risk / No-trade Filter")).toBeVisible();
  await expect(page.getByTestId("observation-log")).toContainText("Observation Log");
  await expect(page.getByTestId("advanced-drawer")).not.toHaveAttribute("open", "");
  await expect(page.getByText("Markets Scanner RC-2")).toHaveCount(0);
  await expect(page.getByText("DEV FIXTURE", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/BUY|SELL|ENTRY|LEVERAGE|POSITION SIZE/i)).toHaveCount(0);

  await page.getByRole("link", { name: "ETH" }).click();
  await expect(page).toHaveURL(/symbol=ETH/);
  await expect(page.getByTestId("minimal-prediction-terminal")).toBeVisible();
});

test("live market data page supports BTC ETH and candle intervals", async ({ page }) => {
  await page.goto("/market-data/live");

  await expect(page.getByTestId("live-market-data-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live Market Data" })).toBeVisible();
  await expect(page.getByTestId("data-source-badge")).toHaveText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-BTC")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-ETH")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-value-BTC")).toContainText(/\$[0-9,]+\.[0-9]{2}/);
  await expect(page.getByTestId("realtime-price-status-ETH")).toContainText(/open|stale|connecting/i);
  await expect(page.getByTestId("realtime-price-latency-ETH")).toContainText(/ms|Pending/);
  await expect(page.getByText("BTCUSDT").first()).toBeVisible();
  await expect(page.getByText("Binance public").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ETH" })).toBeVisible();
  await expect(page.getByRole("link", { name: "1m", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "5m", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "15m", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "1h", exact: true })).toBeVisible();
  await expect(page.getByTestId("event-signal-chart")).toBeVisible();
  await expect(page.getByTestId("provider-health-card")).toContainText("DEV MOCK");
  await expect(page.getByTestId("provider-health-card")).toContainText("fallbackUsed");
  await expect(page.getByTestId("provider-health-card").getByText("sourceType")).toBeVisible();

  await page.getByRole("link", { name: "ETH" }).click();
  await expect(page).toHaveURL(/symbol=ETH/);
  await page.getByRole("link", { name: "15m", exact: true }).click();
  await expect(page).toHaveURL(/interval=15m/);
});

test("signals console defaults to live mode and marks experimental output", async ({ page }) => {
  await page.goto("/signals/console");

  await expect(page.getByTestId("signals-console-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signals Console" })).toBeVisible();
  await expect(page.getByTestId("data-source-badge")).toHaveText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-BTC")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-card-ETH")).toContainText("DEV MOCK");
  await expect(page.getByTestId("realtime-price-value-BTC")).toContainText(/\$[0-9,]+\.[0-9]{2}/);
  await expect(page.getByTestId("realtime-price-status-BTC")).toContainText(/open|stale|connecting/i);
  await expect(page.getByTestId("realtime-price-latency-BTC")).toContainText(/ms|Pending/);
  await expect(page.getByTestId("provider-health-card")).toContainText("DEV MOCK");
  await expect(page.getByTestId("provider-health-card")).toContainText("fallbackUsed");
  await expect(page.getByText("Experimental model")).toBeVisible();
  await expect(page.getByText("BTCUSDT").first()).toBeVisible();
  await expect(page.getByText("Binance public").first()).toBeVisible();
  await expect(page.getByTestId("signals-console-card")).toContainText(/LONG bias|SHORT bias|NO_SIGNAL/);
  await expect(page.getByTestId("signals-console-card")).toContainText("No trading action");
  await expect(page.getByTestId("research-strategy-status")).toContainText("research_only");
  await expect(page.getByTestId("research-strategy-status")).toContainText("production enabled");
  await expect(page.getByTestId("event-signal-chart")).toBeVisible();
  await expect(page.getByTestId("advanced-drawer")).not.toHaveAttribute("open", "");
  await expect(page.getByText(/BUY|SELL|ENTRY|LEVERAGE|POSITION SIZE/i)).toHaveCount(0);
});

test("old scanner is available only on the scanner route", async ({ page }) => {
  await page.goto("/scanner?asset=BTC&sort=liquidity&q=Bitcoin");

  await expect(page.getByText("Query: Bitcoin")).toBeVisible();
  await expect(page.getByText("Showing 1 of 2 fixture-backed candidates.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByText(/Will Ethereum be up/i)).toHaveCount(0);
});

test("market detail opens from deterministic fixture id", async ({ page }) => {
  await page.goto(`/markets/${encodeURIComponent(fixtureMarketId)}`);

  await expect(page.getByText("Market Detail RC-3")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Binary Outcomes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research Readiness" })).toBeVisible();
  await expect(page.getByText("/markets/:id/detail")).toBeVisible();
  await expect(page.getByText("ept-api-v1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Token Trace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Placeholder Pricing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provenance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source Trace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Gaps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Related Fixture Markets" })).toBeVisible();
  await expect(page.getByText("placeholder only").first()).toBeVisible();
  await expect(page.getByText("fixture_metadata", { exact: true }).first()).toBeVisible();
});
