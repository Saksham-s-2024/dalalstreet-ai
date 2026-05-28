"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, TrendingUp, Clock, FileText, LogOut, Search } from "lucide-react";
import { authHeaders, clearToken, getToken } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────
type Mode = "trader" | "investor";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
type Decision = "BUY" | "SELL" | "HOLD" | "AVOID";

interface QuoteData {
  symbol: string; ltp: number; open: number; high: number;
  low: number; close: number; volume: number; change_pct: number;
  bid: number; ask: number; timestamp: string; is_mock?: boolean;
}

interface TraderReport {
  symbol: string; timestamp: string;
  technical: { ltp: number; change_pct: number; volume: number; rsi_14: number;
    vwap: number; bollinger: { upper: number; mid: number; lower: number };
    high_52w: number; low_52w: number; };
  assessment: { risk_level: RiskLevel; risk_score: number; decision: Decision;
    confidence_pct: number; entry_price: number | null; stop_loss: number | null;
    target_price: number | null; holding_period: string; summary: string;
    key_signals: string[]; warnings: string[]; technical_bias: string;
    predicted_prices_next_sessions?: number[];
    model_diagnostics?: { trained_samples?: number; used_mlp?: boolean };
  };
  from_cache: boolean;
}

interface InvestorPick {
  symbol: string; type: string; rationale: string; risk_rating: string;
  expected_return_range: string; suggested_allocation_pct: number; sip_suitable: boolean;
}

interface InvestorReport {
  asset_type: string; risk_appetite: string;
  assets_analysed: Record<string, {
    ltp: number; change_pct: number; return_1y_pct: number;
    volatility_pct: number; rsi: number; score: number;
  }>;
  recommendation: { recommendation_summary: string; top_picks: InvestorPick[];
    diversification_tip: string; risk_warning: string;
    holding_horizon: string; tax_note: string; };
  etf_research_signals?: Record<string, {
    median_negative_threshold: number;
    current_month_performance: number;
    is_buy_signal: boolean;
    signal_logic: string;
    confidence: string;
  }>;
  market_vitals?: Record<string, {
    ltp: number;
    change_pct: number;
    status: string;
  }>;
  from_cache: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SYMBOLS = ["RELIANCE","TCS","HDFCBANK","INFY","HINDUNILVR","ICICIBANK",
  "KOTAKBANK","BHARTIARTL","ITC","AXISBANK","LT","ASIANPAINT","MARUTI",
  "TITAN","BAJFINANCE","SUNPHARMA","HCLTECH","WIPRO","NESTLEIND","ULTRACEMCO"];

// ── Utils ─────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);
const fmtPrice = (n: number) => `₹${fmt(n)}`;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: "#22c55e", MEDIUM: "#eab308", HIGH: "#f97316", EXTREME: "#ef4444",
};
const DECISION_COLOR: Record<Decision, string> = {
  BUY: "#22c55e", SELL: "#ef4444", HOLD: "#eab308", AVOID: "#94a3b8",
};
const DECISION_BG: Record<Decision, string> = {
  BUY: "rgba(34,197,94,0.1)", SELL: "rgba(239,68,68,0.1)",
  HOLD: "rgba(234,179,8,0.1)", AVOID: "rgba(148,163,184,0.1)",
};

const NSE_SYMBOLS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "INFY.NS", "BHARTIARTL.NS", "ITC.NS", "SBIN.NS", "LT.NS", "HINDUNILVR.NS", "AXISBANK.NS", "KOTAKBANK.NS", "HCLTECH.NS", "ADANIENT.NS", "SUNPHARMA.NS", "BAJFINANCE.NS", "MARUTI.NS", "TITAN.NS", "ULTRACEMCO.NS", "ASIANPAINT.NS", "NTPC.NS", "TATASTEEL.NS", "POWERGRID.NS", "M&M.NS", "ADANIPORTS.NS", "JSWSTEEL.NS", "TATAMOTORS.NS", "BAJAJFINSV.NS", "NESTLEIND.NS", "GRASIM.NS", "INDUSINDBK.NS", "ONGC.NS", "TECHM.NS", "HINDALCO.NS", "WIPRO.NS", "COALINDIA.NS", "SBILIFE.NS", "BPCL.NS", "HDFCLIFE.NS", "DRREDDY.NS", "BAJAJ-AUTO.NS", "APOLLOHOSP.NS", "TATACONSUM.NS", "EICHERMOT.NS", "DIVISLAB.NS", "HEROMOTOCO.NS", "CIPLA.NS", "LTIM.NS", "BRITANNIA.NS", "UPL.NS"];
const BSE_SYMBOLS = ["RELIANCE.BO", "TCS.BO", "HDFCBANK.BO", "ICICIBANK.BO", "INFY.BO", "BHARTIARTL.BO", "ITC.BO", "SBIN.BO", "LT.BO", "HINDUNILVR.BO", "AXISBANK.BO", "KOTAKBANK.BO", "HCLTECH.BO", "SUNPHARMA.BO", "BAJFINANCE.BO", "MARUTI.BO", "TITAN.BO", "ULTRACEMCO.BO", "ASIANPAINT.BO", "NTPC.BO", "TATASTEEL.BO", "POWERGRID.BO", "M&M.BO", "JSWSTEEL.BO", "TATAMOTORS.BO", "BAJAJFINSV.BO", "NESTLEIND.BO", "INDUSINDBK.BO", "TECHM.BO", "WIPRO.BO"];

