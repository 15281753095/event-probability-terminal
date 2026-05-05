import type {
  OhlcvCandle,
  OhlcvInterval,
  RealTimePriceTick,
  RealtimePriceSymbol,
  SignalSymbol
} from "@ept/shared-types";

export const BINANCE_SPOT_PUBLIC_WS_BASE_URL = "wss://data-stream.binance.vision";

export type BinanceRealtimeStreamType = "trade" | "aggTrade" | "bookTicker" | "kline_1m" | "kline_5m";

export type BinanceRealtimeParseResult =
  | { ok: true; tick: RealTimePriceTick }
  | { ok: false; reason: string };

export type RealtimeWebSocketLike = {
  close: () => void;
  send?: (data: string) => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
};

export type RealtimeWebSocketFactory = (url: string) => RealtimeWebSocketLike;

export type BinanceRealtimeClientOptions = {
  symbol: SignalSymbol;
  streams?: BinanceRealtimeStreamType[];
  now?: () => string;
  staleAfterMs?: number;
  maxReconnects?: number;
  reconnectBaseDelayMs?: number;
  websocketFactory?: RealtimeWebSocketFactory;
  onTick: (tick: RealTimePriceTick) => void;
  onStatus?: (status: "connecting" | "open" | "stale" | "reconnecting" | "closed" | "failed", reason?: string) => void;
};

export class BinanceSpotRealtimeClient {
  private readonly options: Required<Omit<BinanceRealtimeClientOptions, "websocketFactory" | "onStatus">> &
    Pick<BinanceRealtimeClientOptions, "websocketFactory" | "onStatus">;
  private socket: RealtimeWebSocketLike | undefined;
  private reconnectCount = 0;
  private closedByUser = false;
  private staleTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private lastTickAtMs = 0;

  constructor(options: BinanceRealtimeClientOptions) {
    this.options = {
      streams: ["trade", "bookTicker", "kline_1m"],
      now: () => new Date().toISOString(),
      staleAfterMs: 15_000,
      maxReconnects: 3,
      reconnectBaseDelayMs: 1_000,
      ...options
    };
  }

  start() {
    this.closedByUser = false;
    this.open();
    this.staleTimer = setInterval(() => {
      if (this.lastTickAtMs > 0 && Date.now() - this.lastTickAtMs > this.options.staleAfterMs) {
        this.options.onStatus?.("stale", `No Binance Spot public realtime tick for ${this.options.staleAfterMs}ms.`);
      }
    }, Math.max(1_000, Math.floor(this.options.staleAfterMs / 2)));
  }

  stop() {
    this.closedByUser = true;
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
    this.options.onStatus?.("closed");
  }

  private open() {
    if (this.closedByUser) {
      return;
    }
    const factory = this.options.websocketFactory ?? defaultWebSocketFactory;
    this.options.onStatus?.(this.reconnectCount === 0 ? "connecting" : "reconnecting");
    const socket = factory(buildBinanceSpotRealtimeStreamUrl(this.options.symbol, this.options.streams));
    this.socket = socket;
    socket.onopen = () => {
      this.options.onStatus?.("open");
    };
    socket.onmessage = (event) => {
      const parsed = parseBinanceSpotRealtimeMessage(event.data, this.options.now());
      if (!parsed.ok) {
        this.options.onStatus?.("stale", parsed.reason);
        return;
      }
      this.lastTickAtMs = Date.now();
      this.reconnectCount = 0;
      this.options.onTick(parsed.tick);
    };
    socket.onerror = () => {
      this.options.onStatus?.("reconnecting", "Binance Spot public WebSocket error.");
    };
    socket.onclose = () => {
      if (this.closedByUser) {
        return;
      }
      if (this.reconnectCount >= this.options.maxReconnects) {
        this.options.onStatus?.("failed", "Binance Spot public WebSocket reconnect limit reached.");
        return;
      }
      this.reconnectCount += 1;
      const delay = this.options.reconnectBaseDelayMs * this.reconnectCount;
      this.options.onStatus?.("reconnecting", `Reconnecting Binance Spot public WebSocket in ${delay}ms.`);
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
  }
}

export function buildBinanceSpotRealtimeStreamUrl(
  symbol: SignalSymbol,
  streams: BinanceRealtimeStreamType[] = ["trade", "bookTicker", "kline_1m"]
): string {
  const streamNames = streams.map((stream) => `${toBinanceRealtimeSymbol(symbol).toLowerCase()}@${stream}`);
  return `${BINANCE_SPOT_PUBLIC_WS_BASE_URL}/stream?streams=${streamNames.join("/")}`;
}

export function toBinanceRealtimeSymbol(symbol: SignalSymbol): RealtimePriceSymbol {
  return symbol === "BTC" ? "BTCUSDT" : "ETHUSDT";
}

export function parseBinanceSpotRealtimeMessage(data: unknown, receivedAt = new Date().toISOString()): BinanceRealtimeParseResult {
  let payload: unknown = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return { ok: false, reason: "Binance realtime message was not valid JSON." };
    }
  }
  const record = unwrapCombinedStream(payload);
  if (!record) {
    return { ok: false, reason: "Binance realtime message was not an object." };
  }
  const eventType = record.e;
  if (eventType === "trade") {
    return parseBinanceTrade(record, receivedAt);
  }
  if (eventType === "aggTrade") {
    return parseBinanceAggTrade(record, receivedAt);
  }
  if (eventType === "bookTicker" || record.u !== undefined) {
    return parseBinanceBookTicker(record, receivedAt);
  }
  if (eventType === "kline") {
    return parseBinanceKline(record, receivedAt);
  }
  return { ok: false, reason: "Unsupported Binance realtime event type." };
}

