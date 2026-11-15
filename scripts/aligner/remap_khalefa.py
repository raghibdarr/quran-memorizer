"""khalefa_al_tunaiji_64kbps: EveryAyah's files for parts of surahs 13, 14 and 34 hold a
different ayah than their name says (found with check_audio.py over all 6236 files).
This stages, under <TAKRAR_ALIGNER_HOME>/out/khalefa_al_tunaiji_64kbps/:

    _remap.json    {"<surah>:<ayah>": "<sss><aaa>", ..., "missing": [...]}  correct file per ayah
    <surah>.json   word timings of each remapped ayah, relative to the start of the remapped file
    _missing.json  ayahs no EveryAyah file holds in one piece: where they sit in mp3quran.net's
                   whole-surah file of the same reciter, with word timings relative to that start
    _report.json   confidences (merged into the existing report)

Nothing is written to the repo.
"""
from __future__ import annotations

import json
import urllib.request

import numpy as np

import takrar_align as ta

REC = "khalefa_al_tunaiji_64kbps"
OUT = ta.WORK / "out" / REC
MP3QURAN = "https://cdn.mp3quran.net/audio/khalifa-tunaiji/r1/{:03d}.mp3"

# file -> the ayahs its audio holds, in order (from check_audio.py, confirmed below by alignment)
FILES = {(13, n): [(13, n + 1)] for n in range(1, 5)}            # 013001..004 hold ayahs 2..5
FILES.update({(14, n): [(14, n + 1)] for n in range(1, 50)})     # 014001..049 hold ayahs 2..50
FILES[(34, 47)] = [(34, 47), (34, 48)]                           # two ayahs in one file
FILES[(34, 48)] = [(34, 49)]
REMAP = {(13, a): (13, a - 1) for a in range(2, 6)}
REMAP.update({(14, a): (14, a - 1) for a in range(2, 51)})
REMAP.update({(34, 48): (34, 47), (34, 49): (34, 48)})
# 34:50 is cut in two: 034049 holds all but its last three words, 034050 holds those three
SPLIT = {(34, 50): [((34, 49), 0, -3), ((34, 50), -3, None)]}
MISSING = [(13, 1), (14, 1), (34, 50)]   # 34:50 exists only in two pieces


def run(em, wav, txt, lead=None):
    return ta.align_ayah(em.emissions(wav), ta.envelope_db(wav), 0, 0, em.vocab, em.blank,
                         txt=txt, lead_candidates=lead or [""])


