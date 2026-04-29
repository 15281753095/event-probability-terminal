import Link from "next/link";
import type {
  Asset,
  EventSignalConsoleResponse,
  EventMarket,
  ResearchSignal,
  ResearchSignalSourceMode,
  ResearchSignalsResponse,
  ScannerCandidate,
  ScannerTopResponse,
  SignalHorizon,
  SignalSymbol,
  TimeWindow
} from "@ept/shared-types";
import { apiErrorMessage } from "./api-client";
import { ConsoleCandlestickChart } from "./ConsoleCandlestickChart";
import { EventSignalRuntimePanel } from "./EventSignalRuntimePanel";

export const dynamic = "force-dynamic";

type PageState = {
  candidates: ScannerCandidate[];
  error?: string;
  meta?: ScannerTopResponse["meta"];
  signals: ResearchSignal[];
  signalError?: string;
  signalMeta?: ResearchSignalsResponse["meta"];
  console?: EventSignalConsoleResponse;
  consoleError?: string;
};

type SearchParams = Promise<{
  asset?: string;
  window?: string;
  sort?: string;
  q?: string;
  signalSourceMode?: string;
  consoleSymbol?: string;
  consoleHorizon?: string;
  consoleSourceMode?: string;
  consoleBacktest?: string;
  consoleRefresh?: string;
}>;

type SortKey = "expiry" | "liquidity" | "spread" | "marketProb";

type ScannerFilters = {
  asset: Asset | "all";
  window: TimeWindow | "all";
  sort: SortKey;
  query: string;
  signalSourceMode: ResearchSignalSourceMode;
  consoleSymbol: SignalSymbol;
  consoleHorizon: SignalHorizon;
  consoleSourceMode: ResearchSignalSourceMode;
  consoleBacktest: boolean;
  consoleRefresh: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const [scannerState, signalState, consoleState] = await Promise.all([
    loadScanner(),
    loadResearchSignals(filters.signalSourceMode),
    loadEventSignalConsole(filters)
  ]);
  const state: PageState = {
    ...scannerState,
    signals: signalState.signals,
    ...(signalState.error ? { signalError: signalState.error } : {}),
    ...(signalState.meta ? { signalMeta: signalState.meta } : {}),
    ...(consoleState.console ? { console: consoleState.console } : {}),
    ...(consoleState.error ? { consoleError: consoleState.error } : {})
  };
  const candidates = sortCandidates(filterCandidates(state.candidates, filters), filters.sort);
  const allMarkets = state.candidates.map((candidate) => candidate.market);
  const visibleMarkets = candidates.map((candidate) => candidate.market);
  const highestLiquidity = maxBy(visibleMarkets, (market) => market.metrics.liquidity ?? 0);
  const widestSpread = maxBy(visibleMarkets, (market) => market.metrics.spread ?? 0);
  const expiringSoon = minBy(visibleMarkets, (market) =>
    market.market.endAt ? new Date(market.market.endAt).getTime() : Number.POSITIVE_INFINITY
  );

  return (
    <main className="min-h-screen bg-[#070b12] px-4 py-4 text-slate-100">
      <section className="mx-auto grid max-w-[1500px] gap-4">
        <EventSignalConsolePanel
          console={state.console}
          current={filters}
          error={state.consoleError}
        />

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="border border-slate-800 bg-[#0b111d] p-4">
            <h2 className="text-sm font-semibold text-slate-100">Market Filters</h2>
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
              <QuerySearch current={filters} />
            </div>
            <section className="mt-5 border-t border-slate-800 pt-4 text-sm text-slate-400">
              <div>Venue: Polymarket</div>
              <div>Mode: {state.meta?.mode ?? "unknown"}</div>
              <div>Contract: {state.meta?.contractVersion ?? "unknown"}</div>
              <div>Scope: read-only</div>
            </section>
          </aside>

          <section className="min-w-0 border border-slate-800 bg-[#0b111d]">
            <header className="flex flex-col gap-2 border-b border-slate-800 p-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-300">Markets Scanner RC-2</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-50">BTC / ETH Event Markets</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Showing {visibleMarkets.length} of {allMarkets.length} fixture-backed candidates.
                  {filters.query ? ` Query: ${filters.query}` : ""}
                </p>
              </div>
              <div className="text-sm text-slate-400">
                Source: Polymarket / {state.meta?.mode ?? "unknown"}
              </div>
            </header>

            {state.error ? <ErrorState message={state.error} /> : null}
            {!state.error ? (
              <ResearchStatusStrip
                meta={state.meta}
                totalCount={allMarkets.length}
                visibleCount={visibleMarkets.length}
              />
            ) : null}
            {!state.error && visibleMarkets.length === 0 ? <EmptyState /> : null}

            {!state.error && visibleMarkets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-[#0f172a] text-left text-xs text-slate-400">
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
                            className="text-slate-100 underline decoration-slate-600 underline-offset-4 hover:text-cyan-300"
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
          <ResearchSignalPanel
            current={filters}
            error={state.signalError}
            meta={state.signalMeta}
            signals={state.signals}
          />
          <EvidencePanel meta={state.meta} />
          </aside>
        </section>
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
        signals: [],
        error: await apiErrorMessage(response)
      };
    }
    const payload = (await response.json()) as ScannerTopResponse;
    return {
      candidates: payload.candidates ?? [],
      signals: [],
      ...(payload.meta ? { meta: payload.meta } : {})
    };
  } catch (error) {
    return {
      candidates: [],
      signals: [],
      error: error instanceof Error ? error.message : "API request failed."
    };
  }
}

