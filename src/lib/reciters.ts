import qudReciters from '../data/qud-reciters.json';

export interface ReciterOption {
  /** Settings id. EveryAyah directory for per-ayah reciters; kept as-is for reciters
   *  later moved to surah audio, so saved choices carry over. */
  id: string;
  name: string;
  hint?: string;
  /** Other spellings people search by (the names are transliterated many ways) */
  aka?: string[];
}

/**
 * Every reciter in the picker. Two kinds of audio sit behind them:
 * - per-ayah files from everyayah.com, word-timed by quran-align (CC BY 4.0) where it
 *   has them (scripts/import-quran-align.mjs);
 * - whole-surah files (QuranicAudio, MP3Quran) timed per ayah and per word by Qur'anic
 *   Universal Audio (QUD, CC BY 4.0). Those are listed in src/data/qud-reciters.json and
 *   played as a slice of the surah file (see audioController).
 * Nothing streams from Tarteel's or Quran.com's CDNs (licensing audit, 2026-10-16).
 */
export const RECITERS: ReciterOption[] = [
  { id: 'Alafasy_128kbps', name: 'Mishary Alafasy', hint: 'Default, clear and modern', aka: ['Afasy', 'Mishari', 'Alafasi'] },
  { id: 'Husary_128kbps', name: 'Mahmoud Al-Husary', hint: 'Slower, beginner-friendly', aka: ['Husari', 'Hussary', 'Hosary'] },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)', hint: 'Slow, ornate', aka: ['Abdulbasit', 'Abdussamad', 'Abdul Samad'] },
  { id: 'Minshawy_Murattal_128kbps', name: 'Al-Minshawy (Murattal)', hint: 'Classical', aka: ['Minshawi'] },
  { id: 'Husary_Muallim_128kbps', name: 'Al-Husary (Teaching)', hint: 'Slow and clear, made for learners', aka: ['Husari', 'Hussary', 'Muallim', "Mu'allim"] },
  { id: 'MaherAlMuaiqly128kbps', name: 'Maher Al-Muaiqly', hint: 'No word-by-word highlighting', aka: ['Muaiqli', 'Mueaqly'] },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dussary', hint: 'No word-by-word highlighting', aka: ['Dosari', 'Dossary', 'Dawsari'] },
  { id: 'Ghamadi_40kbps', name: 'Saad Al-Ghamdi', hint: 'No word-by-word highlighting', aka: ['Ghamidi', 'Ghamadi'] },
  { id: 'Abu_Bakr_Ash-Shaatree_128kbps', name: 'Abu Bakr Al-Shatri', aka: ['Shatree', 'Shaatree'] },
  { id: 'qud-saud_al_shuraim', name: 'Saud Al-Shuraim', aka: ['Shuraym', 'Shureim'] },
  { id: 'Hudhaify_128kbps', name: 'Ali Al-Hudhaify', aka: ['Huthaifi', 'Hudhaifi', 'Huzaifi'] },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nasser Al-Qatami', aka: ['Qatamy', 'Katami'] },
  { id: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', name: 'Ahmed Al-Ajamy', aka: ['Ajmi', 'Ajami'] },
  { id: 'qud-abdullah_al_mattrod', name: 'Abdullah Al-Mattrod', aka: ['Matrood', 'Matroud'] },
  { id: 'qud-hani_al_rifai', name: 'Hani Ar-Rifai', aka: ['Rifaie', 'Refai'] },
  { id: 'qud-mohammed_al_luhaidan', name: 'Muhammad Al-Luhaidan', aka: ['Lohaidan', 'Luhaydan', 'Mohammed'] },
  { id: 'qud-bandar_baleela', name: 'Bandar Baleela', aka: ['Balila'] },
  { id: 'khalefa_al_tunaiji_64kbps', name: 'Khalifa At-Tunaiji', hint: 'No word-by-word highlighting', aka: ['Tunaji', 'Tunaiji'] },
  { id: 'Mohammad_al_Tablaway_128kbps', name: 'Muhammad At-Tablawi', aka: ['Tablawy', 'Tablaway'] },
  { id: 'qud-mahmoud_ali_al_banna', name: 'Mahmoud Ali Al-Banna', aka: ['Bana'] },
  { id: 'qud-mustafa_ismail', name: 'Mustafa Ismail', aka: ['Mostafa', 'Ismaeel'] },
  { id: 'qud-abdur_rashid_sufi', name: 'Abdur-Rashid Sufi', aka: ['Soufi', 'Abdulrashid'] },
  { id: 'Abdul_Basit_Mujawwad_128kbps', name: 'Abdul Basit (Mujawwad)', hint: 'Melodic and slow', aka: ['Abdulbasit', 'Abdussamad'] },
  { id: 'Minshawy_Mujawwad_192kbps', name: 'Al-Minshawy (Mujawwad)', hint: 'Melodic and slow', aka: ['Minshawi'] },
  { id: 'Husary_128kbps_Mujawwad', name: 'Al-Husary (Mujawwad)', hint: 'Melodic and slow, no word-by-word highlighting', aka: ['Husari', 'Hussary'] },
  { id: 'Muhammad_Jibreel_128kbps', name: 'Muhammad Jibreel', hint: 'No word-by-word highlighting', aka: ['Jibril', 'Mohammed'] },
];

/** Reciters played as slices of whole-surah files → the everyayah directory that fills their missing ayahs */
const SURAH_AUDIO = new Map<string, string>(qudReciters.map((r) => [r.id, r.fallback]));

/** everyayah reciters with quran-align word timings in public/segments */
const AYAH_TIMED = new Set([
  'Alafasy_128kbps',
  'Abdul_Basit_Murattal_192kbps',
  'Minshawy_Murattal_128kbps',
  'Abu_Bakr_Ash-Shaatree_128kbps',
  'Abdul_Basit_Mujawwad_128kbps',
  'Husary_Muallim_128kbps',
  'Minshawy_Mujawwad_192kbps',
  'Mohammad_al_Tablaway_128kbps',
]);

/** Reciters whose ids changed when their audio moved off Tarteel's CDN (2026-10-16) */
export const RENAMED_RECITERS: Record<string, string> = {
  'qud-saad_al_ghamdi': 'Ghamadi_40kbps',
  'qud-abu_bakr_al_shatri': 'Abu_Bakr_Ash-Shaatree_128kbps',
  'qud-khalifa_al_tunaiji': 'khalefa_al_tunaiji_64kbps',
  'qud-abdulbasit_mujawwad': 'Abdul_Basit_Mujawwad_128kbps',
  'qud-husary_mujawwad': 'Husary_128kbps_Mujawwad',
};

export const isSurahAudio = (id: string) => SURAH_AUDIO.has(id);
export const surahAudioFallback = (id: string) => SURAH_AUDIO.get(id) ?? 'Alafasy_128kbps';
/** Whether public/segments has word timings for this reciter (highlighting, word slices) */
export const hasWordTimings = (id: string) => AYAH_TIMED.has(id) || SURAH_AUDIO.has(id);
