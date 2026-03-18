import type { Metadata } from "next";
import { Amiri, Plus_Jakarta_Sans, Noto_Nastaliq_Urdu } from "next/font/google";
import Providers from "@/components/providers";
import "./globals.css";

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-indopak",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HifzFlow — Quran Memorization",
  description:
    "A guided Quran memorization app for beginners. Learn Juz Amma step by step with listen, understand, chunk, and test phases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${amiri.variable} ${nastaliq.variable} ${jakarta.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
