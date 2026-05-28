/**
 * DalalStreet AI — Global State (Zustand)
 * Manages active_mode, selected symbol, and report state.
 */
import { create } from "zustand";

export type Mode = "trader" | "investor";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type Decision = "BUY" | "SELL" | "HOLD" | "AVOID";

export interface TraderReport {
  symbol: string;
  timestamp: string;
  technical: {
    ltp: number;
    change_pct: number;
    volume: number;
    rsi_14: number;
    vwap: number;
    bollinger: { upper: number; mid: number; lower: number };
    high_52w: number;
    low_52w: number;
  };
  assessment: {
    risk_level: RiskLevel;
    risk_score: number;
    decision: Decision;
    confidence_pct: number;
    entry_price: number | null;
    stop_loss: number | null;
    target_price: number | null;
    holding_period: string;
    summary: string;
    key_signals: string[];
    warnings: string[];
    technical_bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
  from_cache: boolean;
}

export interface InvestorReport {
  mode: "investor";
  asset_type: string;
  risk_appetite: string;
  recommendation: {
    recommendation_summary: string;
    top_picks: Array<{
      symbol: string;
      type: string;
      rationale: string;
      risk_rating: string;
      expected_return_range: string;
      suggested_allocation_pct: number;
      sip_suitable: boolean;
    }>;
    diversification_tip: string;
    risk_warning: string;
    holding_horizon: string;
    tax_note: string;
  };
  from_cache: boolean;
}

export interface QuoteData {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_pct: number;
  timestamp: string;
}

interface AppState {
  // Mode
  activeMode: Mode;
  setMode: (mode: Mode) => void;

  // Symbol
  selectedSymbol: string;
  setSymbol: (symbol: string) => void;

  // Live quote
  liveQuote: QuoteData | null;
  setLiveQuote: (quote: QuoteData) => void;

  // Reports
  traderReport: TraderReport | null;
  setTraderReport: (report: TraderReport | null) => void;
  investorReport: InvestorReport | null;
  setInvestorReport: (report: InvestorReport | null) => void;

  // Loading states
  isGeneratingReport: boolean;
  setGeneratingReport: (v: boolean) => void;

  // Market status
  isMarketOpen: boolean;
  setMarketOpen: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeMode: "trader",
  setMode: (mode) =>
    set({
      activeMode: mode,
      traderReport: null,
      investorReport: null,
      selectedSymbol: mode === "trader" ? "RELIANCE" : "",
    }),

  selectedSymbol: "RELIANCE",
  setSymbol: (symbol) => set({ selectedSymbol: symbol, traderReport: null }),

  liveQuote: null,
  setLiveQuote: (quote) => set({ liveQuote: quote }),

  traderReport: null,
  setTraderReport: (report) => set({ traderReport: report }),

  investorReport: null,
  setInvestorReport: (report) => set({ investorReport: report }),

  isGeneratingReport: false,
  setGeneratingReport: (v) => set({ isGeneratingReport: v }),

  isMarketOpen: false,
  setMarketOpen: (v) => set({ isMarketOpen: v }),
}));
