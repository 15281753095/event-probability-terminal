import Link from "next/link";
import type { ReactNode } from "react";
import type { BoundEventMarket, PolymarketActiveMarketsResponse, SignalSymbol } from "@ept/shared-types";
import { apiErrorMessage } from "../../api-client";
import { RealTimePriceCard } from "../../RealTimePriceCard";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  symbol?: string;
}>;

type LoadState = {
  data?: PolymarketActiveMarketsResponse;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function PolymarketMarketsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const symbol = parseSymbol(params.symbol);
  const { data, error } = await loadPolymarketActiveMarkets(symbol);

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-3" data-testid="polymarket-active-markets-page">
        <header className="border border-slate-800 bg-[#0b111d] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-50">Polymarket Active Markets</h1>
                <Badge>READ ONLY</Badge>
                <Badge>NO TRADING</Badge>
                <Badge>PUBLIC MARKET DATA</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Active BTC/ETH event-contract odds bound to Binance realtime underlying prices. Research diagnostics only.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedLink current={symbol} value="ALL" />
              <SegmentedLink current={symbol} value="BTC" />
              <SegmentedLink current={symbol} value="ETH" />
              <HeaderMetric label="sourceType" value={data?.sourceType === "mock" ? "DEV MOCK" : data?.sourceType ?? "Unavailable"} />
              <HeaderMetric label="markets" value={`${data?.markets.length ?? 0}`} />
              <HeaderMetric label="checkedAt" value={formatTime(data?.checkedAt ?? null)} />
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2" data-testid="polymarket-realtime-prices">
          <RealTimePriceCard symbol="BTC" />
          <RealTimePriceCard symbol="ETH" />
        </section>

        {error ? <ErrorBanner message={error} /> : null}
        {data?.warnings.length ? <ReasonList title="Discovery notes" items={data.warnings} /> : null}
        {data?.failClosedReasons.length ? <ReasonList title="Fail-closed reasons" items={data.failClosedReasons} /> : null}

        <section className="border border-slate-800 bg-[#0b111d] p-3">
          <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Active Market Odds</h2>
              <p className="mt-1 text-xs text-slate-500">
                Yes/No prices are public market-data diagnostics. Missing midpoint or spread is shown as data insufficiency.
              </p>
            </div>
            <Link className="text-xs font-semibold text-cyan-200 hover:text-cyan-100" href="/">
              Back to terminal
            </Link>
          </div>
          {data && data.markets.length > 0 ? (
            <div className="overflow-x-auto" data-testid="polymarket-market-table">
              <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
                <thead className="bg-slate-950 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <Th>Symbol</Th>
                    <Th>Question</Th>
                    <Th>End</Th>
                    <Th>Yes price</Th>
                    <Th>No price</Th>
                    <Th>Yes midpoint</Th>
                    <Th>Spread</Th>
                    <Th>Liquidity</Th>
                    <Th>Binding</Th>
                    <Th>Research</Th>
                    <Th>Reject reasons</Th>
                    <Th>Provider</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.markets.map((market) => (
                    <MarketRow key={market.market.marketId} market={market} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center border border-slate-800 bg-slate-950 text-sm text-slate-400" data-testid="polymarket-empty-state">
              No active BTC/ETH markets found.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MarketRow({ market }: { market: BoundEventMarket }) {
  return (
    <tr className="border-t border-slate-800 align-top text-slate-300" data-testid="polymarket-market-row">
      <Td>{market.symbol}</Td>
      <Td>
        <div className="max-w-[330px] font-semibold text-slate-100">{market.market.question}</div>
        <div className="mt-1 text-slate-500">tokens {market.market.clobTokenIds.slice(0, 2).join(" / ") || "Unavailable"}</div>
        <div className="mt-1 text-slate-500">outcomes {market.market.outcomes.join(" / ") || "Unavailable"}</div>
      </Td>
      <Td>{formatDate(market.market.endDate)}</Td>
      <Td>{formatProbability(market.odds.yesPrice)}</Td>
      <Td>{formatProbability(market.odds.noPrice)}</Td>
      <Td>{formatProbability(market.odds.yesMidpoint)}</Td>
      <Td>{formatProbability(market.odds.spread)}</Td>
      <Td>{market.odds.liquidityStatus}</Td>
      <Td>{market.bindingStatus}</Td>
      <Td>{market.researchEligible ? "eligible" : "data insufficient"}</Td>
      <Td>
        <ul className="grid max-w-[260px] gap-1">
          {(market.researchRejectReasons.length ? market.researchRejectReasons : ["None"]).slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Td>
      <Td>
        <div>{market.odds.provider}</div>
        <div className="text-slate-500">{market.odds.sourceType}</div>
        <div className="text-slate-500">{formatTime(market.odds.checkedAt)}</div>
      </Td>
    </tr>
  );
}

async function loadPolymarketActiveMarkets(symbol: SignalSymbol | "ALL"): Promise<LoadState> {
  try {
    const response = await fetch(`${apiBaseUrl}/markets/polymarket/active?symbol=${symbol}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return { error: await apiErrorMessage(response) };
    }
    return { data: (await response.json()) as PolymarketActiveMarketsResponse };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Polymarket active markets API request failed." };
  }
}

function parseSymbol(value?: string): SignalSymbol | "ALL" {
  return value === "BTC" || value === "ETH" ? value : "ALL";
}

function SegmentedLink({ current, value }: { current: SignalSymbol | "ALL"; value: SignalSymbol | "ALL" }) {
  const active = current === value;
  return (
    <Link
      className={`border px-3 py-2 text-xs font-semibold ${active ? "border-slate-100 bg-slate-100 text-slate-950" : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"}`}
      href={value === "ALL" ? "/markets/polymarket" : `/markets/polymarket?symbol=${value}`}
    >
      {value}
    </Link>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="border border-cyan-400/50 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{children}</span>;
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-10 border border-slate-800 bg-slate-950 px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function Th({ children }: { children: string }) {
  return <th className="border border-slate-800 px-2 py-2">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border border-slate-800 px-2 py-2">{children}</td>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">{message}</div>;
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border border-amber-500/40 bg-amber-500/10 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">{title}</h3>
      <ul className="mt-2 grid gap-1 text-xs leading-5 text-amber-100">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function formatProbability(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "Unavailable" : value.toFixed(3);
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(0, 16).replace("T", " ");
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(11, 19);
}
