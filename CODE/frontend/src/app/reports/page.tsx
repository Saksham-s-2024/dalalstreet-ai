"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authHeaders, clearToken, getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HistoryRow {
  id: string;
  kind: string;
  title: string;
  created_at: string;
  payload: Record<string, unknown>;
}

function formatIst(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ReportsHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${API}/api/v1/reports/history?limit=100`, { headers: { ...authHeaders() } });
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Failed to load reports");
        setRows(data.reports || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen" style={{ background: "#050505", color: "#e2e8f0" }}>
      <header className="border-b border-white/[0.06] backdrop-blur-md px-4 sm:px-6 py-3" style={{
        background: "rgba(7,12,20,0.92)",
      }}>
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">
              Saved <span style={{ color: "#22c55e" }}>reports</span>
            </h1>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase">Generated while signed in</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && <p className="text-slate-500 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <div className="rounded-2xl p-8 text-center ds-panel text-slate-500 text-sm">
            No saved reports yet. Open the dashboard, sign in, and generate a trader or investor report — each run is stored here with a timestamp.
          </div>
        )}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl overflow-hidden ds-panel">
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate">{r.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <span className="uppercase tracking-wider text-emerald-500/90">{r.kind}</span>
                    <span className="mx-2">·</span>
                    <span className="tabular-nums">{formatIst(r.created_at)} IST</span>
                  </div>
                </div>
                <span className="text-slate-500 text-xs shrink-0">{openId === r.id ? "▲" : "▼"}</span>
              </button>
              {openId === r.id && (
                <pre className="text-[11px] leading-relaxed p-4 overflow-x-auto border-t border-white/5 text-slate-400 font-mono max-h-[420px] overflow-y-auto">
                  {JSON.stringify(r.payload, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
