import qudReciters from '../data/qud-reciters.json';

export interface ReciterOption {
  /** Settings id. EveryAyah directory for per-ayah reciters; kept as-is for reciters
   *  later moved to surah audio, so saved choices carry over. */
  id: string;
  name: string;
  hint?: string;
}

/**
 * Every reciter in the picker. Two kinds of audio sit behind them:
 * - per-ayah files from everyayah.com, word-timed by QUL (Tarteel) where we have data;
 * - whole-surah files (QuranicAudio, MP3Quran, Tarteel's CDN) timed per ayah and per
 *   word by Qur'anic Universal Audio (QUD). Those are listed in src/data/qud-reciters.json
 *   and played as a slice of the surah file (see audioController).
 */
export const RECITERS: ReciterOption[] = [
  { id: 'Alafasy_128kbps', name: 'Mishary Alafasy', hint: 'Default, clear and modern' },
  { id: 'Husary_128kbps', name: 'Mahmoud Al-Husary', hint: 'Slower, beginner-friendly' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)', hint: 'Slow, ornate' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Al-Minshawy (Murattal)', hint: 'Classical' },
  // 128kbps (exact everyayah dir name, no underscores): QUL's word timestamps align to
  // this encode, not the old 64kbps directory
  { id: 'MaherAlMuaiqly128kbps', name: 'Maher Al-Muaiqly' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dussary' },
  { id: 'qud-saad_al_ghamdi', name: 'Saad Al-Ghamdi' },
  { id: 'qud-abu_bakr_al_shatri', name: 'Abu Bakr Al-Shatri' },
  { id: 'qud-saud_al_shuraim', name: 'Saud Al-Shuraim' },
  { id: 'Hudhaify_128kbps', name: 'Ali Al-Hudhaify' },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nasser Al-Qatami' },
  { id: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', name: 'Ahmed Al-Ajamy' },
  { id: 'qud-abdullah_al_mattrod', name: 'Abdullah Al-Mattrod' },
  { id: 'qud-hani_al_rifai', name: 'Hani Ar-Rifai' },
  { id: 'qud-mohammed_al_luhaidan', name: 'Muhammad Al-Luhaidan' },
  { id: 'qud-bandar_baleela', name: 'Bandar Baleela' },
  { id: 'qud-khalifa_al_tunaiji', name: 'Khalifa At-Tunaiji' },
  { id: 'qud-mahmoud_ali_al_banna', name: 'Mahmoud Ali Al-Banna' },
  { id: 'qud-mustafa_ismail', name: 'Mustafa Ismail' },
  { id: 'qud-abdur_rashid_sufi', name: 'Abdur-Rashid Sufi' },
  { id: 'qud-abdulbasit_mujawwad', name: 'Abdul Basit (Mujawwad)', hint: 'Melodic and slow' },
  { id: 'qud-husary_mujawwad', name: 'Al-Husary (Mujawwad)', hint: 'Melodic and slow' },
  { id: 'Muhammad_Jibreel_128kbps', name: 'Muhammad Jibreel', hint: 'No word-by-word highlighting' },
];

/** Reciters played as slices of whole-surah files → the everyayah directory that fills their missing ayahs */
const SURAH_AUDIO = new Map<string, string>(qudReciters.map((r) => [r.id, r.fallback]));

/** everyayah reciters with QUL word timings in public/segments */
const QUL_TIMED = new Set([
  'Alafasy_128kbps',
  'Abdul_Basit_Murattal_192kbps',
  'Minshawy_Murattal_128kbps',
  'Yasser_Ad-Dussary_128kbps',
  'MaherAlMuaiqly128kbps',
]);

export const isSurahAudio = (id: string) => SURAH_AUDIO.has(id);
export const surahAudioFallback = (id: string) => SURAH_AUDIO.get(id) ?? 'Alafasy_128kbps';
/** Whether public/segments has word timings for this reciter (highlighting, word slices) */
export const hasWordTimings = (id: string) => QUL_TIMED.has(id) || SURAH_AUDIO.has(id);
