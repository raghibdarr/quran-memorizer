/** "Ayahs 190–192", or "Ayah 196" when the range is one ayah */
export const ayahRange = (start: number, end: number) => (start === end ? `Ayah ${start}` : `Ayahs ${start}–${end}`);
