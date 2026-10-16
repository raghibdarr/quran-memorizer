import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import Providers from "@/components/providers";
import "./globals.css";

// Amiri Quran (OFL 1.1, public/fonts/AmiriQuran-OFL.txt): draws all of Tanzil's Uthmani
// text, signs like the small rounded zero included. It replaced KFGQPC Uthmanic Hafs, whose
// licence needs the King Fahd Complex's written approval (licensing audit, 2026-10-16).
const amiriQuran = localFont({
  src: "../../public/fonts/AmiriQuran.ttf",
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
  title: "Takrar · Quran Memorization",
  description:
    "A guided Quran memorization app. Listen, understand, repeat, chain the ayahs together, then test and review.",
  icons: {
    icon: "/logos/takrar.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Takrar",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FEFCF9" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${amiriQuran.variable} ${nastaliq.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('quran-dark-mode');var d=s!==null?s==='true':window.matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
