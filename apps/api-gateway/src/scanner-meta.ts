import type { RejectionSummary } from "@ept/shared-types";

type AdapterRejection = {
  marketId?: string;
  reason: string;
};

export function summarizeRejections(
  rejected: AdapterRejection[],
  limit = 5
): RejectionSummary[] {
  const byReason = new Map<string, { count: number; sampleMarketIds: string[] }>();

  for (const item of rejected) {
    const current = byReason.get(item.reason) ?? { count: 0, sampleMarketIds: [] };
    current.count += 1;
    if (item.marketId && current.sampleMarketIds.length < 3) {
      current.sampleMarketIds.push(item.marketId);
    }
    byReason.set(item.reason, current);
  }

  return Array.from(byReason.entries())
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      sampleMarketIds: value.sampleMarketIds
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, limit);
}
