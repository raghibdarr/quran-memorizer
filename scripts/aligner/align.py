"""Generate word timings for an EveryAyah-style per-ayah reciter.

    python align.py <reciterDir> --gaps                 # ayahs listed under the reciter's
                                                        # lowCorrelationSkipped in the manifest
    python align.py <reciterDir> --ayahs 17:1-111 62:9  # explicit ayahs / ranges
    python align.py <reciterDir> --surahs 1 112-114     # whole surahs
    python align.py <reciterDir> --all                  # the whole Qur'an

Writes to a STAGING folder (default <TAKRAR_ALIGNER_HOME>/out/<reciterDir>/), never to
public/segments:
    <surah>.json   {"<ayah>": [[wordNumber, startMs, endMs], ...]}   (Takrar's format)
    _report.json   per ayah: confidence, lead-in found, repeats, duration, flags
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import takrar_align as ta

# Never generate from / compare with data under the QUA Dataset License (QUD v5+).
MANIFEST = ta.REPO / "public" / "segments" / "manifest.json"


def parse_ayahs(specs: list) -> list:
    out = []
    for sp in specs:
        m = re.fullmatch(r"(\d+):(\d+)(?:-(\d+))?", sp)
        if not m:
            sys.exit(f"bad ayah spec {sp!r} (want 17:1 or 17:1-111)")
        s, a, b = int(m[1]), int(m[2]), int(m[3] or m[2])
        out += [(s, x) for x in range(a, b + 1)]
    return out


def parse_surahs(specs: list) -> list:
    out = []
    for sp in specs:
        a, _, b = sp.partition("-")
        for s in range(int(a), int(b or a) + 1):
            out += [(s, x) for x in range(1, len(ta.surah_words(s)) + 1)]
    return out


def gaps(reciter: str) -> list:
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    skipped = man["reciters"][reciter].get("lowCorrelationSkipped", [])
    return [tuple(int(x) for x in re.match(r"(\d+):(\d+)", k).groups()) for k in skipped]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("reciter", help="EveryAyah directory, e.g. Husary_128kbps_Mujawwad")
    ap.add_argument("--gaps", action="store_true")
    ap.add_argument("--ayahs", nargs="*", default=[])
    ap.add_argument("--surahs", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default=str(ta.WORK / "out"))
    ap.add_argument("--min-confidence", type=float, default=0.4,
                    help="do not stage ayahs below this confidence: the file most likely holds other "
                         "words than the ayah's text (they are still listed in _report.json)")
    args = ap.parse_args()

    todo = []
    if args.gaps:
        todo += gaps(args.reciter)
    todo += parse_ayahs(args.ayahs) + parse_surahs(args.surahs)
    if args.all:
        todo += parse_surahs(["1-114"])
    todo = sorted(set(todo))
    if not todo:
        sys.exit("nothing to do: pass --gaps, --ayahs, --surahs or --all")

    print(f"{args.reciter}: {len(todo)} ayahs; fetching audio", flush=True)
    with ThreadPoolExecutor(4) as ex:
        paths = list(ex.map(lambda t: ta.audio_path(args.reciter, t[0], t[1]), todo))
    em = ta.Emitter()
    p = ta.Params()
    out_dir = Path(args.out) / args.reciter
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {
        "reciter": args.reciter, "model": ta.MODEL_ID, "params": {}, "ayahs": {}}
    report["params"] = {k: getattr(p, k) for k in p.__dataclass_fields__}
    by_surah = {}
    t0 = time.time()
    audio_s = 0.0
    for (s, a), path in zip(todo, paths):
        key = f"{s}:{a}"
        if path is None:
            report["ayahs"][key] = {"error": "audio not found on EveryAyah"}
            print(f"  {key}: no audio")
            continue
        try:
            wav = ta.load_audio(path)
            audio_s += len(wav) / ta.SR
            r = ta.align_ayah(em.emissions(wav), ta.envelope_db(wav), s, a, em.vocab, em.blank, p)
        except Exception as e:
            report["ayahs"][key] = {"error": str(e)}
            print(f"  {key}: FAILED {e}")
            continue
        flags = ta.sanity_flags(r)
        report["ayahs"][key] = {"confidence": r.confidence, "words": len(r.rows), "durationMs": r.duration_ms,
                                "leadIn": r.lead_in, "repeats": r.repeats, "flags": flags,
                                "staged": r.confidence >= args.min_confidence}
        if r.confidence >= args.min_confidence:
            by_surah.setdefault(s, {})[str(a)] = r.rows
        else:
            print(f"  {key}: confidence {r.confidence:.2f} - not staged (audio does not match the ayah's text?)")
    for s, rows in by_surah.items():
        f = out_dir / f"{s}.json"
        cur = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        cur.update(rows)
        cur = {k: cur[k] for k in sorted(cur, key=int)}
        f.write_text(json.dumps(cur), encoding="utf-8")
    report["ayahs"] = {k: report["ayahs"][k] for k in sorted(report["ayahs"], key=lambda k: tuple(map(int, k.split(":"))))}
    report_path.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    ok = [v for v in report["ayahs"].values() if "confidence" in v]
    confs = sorted(v["confidence"] for v in ok)
    print(f"done: {len(ok)} aligned, {len(report['ayahs']) - len(ok)} failed, "
          f"{audio_s / 60:.1f} min of audio in {time.time() - t0:.0f}s")
    if confs:
        print(f"confidence: min {confs[0]:.2f}, median {confs[len(confs) // 2]:.2f}; "
              f"<0.6: {sum(c < 0.6 for c in confs)}, not staged (<{args.min_confidence}): "
              f"{sum(c < args.min_confidence for c in confs)}, flagged: {sum(bool(v['flags']) for v in ok)}")
    print(f"staged in {out_dir}")


if __name__ == "__main__":
    main()
