# Takrar word-timing generator ("route B")

Forced alignment of an EveryAyah-style per-ayah recitation against the ayah's known text,
producing word timings in Takrar's own format
(`{"<ayah>": [[wordNumber, startMs, endMs], ...]}`, relative to the start of
`https://everyayah.com/data/<reciterDir>/<sss><aaa>.mp3`, word numbers over the
`charType === 'word'` words of `src/data/surah-<n>.json`).

Nothing here writes to `public/segments`. Output goes to a staging folder for review.

## Licences

| Piece | What | Licence | Notes |
|---|---|---|---|
| Acoustic model | [`obadx/muaalem-model-v3_2`](https://huggingface.co/obadx/muaalem-model-v3_2) | MIT (model card `license: mit`) | fine-tune of `facebook/w2v-bert-2.0` (MIT). Only the encoder and the `phonemes` CTC head are loaded. |
| Phonetizer | [`quran-transcript`](https://pypi.org/project/quran-transcript/) 0.6.4 | MIT (`License-Expression: MIT` in the wheel) | bundles Tanzil's Uthmani text (CC BY 3.0, attribution to tanzil.net required, text unmodified). The GitHub repo's `LICENSE` file is the Tanzil notice, so GitHub shows "Other"; the package metadata is what states MIT. |
| Model code | `transformers` `Wav2Vec2BertModel` + one `Linear` | Apache-2.0 | **The `quran-muaalem` package is deliberately not used**: from 0.3.0 it is under a custom "QML-1.0" licence (0.2.2 and earlier were MIT). The checkpoint is read directly with `safetensors`. |
| Runtime | `torch` (BSD-3), `numpy` (BSD-3), `safetensors` (Apache-2.0), `huggingface_hub` (Apache-2.0), ffmpeg (external binary) | | |
| Evaluation data | quran-align timings (CC BY 4.0) for 8 reciters; QUD v3.2.0-derived timings (CC BY 4.0) for 3 | | read from `public/segments`. **Nothing from QUD v5.0.0+ (QUA Dataset License), Tarteel or quran.com is read, downloaded or evaluated against.** `evaluate.py` has a fixed allow-list. |

No model is trained or fine-tuned: inference and CTC forced alignment only. No CC-BY-NC
model (e.g. torchaudio `MMS_FA`) is used.

## Setup (Windows, CUDA)

```bash
python -m venv C:/Users/<you>/Downloads/takrar-sources/aligner/.venv
VENV=C:/Users/<you>/Downloads/takrar-sources/aligner/.venv/Scripts/python
$VENV -m pip install torch --index-url https://download.pytorch.org/whl/cu124
$VENV -m pip install -r scripts/aligner/requirements.txt
```

ffmpeg must be on PATH. Weights (2.3 GB), audio and caches live under
`TAKRAR_ALIGNER_HOME` (default `C:\Users\raghi\Downloads\takrar-sources\aligner`), never in the
repo. The model downloads itself on first use. CPU works too, just slower.
On Windows run with `PYTHONIOENCODING=utf-8`.

## Run

```bash
cd scripts/aligner
$VENV align.py Husary_128kbps_Mujawwad --gaps            # ayahs in manifest lowCorrelationSkipped
$VENV align.py SomeReciter_128kbps --all                 # a whole new reciter
$VENV align.py SomeReciter_128kbps --surahs 1 78-114
$VENV align.py SomeReciter_128kbps --ayahs 2:255 17:1-111
```

Output, in `<TAKRAR_ALIGNER_HOME>/out/<reciterDir>/`:

* `<surah>.json` in Takrar's segment format (merge into `public/segments/<reciterDir>/` after review);
* `_report.json` with, per ayah: `confidence`, `leadIn`, `repeats`, `flags`, `staged`.

Speed on an RTX 4080 Super: about 90x real time end to end (110 minutes of mujawwad audio
in 72 s); a whole reciter is 15 to 40 minutes plus the download.

## Method

1. **Text.** `quran-transcript` phonetizes the whole ayah (so cross-word tajweed, idgham,
   iqlab, madd and waqf at the ayah end are applied) and returns a character-to-phoneme map,
   from which each word's first phoneme is taken. Its text is Tanzil's; the three places where
   Takrar keeps a two-part word whole (2:181, 8:6, 37:130) are merged to Takrar's numbering.
2. **Acoustics.** The model gives one phoneme posterior vector per 40 ms. Audio over 48 s is
   run in 40 s windows with 4 s of context each side.
3. **Alignment.** Our own Viterbi over the CTC lattice (`ctc_align`), with three extensions:
   * runs of identical phonemes (madd, shadda, ghunna lengths) are collapsed to one token
     that may be re-entered, so recitation speed and madd length do not matter;
   * **repeats**: from the end of any word the path may rewind to the start of the same or
     an earlier word at a fixed cost. Reciters restart a few words back after a breath
     (10% of murattal ayahs in the sample, 12% of mujawwad), or repeat a whole ayah. A word
     is timed on its **first** rendition; time spent on the repeat stays with the last word
     reached before the rewind. (`Params.rendition = "final"` gives the other convention;
     "first" agreed with the ground truth far more often.)
   * **lead-ins**: for ayah 1 the path is also tried with isti'adha and/or basmala before
     the ayah and the best-scoring variant kept; the lead-in gets no word timing.
4. **Times.** A word starts at the first frame of its first phoneme, minus a 30 ms
   calibration (the CTC spike sits just after the onset; -30 ms splits the difference between
   the two ground-truth sources, which disagree with each other by 40 ms). Where an idgham with
   ghunna merges the previous word's tanween/nun into the word, the word starts at the release of the
   held sound, as both ground-truth sources mark it. A word ends 10 ms before the next one, or
   at the start of a pause of 250 ms or more (energy 28 dB under the recording's loud level);
   the last word ends where the sound does.
5. **Confidence** (0 to 1 per ayah) = half the share of words whose phonemes the model heard
   with mean posterior of at least 0.5, half the mean phoneme posterior. It answers "is this the ayah's
   text at all": aligning 432 sampled recordings to the *next* ayah's text gave a median of
   0.0003 and a maximum of 0.40, while the right text gave a median of 0.98 with 2 of 432 below 0.3.
   `align.py` does not stage anything under 0.4. Above that it is only a weak predictor of
   timing precision (see table), so treat `flags` as review hints, not as error bars.

## Evaluation

`evaluate.py emit` then `evaluate.py score`. Sample: seeded, stratified per reciter (30% from
long surahs, 35% medium, 35% juz' 30, plus fixed hard cases: 1:1, 2:1, 2:282, 9:1, 19:1,
36:1, 55:13, 112:1). 1,686 ayahs / 18,158 words over 11 reciters. Error = aligner minus
ground truth. "Failed" = alignment impossible or the ayah's median start error is over 500 ms.
Baseline = file duration shared out by letter count.

Word start, absolute error:

| Set | Ayahs | Words | Median | p90 | within 50 | 100 | 150 | 200 ms | Failed ayahs | Baseline median / within 150 |
|---|---|---|---|---|---|---|---|---|---|---|
| **All** | 1,686 | 18,158 | **40 ms** | 130 | 61.6% | 85.4% | **92.1%** | 93.7% | 0.9% | 939 ms / 11.4% |
| quran-align, 8 reciters | 1,252 | 14,106 | 50 | 140 | 56.7% | 83.5% | 91.3% | 92.7% | 1.2% | 1000 / 11.0% |
| ... murattal (5) | 785 | 8,802 | 40 | 100 | 65.4% | 90.0% | 94.4% | 95.3% | 0.1% | 700 / 14.3% |
| ... Husary Muallim | 157 | 1,746 | 50 | 120 | 52.4% | 85.9% | 95.1% | 96.2% | 0% | 1948 / 4.7% |
| ... mujawwad (Abdul Basit, Minshawy) | 310 | 3,558 | 80 | 460 | 37.3% | 66.4% | 81.8% | 84.3% | 4.5% | 1848 / 5.8% |
| QUD v3.2.0, 3 reciters | 434 | 4,052 | 30 | 78 | 78.6% | 92.1% | 95.0% | 97.3% | 0% | 758 / 13.0% |
| ... Ghamadi, khalefa (murattal) | 287 | 2,715 | 30 | 70 | 81.7% | 93.2% | 96.1% | 98.6% | 0% | 496 / 17.2% |
| ... Husary Mujawwad | 147 | 1,337 | 30 | 105 | 72.3% | 89.8% | 92.7% | 94.7% | 0% | 1935 / 4.6% |
| Short ayahs (6 words or fewer) | 798 | 3,024 | 40 | 130 | 60.3% | 84.7% | 93.1% | 94.3% | 1.8% | 436 / 21.9% |
| Long ayahs (30 words or more) | 72 | 3,837 | 45 | 150 | 57.4% | 83.7% | 90.5% | 92.1% | 0% | 1970 / 5.0% |

Word end (the boundary a highlight leaves a word): all 50 ms median, 83.4% within 150 ms,
p90 389 ms; quran-align 81.7% within 150; QUD 89.2%. End errors are dominated by pauses
and last words, where the two sources themselves use different conventions.

Per reciter (start: median / within 150 ms): Alafasy 30 / 96.2%, Shaatree 30 / 95.6%,
Tablaway 40 / 94.7%, Minshawy Murattal 40 / 92.9%, Abdul Basit Murattal 50 / 92.9%,
Husary Muallim 50 / 95.1%, Abdul Basit Mujawwad 80 / 82.7%, Minshawy Mujawwad 70 / 80.8%,
Ghamadi 30 / 95.6%, khalefa 30 / 96.6%, Husary Mujawwad 30 / 92.7%.

Confidence vs error (all 1,686): [0.9, 1] 1,349 ayahs, 93.4% of words within 150 ms;
[0.8, 0.9) 241, 89.4%; [0.7, 0.8) 64, 88.8%; [0.6, 0.7) 18, 81.0%; under 0.6: 14 ayahs, 98%.

### Reading the mujawwad numbers

The two quran-align mujawwad reciters score much lower than Husary Mujawwad measured against
QUD (92.7% within 150 ms, no failures). The quran-align ground truth for mujawwad is the limit:

* quran-align could not separate some words and timed a stretch as one segment, which the
  import shares out evenly (manifest: 686 and 657 such segments for the two mujawwad
  reciters, 14 to 27 for the others). Dropping those rows (they touch with no 10 ms gap) moves
  mujawwad to 84.3% within 150 ms and all quran-align reciters to 92.3%.
* Every one of the roughly 25 worst disagreements that were inspected by hand (aligner vs the
  model's unconstrained greedy decode and the silence envelope) was a ground-truth error or a
  convention difference, not an aligner error. Examples: Minshawy Mujawwad 1:1 (speech starts
  after 4.3 s of silence, ground truth starts word 1 at 5.8 s); Abdul Basit Mujawwad 7:183
  (word 3 follows a 3.9 s pause ending at 8.3 s, ground truth says 11.1 s); 19:1 for both;
  91:6 (whole ayah recited twice; ground truth times the second pass, we time the first).

So the "failed 4.5%" for mujawwad is an upper bound that is mostly ground-truth noise. It has
not been proven to be zero.

## Known weaknesses

* 40 ms frames: timing cannot be better than about +/-20 ms, and the median error is at that floor.
* One timing per word. With a repeat, the highlight waits on the last word of the first pass
  while the reciter goes back. A fully repeated ayah is timed on its first pass.
* The phonetizer assumes Hafs with a stop only at the end of the ayah. A stop mid-ayah
  (dropped tanween, madd 'arid), a saktah recited as idgham (75:27 with Husary) or another
  riwayah lowers confidence on those words; timing usually survives because the neighbours anchor it.
* Idgham boundaries are a convention. Tanween/nun + ghunna is placed at the release (matches
  both sources); a doubled consonant without ghunna at its onset. Either can be 200 to 600 ms
  from where a listener would put it in slow recitation.
* Word ends at pauses depend on an energy threshold; reverberant mujawwad recordings may
  hold a word through a short pause.
* Extra speech after the ayah (takbir, "sadaqa Allah") is not modelled and would be attached to
  the last word; none was seen in the sample.
* Lead-in handling (isti'adha/basmala inside ayah 1) is implemented but was never triggered
  in the sample or the gap fill, so it is untested on real data.
* It times what the file contains. If the file holds another ayah, confidence collapses and
  nothing is staged (see below), but the right fix is then the audio, not the timing.

## Gap fill, 2026-11-13

| Reciter | Gap ayahs | Staged | Confidence |
|---|---|---|---|
| `Husary_128kbps_Mujawwad` | 150 (manifest list) | **150** | median 0.98, p10 0.87, min 0.49; 120 at 0.9 or more, 27 in 0.8 to 0.9, 2 in 0.77 to 0.8, 1 at 0.49 (75:27, saktah recited as idgham, 3 words). 18 ayahs contain a repeated phrase. |
| `khalefa_al_tunaiji_64kbps` | 36 | **1** (1:1, 0.99) | the other 35 scored 0.00 to 0.06: **EveryAyah's files hold the wrong ayah** |

EveryAyah's khalefa files for surahs 13 and 14 are shifted by one: `013001..013005.mp3` hold
ayahs 2 to 6 (ayah 6 again in `013006`, ayah 1 missing) and `014001..014050.mp3` hold ayahs
2 to 51 (ayah 51 again in `014051`, ayah 1 missing). Found by decoding each file and matching
it against every ayah of the surah. That is why the correlation import skipped them, and no timing can fix it.
It also means the 20 ayahs of 14:1-50 that *did* pass the 0.9 correlation and are in
`public/segments/khalefa_al_tunaiji_64kbps/14.json` today (14:2, 7, 14, 15, 16, 20, 26, 28,
29, 30, 33, 35, 40, 41, 43, 46, 47, 48, 49, 50) carry timings for audio that is a different ayah.

## khalefa file check and remap, 2026-11-13

`check_audio.py decode|report <reciterDir>` free-decodes every per-ayah file and compares it
with its own ayah and the neighbours +/-2 (single ayahs and runs of up to three).
`remap_khalefa.py` then stages the fix for `khalefa_al_tunaiji_64kbps`. Result over all 6,236 files:

* 6,177 files start and end with their own ayah (longer decodes are mid-ayah restarts).
* Surah 13: `013001..013005` hold ayahs 2..6 (`013006` is correct too). Ayah 1 is in no file.
* Surah 14: `014001..014050` hold ayahs 2..51 (`014051` is correct too). Ayah 1 is in no file.
* Surah 34: `034047` holds ayahs 47 and 48 (47 ends at 15.08 s of 22.8 s); `034048` holds 49;
  `034049` holds 50 without its last three words; `034050` holds only those three words.

Staged in `<TAKRAR_ALIGNER_HOME>/out/khalefa_al_tunaiji_64kbps/`: `_remap.json` (55 ayahs to
another file, 3 missing), `13.json`/`14.json`/`34.json` (timings relative to the remapped file;
34:48 starts 15.09 s into `034047`), `_missing.json` (13:1, 14:1, 34:50 located in mp3quran.net's
whole-surah files of the same reciter, plus 34:50's two EveryAyah pieces), `_report.json`.
