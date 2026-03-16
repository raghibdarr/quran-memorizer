import type { Metadata } from "next";
import { Scheherazade_New, Plus_Jakarta_Sans } from "next/font/google";
import Providers from "@/components/providers";
import "./globals.css";

const scheherazade = Scheherazade_New({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-scheherazade",
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
    <html lang="en" className={`${scheherazade.variable} ${jakarta.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
