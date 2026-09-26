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
  if (path === '/essentials') return 'Essentials';
  if (path === '/progress') return 'Progress';
  if (path === '/plan' || path.startsWith('/plan/')) return 'Plan';
  const juz = path.match(/^\/juz\/(\d+)$/);
  if (juz) return `Juz ${juz[1]}`;
  const surah = path.match(/^\/lesson\/(\d+)$/);
  if (surah) return (await surahName(Number(surah[1]))) ?? 'Back';
  return 'Back';
}