async function loadResearchSignals(sourceMode: ResearchSignalSourceMode): Promise<{
  signals: ResearchSignal[];
  error?: string;
  meta?: ResearchSignalsResponse["meta"];
}> {
  try {
    const url =
      sourceMode === "live"
        ? `${apiBaseUrl}/signals/research?sourceMode=live`
        : `${apiBaseUrl}/signals/research`;
    const response = await fetch(url, {
      cache: "no-store"
    });
    if (!response.ok) {
      return {
        signals: [],
        error: await apiErrorMessage(response)
      };
    }
    const payload = (await response.json()) as ResearchSignalsResponse;
    return {
      signals: payload.signals ?? [],
      ...(payload.meta ? { meta: payload.meta } : {})
    };
  } catch (error) {
    return {
      signals: [],
      error: error instanceof Error ? error.message : "Signal API request failed."
    };
  }
}

async function loadEventSignalConsole(filters: ScannerFilters): Promise<{
  console?: EventSignalConsoleResponse;
  error?: string;
}> {
  const params = new URLSearchParams({
    symbol: filters.consoleSymbol,
    horizon: filters.consoleHorizon,
    sourceMode: filters.consoleSourceMode
  });
  if (filters.consoleBacktest) {
    params.set("includeBacktest", "true");
  }
  try {
    const response = await fetch(`${apiBaseUrl}/signals/console?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return {
        error: await apiErrorMessage(response)
      };
    }
    return {
      console: (await response.json()) as EventSignalConsoleResponse
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Event Signal Console API request failed."
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
        : "expiry",
    query: typeof params.q === "string" ? params.q.trim().slice(0, 80) : "",
    signalSourceMode: params.signalSourceMode === "live" ? "live" : "fixture",
    consoleSymbol: params.consoleSymbol === "ETH" ? "ETH" : "BTC",
    consoleHorizon: params.consoleHorizon === "10m" ? "10m" : "5m",
    consoleSourceMode: params.consoleSourceMode === "live" ? "live" : "fixture",
    consoleBacktest: params.consoleBacktest === "1",
    consoleRefresh: typeof params.consoleRefresh === "string" ? params.consoleRefresh.slice(0, 32) : ""
  };
}

function filterCandidates(candidates: ScannerCandidate[], filters: ScannerFilters) {
  return candidates.filter((candidate) => {
    const market = candidate.market;
    return (
      (filters.asset === "all" || market.asset === filters.asset) &&
      (filters.window === "all" || market.window === filters.window) &&
      queryMatches(candidate, filters.query)
    );
  });
}

function queryMatches(candidate: ScannerCandidate, query: string) {
  if (!query) {
    return true;
  }
  const market = candidate.market;
  const haystack = [
    market.id,
    market.question,
    market.asset,
    market.window,
    market.outcomes.primary.label,
    market.outcomes.secondary.label,
    market.market.id,
    market.event.title ?? "",
    market.market.slug ?? ""
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
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
          const update = { [paramName]: value } as Partial<ScannerFilters>;
          return (
            <Link
              className={`border px-2 py-1 text-xs ${
                active ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"
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

function QuerySearch({ current }: { current: ScannerFilters }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500">Query</h3>
      <form action="/" className="mt-2 grid gap-2">
        {current.asset !== "all" ? <input name="asset" type="hidden" value={current.asset} /> : null}
        {current.window !== "all" ? <input name="window" type="hidden" value={current.window} /> : null}
        {current.sort !== "expiry" ? <input name="sort" type="hidden" value={current.sort} /> : null}
        {current.signalSourceMode === "live" ? <input name="signalSourceMode" type="hidden" value="live" /> : null}
        {current.consoleSymbol !== "BTC" ? <input name="consoleSymbol" type="hidden" value={current.consoleSymbol} /> : null}
        {current.consoleHorizon !== "5m" ? <input name="consoleHorizon" type="hidden" value={current.consoleHorizon} /> : null}
        {current.consoleSourceMode === "live" ? <input name="consoleSourceMode" type="hidden" value="live" /> : null}
        {current.consoleRefresh ? <input name="consoleRefresh" type="hidden" value={current.consoleRefresh} /> : null}
        <input
          className="min-h-9 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 placeholder:text-slate-600"
          defaultValue={current.query}
          name="q"
          placeholder="Question, outcome, id"
          type="search"
        />
        <div className="flex items-center gap-2">
          <button className="border border-cyan-400 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100" type="submit">
            Search
          </button>
          {current.query ? (
            <Link className="text-xs text-slate-400 underline" href={scannerHref(current, { query: "" })}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function scannerHref(current: ScannerFilters, updates: Partial<ScannerFilters>) {
  const next = {
    asset: updates.asset ?? current.asset,
    window: updates.window ?? current.window,
    sort: updates.sort ?? current.sort,
    query: updates.query ?? current.query,
    signalSourceMode: updates.signalSourceMode ?? current.signalSourceMode,
    consoleSymbol: updates.consoleSymbol ?? current.consoleSymbol,
    consoleHorizon: updates.consoleHorizon ?? current.consoleHorizon,
    consoleSourceMode: updates.consoleSourceMode ?? current.consoleSourceMode,
    consoleBacktest: updates.consoleBacktest ?? current.consoleBacktest,
    consoleRefresh: updates.consoleRefresh ?? current.consoleRefresh
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
  if (next.query) {
    params.set("q", next.query);
  }
  if (next.signalSourceMode === "live") {
    params.set("signalSourceMode", "live");
  }
  if (next.consoleSymbol !== "BTC") {
    params.set("consoleSymbol", next.consoleSymbol);
  }
  if (next.consoleHorizon !== "5m") {
    params.set("consoleHorizon", next.consoleHorizon);
  }
  if (next.consoleSourceMode === "live") {
    params.set("consoleSourceMode", "live");
  }
  if (next.consoleBacktest) {
    params.set("consoleBacktest", "1");
  }
  if (next.consoleRefresh) {
    params.set("consoleRefresh", next.consoleRefresh);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function ResearchStatusStrip({
  visibleCount,
  totalCount,
  meta
}: {
  visibleCount: number;
  totalCount: number;
  meta: ScannerTopResponse["meta"] | undefined;
}) {
  return (
    <section className="grid gap-2 border-b border-slate-800 bg-[#070b12] p-4 text-sm md:grid-cols-5">
      <StatusItem label="Accepted" value={`${totalCount}`} />
      <StatusItem label="Visible" value={`${visibleCount}`} />
      <StatusItem label="Rejected" value={`${meta?.rejectedCount ?? 0}`} />
      <StatusItem label="Pricing" value={meta?.pricing ?? "placeholder"} />
      <StatusItem label="Open gaps" value={`${meta?.uncertainty.length ?? 0}`} />
    </section>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-[#0b111d] px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-100">{value}</div>
    </div>
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
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <h2 className="text-xs font-semibold text-slate-500">{title}</h2>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{detail}</div>
    </section>
  );
}

function EvidencePanel({ meta }: { meta: ScannerTopResponse["meta"] | undefined }) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <h2 className="text-sm font-semibold text-slate-100">Evidence Status</h2>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
        <li>Pricing: {meta?.pricing ?? "placeholder"}</li>
        <li>Rejected rows: {meta?.rejectedCount ?? 0}</li>
        <li>Fair probability: placeholder only</li>
        <li>Edge: placeholder only</li>
      </ul>
      {meta?.rejectionSummary?.length ? (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="text-xs font-semibold text-slate-500">Fail-closed reason matrix</h3>
          <div className="mt-2 grid gap-3">
            {meta.rejectionSummary.map((item) => (
              <div className="border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400" key={item.reason}>
                <div>
                  <span className="font-semibold text-slate-100">{item.count}</span> {item.reason}
                </div>
                {item.sampleMarketIds.length ? (
                  <div className="mt-1 text-slate-500">Samples: {item.sampleMarketIds.join(", ")}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {meta?.uncertainty?.length ? (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h3 className="text-xs font-semibold text-slate-500">Open evidence gaps</h3>
          <ul className="mt-2 grid gap-1 text-xs text-slate-400">
            {meta.uncertainty.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function EventSignalConsolePanel({
  console,
  error,
  current
}: {
  console: EventSignalConsoleResponse | undefined;
  error: string | undefined;
  current: ScannerFilters;
}) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] shadow-2xl shadow-black/30" data-testid="event-signal-console">
      <header className="grid gap-4 border-b border-slate-800 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.95fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300">
            <span>Event Probability Terminal</span>
            <span className="text-slate-600">/</span>
            <span>RC-10 Workbench</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50 md:text-3xl">Event Signal Workbench</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            BTC/ETH short-horizon research console with recent K-line markers, confluence scoring, and fail-closed risk filters.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <WorkbenchBadge>Research only</WorkbenchBadge>
            <WorkbenchBadge>Not trade advice</WorkbenchBadge>
            <WorkbenchBadge>No auto trading</WorkbenchBadge>
          </div>
        </div>
        <div className="grid gap-3 rounded border border-slate-800 bg-[#070b12] p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <ConsoleSelector current={current} label="Symbol" options={["BTC", "ETH"]} paramName="consoleSymbol" />
            <ConsoleSelector current={current} label="Horizon" options={["5m", "10m"]} paramName="consoleHorizon" />
            <ConsoleSelector current={current} label="Source" options={["fixture", "live"]} paramName="consoleSourceMode" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="border border-cyan-500/70 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
              href={scannerHref(current, { consoleRefresh: String(Date.now()) })}
            >
              Refresh
            </a>
            <Link
              className={`border px-3 py-2 text-xs font-semibold ${
                current.consoleBacktest
                  ? "border-amber-400/70 bg-amber-400/10 text-amber-100"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/70"
              }`}
              href={scannerHref(current, { consoleBacktest: !current.consoleBacktest })}
            >
              {current.consoleBacktest ? "Hide backtest preview" : "Show backtest preview"}
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <div className="m-4 border border-rose-500/50 bg-rose-950/40 p-3 text-sm text-rose-100">
          Event Signal Console unavailable: {error}
        </div>
      ) : null}

      {!error && console ? (
        <div className="grid gap-4 p-4">
          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_repeat(4,minmax(130px,0.22fr))]">
            <div className="border border-slate-800 bg-[#070b12] p-4" data-testid="signal-hero">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current signal</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <SignalDirectionBadge direction={console.currentSignal.direction} size="lg" />
                    <span className="text-lg font-semibold text-slate-100">
                      {console.symbol} {console.horizon} / {displaySourceMode(console.sourceMode)}
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Source: {displaySource(console.currentSignal.source)}</div>
                  <div>Generated: {formatTime(console.meta.generatedAt)}</div>
                </div>
              </div>
            </div>
            <HeroMetric label="Confidence" value={formatProb(console.confluence.confidence)} tone={scoreTone(console.confluence.confidence)} />
            <HeroMetric label="Total score" value={formatSigned(console.confluence.totalScore)} tone={directionTone(console.currentSignal.direction)} />
            <HeroMetric label="Freshness" value={displayFreshness(console.currentSignal)} tone={console.currentSignal.dataQuality.status === "ok" ? "good" : "warn"} />
            <HeroMetric label="Markers" value={`${console.recentMarkers.length}/20`} tone={console.recentMarkers.length <= 20 ? "neutral" : "warn"} />
          </section>

          <EventSignalRuntimePanel initialConsole={console} />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.42fr)_420px]">
            <div className="border border-slate-800 bg-[#070b12] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Recent K-line</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {console.recentCandles.length} candles, recent signal markers only. Full-history overlays are not loaded.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <MarkerKey label="LONG bias" tone="long" />
                  <MarkerKey label="SHORT bias" tone="short" />
                  <MarkerKey label="NO_SIGNAL" tone="neutral" />
                </div>
              </div>
              <ConsoleCandlestickChart candles={console.recentCandles} markers={console.recentMarkers} />
            </div>

            <aside className="grid content-start gap-3">
              <ReasonList title="Why this signal" reasons={console.confluence.reasons} />
              <ReasonList title="Veto reasons" reasons={console.confluence.vetoReasons} emptyText="No active veto." />
              <ReasonList title="Fail-closed reasons" reasons={console.currentSignal.failClosedReasons} emptyText="No fail-closed reason." />
              <ReasonList title="Warnings" reasons={console.warnings} emptyText="No active warning." />
            </aside>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="confluence-cards">
              <ConfluenceCard label="Trend" value={console.confluence.trendScore} />
              <ConfluenceCard label="Momentum" value={console.confluence.momentumScore} />
              <ConfluenceCard label="Volatility" value={console.confluence.volatilityScore} />
              <ConfluenceCard label="Volume" value={console.confluence.volumeScore} />
              <RiskScoreCard label="Reversal risk" value={console.confluence.reversalRisk} />
              <RiskScoreCard label="Chop risk" value={console.confluence.chopRisk} />
            </div>
            <div className="grid gap-3">
              <section className="border border-slate-800 bg-[#070b12] p-3">
                <h3 className="text-sm font-semibold text-slate-100">Risk Filters</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <RiskPill label="Freshness" value={console.riskFilters.dataFreshness} />
                  <RiskPill label="Volatility" value={console.riskFilters.volatility} />
                  <RiskPill label="Volume" value={console.riskFilters.volumeConfirmation} />
                  <RiskPill label="Chop" value={console.riskFilters.chop} />
                  <RiskPill label="Conflict" value={console.riskFilters.conflict} />
                  <RiskPill label="Mean revert" value={console.riskFilters.meanReversion} />
                </div>
              </section>
              <BacktestPreviewPanel console={console} current={current} />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ConsoleSelector({
  label,
  options,
  paramName,
  current
}: {
  label: string;
  options: string[];
  paramName: "consoleSymbol" | "consoleHorizon" | "consoleSourceMode";
  current: ScannerFilters;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((value) => {
          const active = current[paramName] === value;
          return (
            <Link
              className={`border px-2 py-1 ${
                active ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
              }`}
              href={scannerHref(current, { [paramName]: value, consoleBacktest: false } as Partial<ScannerFilters>)}
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

function WorkbenchBadge({ children }: { children: React.ReactNode }) {
  return <span className="border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">{children}</span>;
}

function HeroMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
      : tone === "bad"
        ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
        : tone === "warn"
          ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
          : "border-slate-800 bg-[#070b12] text-slate-100";
  return (
    <div className={`border p-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function MarkerKey({ label, tone }: { label: string; tone: "long" | "short" | "neutral" }) {
  const color = tone === "long" ? "bg-emerald-400" : tone === "short" ? "bg-rose-400" : "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <span className={`h-2 w-2 ${color}`} />
      {label}
    </span>
  );
}

function ConfluenceCard({ label, value }: { label: string; value: number }) {
  const tone = value > 0.12 ? "good" : value < -0.12 ? "bad" : "neutral";
  return (
    <section className={`border p-3 ${cardToneClass(tone)}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
        <span className="text-sm font-semibold">{formatSigned(value)}</span>
      </div>
      <div className="mt-3 h-2 bg-slate-900">
        <div className={`h-2 ${value >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${Math.min(Math.abs(value), 1) * 100}%` }} />
      </div>
    </section>
  );
}

function RiskScoreCard({ label, value }: { label: string; value: number }) {
  const tone = value > 0.66 ? "bad" : value > 0.33 ? "warn" : "neutral";
  return (
    <section className={`border p-3 ${cardToneClass(tone)}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
        <span className="text-sm font-semibold">{formatProb(value)}</span>
      </div>
      <div className="mt-3 h-2 bg-slate-900">
        <div className={tone === "bad" ? "h-2 bg-rose-400" : tone === "warn" ? "h-2 bg-amber-400" : "h-2 bg-slate-500"} style={{ width: `${Math.min(value, 1) * 100}%` }} />
      </div>
    </section>
  );
}

function RiskPill({ label, value }: { label: string; value: string }) {
  const tone =
    value === "pass" || value === "confirmed"
      ? "good"
      : value === "veto" || value === "missing"
        ? "bad"
        : value === "watch" || value === "weak"
          ? "warn"
          : "neutral";
  return (
    <div className={`border px-3 py-2 ${cardToneClass(tone)}`}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function cardToneClass(tone: "good" | "bad" | "warn" | "neutral") {
  if (tone === "good") {
    return "border-emerald-500/30 bg-emerald-500/5";
  }
  if (tone === "bad") {
    return "border-rose-500/30 bg-rose-500/5";
  }
  if (tone === "warn") {
    return "border-amber-500/30 bg-amber-500/5";
  }
  return "border-slate-800 bg-[#070b12]";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-950 px-2 py-1">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 break-words font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ReasonList({
  title,
  reasons,
  emptyText = "None"
}: {
  title: string;
  reasons: string[];
  emptyText?: string;
}) {
  return (
    <section className="border border-slate-800 bg-[#070b12] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {reasons.length ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
          {reasons.slice(0, 6).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">{emptyText}</p>
      )}
    </section>
  );
}

function BacktestPreviewPanel({
  console,
  current
}: {
  console: EventSignalConsoleResponse;
  current: ScannerFilters;
}) {
  if (!console.backtestPreview.enabled) {
    return (
      <section className="border border-slate-800 bg-[#070b12] p-3" data-testid="backtest-drawer">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Backtest Preview</h3>
            <p className="mt-1 text-xs text-slate-500">Collapsed by default. Loads only after user action.</p>
          </div>
          <Link
            className="border border-amber-400/70 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/20"
            href={scannerHref(current, { consoleBacktest: true })}
          >
            Show backtest preview
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-amber-500/40 bg-amber-500/5 p-3" data-testid="backtest-drawer">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Backtest Preview</h3>
          <p className="mt-1 text-xs text-amber-100">Small local sample. Research only.</p>
        </div>
        <Link
          className="border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:border-slate-500"
          href={scannerHref(current, { consoleBacktest: false })}
        >
          Hide preview
        </Link>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
        <Metric label="Sample size" value={`${console.backtestPreview.sampleSize}`} />
        <Metric label="Win rate" value={formatNullableProb(console.backtestPreview.winRate)} />
        <Metric label="Average move" value={formatNullableReturn(console.backtestPreview.averageReturn)} />
        <Metric label="Max drawdown proxy" value={formatNullableReturn(console.backtestPreview.maxDrawdownProxy)} />
      </div>
      <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-400">
        {console.backtestPreview.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
    </section>
  );
}

function ResearchSignalPanel({
  signals,
  meta,
  error,
  current
}: {
  signals: ResearchSignal[];
  meta: ResearchSignalsResponse["meta"] | undefined;
  error: string | undefined;
  current: ScannerFilters;
}) {
  return (
    <section className="border border-slate-800 bg-[#0b111d] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Research Signal Panel</h2>
          <p className="mt-1 text-xs text-slate-500">{meta?.modelVersion ?? "research-signal-engine-v0"}</p>
        </div>
        <Badge>Research only</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link
          className={`border px-2 py-1 ${
            current.signalSourceMode === "fixture" ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"
          }`}
          href={scannerHref(current, { signalSourceMode: "fixture" })}
        >
          Fixture
        </Link>
        <Link
          className={`border px-2 py-1 ${
            current.signalSourceMode === "live" ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"
          }`}
          href={scannerHref(current, { signalSourceMode: "live" })}
        >
          Live
        </Link>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Direction is a research bias. Research only. Not trade advice.
      </p>
      <div className="mt-2 grid gap-1 text-xs text-slate-400">
        <div>Mode: {displaySourceMode(meta?.mode ?? current.signalSourceMode)}</div>
        <div>Source: {displaySource(meta?.sourceName ?? "fixture")}</div>
      </div>
      {error ? (
        <div className="mt-3 border border-rose-500/40 bg-rose-950/40 p-2 text-xs text-rose-100">
          Signal API unavailable: {error}
        </div>
      ) : null}
      {!error ? (
        <div className="mt-3 grid gap-3">
          {signals.map((signal) => (
            <article className="border border-slate-800 bg-slate-950 p-3" key={`${signal.symbol}-${signal.horizon}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {signal.symbol} {signal.horizon}
                </div>
                <SignalDirectionBadge direction={signal.direction} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>Confidence: {formatProb(signal.confidence)}</div>
                <div>Score: {formatSigned(signal.score)}</div>
                <div>Data: {signal.dataQuality.status}</div>
                <div>Mode: {displaySourceMode(signal.sourceMode)}</div>
                <div>Source: {displaySource(signal.source)}</div>
                <div>Freshness: {displayFreshness(signal)}</div>
              </div>
              {signal.dataQuality.warnings.length ? (
                <div className="mt-2 text-xs text-amber-200">
                  Warnings: {signal.dataQuality.warnings.slice(0, 2).join("; ")}
                </div>
              ) : null}
              <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-400">
                {signal.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {signal.failClosedReasons.length ? (
                <div className="mt-2 text-xs font-medium text-amber-200">
                  Fail closed: {signal.failClosedReasons.join("; ")}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function displaySourceMode(sourceMode: ResearchSignalSourceMode) {
  return sourceMode === "live" ? "Live" : "Fixture";
}

function displaySource(source: ResearchSignal["source"]) {
  return source === "coinbase_exchange" ? "coinbase-exchange" : "fixture";
}

function displayFreshness(signal: ResearchSignal) {
  const ageMs = signal.dataQuality.freshness.ageMs;
  return `${signal.dataQuality.freshness.status}${ageMs === null ? "" : ` / ${formatDuration(ageMs)}`}`;
}

function directionTone(direction: ResearchSignal["direction"]): "good" | "bad" | "warn" | "neutral" {
  if (direction === "LONG") {
    return "good";
  }
  if (direction === "SHORT") {
    return "bad";
  }
  return "warn";
}

function scoreTone(value: number): "good" | "bad" | "warn" | "neutral" {
  if (value >= 0.55) {
    return "good";
  }
  if (value > 0) {
    return "warn";
  }
  return "neutral";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toISOString().slice(11, 19);
}

function SignalDirectionBadge({ direction, size = "sm" }: { direction: ResearchSignal["direction"]; size?: "sm" | "lg" }) {
  const label =
    direction === "LONG" ? "LONG bias" : direction === "SHORT" ? "SHORT bias" : "NO_SIGNAL";
  const className =
    direction === "LONG"
      ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
      : direction === "SHORT"
        ? "border-rose-400 bg-rose-400/10 text-rose-100"
        : "border-slate-600 bg-slate-900 text-slate-200";
  const sizeClass = size === "lg" ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs";
  return <span className={`border font-semibold ${sizeClass} ${className}`}>{label}</span>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
        API unavailable: {message}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <div className="border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
        No markets returned for the current fixture-backed scope.
      </div>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-800 px-3 py-3 font-semibold">{children}</th>;
}

function TableCell({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`border-b border-slate-800 px-3 py-3 align-top text-slate-300 ${className}`}>{children}</td>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">{children}</span>;
}

function PlaceholderPricing({ fairValue }: { fairValue: ScannerCandidate["fairValue"] }) {
  return (
    <div className="grid gap-1 text-xs">
      <span className="font-semibold text-amber-200">placeholder</span>
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

function formatNullableProb(value: number | null) {
  return value === null ? "n/a" : value.toFixed(3);
}

function formatNullableReturn(value: number | null) {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatDuration(valueMs: number) {
  if (!Number.isFinite(valueMs)) {
    return "n/a";
  }
  const seconds = Math.max(0, Math.round(valueMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
