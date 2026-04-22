import type { EventMarket } from "@ept/shared-types";

export const dynamic = "force-dynamic";

type MarketsResponse = {
  markets: EventMarket[];
  meta?: {
    mode?: string;
    rejectedCount?: number;
    uncertainty?: string[];
  };
};

type PageState = {
  markets: EventMarket[];
  error?: string;
  meta?: MarketsResponse["meta"];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function Home() {
  const state = await loadMarkets();
  const markets = state.markets;
  const highestLiquidity = maxBy(markets, (market) => market.metrics.liquidity ?? 0);
  const widestSpread = maxBy(markets, (market) => market.metrics.spread ?? 0);
  const expiringSoon = minBy(markets, (market) =>
    market.market.endAt ? new Date(market.market.endAt).getTime() : Number.POSITIVE_INFINITY
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="border border-border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Filters
          </h2>
          <div className="mt-4 grid gap-4">
            <FilterGroup title="Assets" values={["BTC", "ETH"]} />
            <FilterGroup title="Windows" values={["10m", "1h"]} />
            <FilterGroup title="Venue" values={["Polymarket"]} />
            <FilterGroup title="Mode" values={["Fixture read"]} />
          </div>
        </aside>

        <section className="min-w-0 border border-border bg-white">
          <header className="flex flex-col gap-2 border-b border-border p-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-teal-700">
                Markets Scanner
              </p>
              <h1 className="mt-1 text-2xl font-semibold">BTC / ETH Event Markets</h1>
            </div>
            <div className="text-sm text-slate-600">
              Source: Polymarket / {state.meta?.mode ?? "unknown"}
            </div>
          </header>

          {state.error ? <ErrorState message={state.error} /> : null}
          {!state.error && markets.length === 0 ? <EmptyState /> : null}

          {!state.error && markets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
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
                  {markets.map((market) => (
                    <tr className="border-t border-border" key={market.id}>
                      <TableCell className="min-w-[260px] font-medium">
                        <div>{market.question}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {market.asset} / {market.window}
                        </div>
                      </TableCell>
                      <TableCell>{market.venue}</TableCell>
                      <TableCell>{countdown(market.market.endAt)}</TableCell>
                      <TableCell>{primaryOutcomeQuote(market)}</TableCell>
                      <TableCell>{marketProbability(market)}</TableCell>
                      <TableCell>{formatNumber(market.metrics.liquidity)}</TableCell>
                      <TableCell>{formatProb(market.metrics.spread)}</TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-amber-700">placeholder</span>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <aside className="grid content-start gap-4">
          <SummaryPanel title="Top candidates" value={`${markets.length}`} detail="read-only" />
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
          <section className="border border-border bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              Notes
            </h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
              <li>Fair probability: placeholder</li>
              <li>Edge: placeholder</li>
              <li>Rejected fixture rows: {state.meta?.rejectedCount ?? 0}</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}

async function loadMarkets(): Promise<PageState> {
  try {
    const response = await fetch(`${apiBaseUrl}/markets`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return {
        markets: [],
        error: `API returned HTTP ${response.status}.`
      };
    }
    const payload = (await response.json()) as MarketsResponse;
    return {
      markets: payload.markets ?? [],
      ...(payload.meta ? { meta: payload.meta } : {})
    };
  } catch (error) {
    return {
      markets: [],
      error: error instanceof Error ? error.message : "API request failed."
    };
  }
}

function FilterGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span className="border border-border bg-slate-50 px-2 py-1 text-xs" key={value}>
            {value}
          </span>
        ))}
      </div>
    </section>
  );
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
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h2>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{detail}</div>
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

function marketProbability(market: EventMarket) {
  const bid = market.metrics.bestBid;
  const ask = market.metrics.bestAsk;
  if (bid === undefined || ask === undefined) {
    return "n/a";
  }
  return formatProb((bid + ask) / 2);
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