def main():
    em = ta.Emitter()
    OUT.mkdir(parents=True, exist_ok=True)
    report_p = OUT / "_report.json"
    report = json.loads(report_p.read_text(encoding="utf-8")) if report_p.exists() else {"reciter": REC, "ayahs": {}}
    staged = {}
    remap_report = {}

    for (s, a), (fs, fa) in sorted(REMAP.items()):
        held = FILES[(fs, fa)]
        wav = ta.load_audio(ta.audio_path(REC, fs, fa))
        r = run(em, wav, ta.concat_text(held))
        k = sum(ta.ayah_text(*x).n_words for x in held[:held.index((s, a))])
        n = ta.ayah_text(s, a).n_words
        rows = [[i + 1, st, en] for i, (_, st, en) in enumerate(r.rows[k:k + n])]
        staged.setdefault(s, {})[str(a)] = rows
        remap_report[f"{s}:{a}"] = {"file": f"{fs:03d}{fa:03d}", "confidence": r.confidence, "words": n,
                                    "startMs": rows[0][1], "endMs": rows[-1][2], "fileDurationMs": r.duration_ms,
                                    "fileHolds": [f"{x}:{y}" for x, y in held], "repeats": r.repeats,
                                    "flags": ta.sanity_flags(r)}
        print(f"{s}:{a} <- {fs:03d}{fa:03d}  conf {r.confidence:.2f}  {rows[0][1]}..{rows[-1][2]} ms")

    # 34:47 keeps its own file, but the file runs on into ayah 48: say where 47 ends
    wav = ta.load_audio(ta.audio_path(REC, 34, 47))
    r = run(em, wav, ta.concat_text(FILES[(34, 47)]))
    n47 = ta.ayah_text(34, 47).n_words
    notes = {"34:47": {"file": "034047", "note": "own file, but it continues with ayah 48",
                       "ayahEndsMs": r.rows[n47 - 1][2], "fileDurationMs": r.duration_ms,
                       "confidence": r.confidence, "rows": r.rows[:n47]}}

    # the split ayah, piece by piece
    split_out = {}
    for (s, a), pieces in SPLIT.items():
        t = ta.ayah_text(s, a)
        parts = []
        for (fs, fa), w0, w1 in pieces:
            w0 = w0 % t.n_words if w0 < 0 else w0
            w1 = t.n_words if w1 is None else (w1 % t.n_words if w1 < 0 else w1)
            wav = ta.load_audio(ta.audio_path(REC, fs, fa))
            r = run(em, wav, ta.slice_text(t, w0, w1))
            parts.append({"file": f"{fs:03d}{fa:03d}", "words": [w0 + 1, w1], "confidence": r.confidence,
                          "rows": [[w0 + i + 1, st, en] for i, (_, st, en) in enumerate(r.rows)]})
            print(f"{s}:{a} words {w0 + 1}..{w1} in {fs:03d}{fa:03d}  conf {r.confidence:.2f}")
        split_out[f"{s}:{a}"] = parts

    # missing ayahs: look in mp3quran.net's whole-surah recording of the same reciter
    missing_out = {}
    cache = ta.AUDIO_DIR / "mp3quran-khalifa-tunaiji"
    cache.mkdir(parents=True, exist_ok=True)
    for s in sorted({s for s, _ in MISSING}):
        p = cache / f"{s:03d}.mp3"
        if not p.exists():
            req = urllib.request.Request(MP3QURAN.format(s), headers={"User-Agent": "Mozilla/5.0"})
            p.write_bytes(urllib.request.urlopen(req, timeout=300).read())
        wav = ta.load_audio(p)
        ayahs = [(s, a) for a in range(1, len(ta.surah_words(s)) + 1)]
        r = run(em, wav, ta.concat_text(ayahs), lead=["basmala", "istiaatha+basmala", ""])
        k = 0
        per_ayah = {}
        for (_, a) in ayahs:
            n = ta.ayah_text(s, a).n_words
            per_ayah[a] = r.rows[k:k + n]
            k += n
        print(f"mp3quran {s:03d}: whole-surah confidence {r.confidence:.2f}, lead-in {r.lead_in!r}, repeats {r.repeats}")
        for (ms, a) in MISSING:
            if ms != s:
                continue
            rows = per_ayah[a]
            st, en = rows[0][1], rows[-1][2]
            # re-align the ayah alone on its own stretch (with margins) for a local confidence
            lo = max(0, st - 1500); hi = min(int(len(wav) / 16), en + 1500)
            seg = wav[lo * 16:hi * 16]
            rr = run(em, seg, ta.ayah_text(s, a))
            missing_out[f"{s}:{a}"] = {
                "source": MP3QURAN.format(s), "startMs": st, "endMs": en,
                "confidence": rr.confidence, "surahConfidence": r.confidence, "leadIn": r.lead_in,
                "words": [[i + 1, x - st, y - st] for i, (_, x, y) in enumerate(rows)],
                "check": {"isolatedStartMs": rr.rows[0][1] + lo, "isolatedEndMs": rr.rows[-1][2] + lo},
            }
            print(f"  {s}:{a} at {st}..{en} ms, confidence {rr.confidence:.2f}")

    remap = {f"{s}:{a}": f"{fs:03d}{fa:03d}" for (s, a), (fs, fa) in sorted(REMAP.items())}
    remap["missing"] = [f"{s}:{a}" for s, a in MISSING]
    (OUT / "_remap.json").write_text(json.dumps(remap, indent=1), encoding="utf-8")
    for s, rows in staged.items():
        f = OUT / f"{s}.json"
        cur = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        cur.update(rows)
        f.write_text(json.dumps({k: cur[k] for k in sorted(cur, key=int)}), encoding="utf-8")
    missing_doc = {"note": "startMs/endMs are inside the mp3quran.net whole-surah file; word rows are relative to startMs",
                   "ayahs": missing_out, "splitOnEveryAyah": split_out}
    (OUT / "_missing.json").write_text(json.dumps(missing_doc, indent=1), encoding="utf-8")
    report["remapped"] = remap_report
    report["notes"] = notes
    report_p.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
