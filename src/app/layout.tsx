import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import Providers from "@/components/providers";
import "./globals.css";

const kfgqpc = localFont({
  src: "../../public/fonts/kfgqpc-hafs.woff",
  variable: "--font-arabic",
  display: "swap",
});

const nastaliq = localFont({
  src: "../../public/fonts/indopak-nastaleeq.woff2",
  variable: "--font-indopak",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Takrar — Quran Memorization",
  description:
    "A guided Quran memorization app. Learn step by step through repitition — listen, understand, chain ayahs, test and review.",
  icons: {
    icon: "/logos/light-16.svg",
    apple: "/logos/light-48.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${kfgqpc.variable} ${nastaliq.variable} ${jakarta.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
