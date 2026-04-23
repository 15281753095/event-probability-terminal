import { expect, test } from "@playwright/test";

const fixtureMarketId = "polymarket:mkt-btc-1h-demo";

test("scanner home renders fixture-backed research state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BTC / ETH Event Markets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research Filters" })).toBeVisible();
  await expect(page.getByRole("link", { name: "BTC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "marketProb" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence Status" })).toBeVisible();
  await expect(page.getByText("Fair probability: placeholder only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fail-closed summary" })).toBeVisible();
});

test("market detail opens from deterministic fixture id", async ({ page }) => {
  await page.goto(`/markets/${encodeURIComponent(fixtureMarketId)}`);

  await expect(page.getByText("Market Detail RC-1")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Will Bitcoin be up at the end of the hour/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Binary Outcomes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Placeholder Pricing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provenance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Gaps" })).toBeVisible();
  await expect(page.getByText("placeholder only")).toBeVisible();
  await expect(page.getByText("fixture_metadata", { exact: true }).first()).toBeVisible();
});