// ── Mini Sparkline ─────────────────────────────────────────────
function Sparkline({ data, color = "#22c55e", width = 80, height = 30 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Animated Counter ──────────────────────────────────────────
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 2 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    let start = display;
    const end = value;
    if (start === end) return;
    const dur = 600;
    const step = (end - start) / (dur / 16);
    let raf: number;
    const tick = () => {
      start += step;
      if ((step > 0 && start >= end) || (step < 0 && start <= end)) {
        setDisplay(end);
        return;
      }
      setDisplay(parseFloat(start.toFixed(decimals)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed frame; `display` omitted on purpose
  }, [value, decimals]);
  return <span>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

// ── Risk Gauge ────────────────────────────────────────────────
function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const color = RISK_COLOR[level];
  const angle = (score / 100) * 180 - 90;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="120" height="70" viewBox="0 0 120 70">
        <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke={color}
          strokeWidth="10" strokeLinecap="round" strokeDasharray="157" strokeDashoffset={157 - (score / 100) * 157} />
        <g transform={`rotate(${angle}, 60, 65)`}>
          <line x1="60" y1="65" x2="60" y2="22" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="60" cy="65" r="4" fill={color} />
        </g>
        <text x="60" y="80" textAnchor="middle" fill={color} fontSize="13" fontWeight="bold">{score}</text>
      </svg>
      <span className="text-xs font-semibold tracking-widest" style={{ color }}>{level} RISK</span>
    </div>
  );
}

// ── Allocation Bar ─────────────────────────────────────────────
function AllocationBar({ pct, color = "#22c55e" }: { pct: number; color?: string }) {
  return (
    <div className="relative h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
      <motion.div className="absolute top-0 left-0 h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: "easeOut" }} />
    </div>
  );
}

// ── Ticker Tape ───────────────────────────────────────────────
function TickerTape({ quotes }: { quotes: QuoteData[] }) {
  if (!quotes.length) return <div className="h-8 bg-black border-b border-white/5" />;
  return (
    <div className="overflow-hidden border-b border-white/[0.05] bg-black py-1.5" style={{ height: 36 }}>
      <motion.div className="flex gap-12 items-center h-full"
        animate={{ x: ["0%", "-50%"] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        {[...quotes, ...quotes].map((q, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap text-[10px] font-bold tracking-tight uppercase">
            <span className="text-neutral-500 font-mono">{q.symbol.replace(".NS", "").replace(".BO", "")}</span>
            <span className="text-white">₹{fmt(q.ltp)}</span>
            <span className={q.change_pct >= 0 ? "text-emerald-500" : "text-rose-500"} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {q.change_pct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5 rotate-180" />}
              {Math.abs(q.change_pct).toFixed(2)}%
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function DalalStreetAI() {
  const router = useRouter();
  const [sessionOk, setSessionOk] = useState(false);
  const [isSkipMode, setIsSkipMode] = useState(false);
  const [exchange, setExchange] = useState<"NSE" | "BSE">("BSE");
  const [activeTab, setActiveTab] = useState<"overview" | "trader" | "investor" | "reports">("overview");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [traderReport, setTraderReport] = useState<TraderReport | null>(null);
  const [investorReport, setInvestorReport] = useState<InvestorReport | null>(null);
  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [assetType, setAssetType] = useState("large_cap");
  const [riskAppetite, setRiskAppetite] = useState<"LOW"|"MODERATE"|"HIGH">("MODERATE");
  const [investorSymbols, setInvestorSymbols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState("TCS");
  const [compareQuote, setCompareQuote] = useState<QuoteData | null>(null);
  const [compareTraderReport, setCompareTraderReport] = useState<TraderReport | null>(null);
  const [subTab, setSubTab] = useState<"chart"|"report"|"indicators"|"compare">("chart");
  const [istTime, setIstTime] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [indices, setIndices] = useState<Record<string, QuoteData>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const candleDataRef = useRef<any[]>([]);

  useEffect(() => {
    if (!getToken()) setIsSkipMode(true);
    setSessionOk(true);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/v1/market/status`).then(r => r.json()).then(d => setMarketOpen(d.is_open)).catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => setIstTime(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  // Unified Indices Fetch
  useEffect(() => {
    const fetchIndices = async () => {
      const idxs = ["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT"];
      const results: Record<string, QuoteData> = {};
      await Promise.all(idxs.map(async s => {
        try {
          const r = await fetch(`${API}/api/v1/market/quote/${s}`);
          if (r.ok) results[s] = await r.json();
        } catch {}
      }));
      if (Object.keys(results).length > 0) {
        setIndices(prev => ({ ...prev, ...results }));
      }
    };
    fetchIndices();
    const id = setInterval(fetchIndices, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const fetchAllQuotes = async () => {
      const syms = exchange === "NSE" ? NSE_SYMBOLS : BSE_SYMBOLS;
      const results: Record<string, QuoteData> = {};
      const chunks = []; for (let i = 0; i < syms.length; i += 8) chunks.push(syms.slice(i, i + 8));
      for (const chunk of chunks) {
        await Promise.all(chunk.map(async s => {
          try {
            const r = await fetch(`${API}/api/v1/market/quote/${s}`);
            if (r.ok) results[s] = await r.json();
          } catch {}
        }));
      }
      if (Object.keys(results).length > 0) {
        setQuotes(prev => ({ ...prev, ...results }));
      }
    };
    fetchAllQuotes();
    const interval = setInterval(fetchAllQuotes, 20000);
    return () => clearInterval(interval);
  }, [exchange]);

  useEffect(() => {
    if (activeTab !== "trader") return;
    let ws: WebSocket | undefined;
    let reconnectTimeout: any;

    const connect = () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      const s = symbol.startsWith("^") ? symbol : (exchange === "BSE" ? `${symbol}.BO` : symbol);
      const wsUrl = API.replace("http", "ws") + `/ws/market/${s}`;
      
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => { 
          setWsConnected(false); 
          reconnectTimeout = setTimeout(connect, 3000); 
        };
        ws.onmessage = (e) => {
          const data: QuoteData = JSON.parse(e.data);
          setQuote(data);
          setPriceHistory(prev => [...prev.slice(-59), data.ltp]);
          if (seriesRef.current) {
            const ts = Math.floor(Date.now() / 1000);
            const last = candleDataRef.current[candleDataRef.current.length - 1];
            if (last && Math.floor(last.time / 60) === Math.floor(ts / 60)) {
              const updated = { ...last, high: Math.max(last.high, data.ltp), low: Math.min(last.low, data.ltp), close: data.ltp };
              candleDataRef.current[candleDataRef.current.length - 1] = updated;
              seriesRef.current.update(updated);
            } else {
              const newCandle = { time: Math.floor(ts / 60) * 60, open: data.ltp, high: data.ltp, low: data.ltp, close: data.ltp };
              candleDataRef.current.push(newCandle); seriesRef.current.update(newCandle);
            }
          }
        };
        wsRef.current = ws;
      } catch (err) {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();
    return () => { 
      if (ws) { ws.onclose = null; ws.close(); } 
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [symbol, exchange, activeTab]);

  useEffect(() => {
    if (activeTab !== "trader" || !isCompareMode) return;
    const s = compareSymbol.startsWith("^") ? compareSymbol : (exchange === "BSE" ? `${compareSymbol}.BO` : compareSymbol);
    const wsUrl = API.replace("http", "ws") + `/ws/market/${s}`;
    let ws: WebSocket | undefined;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => setCompareQuote(JSON.parse(e.data));
    } catch {}
    return () => { ws?.close(); };
  }, [compareSymbol, exchange, activeTab, isCompareMode]);

  useEffect(() => {
    if (!chartRef.current || activeTab !== "trader" || subTab !== "chart") return;
    let chart: any, series: any; let isMounted = true;
    const init = async () => {
      try {
        const { createChart } = await import("lightweight-charts");
        if (!isMounted || !chartRef.current) return;
        chart = createChart(chartRef.current!, {
          layout: { background: { color: "transparent" }, textColor: "#64748b" },
          grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", textColor: "#64748b" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true },
          width: chartRef.current!.offsetWidth, height: 300,
        });
        series = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#22c55e", borderDownColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
        chartApiRef.current = chart; seriesRef.current = series;
        const s = symbol.startsWith("^") ? symbol : (exchange === "BSE" ? `${symbol}.BO` : symbol);
        const r = await fetch(`${API}/api/v1/market/ohlc/${s}?days=2&interval=1minute`);
        if (r.ok && isMounted) {
          const d = await r.json();
          const candles = d.candles.map((c: any) => ({ time: typeof c.time === "string" ? Math.floor(new Date(c.time).getTime() / 1000) : c.time, open: c.open, high: c.high, low: c.low, close: c.close })).sort((a: any, b: any) => a.time - b.time);
          if (candles.length > 0) {
            candleDataRef.current = candles; series.setData(candles); chart.timeScale().fitContent();
          }
        }
      } catch (err) {
        console.error("Chart init error:", err);
      }
    };
    init();
    const handleResize = () => { if (chartApiRef.current && chartRef.current && isMounted) chartApiRef.current.applyOptions({ width: chartRef.current.offsetWidth }); };
    window.addEventListener("resize", handleResize);
    return () => { isMounted = false; window.removeEventListener("resize", handleResize); if (chartApiRef.current) { try { chartApiRef.current.remove(); } catch {} } chartApiRef.current = null; seriesRef.current = null; };
  }, [symbol, exchange, activeTab, subTab]);

  const generateTraderReport = async (targetSymbol?: string) => {
    const s = targetSymbol || (symbol.startsWith("^") ? symbol : (exchange === "BSE" ? `${symbol}.BO` : symbol));
    const isMain = !targetSymbol;
    if (isMain) { setLoading(true); setError(null); setTraderReport(null); }
    try {
      const r = await fetch(`${API}/api/v1/trader/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ symbol: s, timestamp: new Date().toISOString() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Report generation failed"); }
      const data = await r.json();
      if (isMain) {
        setTraderReport(data); setReportHistory(prev => [{ ...data, id: Date.now(), type: "trader" }, ...prev]);
        setSubTab("report");
      } else {
        setCompareTraderReport(data);
      }
    } catch (e: any) { if (isMain) setError(e.message || "Failed to generate report"); } finally { if (isMain) setLoading(false); }
  };

  const startComparison = async () => {
    setLoading(true); setError(null);
    await Promise.all([
      generateTraderReport(),
      generateTraderReport(compareSymbol.startsWith("^") ? compareSymbol : (exchange === "BSE" ? `${compareSymbol}.BO` : compareSymbol))
    ]);
    setSubTab("compare");
    setLoading(false);
  };

  const generateInvestorReport = async () => {
    setLoading(true); setError(null); setInvestorReport(null);
    try {
      const syms = investorSymbols.length > 0 ? investorSymbols : (assetType === "etf" ? ["NIFTYBEES.NS", "BANKBEES.NS"] : ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]);
      const r = await fetch(`${API}/api/v1/investor/report`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ asset_type: assetType, risk_appetite: riskAppetite, symbols: syms }),
      });
      if (!r.ok) {
        let msg = "Report generation failed";
        try { const e = await r.json(); msg = e.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await r.json();
      setInvestorReport(data);
      setReportHistory(prev => [{ ...data, id: Date.now(), type: "investor" }, ...prev]);
    } catch (e: any) {
      console.error("Investor report error:", e);
      setError(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  if (!sessionOk) return null;

  return (
    <div className="min-h-screen font-sans" style={{ background: "#050505", color: "#fafafa" }}>
      {/* Ticker Tape */}
      <TickerTape quotes={Object.values(quotes)} />

      {/* Header */}
      <header className="relative z-50 border-b border-white/[0.05] bg-black/50 backdrop-blur-xl py-3 px-4 sm:px-8">
        <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-white/5 flex items-center justify-center group-hover:border-emerald-500/50 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-black text-lg leading-tight tracking-tight">DalalStreet AI</h1>
              <p className="text-[9px] text-neutral-500 font-bold tracking-[0.2em] uppercase">INDIAN MARKET INTELLIGENCE</p>
            </div>
          </Link>

          {/* Navigation Tabs */}
          <nav className="flex bg-neutral-900/50 p-1 rounded-xl border border-white/5 mx-auto lg:mx-0">
            {[
              { id: "overview", label: "Overview", icon: Zap },
              { id: "trader", label: "Trader", icon: Zap },
              { id: "investor", label: "Investor", icon: TrendingUp },
              { id: "reports", label: "Reports", icon: FileText },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === t.id ? "bg-white text-black shadow-lg shadow-white/10" : "text-neutral-500 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-4 ml-auto">
            {/* Live Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{wsConnected ? "Live" : "Reconnecting"}</span>
            </div>

            {/* NSE/BSE Toggle */}
            <div className="flex bg-neutral-900/50 p-1 rounded-lg border border-white/5 h-10">
              {["NSE", "BSE"].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setExchange(ex as any)}
                  className={`px-4 rounded-md text-[10px] font-black tracking-widest transition-all ${exchange === ex ? "bg-white text-black" : "text-neutral-500 hover:text-white"}`}
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Auth Buttons */}
            {isSkipMode ? (
              <div className="flex items-center gap-2">
                <button onClick={() => router.push("/login")} className="h-10 px-6 rounded-xl bg-neutral-900 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-neutral-800">Sign in</button>
                <button onClick={() => router.push("/login")} className="h-10 px-6 rounded-xl bg-white text-black text-[10px] font-bold uppercase tracking-widest shadow-xl">Register</button>
              </div>
            ) : (
              <button onClick={() => { clearToken(); router.push("/login"); }} className="h-10 px-4 rounded-xl bg-neutral-900 border border-white/5 text-neutral-400 hover:text-rose-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            )}

            {/* Market Status */}
            <div className="flex items-center gap-3 bg-neutral-900/50 border border-white/5 px-4 h-10 rounded-xl">
              <span className={`w-2 h-2 rounded-full ${marketOpen ? "bg-emerald-500" : "bg-rose-500"} animate-pulse`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {exchange} {marketOpen ? "Open" : "Closed"}
              </span>
            </div>

            {/* Clock */}
            <div className="hidden xl:flex items-center gap-2 bg-neutral-900/50 border border-white/5 px-4 h-10 rounded-xl tabular-nums">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-[10px] font-bold text-neutral-300">{istTime}</span>
              <span className="text-[8px] text-neutral-600 font-bold uppercase">IST</span>
            </div>
          </div>
        </div>
      </header>

      {/* Banner */}
      {isSkipMode && (
        <div className="max-w-[1400px] mx-auto px-4 mt-6">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_50px_rgba(34,197,94,0.05)]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-medium text-emerald-500 tracking-wide">
                Unlocked the full potential: Sign in or register to save reports, track your portfolio, and get personalized AI alerts.
              </p>
            </div>
            <button onClick={() => router.push("/login")} className="bg-white text-black px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform">
              Sign In
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {/* Summary Section */}
              <div className="mb-10">
                <h2 className="text-2xl font-black tracking-tight text-white mb-1 uppercase">Hi, User</h2>
                <p className="text-neutral-500 text-sm mb-8">Welcome to DalalStreet AI — Your market intelligence dashboard</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Exchange", value: exchange, icon: <Zap className="w-5 h-5" /> },
                    { label: "Market Status", value: marketOpen ? "Open" : "Closed", icon: <Clock className="w-5 h-5" />, statusColor: marketOpen ? "text-emerald-500" : "text-rose-500" },
                    { label: "Symbols Tracked", value: exchange === "NSE" ? NSE_SYMBOLS.length : BSE_SYMBOLS.length, icon: <TrendingUp className="w-5 h-5" /> },
                    { label: "Reports Generated", value: "0", icon: <FileText className="w-5 h-5" /> },
                  ].map((card) => (
                    <div key={card.label} className="bg-neutral-900/40 border border-white/[0.05] p-6 rounded-2xl hover:bg-neutral-900/60 transition-colors">
                      <div className="text-neutral-400 mb-4">{card.icon}</div>
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">{card.label}</div>
                      <div className={`text-xl font-bold uppercase tracking-tight ${card.statusColor || "text-white"}`}>{card.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Watchlist Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-neutral-900/30 border border-white/[0.05] rounded-3xl overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
                    <h3 className="text-xs font-black tracking-[0.2em] uppercase text-neutral-300">Live Watchlist — {exchange}</h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                      Auto-refresh
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] font-bold tracking-[0.2em] text-neutral-600 uppercase border-b border-white/[0.03]">
                          <th className="px-8 py-5">Symbol</th>
                          <th className="px-8 py-5">LTP</th>
                          <th className="px-8 py-5">Change %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {(exchange === "NSE" ? NSE_SYMBOLS : BSE_SYMBOLS).map((s) => {
                          const q = quotes[s];
                          return (
                            <tr key={s} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => { setSymbol(s.replace(".NS", "").replace(".BO", "")); setActiveTab("trader"); }}>
                              <td className="px-8 py-5">
                                <div className="font-black text-xs text-white group-hover:text-emerald-500 transition-colors">{s.replace(".NS", "").replace(".BO", "")}</div>
                              </td>
                              <td className="px-8 py-5 font-mono text-xs tabular-nums text-white">₹{q ? fmt(q.ltp) : "—"}</td>
                              <td className={`px-8 py-5 font-mono text-xs tabular-nums font-bold ${q?.change_pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {q ? (q.change_pct >= 0 ? "+" : "") + q.change_pct.toFixed(2) + "%" : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Top Gainers */}
                  <div className="bg-neutral-900/40 border border-white/[0.05] rounded-3xl p-6">
                    <h3 className="text-[10px] font-black tracking-widest text-emerald-500 uppercase mb-6 flex items-center gap-2">
                      <TrendingUp className="w-3 h-3" /> Top Gainers
                    </h3>
                    <div className="space-y-4">
                      {Object.values(quotes)
                        .sort((a, b) => b.change_pct - a.change_pct)
                        .slice(0, 5)
                        .map((q) => (
                          <div key={q.symbol} className="flex items-center justify-between group cursor-pointer" onClick={() => { setSymbol(q.symbol.replace(".NS", "").replace(".BO", "")); setActiveTab("trader"); }}>
                            <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors">{q.symbol.replace(".NS", "").replace(".BO", "")}</span>
                            <span className="text-xs font-black text-emerald-500">+{q.change_pct.toFixed(2)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Top Losers */}
                  <div className="bg-neutral-900/40 border border-white/[0.05] rounded-3xl p-6">
                    <h3 className="text-[10px] font-black tracking-widest text-rose-500 uppercase mb-6 flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 rotate-180" /> Top Losers
                    </h3>
                    <div className="space-y-4">
                      {Object.values(quotes)
                        .sort((a, b) => a.change_pct - b.change_pct)
                        .slice(0, 5)
                        .map((q) => (
                          <div key={q.symbol} className="flex items-center justify-between group cursor-pointer" onClick={() => { setSymbol(q.symbol.replace(".NS", "").replace(".BO", "")); setActiveTab("trader"); }}>
                            <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors">{q.symbol.replace(".NS", "").replace(".BO", "")}</span>
                            <span className="text-xs font-black text-rose-500">{q.change_pct.toFixed(2)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "trader" && (
            <motion.div key="trader" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              
              {/* Indices Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                {[
                  { id: "^NSEI", label: "NIFTY 50" },
                  { id: "^BSESN", label: "SENSEX" },
                  { id: "^NSEBANK", label: "NIFTY BANK" },
                  { id: "^CNXIT", label: "NIFTY IT" },
                ].map(idx => {
                  const data = indices[idx.id];
                  const diff = data ? data.ltp - data.open : 0;
                  return (
                    <div key={idx.id} 
                      onClick={() => { setSymbol(idx.id); setActiveTab("trader"); }}
                      className="bg-neutral-900/40 border border-white/5 rounded-2xl p-5 hover:bg-neutral-900/60 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-neutral-400 tracking-widest group-hover:text-emerald-500 transition-colors">{idx.label}</span>
                        {data && (
                          <div className={`px-2 py-0.5 rounded-md text-[9px] font-black ${data.change_pct >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                            {data.change_pct >= 0 ? "+" : ""}{data.change_pct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="text-xl font-black text-white">{data ? fmt(data.ltp) : "—"}</div>
                        <div className={`text-[10px] font-bold mb-1 ${diff >= 0 ? "text-emerald-500/70" : "text-rose-500/70"}`}>
                          {data ? (diff >= 0 ? "+" : "") + diff.toFixed(2) : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left Panel */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                  <div className="rounded-3xl p-8 bg-neutral-900/40 border border-white/[0.05] shadow-2xl">
                    
                    {/* Search & Selector */}
                    <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                      <div className="w-full md:w-auto flex-1">
                        <label className="text-[10px] text-neutral-500 font-bold tracking-[0.2em] uppercase block mb-3">Search Market</label>
                        <div className="relative group">
                          <input 
                            type="text" 
                            placeholder="Type symbol..."
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-emerald-500 outline-none transition-all"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-emerald-500">
                            <Zap className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      <div className="text-neutral-700 font-black text-xs hidden md:block mt-6">OR</div>

                      <div className="w-full md:w-auto">
                        <label className="text-[10px] text-neutral-500 font-bold tracking-[0.2em] uppercase block mb-3">Quick Select</label>
                        <div className="flex gap-2 overflow-x-auto pb-2 max-w-[400px] no-scrollbar mask-fade-right">
                          {(exchange === "NSE" ? NSE_SYMBOLS : BSE_SYMBOLS).slice(0, 15).map(s => {
                            const sym = s.replace(".NS", "").replace(".BO", "");
                            return (
                              <button 
                                key={s} 
                                onClick={() => setSymbol(sym)}
                                className={`px-4 py-2.5 rounded-xl text-[10px] font-black tracking-widest whitespace-nowrap border transition-all ${symbol === sym ? "bg-white text-black border-white shadow-lg shadow-white/10" : "bg-neutral-800 text-neutral-400 border-white/5 hover:border-white/10"}`}
                              >
                                {sym}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {quote && (
                      <div className="flex items-center gap-10 mb-8 p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
                        <div>
                          <div className="text-[10px] text-neutral-500 font-bold tracking-[0.2em] mb-1.5 uppercase">Last Traded Price</div>
                          <div className="text-4xl font-black tracking-tight text-white tabular-nums">
                            ₹<AnimatedNumber value={quote.ltp} decimals={2} />
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black shadow-lg ${quote.change_pct >= 0 ? "bg-emerald-500/10 text-emerald-500 shadow-emerald-500/5" : "bg-rose-500/10 text-rose-500 shadow-rose-500/5"}`}>
                          {Math.abs(quote.change_pct).toFixed(2)}%
                        </div>
                      </div>
                    )}

                  {/* Trader Tabs */}
                  <div className="flex gap-2 mb-8 bg-black/40 p-1.5 rounded-2xl w-fit border border-white/[0.03]">
                    {[
                      { id: "chart", label: "Live Chart" },
                      { id: "report", label: "Risk Analysis" },
                      { id: "indicators", label: "Indicators" },
                      ...(isCompareMode ? [{ id: "compare", label: "Comparison" }] : [])
                    ].map(t => (
                      <button key={t.id} onClick={() => setSubTab(t.id as any)}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${subTab === t.id ? "bg-neutral-800 text-white shadow-xl" : "text-neutral-500 hover:text-white"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* SubTab Content */}
                  <div className="min-h-[300px]">
                    <AnimatePresence mode="wait">
                      {subTab === "chart" && (
                        <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <div ref={chartRef} className="h-[300px] w-full rounded-2xl overflow-hidden" />
                        </motion.div>
                      )}
                      {subTab === "report" && (
                        <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          {traderReport ? <TraderReportView report={traderReport} /> : <div className="h-[300px] flex items-center justify-center text-neutral-600 text-sm font-medium">Generate an analysis report to see details</div>}
                        </motion.div>
                      )}
                      {subTab === "indicators" && quote && (
                        <motion.div key="indicators" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           {[
                            { label: "OPEN", value: fmtPrice(quote.open) },
                            { label: "HIGH", value: fmtPrice(quote.high), color: "#22c55e" },
                            { label: "LOW", value: fmtPrice(quote.low), color: "#ef4444" },
                            { label: "CLOSE", value: fmtPrice(quote.close) },
                          ].map(item => (
                            <div key={item.label} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">{item.label}</div>
                              <div className="text-lg font-black" style={{ color: item.color || "white" }}>{item.value}</div>
                            </div>
                          ))}
                          {traderReport && [
                            { label: "RSI (14)", value: traderReport.technical.rsi_14.toFixed(1), 
                              color: traderReport.technical.rsi_14 > 70 ? "#ef4444" : traderReport.technical.rsi_14 < 30 ? "#22c55e" : "#eab308" },
                            { label: "VWAP", value: fmtPrice(traderReport.technical.vwap) },
                            { label: "BB UPPER", value: fmtPrice(traderReport.technical.bollinger.upper) },
                            { label: "BB LOWER", value: fmtPrice(traderReport.technical.bollinger.lower) },
                            { label: "52W HIGH", value: fmtPrice(traderReport.technical.high_52w), color: "#22c55e" },
                            { label: "52W LOW", value: fmtPrice(traderReport.technical.low_52w), color: "#ef4444" },
                          ].map(item => (
                            <div key={item.label} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">{item.label}</div>
                              <div className="text-lg font-black" style={{ color: item.color || "white" }}>{item.value}</div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                      {subTab === "compare" && traderReport && compareTraderReport && (
                        <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <CompareReportView r1={traderReport} r2={compareTraderReport} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Right Panel */}
              <div className="flex flex-col gap-6">
                <PunchInPanel symbol={symbol} loading={loading} marketOpen={marketOpen}
                  onGenerate={isCompareMode ? startComparison : generateTraderReport} 
                  error={error} report={traderReport}
                  isCompareMode={isCompareMode} setIsCompareMode={setIsCompareMode}
                  compareSymbol={compareSymbol} setCompareSymbol={setCompareSymbol}
                  compareQuote={compareQuote} />
              </div>
            </div>
          </motion.div>
          )}

          {activeTab === "investor" && (
            <motion.div key="investor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <InvestorPanel loading={loading} error={error} report={investorReport}
                assetType={assetType} setAssetType={setAssetType}
                riskAppetite={riskAppetite} setRiskAppetite={setRiskAppetite}
                investorSymbols={investorSymbols} setInvestorSymbols={setInvestorSymbols}
                onGenerate={generateInvestorReport} />
            </motion.div>
          )}

          {activeTab === "reports" && (
            <motion.div key="reports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {reportHistory.length === 0 ? (
                <div className="h-[600px] flex items-center justify-center border border-dashed border-white/10 rounded-3xl">
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-neutral-800 mx-auto mb-4" />
                    <p className="text-neutral-600 font-medium">No reports generated in this session</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {reportHistory.map(rep => (
                    <div key={rep.id} className="bg-neutral-900/40 border border-white/5 rounded-2xl p-6 hover:bg-neutral-900/60 transition-all cursor-pointer group"
                      onClick={() => {
                        if (rep.type === "trader") { setTraderReport(rep); setActiveTab("trader"); setSubTab("report"); setSymbol(rep.symbol); }
                        else { setInvestorReport(rep); setActiveTab("investor"); }
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${rep.type === 'trader' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {rep.type === 'trader' ? 'T' : 'I'}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white uppercase tracking-tight">{rep.type === 'trader' ? rep.symbol : rep.asset_type.replace('_', ' ')} Analysis</div>
                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{new Date(rep.id).toLocaleString()}</div>
                          </div>
                        </div>
                        <Zap className="w-4 h-4 text-neutral-700 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.03] py-8 px-6 text-center bg-black/50">
        <p className="text-[9px] text-neutral-700 font-bold tracking-[0.3em] uppercase max-w-4xl mx-auto leading-relaxed">
          DalalStreet AI is for educational intelligence only. We are not SEBI registered advisors. Trading involves significant risk of capital loss.
        </p>
      </footer>
    </div>
  );
}

// ── Punch-In Panel ─────────────────────────────────────────────
function PunchInPanel({ symbol, loading, marketOpen, onGenerate, error, report, isCompareMode, setIsCompareMode, compareSymbol, setCompareSymbol, compareQuote }: {
  symbol: string; loading: boolean; marketOpen: boolean;
  onGenerate: () => void; error: string | null; report: TraderReport | null;
  isCompareMode: boolean; setIsCompareMode: (v: boolean) => void;
  compareSymbol: string; setCompareSymbol: (v: string) => void;
  compareQuote: QuoteData | null;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#475569] tracking-widest uppercase font-bold">Trading Desk</span>
          </div>
          <button onClick={() => setIsCompareMode(!isCompareMode)}
            className={`px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${isCompareMode ? "bg-white text-black" : "bg-white/5 text-neutral-500 hover:text-white"}`}>
            {isCompareMode ? "Close Compare" : "Compare Stocks"}
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] text-[#475569] font-bold uppercase mb-1">Primary Stock</div>
            <div className="text-sm font-black text-white">{symbol}</div>
          </div>
          
          {isCompareMode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-emerald-500/20">
                <div className="text-[10px] text-emerald-500 font-bold uppercase mb-2">Secondary Stock</div>
                <input 
                  type="text" value={compareSymbol} onChange={(e) => setCompareSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none focus:border-emerald-500"
                  placeholder="SYM..."
                />
                {compareQuote && (
                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-xs font-mono text-white">₹{fmt(compareQuote.ltp)}</span>
                    <span className={`text-[10px] font-bold ${compareQuote.change_pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {compareQuote.change_pct >= 0 ? "+" : ""}{compareQuote.change_pct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {!marketOpen && (
          <div className="rounded-lg p-3 mb-4 text-xs flex items-center gap-2"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#eab308" }}>
            Market is currently closed. Reports use last available data.
          </div>
        )}

        <motion.button onClick={onGenerate} disabled={loading} whileTap={{ scale: 0.97 }}
          className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wider relative overflow-hidden transition-all"
          style={{ background: loading ? "rgba(34,211,160,0.1)" : "#22c55e",
            color: loading ? "#22c55e" : "#050505",
            border: loading ? "1px solid rgba(34,211,160,0.3)" : "none" }}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full block" />
              Analysing Market…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              PUNCH IN — Generate Report
            </span>
          )}
        </motion.button>

        {error && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg p-3 text-xs"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            {error}
          </motion.div>
        )}
      </div>

      {/* Report Summary Card */}
      {report && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t border-white/5 p-5 space-y-4">
          {/* Decision Badge */}
          <div className="flex items-center justify-between">
            <div className="rounded-xl px-5 py-3 text-center"
              style={{ background: DECISION_BG[report.assessment.decision], border: `1px solid ${DECISION_COLOR[report.assessment.decision]}30` }}>
              <div className="text-2xl font-black tracking-wider" style={{ color: DECISION_COLOR[report.assessment.decision] }}>
                {report.assessment.decision}
              </div>
              <div className="text-[10px] tracking-widest mt-0.5" style={{ color: DECISION_COLOR[report.assessment.decision] + "aa" }}>
                {report.assessment.confidence_pct}% CONFIDENCE
              </div>
            </div>
            <RiskGauge score={report.assessment.risk_score} level={report.assessment.risk_level} />
          </div>

          {/* Summary */}
          <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
            {report.assessment.summary}
          </p>

          {/* Prices */}
          {(report.assessment.entry_price || report.assessment.stop_loss || report.assessment.target_price) && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "ENTRY", value: report.assessment.entry_price, color: "#eab308" },
                { label: "SL", value: report.assessment.stop_loss, color: "#ef4444" },
                { label: "TARGET", value: report.assessment.target_price, color: "#22c55e" },
              ].map(item => item.value && (
                <div key={item.label} className="rounded-lg p-2 text-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${item.color}25` }}>
                  <div className="text-[9px] tracking-widest mb-1" style={{ color: item.color + "99" }}>{item.label}</div>
                  <div className="text-xs font-bold" style={{ color: item.color }}>₹{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Signals */}
          <div>
            <div className="text-[10px] text-[#475569] tracking-widest mb-2">KEY SIGNALS</div>
            <div className="space-y-1.5">
              {report.assessment.key_signals.map((s, i) => (
                <motion.div key={i} className="text-xs flex gap-2 mb-1" style={{ color: "#94a3b8" }}>
                  <span style={{ color: "#22c55e", marginTop: 1 }}>•</span> {s}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {report.assessment.warnings.length > 0 && (
            <div>
              <div className="text-[10px] text-[#475569] tracking-widest mb-2">WARNINGS</div>
              {report.assessment.warnings.map((w, i) => (
                <div key={i} className="text-xs rounded p-2 mb-1" style={{ background: "rgba(245,158,11,0.06)", color: "#eab308" }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between text-[10px] text-[#334155] pt-2 border-t border-white/5">
            <span>BIAS: <span style={{ color: report.assessment.technical_bias === "BULLISH" ? "#22c55e" : report.assessment.technical_bias === "BEARISH" ? "#ef4444" : "#eab308" }}>{report.assessment.technical_bias}</span></span>
            <span>{new Date(report.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Trader Report Full View ────────────────────────────────────
function TraderReportView({ report }: { report: TraderReport }) {
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "RSI (14)", value: report.technical.rsi_14.toFixed(1),
            color: report.technical.rsi_14 > 70 ? "#ef4444" : report.technical.rsi_14 < 30 ? "#22c55e" : "#eab308",
            note: report.technical.rsi_14 > 70 ? "Overbought" : report.technical.rsi_14 < 30 ? "Oversold" : "Neutral" },
          { label: "VWAP", value: `₹${report.technical.vwap}`, color: "#e2e8f0",
            note: report.technical.ltp > report.technical.vwap ? "Above VWAP ↑" : "Below VWAP ↓" },
          { label: "52W HIGH", value: `₹${report.technical.high_52w}`, color: "#22c55e", note: "" },
          { label: "52W LOW", value: `₹${report.technical.low_52w}`, color: "#ef4444", note: "" },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[10px] text-[#475569] tracking-widest mb-1">{item.label}</div>
            <div className="text-base font-bold" style={{ color: item.color }}>{item.value}</div>
            {item.note && <div className="text-[10px] mt-0.5" style={{ color: item.color + "99" }}>{item.note}</div>}
          </div>
        ))}
      </div>

      {/* Bollinger Bands */}
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-[10px] text-[#475569] tracking-widest mb-3">BOLLINGER BANDS</div>
        <div className="relative h-8">
          {[
            { label: "Lower", val: report.technical.bollinger.lower, pos: 0, color: "#ef4444" },
            { label: "Mid", val: report.technical.bollinger.mid, pos: 50, color: "#eab308" },
            { label: "Upper", val: report.technical.bollinger.upper, pos: 100, color: "#22c55e" },
          ].map(b => (
            <div key={b.label} className="absolute flex flex-col items-center" style={{ left: `${b.pos}%`, transform: "translateX(-50%)" }}>
              <span className="text-[9px]" style={{ color: b.color }}>₹{b.val}</span>
              <span className="text-[9px] text-[#334155]">{b.label}</span>
            </div>
          ))}
          <div className="absolute top-3 left-0 right-0 h-0.5 rounded-full" style={{ background: "#334155" }} />
          {/* LTP marker */}
          {(() => {
            const r = report.technical;
            const range = r.bollinger.upper - r.bollinger.lower;
            const pct = range > 0 ? clamp(((r.ltp - r.bollinger.lower) / range) * 100, 0, 100) : 50;
            return <div className="absolute top-1.5 w-2 h-2 rounded-full -ml-1" style={{ left: `${pct}%`, background: "#fff", boxShadow: "0 0 6px rgba(255,255,255,0.8)" }} />;
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Investor Panel ─────────────────────────────────────────────
function InvestorPanel({ 
  loading, error, report, assetType, setAssetType, 
  riskAppetite, setRiskAppetite, investorSymbols, setInvestorSymbols, onGenerate 
}: {
  loading: boolean; error: string | null; report: InvestorReport | null;
  assetType: string; setAssetType: (v: string) => void;
  riskAppetite: "LOW"|"MODERATE"|"HIGH"; setRiskAppetite: (v: "LOW"|"MODERATE"|"HIGH") => void;
  investorSymbols: string[]; setInvestorSymbols: (v: string[]) => void;
  onGenerate: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const ASSET_TYPES = [
    { value: "large_cap", label: "Large Cap", icon: <Zap className="w-4 h-4" />, desc: "Nifty 50 blue-chip stocks" },
    { value: "small_cap", label: "Small Cap", icon: <TrendingUp className="w-4 h-4" />, desc: "High growth potential" },
    { value: "etf", label: "ETFs", icon: <Zap className="w-4 h-4" />, desc: "Index-tracking funds" },
    { value: "mutual_fund", label: "Mutual Funds", icon: <Zap className="w-4 h-4" />, desc: "Professionally managed" },
  ];

  const toggleSymbol = (s: string) => {
    const sym = s.replace(".NS", "").replace(".BO", "");
    if (investorSymbols.includes(sym)) {
      setInvestorSymbols(investorSymbols.filter(x => x !== sym));
    } else {
      if (investorSymbols.length >= 5) return;
      setInvestorSymbols([...investorSymbols, sym]);
    }
  };

  const allSymbols = ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "BHARTIARTL", "ITC", "SBIN", "LT", "HINDUNILVR", "AXISBANK", "KOTAKBANK", "HCLTECH", "ADANIENT", "SUNPHARMA", "BAJFINANCE", "MARUTI", "TITAN", "ULTRACEMCO", "ASIANPAINT", "NTPC", "TATASTEEL", "POWERGRID", "M&M", "ADANIPORTS", "JSWSTEEL", "TATAMOTORS", "BAJAJFINSV", "NESTLEIND", "GRASIM", "INDUSINDBK", "ONGC", "TECHM", "HINDALCO", "WIPRO", "COALINDIA", "SBILIFE", "BPCL", "HDFCLIFE", "DRREDDY", "BAJAJ-AUTO", "APOLLOHOSP", "TATACONSUM", "EICHERMOT", "DIVISLAB", "HEROMOTOCO", "CIPLA", "LTIM", "BRITANNIA", "UPL", "NIFTYBEES.NS", "BANKBEES.NS", "GOLDBEES.NS", "SILVERBEES.NS"];
  
  const filteredSymbols = allSymbols.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Config Panel */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 className="text-sm font-bold tracking-widest text-[#64748b] mb-5">CONFIGURE YOUR INVESTMENT PROFILE</h2>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {/* Asset Type */}
            <div>
              <label className="text-[10px] text-[#475569] tracking-widest block mb-3 uppercase">1. Select Asset Class</label>
              <div className="grid grid-cols-2 gap-2">
                {ASSET_TYPES.map(a => (
                  <motion.button key={a.value} onClick={() => setAssetType(a.value)} whileTap={{ scale: 0.97 }}
                    className="p-3 rounded-xl text-left transition-all"
                    style={{
                      background: assetType === a.value ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${assetType === a.value ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                    }}>
                    <div className="text-lg mb-1">{a.icon}</div>
                    <div className="text-xs font-bold" style={{ color: assetType === a.value ? "#22c55e" : "#fafafa" }}>{a.label}</div>
                    <div className="text-[10px] text-[#475569] mt-0.5">{a.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Risk Appetite */}
            <div>
              <label className="text-[10px] text-[#475569] tracking-widest block mb-3 uppercase">2. Risk Profile</label>
              <div className="space-y-2">
                {(["LOW","MODERATE","HIGH"] as const).map(r => {
                  const colors: Record<string, string> = { LOW: "#22c55e", MODERATE: "#eab308", HIGH: "#ef4444" };
                  const descs: Record<string, string> = { LOW: "Capital preservation, stable returns", MODERATE: "Balanced growth & safety", HIGH: "Aggressive growth, volatility ok" };
                  return (
                    <motion.button key={r} onClick={() => setRiskAppetite(r)} whileTap={{ scale: 0.98 }}
                      className="w-full p-3 rounded-xl flex items-center gap-3 transition-all"
                      style={{
                        background: riskAppetite === r ? `rgba(${r === "LOW" ? "34,211,160" : r === "MODERATE" ? "245,158,11" : "239,68,68"},0.1)` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${riskAppetite === r ? colors[r] + "40" : "rgba(255,255,255,0.07)"}`,
                      }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[r] }} />
                      <div className="text-left">
                        <div className="text-xs font-bold" style={{ color: riskAppetite === r ? colors[r] : "#e2e8f0" }}>{r}</div>
                        <div className="text-[10px] text-[#475569]">{descs[r]}</div>
                      </div>
                      {riskAppetite === r && <span className="ml-auto text-xs" style={{ color: colors[r] }}>✓</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Manual Selection (Search & Scroll) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] text-[#475569] tracking-widest uppercase">3. Custom Selection (Optional)</label>
                <span className="text-[10px] text-neutral-600 uppercase font-bold">{investorSymbols.length}/5 Selected</span>
              </div>
              
              {/* Search Bar */}
              <div className="relative mb-3 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#475569] group-focus-within:text-white transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search and select companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-[#475569] outline-none focus:border-white/20 transition-all"
                />
              </div>

              {/* Scrollable Selector (The Wheel) */}
              <div className="h-[180px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar bg-black/20 rounded-xl p-2 border border-white/5">
                {filteredSymbols.map(s => {
                  const isSelected = investorSymbols.includes(s);
                  return (
                    <button key={s} onClick={() => toggleSymbol(s)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all ${isSelected ? "bg-white text-black" : "text-neutral-500 hover:bg-white/5 hover:text-white"}`}>
                      <span>{s}</span>
                      {isSelected ? <span className="text-[10px]">✕</span> : <span className="text-[10px] opacity-30">+</span>}
                    </button>
                  );
                })}
                {filteredSymbols.length === 0 && <div className="text-center py-10 text-[10px] text-[#475569] uppercase font-bold">No results found</div>}
              </div>

              {/* Selected Tags */}
              <div className="mt-4 flex flex-wrap gap-2">
                {investorSymbols.length === 0 && <span className="text-[10px] text-[#475569] italic">Defaulting to top sector performers...</span>}
                {investorSymbols.map(s => (
                  <span key={s} className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black flex items-center gap-2">
                    {s}
                    <button onClick={() => toggleSymbol(s)} className="hover:text-white">×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <motion.button onClick={onGenerate} disabled={loading} whileTap={{ scale: 0.97 }}
          className="w-full mt-10 py-4 rounded-xl font-bold text-xs tracking-[0.2em] uppercase shadow-2xl transition-all"
          style={{ 
            background: loading ? "rgba(34,197,94,0.1)" : "#ffffff",
            color: loading ? "#22c55e" : "#000",
            border: loading ? "1px solid rgba(34,197,94,0.3)" : "none",
            boxShadow: loading ? "none" : "0 8px 30px rgba(255,255,255,0.05)"
          }}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full block" />
              Analysing Opportunities…
            </span>
          ) : "Generate Investment Report"}
        </motion.button>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-lg text-xs"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            {error}
          </motion.div>
        )}
      </div>

      {/* Report Output */}
      {report && <InvestorReportView report={report} />}
    </div>
  );
}

function InvestorReportView({ report }: { report: InvestorReport }) {
  const riskColors: Record<string, string> = { LOW: "#22c55e", MODERATE: "#eab308", HIGH: "#ef4444" };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Market Vitals (NIFTY EDA Inspired) */}
      {report.market_vitals && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Object.entries(report.market_vitals).map(([name, data]) => (
            <div key={name} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-colors">
              <div className="text-[9px] text-[#475569] font-black uppercase mb-1">{name}</div>
              <div className={`text-xs font-black flex items-center gap-1 ${data.change_pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {data.change_pct >= 0 ? "+" : ""}{data.change_pct.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ETF Alpha Signals (Research Notebook Integrated) */}
      {report.etf_research_signals && Object.keys(report.etf_research_signals).length > 0 && (
        <div className="rounded-2xl p-6 ds-panel overflow-hidden relative" style={{ background: "rgba(34,197,94,0.05)" }}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] -mr-10 -mt-10" />
          <h3 className="text-xs font-black tracking-widest text-[#22c55e] mb-5 flex items-center gap-2 relative z-10">
            <Zap className="w-3.5 h-3.5" /> SYSTEMATIC ETF ALPHA SIGNALS
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
            {Object.entries(report.etf_research_signals).map(([sym, sig]) => (
              <div key={sym} className="p-4 rounded-xl bg-black/40 border border-white/5 hover:border-emerald-500/20 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-sm font-black text-white">{sym}</div>
                    <div className="text-[9px] text-[#475569] font-bold uppercase tracking-tight">Signal Analysis</div>
                  </div>
                  {sig.is_buy_signal ? (
                    <div className="px-2 py-0.5 rounded bg-emerald-500 text-black text-[9px] font-black">BUY SIGNAL</div>
                  ) : (
                    <div className="px-2 py-0.5 rounded bg-white/5 text-white/30 text-[9px] font-black">NEUTRAL</div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#475569]">Performance (MoM):</span>
                    <span className={`font-bold ${sig.current_month_performance < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {sig.current_month_performance.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#475569]">Historical Median Drop:</span>
                    <span className="text-white font-bold">{sig.median_negative_threshold.toFixed(2)}%</span>
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[9px] text-[#94a3b8] leading-relaxed italic">
                      {sig.is_buy_signal ? "Current drop is deeper than typical negative months. Statistically significant entry point." : "Asset performance is holding above median risk thresholds."}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[#22c55e] tracking-widest font-bold">AI STRATEGY SUMMARY</span>
          {report.from_cache && <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>CACHED</span>}
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
          {report.recommendation.recommendation_summary}
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-[#475569] mr-2">HORIZON</span>
            <span className="text-white font-bold">{report.recommendation.holding_horizon}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-[#475569] mr-2">PROFILE</span>
            <span className="text-white font-bold">{report.risk_appetite} Risk</span>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="rounded-2xl overflow-hidden ds-panel">
        <div className="p-5 border-b border-white/5 bg-white/[0.01]">
          <h3 className="text-xs font-bold tracking-widest text-[#475569]">ASSET COMPARISON & ALLOCATION</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] tracking-widest text-[#475569] uppercase bg-white/[0.01]">
                <th className="px-6 py-4 font-semibold">Asset / Symbol</th>
                <th className="px-6 py-4 font-semibold">1Y Return</th>
                <th className="px-6 py-4 font-semibold">Volatility</th>
                <th className="px-6 py-4 font-semibold">AI Score</th>
                <th className="px-6 py-4 font-semibold">SIP</th>
                <th className="px-6 py-4 font-semibold text-right">Allocation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {report.recommendation.top_picks.map((pick, i) => {
                const stats = report.assets_analysed?.[pick.symbol];
                return (
                <tr key={pick.symbol} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border border-white/10 bg-white/5 group-hover:border-emerald-500/30 transition-colors">
                        {pick.symbol.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white">{pick.symbol}</div>
                        <div className="text-[10px] text-[#475569] font-mono truncate max-w-[150px]">{pick.risk_rating} Risk</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm font-bold text-emerald-500">{stats ? stats.return_1y_pct.toFixed(1) + "%" : pick.expected_return_range}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs font-bold text-neutral-400">{stats ? stats.volatility_pct.toFixed(1) + "%" : "—"}</span>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`text-xs font-black ${stats && stats.score > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {stats ? stats.score.toFixed(1) : "—"}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {pick.sip_suitable ? 
                      <span className="text-emerald-500">✓ <span className="text-[10px] text-[#94a3b8] ml-1">Yes</span></span> : 
                      <span className="text-[#475569]">× <span className="text-[10px] text-[#475569] ml-1">No</span></span>
                    }
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="text-xs font-bold text-white tabular-nums">{pick.suggested_allocation_pct}%</div>
                      <div className="w-24">
                        <AllocationBar pct={pick.suggested_allocation_pct} color={i === 0 ? "#22c55e" : "#ffffff"} />
                      </div>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tips & Notes */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] text-[#475569] tracking-widest mb-2">DIVERSIFICATION TIP</div>
          <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>{report.recommendation.diversification_tip}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-[10px] text-[#475569] tracking-widest mb-2">TAX NOTE (INDIA)</div>
          <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>{report.recommendation.tax_note}</p>
        </div>
      </div>

      <div className="rounded-xl p-3 text-[10px] leading-relaxed" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", color: "#92400e" }}>
        {report.recommendation.risk_warning}
      </div>
    </motion.div>
  );
}
// ── Compare Report View ────────────────────────────────────────
function CompareReportView({ r1, r2 }: { r1: TraderReport; r2: TraderReport }) {
  return (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[r1, r2].map((r, i) => (
          <div key={i} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-3xl -mr-10 -mt-10" />
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div>
                <div className="text-2xl font-black text-white tracking-tight">{r.symbol.split(".")[0]}</div>
                <div className="text-[10px] text-[#475569] font-bold uppercase tracking-widest mt-1">Trading Analysis</div>
              </div>
              <div className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl"
                style={{ background: DECISION_BG[r.assessment.decision], color: DECISION_COLOR[r.assessment.decision], border: `1px solid ${DECISION_COLOR[r.assessment.decision]}30` }}>
                {r.assessment.decision}
              </div>
            </div>
            
            <div className="space-y-4 relative z-10">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="text-[9px] text-[#475569] font-bold uppercase tracking-widest mb-1.5">RSI Momentum</div>
                  <div className={`text-lg font-black ${r.technical.rsi_14 > 70 ? "text-rose-500" : r.technical.rsi_14 < 30 ? "text-emerald-500" : "text-white"}`}>
                    {r.technical.rsi_14.toFixed(1)}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="text-[9px] text-[#475569] font-bold uppercase tracking-widest mb-1.5">AI Risk Score</div>
                  <div className="text-lg font-black text-white">{r.assessment.risk_score}</div>
                </div>
              </div>
              
              <div className="p-5 rounded-2xl bg-black/40 border border-white/5">
                <div className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mb-2.5 flex items-center gap-2">
                  <Zap className="w-3 h-3" /> Intelligence Summary
                </div>
                <p className="text-[11px] leading-relaxed text-neutral-400 italic font-medium">"{r.assessment.summary}"</p>
              </div>

              <div className="space-y-2.5">
                 <div className="text-[9px] text-[#475569] font-black uppercase tracking-widest ml-1">Key Growth Signals</div>
                 <div className="grid grid-cols-1 gap-1.5">
                   {r.assessment.key_signals.slice(0,3).map((s, idx) => (
                     <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-[10px] text-neutral-300 font-bold">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                       {s}
                     </div>
                   ))}
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Head-to-Head Comparison Engine */}
      <div className="rounded-3xl bg-neutral-900/40 border border-white/5 overflow-hidden shadow-2xl">
        <div className="p-5 bg-white/[0.01] border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-black tracking-[0.2em] text-neutral-400 uppercase">Head-to-Head Comparative Engine</h3>
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black text-emerald-500 uppercase">Live Delta Analysis</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-neutral-600 uppercase tracking-widest bg-black/20">
                <th className="px-8 py-5 border-b border-white/5">Performance Metric</th>
                <th className="px-8 py-5 border-b border-white/5 border-l border-white/5">{r1.symbol.split(".")[0]}</th>
                <th className="px-8 py-5 border-b border-white/5 border-l border-white/5">{r2.symbol.split(".")[0]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-[11px] font-bold">
              {[
                { label: "AI Confidence Index", v1: r1.assessment.confidence_pct + "%", v2: r2.assessment.confidence_pct + "%", b: r1.assessment.confidence_pct > r2.assessment.confidence_pct },
                { label: "Technical Bias", v1: r1.assessment.technical_bias, v2: r2.assessment.technical_bias, b: r1.assessment.technical_bias === "BULLISH" && r2.assessment.technical_bias !== "BULLISH" },
                { label: "Price vs VWAP", v1: r1.technical.ltp > r1.technical.vwap ? "ABOVE ↑" : "BELOW ↓", v2: r2.technical.ltp > r2.technical.vwap ? "ABOVE ↑" : "BELOW ↓", b: r1.technical.ltp > r1.technical.vwap },
                { label: "Projected Upside", v1: r1.assessment.target_price ? "₹"+fmt(r1.assessment.target_price) : "NEUTRAL", v2: r2.assessment.target_price ? "₹"+fmt(r2.assessment.target_price) : "NEUTRAL", b: true },
                { label: "Risk Exposure", v1: r1.assessment.risk_level, v2: r2.assessment.risk_level, b: r1.assessment.risk_score < r2.assessment.risk_score },
              ].map(m => (
                <tr key={m.label} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-5 text-neutral-500 uppercase tracking-wider">{m.label}</td>
                  <td className={`px-8 py-5 border-l border-white/5 tabular-nums ${m.b ? "text-emerald-500" : "text-white"}`}>{m.v1}</td>
                  <td className={`px-8 py-5 border-l border-white/5 tabular-nums ${!m.b ? "text-emerald-500" : "text-white"}`}>{m.v2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
