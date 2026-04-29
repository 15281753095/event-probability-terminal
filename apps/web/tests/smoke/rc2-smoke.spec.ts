import { expect, test } from "@playwright/test";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";

test("scanner home renders fixture-backed research state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BTC / ETH Event Markets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market Filters" })).toBeVisible();
  await expect(page.getByText("Markets Scanner RC-2")).toBeVisible();
  await expect(page.getByText("Contract: ept-api-v1")).toBeVisible();
  await expect(page.getByPlaceholder("Question, outcome, id")).toBeVisible();
  await expect(page.getByText("Accepted")).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "marketProb" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research Signal Panel" })).toBeVisible();
  await expect(page.getByText("RC-10 Workbench")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event Signal Workbench" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Symbol" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Horizon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source" })).toBeVisible();
  await expect(page.getByText("Current signal")).toBeVisible();
  await expect(page.getByTestId("signal-runtime-panel")).toContainText("Signal Runtime");
  await expect(page.getByRole("button", { name: "Auto refresh off" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Runtime refresh" })).toBeVisible();
  await expect(page.getByTestId("signal-runtime-panel")).toContainText("Profile");
  await expect(page.getByTestId("signal-runtime-panel")).toContainText("balanced");
  await expect(page.getByTestId("signal-history")).toContainText(/LONG bias|SHORT bias|NO_SIGNAL/);
  await expect(page.getByTestId("event-signal-chart")).toBeVisible();
  await expect(page.getByText("Markers", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("confluence-cards")).toContainText("Trend");
  await expect(page.getByTestId("confluence-cards")).toContainText("Momentum");
  await expect(page.getByTestId("confluence-cards")).toContainText("Chop risk");
  await expect(page.getByTestId("backtest-drawer")).toContainText("Collapsed by default");
  await expect(page.getByTestId("backtest-drawer").getByRole("link", { name: "Show backtest preview" })).toBeVisible();
  await expect(page.getByText("Research only", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Not trade advice").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Live", exact: true })).toBeVisible();
  await expect(page.getByText("Source: fixture").first()).toBeVisible();
  await expect(page.getByText("LONG bias").first()).toBeVisible();
  await expect(page.getByText("SHORT bias").first()).toBeVisible();
  await expect(page.getByText("NO_SIGNAL").first()).toBeVisible();
  await expect(page.getByText("Fair probability: placeholder only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fail-closed reason matrix" })).toBeVisible();

  await page.getByTestId("backtest-drawer").getByRole("link", { name: "Show backtest preview" }).click();
  await expect(page.getByRole("heading", { name: "Backtest Preview" })).toBeVisible();
  await expect(page.getByText("Sample size")).toBeVisible();
  await expect(page.getByText("Small local sample")).toBeVisible();
});

test("scanner query state is shareable through the URL", async ({ page }) => {
  await page.goto("/?asset=BTC&sort=liquidity&q=Bitcoin");

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
