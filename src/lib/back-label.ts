/** The all-in-one sections' own screens (detail screens like /hadith/view stay "Back") */
const ALL_IN_ONE_LABELS: Record<string, string> = {
  '/qibla': 'Qibla',
  '/tasbih': 'Tasbih',
  '/calendar': 'Calendar',
  '/ramadan': 'Ramadan',
  '/zakat': 'Zakat',
  '/mosques': 'Mosques',
  '/hadith': 'Hadith',
  '/adhkar': 'Adhkar',
  '/names': 'Names',
  '/course': 'Course',
  '/glossary': 'Glossary',
  '/sources': 'Sources',
};

/**
 * What a back chevron should say: the name of the screen it returns to
 * ("‹ Home", "‹ Juz 30", "‹ Al-Mulk"), iOS-style. Anything without a short,
 * certain name is plain "Back" — a wrong name is worse than none.
 */
export async function backLabelFor(
  url: string,
  surahName: (id: number) => Promise<string | undefined>,
): Promise<string> {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/') return 'Home';
  if (path === '/review' || path.startsWith('/review/')) return 'Review';
  if (path === '/essentials') return 'Learn';
  if (path === '/progress') return 'Progress';
  if (path === '/prayer' || path.startsWith('/prayer/')) return 'Prayer';
  const section = ALL_IN_ONE_LABELS[path];
  if (section) return section;
  if (path === '/bookmarks') return 'Bookmarks';
  if (path === '/downloads') return 'Downloads';
  if (path === '/khatm') return 'Khatm';
  if (path === '/circles') return 'Circles';
  if (path === '/plan' || path.startsWith('/plan/')) return 'Plan';
  const juz = path.match(/^\/juz\/(\d+)$/);
  if (juz) return `Juz ${juz[1]}`;
  const surah = path.match(/^\/lesson\/(\d+)$/);
  if (surah) return (await surahName(Number(surah[1]))) ?? 'Back';
  return 'Back';
}
