"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingPaths } from "@/components/ui/background-paths";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full bg-[#030303] overflow-hidden selection:bg-white/10 font-sans">
      {/* Premium Background with Floating Paths on the left */}
      <div className="absolute inset-0 z-0">
        <FloatingPaths position={1.5} />
      </div>
      
      {/* Content Overlay */}
      <div className="relative z-20 flex flex-col items-center justify-center min-h-screen px-4">
        
        {/* Top Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-10 bg-neutral-900/40 border border-white/5 shadow-2xl backdrop-blur-md"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-4"
          style={{ letterSpacing: "-0.04em" }}
        >
          DalalStreet AI
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="text-neutral-500 text-sm md:text-base font-medium tracking-wide mb-12 uppercase"
          style={{ letterSpacing: "0.05em" }}
        >
          AI-Powered Indian Market Intelligence
        </motion.p>

        {/* Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <Link 
            href="/login"
            className="group inline-flex items-center gap-3 px-8 py-3 rounded-full text-sm font-medium text-white transition-all hover:bg-white/5 border border-white/10 backdrop-blur-sm"
          >
            Enter Dashboard 
            <span className="text-neutral-400 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </motion.div>

      </div>

      {/* Subtle background overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20" style={{
        background: "transparent"
      }} />
    </div>
  );
}
