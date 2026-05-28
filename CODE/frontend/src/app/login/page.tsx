"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Chrome } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const endpoint = isLogin ? "/api/v1/auth/login" : "/api/v1/auth/register";
    
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email: email.trim(), password } : { name: name.trim(), email: email.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      
      if (!r.ok) {
        const d = data.detail;
        throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d[0]?.msg || "Action failed" : "Action failed");
      }
      
      setToken(data.access_token);
      router.replace("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030303] px-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] bg-[#0a0a0a] border border-white/[0.05] rounded-[24px] p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center border border-white/5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">DalalStreet AI</h1>
            <p className="text-[10px] text-neutral-500 font-medium tracking-[0.2em] uppercase">Welcome</p>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex p-1 bg-neutral-900/50 rounded-xl mb-8 border border-white/5">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all ${isLogin ? "bg-white text-black" : "text-neutral-500 hover:text-white"}`}
          >
            Sign In
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all ${!isLogin ? "bg-white text-black" : "text-neutral-500 hover:text-white"}`}
          >
            Register
          </button>
        </div>

        {/* Google Login */}
        <button className="w-full py-3 rounded-xl bg-neutral-900 border border-white/5 flex items-center justify-center gap-3 text-xs font-medium text-white hover:bg-neutral-800 transition-colors mb-6">
          <Chrome className="w-4 h-4" />
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-5">
          <AnimatePresence>
            {!isLogin && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-2 ml-1">Full Name</label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-white transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <input 
                    type="text"
                    placeholder="John Doe"
                    required={!isLogin}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-neutral-700 outline-none focus:border-white/20 focus:bg-neutral-900 transition-all"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div>
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-2 ml-1">Email</label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-white transition-colors" />
              <input 
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-neutral-700 outline-none focus:border-white/20 focus:bg-neutral-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block mb-2 ml-1">Password</label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-white transition-colors" />
              <input 
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-neutral-700 outline-none focus:border-white/20 focus:bg-neutral-900 transition-all"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-500 font-medium ml-1">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? "Processing..." : (isLogin ? "Sign In" : "Create Account")}
          </button>
        </form>

        {/* Skip Action */}
        <button 
          onClick={() => router.push("/dashboard")}
          className="w-full text-center mt-6 text-[10px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
        >
          Skip for now <span>→</span>
        </button>
      </motion.div>
    </div>
  );
}
