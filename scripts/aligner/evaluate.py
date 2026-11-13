"""Evaluate the aligner against CC BY 4.0 ground truth (quran-align timings as imported into
public/segments for Takrar's eight quran-align reciters).

    python evaluate.py emit              # download the sample's audio, cache model emissions
    python evaluate.py score [options]   # align from the cache and print metrics

Never point this at QUD v5+ data (e.g. Muhammad_Jibreel_128kbps): GT_RECITERS is a fixed
allow-list and nothing else is read.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

import takrar_align as ta

# segments folder (ground truth) -> EveryAyah directory whose audio the ground truth was timed on
GT_RECITERS = {
    "Alafasy_128kbps": ("Alafasy_128kbps", "murattal"),
    "Minshawy_Murattal_128kbps": ("Minshawy_Murattal_128kbps", "murattal"),
    "Abdul_Basit_Murattal_192kbps": ("Abdul_Basit_Murattal_64kbps", "murattal"),
    "Abu_Bakr_Ash-Shaatree_128kbps": ("Abu_Bakr_Ash-Shaatree_128kbps", "murattal"),
    "Husary_Muallim_128kbps": ("Husary_Muallim_128kbps", "muallim"),
    "Mohammad_al_Tablaway_128kbps": ("Mohammad_al_Tablaway_128kbps", "murattal"),
    "Abdul_Basit_Mujawwad_128kbps": ("Abdul_Basit_Mujawwad_128kbps", "mujawwad"),
    "Minshawy_Mujawwad_192kbps": ("Minshawy_Mujawwad_192kbps", "mujawwad"),
}
# Second ground-truth set: Qur'anic Universal Audio v3.2.0 (CC BY 4.0) timings that
# scripts/import-tarteel-matched.mjs mapped onto EveryAyah's files (correlation >= 0.9).
# Reported separately. (v3.2.0 only - never v5+.)
QUD_RECITERS = {
    "Ghamadi_40kbps": ("Ghamadi_40kbps", "qud-murattal"),
    "khalefa_al_tunaiji_64kbps": ("khalefa_al_tunaiji_64kbps", "qud-murattal"),
    "Husary_128kbps_Mujawwad": ("Husary_128kbps_Mujawwad", "qud-mujawwad"),
}
GT_RECITERS.update(QUD_RECITERS)
LONG = [2, 3, 4, 5, 6, 7, 9, 11, 16]
MEDIUM = [12, 18, 19, 20, 24, 36, 38, 55, 56, 67, 71, 73]
SHORT = list(range(78, 115))
EMIS = ta.WORK / "emis"
SEG = ta.REPO / "public" / "segments"


def n_ayahs(s: int) -> int:
    return len(ta.surah_words(s))


def sample(per_reciter: int, seed: int = 20261113) -> list:
    out = []
    for ri, rec in enumerate(GT_RECITERS):
        rng = random.Random(seed + ri)
        picks = set()
        # fixed hard cases for everyone: first ayahs (lead-ins), muqatta'at, a very long ayah
        for s, a in [(1, 1), (2, 1), (2, 282), (19, 1), (36, 1), (112, 1), (9, 1), (55, 13)]:
            picks.add((s, a))
        for pool, share in ((LONG, 0.3), (MEDIUM, 0.35), (SHORT, 0.35)):
            want = int(per_reciter * share)
            allv = [(s, a) for s in pool for a in range(1, n_ayahs(s) + 1)]
            for v in rng.sample(allv, want):
                picks.add(v)
        out += [(rec, s, a) for s, a in sorted(picks)]
    return out


def emis_path(rec: str, s: int, a: int) -> Path:
    return EMIS / rec / f"{s:03d}{a:03d}.npy"


def cmd_emit(args):
    items = sample(args.per_reciter)
    todo = [(r, s, a) for r, s, a in items if not emis_path(r, s, a).exists()]
    print(f"{len(items)} ayahs sampled, {len(todo)} to emit", flush=True)
    with ThreadPoolExecutor(4) as ex:
        paths = list(ex.map(lambda t: ta.audio_path(GT_RECITERS[t[0]][0], t[1], t[2]), todo))
    em = ta.Emitter()
    for (r, s, a), p in zip(todo, paths):
        if p is None:
            print("no audio", r, s, a)
            continue
        wav = ta.load_audio(p)
        lp = em.emissions(wav)
        out = emis_path(r, s, a)
        out.parent.mkdir(parents=True, exist_ok=True)
        np.save(out.with_suffix(".env.npy"), ta.envelope_db(wav).astype(np.float32))
        np.save(out, lp.astype(np.float16))
    print("done")


def pct(v, q):
    return float(np.percentile(v, q)) if len(v) else float("nan")


def summarize(name: str, d: np.ndarray, extra: str = "") -> str:
    a = np.abs(d)
    return (f"{name:34s} n={len(a):6d} median={np.median(a):6.0f} mean={a.mean():7.0f} p90={pct(a, 90):6.0f} "
            f"<=50:{(a <= 50).mean() * 100:5.1f}% <=100:{(a <= 100).mean() * 100:5.1f}% "
            f"<=150:{(a <= 150).mean() * 100:5.1f}% <=200:{(a <= 200).mean() * 100:5.1f}% "
            f"bias={np.median(d):+5.0f} {extra}")


def cmd_score(args):
    em_vocab = json.loads((ta.MODEL_DIR / "vocab.json").read_text(encoding="utf-8"))["phonemes"]
    blank = em_vocab["[PAD]"]
    p = ta.Params(offset_ms=args.offset, jump_penalty=args.jump, rendition=args.rendition,
                  silence_db=args.silence_db, min_silence_ms=args.min_silence,
                  idgham_frac=args.idgham_frac, ghunna_frac=args.ghunna_frac)
    items = sample(args.per_reciter)
    if args.only:
        items = [i for i in items if args.only in i[0]]
    gt_cache = {}
    res = []   # per ayah dict
    for rec, s, a in items:
        ep = emis_path(rec, s, a)
        if not ep.exists():
            continue
        if (rec, s) not in gt_cache:
            gt_cache[rec, s] = json.loads((SEG / rec / f"{s}.json").read_text())
        gt = gt_cache[rec, s].get(str(a))
        nw = len(ta.surah_words(s)[a - 1])
        if not gt or [r[0] for r in gt] != list(range(1, nw + 1)):
            continue   # ground truth incomplete for this ayah
        envp = ep.with_suffix(".env.npy")
        if not envp.exists():
            np.save(envp, ta.envelope_db(ta.load_audio(ta.audio_path(GT_RECITERS[rec][0], s, a, download=False))).astype(np.float32))
        env = np.load(envp)
        dur = len(env) * 10 + 20
        lp = np.load(ep).astype(np.float32)
        rec_d = dict(rec=rec, s=s, a=a, nw=nw, style=GT_RECITERS[rec][1], dur=dur)
        try:
            r = ta.align_ayah(lp, env, s, a, em_vocab, blank, p)
            pr = np.array(r.rows)
            rec_d.update(ok=True, conf=r.confidence, lead=r.lead_in, rep=r.repeats, minw=r.min_word_score)
        except Exception as e:  # counted as a failure
            pr = np.array(ta.baseline_rows(s, a, dur))
            rec_d.update(ok=False, conf=0.0, lead="", rep=0, err=str(e), minw=-30)
        g = np.array(gt)
        # rows that quran-align timed as one multi-word segment were shared out evenly on import
        # (scripts/import-quran-align.mjs): they touch with no 10 ms gap. Not real ground truth.
        interp = np.zeros(len(g), bool)
        z = (g[1:, 1] == g[:-1, 2]) & (rec not in QUD_RECITERS)   # QUD rows always touch
        interp[1:] |= z
        interp[:-1] |= z
        rec_d["interp"] = interp
        b = np.array(ta.baseline_rows(s, a, dur))
        rec_d.update(ds=pr[:, 1] - g[:, 1], de=pr[:, 2] - g[:, 2], bs=b[:, 1] - g[:, 1], be=b[:, 2] - g[:, 2])
        k = ~interp if (~interp).any() else np.ones(len(g), bool)
        rec_d["bad"] = (not rec_d["ok"]) or np.median(np.abs(rec_d["ds"][k])) > 500
        res.append(rec_d)

    def block(title, rows):
        if not rows:
            return
        ds = np.concatenate([r["ds"] for r in rows]); de = np.concatenate([r["de"] for r in rows])
        bs = np.concatenate([r["bs"] for r in rows]); be = np.concatenate([r["be"] for r in rows])
        fail = sum(r["bad"] for r in rows)
        print(f"== {title}: {len(rows)} ayahs, {len(ds)} words, failed ayahs {fail} ({fail / len(rows) * 100:.1f}%)")
        print(summarize("  aligner  word start", ds))
        keep = ~np.concatenate([r["interp"] for r in rows])
        print(summarize("  aligner  start, measured GT only", ds[keep], f"(dropped {(~keep).sum()} interpolated GT words)"))
        print(summarize("  aligner  end,   measured GT only", de[keep]))
        print(summarize("  aligner  word end", de))
        print(summarize("  baseline word start", bs))
        print(summarize("  baseline word end", be))

    block("ALL", res)
    block("quran-align reciters (8)", [r for r in res if r["rec"] not in QUD_RECITERS])
    block("QUD v3.2.0 reciters (3)", [r for r in res if r["rec"] in QUD_RECITERS])
    for style in ("murattal", "muallim", "mujawwad", "qud-murattal", "qud-mujawwad"):
        block(style, [r for r in res if r["style"] == style])
    for rec in GT_RECITERS:
        block(rec, [r for r in res if r["rec"] == rec])
    block("short ayahs (<=6 words)", [r for r in res if r["nw"] <= 6])
    block("long ayahs (>=30 words)", [r for r in res if r["nw"] >= 30])
    # confidence vs error
    print("== confidence buckets (ayah-level median |start error|)")
    confs = np.array([r["conf"] for r in res]); med = np.array([np.median(np.abs(r["ds"])) for r in res])
    w150 = np.array([(np.abs(r["ds"]) <= 150).mean() for r in res])
    for lo, hi in [(0, .3), (.3, .5), (.5, .6), (.6, .7), (.7, .8), (.8, .9), (.9, 1.01)]:
        m = (confs >= lo) & (confs < hi)
        if m.any():
            print(f"  conf [{lo:.1f},{hi:.1f}): {m.sum():5d} ayahs, median of medians {np.median(med[m]):6.0f} ms, "
                  f"mean within150 {w150[m].mean() * 100:5.1f}%, bad {sum(r['bad'] for r, k in zip(res, m) if k)}")
    if args.worst:
        print("== worst ayahs")
        for r in sorted(res, key=lambda r: -np.median(np.abs(r["ds"])))[:args.worst]:
            print(f"  {r['rec']} {r['s']}:{r['a']} words={r['nw']} dur={r['dur'] / 1000:.1f}s med={np.median(np.abs(r['ds'])):.0f} "
                  f"conf={r['conf']:.2f} lead={r['lead']} rep={r['rep']} ds={r['ds'][:12].tolist()}")
    if args.dump:
        Path(args.dump).write_text(json.dumps([{k: (v.tolist() if isinstance(v, np.ndarray) else bool(v) if isinstance(v, np.bool_) else v)
                                                 for k, v in r.items()} for r in res]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("emit"); e.add_argument("--per-reciter", type=int, default=150)
    s = sub.add_parser("score"); s.add_argument("--per-reciter", type=int, default=150)
    s.add_argument("--offset", type=float, default=ta.Params.offset_ms)
    s.add_argument("--jump", type=float, default=ta.Params.jump_penalty)
    s.add_argument("--rendition", default=ta.Params.rendition)
    s.add_argument("--silence-db", type=float, default=ta.Params.silence_db)
    s.add_argument("--min-silence", type=int, default=ta.Params.min_silence_ms)
    s.add_argument("--idgham-frac", type=float, default=ta.Params.idgham_frac)
    s.add_argument("--ghunna-frac", type=float, default=ta.Params.ghunna_frac)
    s.add_argument("--only", default="")
    s.add_argument("--worst", type=int, default=0)
    s.add_argument("--dump", default="")
    a = ap.parse_args()
    {"emit": cmd_emit, "score": cmd_score}[a.cmd](a)