export function parseBinanceTrade(record: Record<string, unknown>, receivedAt = new Date().toISOString()): BinanceRealtimeParseResult {
  return parseTrade(record, receivedAt, "trade");
}

export function parseBinanceAggTrade(record: Record<string, unknown>, receivedAt = new Date().toISOString()): BinanceRealtimeParseResult {
  return parseTrade(record, receivedAt, "aggTrade");
}

function parseTrade(record: Record<string, unknown>, receivedAt: string, eventType: "trade" | "aggTrade"): BinanceRealtimeParseResult {
  const symbol = parseRealtimeSymbol(record.s);
  const price = toFiniteNumber(record.p);
  const eventTime = toIsoTime(record.E);
  if (!symbol || price === undefined || !eventTime) {
    return { ok: false, reason: `Malformed Binance ${eventType} event.` };
  }
  return {
    ok: true,
    tick: {
      symbol,
      displaySymbol: symbol,
      provider: "binance-spot-public",
      sourceType: "live",
      eventType,
      price,
      eventTime,
      receivedAt,
      latencyMs: latencyMs(eventTime, receivedAt),
      sequenceId: eventType === "aggTrade" ? toSequence(record.a) : toSequence(record.t),
      rawProviderEventType: typeof record.e === "string" ? record.e : undefined
    }
  };
}

export function parseBinanceBookTicker(record: Record<string, unknown>, receivedAt = new Date().toISOString()): BinanceRealtimeParseResult {
  const symbol = parseRealtimeSymbol(record.s);
  const bidPrice = toFiniteNumber(record.b);
  const askPrice = toFiniteNumber(record.a);
  if (!symbol || bidPrice === undefined || askPrice === undefined) {
    return { ok: false, reason: "Malformed Binance bookTicker event." };
  }
  const price = Number(((bidPrice + askPrice) / 2).toFixed(8));
  return {
    ok: true,
    tick: {
      symbol,
      displaySymbol: symbol,
      provider: "binance-spot-public",
      sourceType: "live",
      eventType: "bookTicker",
      price,
      bidPrice,
      askPrice,
      eventTime: receivedAt,
      receivedAt,
      latencyMs: null,
      sequenceId: toSequence(record.u),
      rawProviderEventType: typeof record.e === "string" ? record.e : "bookTicker"
    }
  };
}

export function parseBinanceKline(record: Record<string, unknown>, receivedAt = new Date().toISOString()): BinanceRealtimeParseResult {
  const kline = record.k;
  if (!kline || typeof kline !== "object" || Array.isArray(kline)) {
    return { ok: false, reason: "Malformed Binance kline event." };
  }
  const item = kline as Record<string, unknown>;
  const symbol = parseRealtimeSymbol(record.s ?? item.s);
  const openTime = toFiniteNumber(item.t);
  const interval = parseKlineInterval(item.i);
  const open = toFiniteNumber(item.o);
  const high = toFiniteNumber(item.h);
  const low = toFiniteNumber(item.l);
  const close = toFiniteNumber(item.c);
  const volume = toFiniteNumber(item.v);
  const eventTime = toIsoTime(record.E);
  if (!symbol || openTime === undefined || !interval || open === undefined || high === undefined || low === undefined || close === undefined || volume === undefined || !eventTime) {
    return { ok: false, reason: "Malformed Binance kline event." };
  }
  const timestamp = new Date(openTime).toISOString();
  const candle: OhlcvCandle = { timestamp, open, high, low, close, volume };
  return {
    ok: true,
    tick: {
      symbol,
      displaySymbol: symbol,
      provider: "binance-spot-public",
      sourceType: "live",
      eventType: "kline",
      price: close,
      eventTime,
      receivedAt,
      latencyMs: latencyMs(eventTime, receivedAt),
      sequenceId: toSequence(item.L),
      isClosedKline: item.x === true,
      rawProviderEventType: "kline",
      candle
    }
  };
}

function unwrapCombinedStream(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

function parseRealtimeSymbol(value: unknown): RealtimePriceSymbol | undefined {
  return value === "BTCUSDT" || value === "ETHUSDT" ? value : undefined;
}

function parseKlineInterval(value: unknown): OhlcvInterval | undefined {
  return value === "1m" || value === "5m" ? value : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoTime(value: unknown): string | undefined {
  const ms = toFiniteNumber(value);
  if (ms === undefined) {
    return undefined;
  }
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function latencyMs(eventTime: string, receivedAt: string): number | null {
  const value = Date.parse(receivedAt) - Date.parse(eventTime);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function toSequence(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function defaultWebSocketFactory(url: string): RealtimeWebSocketLike {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => RealtimeWebSocketLike }).WebSocket;
  if (!WebSocketCtor) {
    throw new Error("Global WebSocket is unavailable for Binance Spot public realtime adapter.");
  }
  return new WebSocketCtor(url);
}
