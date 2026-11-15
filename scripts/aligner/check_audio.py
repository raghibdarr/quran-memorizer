"""Which ayah does each per-ayah file of a reciter really contain?

    python check_audio.py decode <reciterDir>     # free (greedy) phoneme decode of all 6236 files
    python check_audio.py report <reciterDir>     # compare each decode with its own ayah and neighbours

The decode is cached in <TAKRAR_ALIGNER_HOME>/scan/<reciterDir>.json.
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor

import Levenshtein
import numpy as np

import takrar_align as ta

SCAN = ta.WORK / "scan"


def coll(p: str) -> str:
    return "".join(ta.collapse(p)[0])


def all_ayahs():
    return [(s, a) for s in range(1, 115) for a in range(1, len(ta.surah_words(s)) + 1)]


def decode(reciter: str):
    out_p = SCAN / f"{reciter}.json"
    done = json.loads(out_p.read_text(encoding="utf-8")) if out_p.exists() else {}
    todo = [(s, a) for s, a in all_ayahs() if f"{s}:{a}" not in done]
    print(len(todo), "files to decode", flush=True)
    em = ta.Emitter()
    inv = {v: k for k, v in em.vocab.items()}
    with ThreadPoolExecutor(4) as ex:
        for i in range(0, len(todo), 200):
            batch = todo[i:i + 200]
            paths = list(ex.map(lambda t: ta.audio_path(reciter, t[0], t[1]), batch))
            wavs = list(ex.map(lambda p: ta.load_audio(p) if p else None, paths))
            for (s, a), wav in zip(batch, wavs):
                if wav is None or len(wav) < 1600:
                    done[f"{s}:{a}"] = {"g": "", "ms": 0, "missing": True}
                    continue
                g = em.emissions(wav).argmax(1)
                done[f"{s}:{a}"] = {"g": coll("".join(inv[x] for x in g if x != em.blank)), "ms": int(len(wav) / 16)}
            out_p.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
            print(i + len(batch), flush=True)


def dist(g: str, t: str) -> float:
    return Levenshtein.distance(g, t) / max(len(g), len(t), 1)


def report(reciter: str, thr: float = 0.3):
    d = json.loads((SCAN / f"{reciter}.json").read_text(encoding="utf-8"))
    res = {}
    for s in range(1, 115):
        n = len(ta.surah_words(s))
        texts = {a: coll(ta.ayah_text(s, a).phonemes) for a in range(1, n + 1)}
        for a in range(1, n + 1):
            g = d[f"{s}:{a}"]["g"]
            own = dist(g, texts[a])
            best = (own, a, a)
            for i in range(max(1, a - 2), min(n, a + 2) + 1):
                t = ""
                for j in range(i, min(n, i + 2) + 1):
                    t += texts[j]
                    x = dist(g, t)
                    if x < best[0] - 1e-9:
                        best = (x, i, j)
            if own > thr or (best[1], best[2]) != (a, a) and best[0] < own - 0.1:
                res[f"{s}:{a}"] = {"own": round(own, 2), "best": [best[1], best[2]], "bestDist": round(best[0], 2),
                                   "lenHeard": len(g), "lenText": len(texts[a]), "ms": d[f"{s}:{a}"]["ms"]}
    return res


if __name__ == "__main__":
    if sys.argv[1] == "decode":
        decode(sys.argv[2])
    else:
        r = report(sys.argv[2])
        for k, v in r.items():
            print(k, v)
        print(len(r), "files flagged")
