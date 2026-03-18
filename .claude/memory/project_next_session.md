---
name: Next session tasks
description: Planned tasks for the next working session — home page improvements, juz navigation, surah metadata
type: project
---

## Pending Testing
- Test the practice mode changes (Practice Again shouldn't affect completion status)
- Test level 1 result screen (score display, mistake highlighting, varied messaging)
- Test level 3 full recall (lesson label, play buttons on reveal, Forgot/Struggled/Easy)
- Test fail screen flow (shows mistakes before redirecting to review)

## Home Page Improvements
- **Search/filter**: Searchable input to filter surahs by name (Arabic or English)
- **Sort options**: By length (ayah count), by curriculum order, alphabetical
- **Surah numbers**: Show surah number (e.g. "112" next to "Al-Ikhlas")
- **Juz labels**: Pill/badge on each surah showing which juz it belongs to (e.g. "Juz 30", or "Juz 1-2" for surahs spanning multiple)

## Juz Navigation
- **Juz tab on home page**: Separate view showing Juz 1-30
- **Click into juz**: Shows surahs within that juz with lesson breakdowns
- **Lesson splitting within juz**: Keep consistent ~5 ayahs per lesson
- **Consider hizb/rub divisions**: Each juz has 2 hizb, each hizb has 4 rub al-hizb. These could inform lesson boundaries for longer surahs rather than arbitrary 5-ayah splits. Need to research if the rub boundaries align well with thematic/meaning breaks.
- **Data needed**: Juz/hizb/rub metadata — Tarteel QUL has this at qul.tarteel.ai/resources/quran-metadata

## Open Questions
- Should lesson splits respect hizb/rub boundaries, or stick with fixed 5-ayah chunks?
- For surahs spanning multiple juz (e.g. Al-Baqarah spans Juz 1-3), how to handle in the juz view?
- Do we need all 114 surahs' data fetched, or just expand as needed?
