'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const arabicFontSize = useSettingsStore((s) => s.arabicFontSize);

  useEffect(() => {
    setMounted(true);

    // Apply dark mode — check localStorage first, fallback to system preference
    const saved = localStorage.getItem('quran-dark-mode');
    const isDark = saved !== null
      ? saved === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.style.setProperty('--arabic-font-scale', String(arabicFontSize));
    }
  }, [mounted, arabicFontSize]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
