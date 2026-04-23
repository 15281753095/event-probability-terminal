import Link from "next/link";
import type {
  EventMarket,
  OrderBookSnapshot,
  ScannerCandidate,
  ScannerTopResponse
} from "@ept/shared-types";

export const dynamic = "force-dynamic";

type PageParams = Promise<{
  id: string;
}>;

type MarketPayload = {
  market: EventMarket;
};

type BookPayload = {
  market: EventMarket;
  book: OrderBookSnapshot;
};

type LoadState = {
  market?: EventMarket;
  candidate?: ScannerCandidate;
  book?: OrderBookSnapshot;
  error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default async function MarketDetail({ params }: { params: PageParams }) {
  const { id } = await params;
  const marketId = safeDecode(id);
  const state = await loadMarketDetail(marketId);

  if (state.error || !state.market) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
        <section className="mx-auto max-w-5xl border border-border bg-white p-6">
          <Link className="text-sm text-teal-700 underline" href="/">
            Back to scanner
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">Market unavailable</h1>
          <p className="mt-2 text-sm text-red-700">{state.error ?? "Market not found."}</p>
        </section>
      </main>
    );
  }

  const market = state.market;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <section className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 border border-border bg-white">
          <header className="border-b border-border p-5">
            <Link className="text-sm text-teal-700 underline" href="/">
              Back to scanner
            </Link>
            <p className="mt-4 text-sm font-medium text-teal-700">Market Detail RC-1</p>
            <h1 className="mt-1 text-2xl font-semibold">{market.question}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge>{market.asset}</Badge>
              <Badge>{market.window}</Badge>
              <Badge>{market.outcomeType}</Badge>
              <Badge>{market.provenance.sourceMode}</Badge>
            </div>
          </header>

          <div className="grid gap-4 p-5">
            <section className="grid gap-3 md:grid-cols-3">
              <Metric label="Market probability" value={marketProbability(market)} />
              <Metric label="Liquidity" value={formatNumber(market.metrics.liquidity)} />
              <Metric label="Spread" value={formatProb(market.metrics.spread)} />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Panel title="Binary Outcomes">
                <dl className="grid gap-3 text-sm">
                  <OutcomeRow label="Primary" value={market.outcomes.primary.label} />
                  <OutcomeRow label="Secondary" value={market.outcomes.secondary.label} />
                  <OutcomeRow label="Primary bid / ask" value={primaryOutcomeQuote(market)} />
                  <OutcomeRow label="Last trade" value={formatProb(market.metrics.lastTradePrice)} />
                </dl>
              </Panel>

              <Panel title="Timing">
                <dl className="grid gap-3 text-sm">
                  <OutcomeRow label="Event start" value={market.event.startAt ?? "n/a"} />
                  <OutcomeRow label="Event end" value={market.event.endAt ?? "n/a"} />
                  <OutcomeRow label="Market start" value={market.market.startAt ?? "n/a"} />
                  <OutcomeRow label="Market end" value={market.market.endAt ?? "n/a"} />
                </dl>
              </Panel>
            </section>

            <Panel title="Order Book Snapshot">
              {state.book ? <OrderBookTable book={state.book} /> : <p className="text-sm text-slate-600">No book snapshot available from the current fixture-backed adapter.</p>}
            </Panel>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <Panel title="Placeholder Pricing">
            {state.candidate ? (
              <div className="grid gap-3 text-sm">
                <div>
                  <div className="font-semibold text-amber-700">placeholder only</div>
                  <div className="text-slate-600">{state.candidate.fairValue.modelVersion}</div>
                </div>
                <OutcomeRow
                  label="Primary fair probability"
                  value={formatNullableProb(
                    state.candidate.fairValue.fairProbabilityByOutcome.primary.probability
                  )}
                />
                <OutcomeRow
                  label="Secondary fair probability"
                  value={formatNullableProb(
                    state.candidate.fairValue.fairProbabilityByOutcome.secondary.probability
                  )}
                />
                <OutcomeRow label="Confidence" value={formatNullableProb(state.candidate.fairValue.confidence)} />
                <ul className="grid gap-1 text-xs text-slate-600">
                  {state.candidate.fairValue.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-600">No scanner candidate pricing payload found.</p>
            )}
          </Panel>

          <Panel title="Provenance">
            <dl className="grid gap-3 text-sm">
              <OutcomeRow label="Source" value={market.provenance.source} />
              <OutcomeRow label="Mode" value={market.provenance.sourceMode} />
              <OutcomeRow label="Classification" value={market.provenance.classificationSource} />
              <OutcomeRow label="Market ID" value={market.market.id} />
              <OutcomeRow label="Condition ID" value={market.market.conditionId} />
            </dl>
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-xs font-semibold text-slate-500">Evidence</h3>
              <ul className="mt-2 grid gap-1 text-xs text-slate-600">
                {market.provenance.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Open Gaps">
            <ul className="grid gap-2 text-xs text-slate-600">
              {market.uncertainty.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

async function loadMarketDetail(marketId: string): Promise<LoadState> {
  try {
    const [marketResponse, scannerResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/markets/${encodeURIComponent(marketId)}`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/scanner/top`, { cache: "no-store" })
    ]);

    if (!marketResponse.ok) {
      return {
        error: `API returned HTTP ${marketResponse.status}.`
      };
    }

    const marketPayload = (await marketResponse.json()) as MarketPayload;
    const scannerPayload = scannerResponse.ok
      ? ((await scannerResponse.json()) as ScannerTopResponse)
      : undefined;
    const candidate = scannerPayload?.candidates.find((item) => item.market.id === marketPayload.market.id);
    const book = await loadBook(marketPayload.market.id);

    return {
      market: marketPayload.market,
      ...(candidate ? { candidate } : {}),
      ...(book ? { book } : {})
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "API request failed."
    };
  }
}

async function loadBook(marketId: string) {
  try {
    const response = await fetch(`${apiBaseUrl}/markets/${encodeURIComponent(marketId)}/book`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = (await response.json()) as BookPayload;
    return payload.book;
  } catch {
    return undefined;
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="border border-border bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </section>
  );
}

function OutcomeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800">{value}</dd>
    </div>
  );
}

function OrderBookTable({ book }: { book: OrderBookSnapshot }) {
  const rows = Array.from({ length: Math.max(book.bids.length, book.asks.length) }).slice(0, 5);
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500">
        <tr>
          <th className="border-b border-border py-2">Bid</th>
          <th className="border-b border-border py-2">Bid size</th>
          <th className="border-b border-border py-2">Ask</th>
          <th className="border-b border-border py-2">Ask size</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((_, index) => {
          const bid = book.bids[index];
          const ask = book.asks[index];
          return (
            <tr key={`${bid?.price ?? "bid"}-${ask?.price ?? "ask"}-${index}`}>
              <td className="border-b border-border py-2">{bid?.price ?? "n/a"}</td>
              <td className="border-b border-border py-2">{bid?.size ?? "n/a"}</td>
              <td className="border-b border-border py-2">{ask?.price ?? "n/a"}</td>
              <td className="border-b border-border py-2">{ask?.size ?? "n/a"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="border border-border bg-slate-50 px-2 py-0.5">{children}</span>;
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

function formatNullableProb(value: number | null) {
  return value === null ? "n/a" : formatProb(value);
}

function formatProb(value?: number) {
  return value === undefined ? "n/a" : value.toFixed(3);
}

function formatNumber(value?: number) {
  return value === undefined
    ? "n/a"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
