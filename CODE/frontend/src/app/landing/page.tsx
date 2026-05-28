"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingPaths } from "@/components/ui/background-paths";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";

export default function LandingPage() {
  const words = [
    {
      text: "DalalStreet",
      className: "text-white",
    },
    {
      text: "AI.",
      className: "text-emerald-500",
    },
  ];

  return (
    <div className="relative min-h-screen w-full bg-black overflow-hidden selection:bg-emerald-500/30">
      {/* Premium Background with Floating Paths */}
      <div className="absolute inset-0 z-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Content Overlay */}
      <div className="relative z-20 flex flex-col items-center justify-center min-h-screen px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="w-16 h-16 rounded-3xl flex items-center justify-center mb-8 bg-neutral-900/50 border border-white/10 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </motion.div>

        <div className="flex flex-col items-center">
          <p className="text-neutral-400 text-sm md:text-base font-light tracking-[0.2em] uppercase mb-2">
            Indian Market Intelligence
          </p>
          <TypewriterEffectSmooth words={words} className="mb-0" />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.5 }}
          className="text-neutral-500 text-base md:text-lg font-light tracking-wide mb-12 max-w-2xl text-center"
        >
          Analyze technical patterns, predict market shifts, and invest with AI-driven precision.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 3, ease: "easeOut" }}
          className="flex flex-col sm:flex-row gap-6 items-center"
        >
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-3 px-10 py-4 rounded-full text-lg font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            style={{
              background: "white",
            }}
          >
            Enter Dashboard
            <motion.span
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              →
            </motion.span>
          </Link>

          <Link
            href="/register"
            className="inline-flex items-center gap-3 px-10 py-4 rounded-full text-lg font-medium text-white transition-all hover:bg-white/5 border border-white/10 backdrop-blur-md"
          >
            Create Account
          </Link>
        </motion.div>

        {/* Floating Badges */}
        <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-8 md:gap-16 opacity-20">
          {["Real-time NSE", "ML Modeling", "Risk Scoring"].map((text, i) => (
            <motion.span
              key={text}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.5 + i * 0.2 }}
              className="text-[10px] tracking-[0.4em] uppercase text-white"
            >
              {text}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}



