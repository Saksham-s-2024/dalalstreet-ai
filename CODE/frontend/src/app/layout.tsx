import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "DalalStreet AI — Indian Market Intelligence",
  description: "AI-powered intraday risk assessment and long-term investment recommendations for the Indian stock market.",
  keywords: ["NSE", "BSE", "Indian stock market", "intraday trading", "mutual funds", "ETF", "AI trading"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={`${inter.className} font-sans`} style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
