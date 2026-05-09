export type AppLocale = "zh-CN" | "en-US";

export function resolveLocale(value?: string): AppLocale {
  return value === "en" || value === "en-US" ? "en-US" : "zh-CN";
}

export function localeQueryValue(locale: AppLocale): "zh" | "en" {
  return locale === "en-US" ? "en" : "zh";
}

export function getDictionary(locale: AppLocale): AppDictionary {
  return dictionaries[locale] as AppDictionary;
}

export function withLang(path: string, locale: AppLocale): string {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("lang", localeQueryValue(locale));
  return `${url.pathname}${url.search}`;
}

const dictionaries = {
  "zh-CN": {
    locale: {
      code: "zh-CN",
      languageName: "中文",
      switchLabel: "语言"
    },
    nav: {
      product: "Event Probability Terminal",
      home: "首页",
      shortWindow: "短周期终端",
      replay: "回放统计",
      strategyLab: "策略实验室",
      dataStore: "数据仓库",
      researchOnly: "仅研究用途",
      publicReadOnly: "仅使用公开只读数据"
    },
    common: {
      symbol: "币种",
      eventInterval: "事件周期",
      chartInterval: "K 线周期",
      range: "范围",
      source: "数据源",
      provider: "提供方",
      status: "状态",
      checkedAt: "检查时间",
      loading: "加载中",
      empty: "暂无数据",
      error: "加载失败",
      refresh: "刷新",
      live: "实时",
      stored: "本地缓存",
      mock: "模拟",
      warning: "警告",
      unavailable: "不可用",
      pending: "等待中",
      recentSignals: "最近信号",
      showRecentSignals: "显示最近信号",
      hideRecentSignals: "隐藏最近信号",
      debugDetails: "调试详情",
      sourceBadge: "来源",
      latestPrice: "最新价",
      startReference: "起始参考价",
      manualOnly: "仅供人工判断",
      noTrading: "不接交易 API",
      noAutoExecution: "不做自动执行",
      notTradingAdvice: "非交易建议"
    },
    shortWindow: {
      title: "短周期事件合约终端",
      subtitle: "使用公开市场数据和本地研究缓存，为 BTC / ETH 短周期事件合约提供人工研究支持。",
      chartTitle: "专业 K 线",
      chartSubtitle: "图表只使用 Binance public market data 或明确标记的本地缓存 / mock 数据。",
      signalTitle: "当前信号",
      signalReasons: "信号原因",
      rejectReasons: "等待 / 拒绝原因",
      metricsTitle: "历史代理胜率",
      metricsSubtitle: "WAIT 与 REJECTED 不计入胜率分母。",
      eventTitle: "当前事件窗口",
      countdown: "倒计时",
      runtimePrice: "运行时价格",
      referencePrice: "起始参考价",
      currentPrice: "当前价格",
      confidence: "置信度",
      score: "评分",
      phase: "阶段",
      venue: "场景",
      ruleTitle: "规则模板",
      ruleNotes: "规则说明",
      ruleWarning: "未核验规则 / 代理模型",
      ruleVerified: "已核验 Mock 规则",
      providerHealth: "提供方健康度",
      recentActionableSignals: "最近可执行信号",
      markerSummary: "信号摘要",
      noSignalRow: "暂无最近信号",
      noSignalMarkers: "当前图表不显示短周期 marker。",
      longHistoryWarning: "长周期图表默认压缩或隐藏短周期 marker，避免污染 K 线。",
      intervalDerived: "10m 为派生周期",
      intervalDerivedFrom: "由 1m 聚合"
    },
    home: {
      title: "研究终端首页",
      subtitle: "公开只读行情、事件合约研究、回放统计与本地研究数据入口。"
    },
    replay: {
      title: "回放统计",
      subtitle: "历史信号回放、胜率与样本质量诊断。"
    },
    strategyLab: {
      title: "策略实验室",
      subtitle: "参数扫描与 walk-forward 验证，仅作研究用途。"
    },
    dataStore: {
      title: "研究数据仓库",
      subtitle: "本地只读研究数据、覆盖范围与采集状态。"
    },
    markers: {
      up: "UP",
      down: "DOWN",
      rejected: "拒绝",
      wait: "等待"
    }
  },
  "en-US": {
    locale: {
      code: "en-US",
      languageName: "English",
      switchLabel: "Language"
    },
    nav: {
      product: "Event Probability Terminal",
      home: "Home",
      shortWindow: "Short Window",
      replay: "Replay",
      strategyLab: "Strategy Lab",
      dataStore: "Data Store",
      researchOnly: "Research Only",
      publicReadOnly: "Public read-only market data only"
    },
    common: {
      symbol: "Symbol",
      eventInterval: "Event Interval",
      chartInterval: "Chart Interval",
      range: "Range",
      source: "Source",
      provider: "Provider",
      status: "Status",
      checkedAt: "Checked",
      loading: "Loading",
      empty: "No data",
      error: "Load failed",
      refresh: "Refresh",
      live: "Live",
      stored: "Local Cache",
      mock: "Mock",
      warning: "Warning",
      unavailable: "Unavailable",
      pending: "Pending",
      recentSignals: "Recent Signals",
      showRecentSignals: "Show recent signals",
      hideRecentSignals: "Hide recent signals",
      debugDetails: "Debug Details",
      sourceBadge: "Source",
      latestPrice: "Latest Price",
      startReference: "Start Reference",
      manualOnly: "Manual review only",
      noTrading: "No trading API",
      noAutoExecution: "No auto execution",
      notTradingAdvice: "Not trading advice"
    },
    shortWindow: {
      title: "Short-Window Event Contract Terminal",
      subtitle: "Manual research support for BTC / ETH short-window event contracts using public market data and local research cache.",
      chartTitle: "Professional K-Line",
      chartSubtitle: "Charts use Binance public market data or explicitly labeled local cache / mock data only.",
      signalTitle: "Current Signal",
      signalReasons: "Signal Reasons",
      rejectReasons: "Wait / Reject Reasons",
      metricsTitle: "Historical Proxy Win Rate",
      metricsSubtitle: "WAIT and REJECTED are excluded from the win-rate denominator.",
      eventTitle: "Current Event Window",
      countdown: "Countdown",
      runtimePrice: "Runtime Price",
      referencePrice: "Start Reference",
      currentPrice: "Current Price",
      confidence: "Confidence",
      score: "Score",
      phase: "Phase",
      venue: "Venue",
      ruleTitle: "Rule Template",
      ruleNotes: "Rule Notes",
      ruleWarning: "Unverified Rule / Proxy Model",
      ruleVerified: "Verified Mock Rule",
      providerHealth: "Provider Health",
      recentActionableSignals: "Recent Actionable Signals",
      markerSummary: "Marker Summary",
      noSignalRow: "No recent signals",
      noSignalMarkers: "Short-window markers are hidden on this chart.",
      longHistoryWarning: "Long-range charts compress or hide short-window markers to keep the K-line readable.",
      intervalDerived: "10m is a derived interval",
      intervalDerivedFrom: "Derived from 1m"
    },
    home: {
      title: "Research Terminal",
      subtitle: "Public read-only market data, event-contract research, replay analytics, and local research storage."
    },
    replay: {
      title: "Replay Analytics",
      subtitle: "Historical replay, win-rate analysis, and sample-quality diagnostics."
    },
    strategyLab: {
      title: "Strategy Lab",
      subtitle: "Parameter sweep and walk-forward validation for research only."
    },
    dataStore: {
      title: "Research Data Store",
      subtitle: "Local read-only research data, coverage, and capture status."
    },
    markers: {
      up: "UP",
      down: "DOWN",
      rejected: "Rejected",
      wait: "Wait"
    }
  }
} as const;

type DeepWidenStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? DeepWidenStrings<T[K]>
      : T[K];
};

export type AppDictionary = DeepWidenStrings<(typeof dictionaries)["zh-CN"]>;
