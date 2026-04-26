import { expect, test } from "@playwright/test";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";

test("scanner home renders fixture-backed research state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BTC / ETH Event Markets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research Filters" })).toBeVisible();
  await expect(page.getByText("Markets Scanner RC-2")).toBeVisible();
  await expect(page.getByText("Contract: ept-api-v1")).toBeVisible();
  await expect(page.getByPlaceholder("Question, outcome, id")).toBeVisible();
  await expect(page.getByText("Accepted")).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "marketProb" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research Signal Panel" })).toBeVisible();
  await expect(page.getByText("Research only")).toBeVisible();
  await expect(page.getByText("LONG bias")).toBeVisible();
  await expect(page.getByText("SHORT bias")).toBeVisible();
  await expect(page.getByText("NO_SIGNAL").first()).toBeVisible();
  await expect(page.getByText("Fair probability: placeholder only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fail-closed reason matrix" })).toBeVisible();
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
