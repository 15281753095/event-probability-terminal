import Link from "next/link";
import type { Asset, EventMarket, ScannerCandidate, ScannerTopResponse, TimeWindow } from "@ept/shared-types";

export const dynamic = "force-dynamic";

type PageState = {
  candidates: ScannerCandidate[];
  error?: string;
  meta?: ScannerTopResponse["meta"];
};

type SearchParams = Promise<{
  asset?: string;
  window?: string;
  sort?: string;
}>;

type SortKey = "expiry" | "liquidity" | "spread" | "marketProb";

type ScannerFilters = {
  asset: Asset | "all";
  window: TimeWindow | "all";
  sort: SortKey;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const state = await loadScanner();
  const candidates = sortCandidates(filterCandidates(state.candidates, filters), filters.sort);
  const allMarkets = state.candidates.map((candidate) => candidate.market);
  const visibleMarkets = candidates.map((candidate) => candidate.market);
  const highestLiquidity = maxBy(visibleMarkets, (market) => market.metrics.liquidity ?? 0);
  const widestSpread = maxBy(visibleMarkets, (market) => market.metrics.spread ?? 0);
  const expiringSoon = minBy(visibleMarkets, (market) =>
    market.market.endAt ? new Date(market.market.endAt).getTime() : Number.POSITIVE_INFINITY
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="border border-border bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Research Filters</h2>
          <div className="mt-4 grid gap-4">
            <FilterGroup
              current={filters}
              options={["all", "BTC", "ETH"]}
              paramName="asset"
              title="Assets"
            />
            <FilterGroup
              current={filters}
              options={["all", "10m", "1h"]}
              paramName="window"
              title="Windows"
            />
            <FilterGroup
              current={filters}
              options={["expiry", "liquidity", "spread", "marketProb"]}
              paramName="sort"
              title="Sort"
            />
          </div>
          <section className="mt-5 border-t border-border pt-4 text-sm text-slate-600">
            <div>Venue: Polymarket</div>
            <div>Mode: {state.meta?.mode ?? "unknown"}</div>
            <div>Scope: read-only</div>
          </section>
        </aside>

        <section className="min-w-0 border border-border bg-white">
          <header className="flex flex-col gap-2 border-b border-border p-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Markets Scanner RC-1</p>
              <h1 className="mt-1 text-2xl font-semibold">BTC / ETH Event Markets</h1>
              <p className="mt-1 text-sm text-slate-600">
                Showing {visibleMarkets.length} of {allMarkets.length} fixture-backed candidates.
              </p>
            </div>
            <div className="text-sm text-slate-600">
              Source: Polymarket / {state.meta?.mode ?? "unknown"}
            </div>
          </header>

          {state.error ? <ErrorState message={state.error} /> : null}
          {!state.error && visibleMarkets.length === 0 ? <EmptyState /> : null}

          {!state.error && visibleMarkets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <TableHead>Question</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Outcome bid / ask</TableHead>
                    <TableHead>MarketProb</TableHead>
                    <TableHead>Liquidity</TableHead>
                    <TableHead>Spread</TableHead>
                    <TableHead>Fair / Edge</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => {
                    const market = candidate.market;
                    return (
                      <tr className="border-t border-border" key={market.id}>
                        <TableCell className="min-w-[280px] font-medium">
                          <Link
                            className="text-slate-950 underline decoration-slate-300 underline-offset-4 hover:text-teal-700"
                            href={`/markets/${encodeURIComponent(market.id)}`}
                          >
                            {market.question}
                          </Link>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            <Badge>{market.asset}</Badge>
                            <Badge>{market.window}</Badge>
                            <Badge>{market.outcomeType}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>{market.venue}</TableCell>
                        <TableCell>{countdown(market.market.endAt)}</TableCell>
                        <TableCell>{primaryOutcomeQuote(market)}</TableCell>
                        <TableCell>{marketProbability(market)}</TableCell>
                        <TableCell>{formatNumber(market.metrics.liquidity)}</TableCell>
                        <TableCell>{formatProb(market.metrics.spread)}</TableCell>
                        <TableCell>
                          <PlaceholderPricing fairValue={candidate.fairValue} />
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <aside className="grid content-start gap-4">
          <SummaryPanel title="Visible candidates" value={`${visibleMarkets.length}`} detail="read-only" />
          <SummaryPanel
            title="Highest liquidity"
            value={highestLiquidity ? formatNumber(highestLiquidity.metrics.liquidity) : "n/a"}
            detail={highestLiquidity?.asset ?? "none"}
          />
          <SummaryPanel
            title="Widest spread"
            value={widestSpread ? formatProb(widestSpread.metrics.spread) : "n/a"}
            detail={widestSpread?.asset ?? "none"}
          />
          <SummaryPanel
            title="Expiring soon"
            value={expiringSoon ? countdown(expiringSoon.market.endAt) : "n/a"}
            detail={expiringSoon?.asset ?? "none"}
          />
          <EvidencePanel meta={state.meta} />
        </aside>
      </section>
    </main>
  );
}

async function loadScanner(): Promise<PageState> {
  try {
    const response = await fetch(`${apiBaseUrl}/scanner/top`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return {
        candidates: [],
        error: `API returned HTTP ${response.status}.`
      };
    }
    const payload = (await response.json()) as ScannerTopResponse;
    return {
      candidates: payload.candidates ?? [],
      ...(payload.meta ? { meta: payload.meta } : {})
    };
  } catch (error) {
    return {
      candidates: [],
      error: error instanceof Error ? error.message : "API request failed."
    };
  }
}

function parseFilters(params: Awaited<SearchParams>): ScannerFilters {
  return {
    asset: params.asset === "BTC" || params.asset === "ETH" ? params.asset : "all",
    window: params.window === "10m" || params.window === "1h" ? params.window : "all",
    sort:
      params.sort === "liquidity" || params.sort === "spread" || params.sort === "marketProb"
        ? params.sort
        : "expiry"
  };
}

function filterCandidates(candidates: ScannerCandidate[], filters: ScannerFilters) {
  return candidates.filter((candidate) => {
    const market = candidate.market;
    return (
      (filters.asset === "all" || market.asset === filters.asset) &&
      (filters.window === "all" || market.window === filters.window)
    );
  });
}

function sortCandidates(candidates: ScannerCandidate[], sort: SortKey) {
  return [...candidates].sort((a, b) => {
    if (sort === "expiry") {
      return marketEndTime(a.market) - marketEndTime(b.market);
    }
    if (sort === "liquidity") {
      return (b.market.metrics.liquidity ?? 0) - (a.market.metrics.liquidity ?? 0);
    }
    if (sort === "spread") {
      return (b.market.metrics.spread ?? 0) - (a.market.metrics.spread ?? 0);
    }
    return observedMidpoint(b.market) - observedMidpoint(a.market);
  });
}

function FilterGroup({
  title,
  paramName,
  options,
  current
}: {
  title: string;
  paramName: keyof ScannerFilters;
  options: string[];
  current: ScannerFilters;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((value) => {
          const active = current[paramName] === value;
          const update = { [paramName]: value } as Partial<Record<keyof ScannerFilters, string>>;
          return (
            <Link
              className={`border px-2 py-1 text-xs ${
                active ? "border-teal-700 bg-teal-50 text-teal-800" : "border-border bg-slate-50"
              }`}
              href={scannerHref(current, update)}
              key={value}
            >
              {value}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function scannerHref(current: ScannerFilters, updates: Partial<Record<keyof ScannerFilters, string>>) {
  const next = {
    asset: updates.asset ?? current.asset,
    window: updates.window ?? current.window,
    sort: updates.sort ?? current.sort
  };
  const params = new URLSearchParams();
  if (next.asset !== "all") {
    params.set("asset", next.asset);
  }
  if (next.window !== "all") {
    params.set("window", next.window);
  }
  if (next.sort !== "expiry") {
    params.set("sort", next.sort);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function SummaryPanel({
  title,
  value,
  detail
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="border border-border bg-white p-4">
      <h2 className="text-xs font-semibold text-slate-500">{title}</h2>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{detail}</div>
    </section>
  );
}

function EvidencePanel({ meta }: { meta: ScannerTopResponse["meta"] | undefined }) {
  return (
    <section className="border border-border bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Evidence Status</h2>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
        <li>Pricing: {meta?.pricing ?? "placeholder"}</li>
        <li>Rejected rows: {meta?.rejectedCount ?? 0}</li>
        <li>Fair probability: placeholder only</li>
        <li>Edge: placeholder only</li>
      </ul>
      {meta?.rejectionSummary?.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-slate-500">Fail-closed summary</h3>
          <div className="mt-2 grid gap-2">
            {meta.rejectionSummary.map((item) => (
              <div className="text-xs text-slate-600" key={item.reason}>
                <span className="font-semibold text-slate-800">{item.count}</span> {item.reason}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {meta?.uncertainty?.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-slate-500">Open evidence gaps</h3>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600">
            {meta.uncertainty.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        API unavailable: {message}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <div className="border border-border bg-slate-50 p-4 text-sm text-slate-700">
        No markets returned for the current fixture-backed scope.
      </div>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-border px-3 py-3 font-semibold">{children}</th>;
}

function TableCell({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`border-b border-border px-3 py-3 align-top ${className}`}>{children}</td>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="border border-border bg-slate-50 px-2 py-0.5">{children}</span>;
}

function PlaceholderPricing({ fairValue }: { fairValue: ScannerCandidate["fairValue"] }) {
  return (
    <div className="grid gap-1 text-xs">
      <span className="font-semibold text-amber-700">placeholder</span>
      <span className="text-slate-500">{fairValue.modelVersion}</span>
      <span className="text-slate-500">confidence: n/a</span>
    </div>
  );
}

function marketProbability(market: EventMarket) {
  const midpoint = observedMidpointOrUndefined(market);
  return midpoint === undefined ? "n/a" : formatProb(midpoint);
}

function observedMidpoint(market: EventMarket) {
  return observedMidpointOrUndefined(market) ?? -1;
}

function observedMidpointOrUndefined(market: EventMarket) {
  const bid = market.metrics.bestBid;
  const ask = market.metrics.bestAsk;
  if (bid === undefined || ask === undefined) {
    return undefined;
  }
  return (bid + ask) / 2;
}

function primaryOutcomeQuote(market: EventMarket) {
  const label = market.outcomes.primary.label;
  return `${label} ${formatProb(market.metrics.bestBid)} / ${formatProb(market.metrics.bestAsk)}`;
}

function countdown(value?: string) {
  if (!value) {
    return "n/a";
  }
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) {
    return "n/a";
  }
  const deltaMs = end - Date.now();
  if (deltaMs <= 0) {
    return "expired";
  }
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function marketEndTime(market: EventMarket) {
  return market.market.endAt ? new Date(market.market.endAt).getTime() : Number.POSITIVE_INFINITY;
}

function formatProb(value?: number) {
  return value === undefined ? "n/a" : value.toFixed(3);
}

function formatNumber(value?: number) {
  return value === undefined
    ? "n/a"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function maxBy<T>(values: T[], getValue: (value: T) => number) {
  return values.reduce<T | undefined>((best, item) => {
    if (!best) {
      return item;
    }
    return getValue(item) > getValue(best) ? item : best;
  }, undefined);
}

function minBy<T>(values: T[], getValue: (value: T) => number) {
  return values.reduce<T | undefined>((best, item) => {
    if (!best) {
      return item;
    }
    return getValue(item) < getValue(best) ? item : best;
  }, undefined);
}
