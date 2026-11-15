"""Takrar word-timing generator ("route B"): CTC forced alignment of Qur'an recitation.

Model      : obadx/muaalem-model-v3_2 (MIT) - w2v-bert-2.0 encoder + phoneme CTC head.
             Only the encoder and the `phonemes` head are loaded, through plain
             transformers (Apache-2.0) classes; the quran-muaalem package is NOT used.
Phonetizer : quran-transcript (MIT) - Uthmani text -> phoneme string with char mappings.

Output convention (same as public/segments): {"<ayah>": [[wordNumber, startMs, endMs], ...]}
relative to the start of EveryAyah's per-ayah mp3; wordNumber is 1-based over the
ayah's words in src/data/surah-<n>.json (charType === 'word').
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch

REPO = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get("TAKRAR_ALIGNER_HOME", r"C:\Users\raghi\Downloads\takrar-sources\aligner"))
MODEL_DIR = WORK / "model"
AUDIO_DIR = WORK / "audio"
# Per-ayah mp3s that scripts/import-tarteel-matched.mjs already cached (read-only reuse)
EXTRA_AUDIO_DIRS = [Path(os.environ.get("TEMP", "")) / "takrar-tarteel-match"]
MODEL_ID = "obadx/muaalem-model-v3_2"
SR = 16000

PAUSE_MARKS = re.compile("[\u06D6-\u06DC\u06DE]")
BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
ISTIAATHA = "أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَـٰنِ ٱلرَّجِيمِ"


# ----------------------------------------------------------------------------- text

@lru_cache(maxsize=None)
def surah_words(surah: int) -> list[list[str]]:
    """Takrar's own word list per ayah (index 0 = ayah 1)."""
    d = json.loads((REPO / "src" / "data" / f"surah-{surah}.json").read_text(encoding="utf-8"))
    return [[w["textUthmani"] for w in a["words"] if w["charType"] == "word"] for a in d["ayahs"]]


@lru_cache(maxsize=None)
def _moshaf():
    from quran_transcript import MoshafAttributes
    return MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4,
                            madd_mottasel_waqf=4, madd_aared_len=4)


SHADDA = "ّ"
MARKS = re.compile("[ً-ِْ-ٰٟۖ-ۭـ]")


def phonetize_words(uthmani: str, surah: int = 0):
    """Phonemes of a text (spaces removed) and, per space-separated word, the index of its
    first phoneme and whether the word opens with a letter the previous word was merged into
    (idgham: its first letter carries a shadda, or the phonetizer lengthened it).
    A word whose letters were all assimilated starts where the next does."""
    from quran_transcript import quran_phonetizer
    out = quran_phonetizer(uthmani, _moshaf(), remove_spaces=True, sura_idx=surah)
    starts: list = []
    merged: list = []
    cur = None
    new_word = True
    first_len = 0
    for ch, mp in zip(uthmani, out.mappings):
        if ch == " ":
            if not new_word:
                starts.append(cur)
                merged.append(first_len > 1)
            cur, new_word = None, True
            continue
        if new_word:
            first_len = 0 if mp.deleted else mp.pos[1] - mp.pos[0]
        new_word = False
        if cur is None and not mp.deleted and mp.pos[1] > mp.pos[0]:
            cur = mp.pos[0]
    if not new_word:
        starts.append(cur)
        merged.append(first_len > 1)
    for i, w in enumerate(uthmani.split()):
        if len(MARKS.sub("", w)) > 1 and MARKS.sub("", w)[1] == SHADDA:
            merged[i] = True
    if merged:
        merged[0] = False
    nxt = len(out.phonemes)
    for i in range(len(starts) - 1, -1, -1):
        if starts[i] is None:
            starts[i] = nxt
        nxt = starts[i]
    for i in range(1, len(starts)):  # keep non-decreasing
        if starts[i] < starts[i - 1]:
            starts[i] = starts[i - 1]
    return out.phonemes, starts, merged


@dataclass
class AyahText:
    phonemes: str                 # phoneme string, no spaces
    word_starts: list             # first phoneme index of each of OUR words
    n_words: int
    merged: list = None           # word opens with an idgham from the previous word


@lru_cache(maxsize=None)
def ayah_text(surah: int, ayah: int) -> AyahText:
    """Phonemes of an ayah with word starts mapped onto Takrar's word numbering.
    The phonetizer works on the Uthmani text bundled with quran-transcript (Tanzil); our
    list keeps a few two-part words whole (e.g. 2:181, 37:130), which are merged here."""
    from quran_transcript import Aya
    t = Aya(surah, ayah).get()
    phon, starts, merged = phonetize_words(t.uthmani, surah)
    ours = surah_words(surah)[ayah - 1]
    parts = [max(1, len(PAUSE_MARKS.sub("", w).split())) for w in ours]
    if sum(parts) != len(starts):
        if len(ours) == len(starts):
            parts = [1] * len(ours)
        else:
            raise ValueError(f"{surah}:{ayah}: {len(ours)} of our words vs {len(starts)} phonetizer words")
    ws, mg, k = [], [], 0
    for p in parts:
        ws.append(starts[k])
        mg.append(merged[k])
        k += p
    return AyahText(phon, ws, len(ours), mg)


@lru_cache(maxsize=None)
def lead_in_phonemes(kind: str) -> str:
    return phonetize_words(BASMALA if kind == "basmala" else ISTIAATHA)[0]


# ----------------------------------------------------------------------------- audio

def audio_path(reciter: str, surah: int, ayah: int, download: bool = True):
    name = f"{surah:03d}{ayah:03d}.mp3"
    for d in EXTRA_AUDIO_DIRS:
        p = d / reciter / name
        if p.exists() and p.stat().st_size > 0:
            return p
    p = AUDIO_DIR / reciter / name
    if p.exists() and p.stat().st_size > 0:
        return p
    if not download:
        return None
    p.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://everyayah.com/data/{reciter}/{name}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (word-timing research)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            tmp = p.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(p)
            return p
        except Exception:
            if attempt == 2:
                return None
    return None


def load_audio(path) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


# ----------------------------------------------------------------------------- model

class Emitter:
    """w2v-bert-2.0 encoder + the model's `phonemes` CTC head -> frame log-posteriors."""

    frame_ms = 40.0  # 10 ms fbank frames, stacked x2, adapter stride 2

    def __init__(self, device=None, chunk_s: float = 40.0, overlap_s: float = 4.0):
        from safetensors.torch import load_file
        from transformers import SeamlessM4TFeatureExtractor, Wav2Vec2BertConfig, Wav2Vec2BertModel
        if not (MODEL_DIR / "model.safetensors").exists():
            from huggingface_hub import snapshot_download
            snapshot_download(MODEL_ID, local_dir=str(MODEL_DIR))
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        cfg = json.loads((MODEL_DIR / "config.json").read_text(encoding="utf-8"))
        vocab = json.loads((MODEL_DIR / "vocab.json").read_text(encoding="utf-8"))["phonemes"]
        self.vocab = vocab
        self.blank = vocab["[PAD]"]
        drop = ("model_type", "architectures", "level_to_vocab_size", "level_to_loss_weight",
                "transformers_version", "torch_dtype")
        config = Wav2Vec2BertConfig(**{k: v for k, v in cfg.items() if k not in drop})
        self.encoder = Wav2Vec2BertModel(config)
        sd = load_file(str(MODEL_DIR / "model.safetensors"))
        enc = {k[len("wav2vec2_bert."):]: v for k, v in sd.items() if k.startswith("wav2vec2_bert.")}
        missing, unexpected = self.encoder.load_state_dict(enc, strict=False)
        missing = [m for m in missing if "masked_spec_embed" not in m]
        if missing or unexpected:
            raise RuntimeError(f"weight mismatch: missing={missing[:5]} unexpected={unexpected[:5]}")
        self.head = torch.nn.Linear(config.output_hidden_size, len(vocab))
        self.head.load_state_dict({"weight": sd["level_to_lm_head.phonemes.weight"],
                                   "bias": sd["level_to_lm_head.phonemes.bias"]})
        self.encoder.to(self.device).eval()
        self.head.to(self.device).eval()
        self.fe = SeamlessM4TFeatureExtractor.from_pretrained(str(MODEL_DIR))
        self.chunk = int(chunk_s * SR)
        self.overlap = int(overlap_s * SR)

    @torch.inference_mode()
    def _run(self, wav: np.ndarray) -> np.ndarray:
        feats = self.fe(wav, sampling_rate=SR, return_tensors="pt")
        x = feats["input_features"].to(self.device)
        with torch.autocast("cuda", dtype=torch.float16, enabled=self.device == "cuda"):
            h = self.encoder(input_features=x).last_hidden_state
            logits = self.head(h)
        return torch.log_softmax(logits.float(), dim=-1)[0].cpu().numpy()

    def emissions(self, wav: np.ndarray) -> np.ndarray:
        """(T, V) log-probs, one row per 40 ms. Long audio is run in overlapping windows;
        each window contributes its centre."""
        if len(wav) <= self.chunk + 2 * self.overlap:
            return self._run(wav)
        spf = int(SR * self.frame_ms / 1000)
        step = (self.chunk // spf) * spf
        ov = (self.overlap // spf) * spf
        total = len(wav) // spf
        out = np.full((total, len(self.vocab)), -30.0, dtype=np.float32)
        out[:, self.blank] = 0.0
        pos = 0
        while pos < len(wav):
            a = max(0, pos - ov)
            b = min(len(wav), pos + step + ov)
            em = self._run(wav[a:b])
            f0 = (pos - a) // spf
            n = min(step // spf, em.shape[0] - f0, total - pos // spf)
            if n > 0:
                out[pos // spf: pos // spf + n] = em[f0:f0 + n]
            pos += step
        return out


# ----------------------------------------------------------------------------- alignment

NEG = -1e30


@dataclass
class Alignment:
    tok_first: np.ndarray        # per token: first frame of its FIRST rendition (-1 if never visited)
    tok_last: np.ndarray         # per token: last own frame within that first rendition
    tok_first_final: np.ndarray  # same for the LAST rendition (differs only if a phrase was repeated)
    tok_last_final: np.ndarray
    tok_score: np.ndarray        # mean log-prob over the token's own frames
    score: float                 # mean per-frame log-prob of the best path
    jumps: list = field(default_factory=list)  # (frame, from_token, to_token)
    path: np.ndarray = None


def ctc_align(logp: np.ndarray, tokens: list, blank: int,
              start_tokens=None, word_first_tok=None, jump_penalty=None, repeatable=None) -> Alignment:
    """Viterbi over the CTC lattice blank,t0,blank,t1,...,blank with three extensions:
      * start_tokens: token indices the path may start at (optional lead-ins);
      * repeatable[i]: token i may be re-entered from the blank after it (a collapsed run
        of identical phonemes, e.g. a madd that the model emits as several spikes);
      * jump_penalty: from the end of any word the path may jump back to the start of the
        same or an earlier word (a repeated phrase, common in mujawwad recitation).
    """
    T = logp.shape[0]
    L = len(tokens)
    S = 2 * L + 1
    tok = np.asarray(tokens)
    st_tok = np.full(S, blank)
    st_tok[1::2] = tok
    em = logp[:, st_tok].astype(np.float64)               # (T, S)
    can_skip = np.zeros(S, bool)                          # s-2 -> s between different tokens
    can_skip[3::2] = tok[1:] != tok[:-1]
    rep = np.zeros(S, bool)
    if repeatable is not None:
        rep[1::2] = repeatable
    score = np.full(S, NEG)
    for t0 in (start_tokens or [0]):
        score[2 * t0] = em[0, 2 * t0]
        score[2 * t0 + 1] = em[0, 2 * t0 + 1]
    bp = np.zeros((T, S), dtype=np.int32)
    idx = np.arange(S)
    bp[0] = idx
    use_jump = jump_penalty is not None and word_first_tok is not None and len(word_first_tok) > 0
    if use_jump:
        wf = np.asarray(word_first_tok)
        W = len(wf)
        w_start_state = 2 * wf + 1
        w_end_tok = np.concatenate([wf[1:] - 1, [L - 1]])
        valid_w = w_end_tok >= wf
        w_end_state = 2 * np.maximum(w_end_tok, 0) + 1
        widx = np.arange(W)
    for t in range(1, T):
        best = score.copy()
        arg = idx.copy()
        c = np.empty(S); c[0] = NEG; c[1:] = score[:-1]
        m = c > best; best[m] = c[m]; arg[m] = idx[m] - 1
        c = np.full(S, NEG); c[2:] = score[:-2]; c[~can_skip] = NEG
        m = c > best; best[m] = c[m]; arg[m] = idx[m] - 2
        c = np.full(S, NEG); c[:-1] = score[1:]; c[~rep] = NEG
        m = c > best; best[m] = c[m]; arg[m] = idx[m] + 1
        if use_jump:
            a_, b_ = score[w_end_state], score[w_end_state + 1]
            ends = np.where(valid_w, np.maximum(a_, b_), NEG)
            ends_arg = np.where(a_ >= b_, w_end_state, w_end_state + 1)
            # suffix arg-max over words e >= w
            rev = ends[::-1]
            rmax = np.maximum.accumulate(rev)
            ridx = np.maximum.accumulate(np.where(rev >= rmax, widx, 0))
            sa = (W - 1 - ridx)[::-1]
            cj = rmax[::-1] + jump_penalty
            m2 = cj > best[w_start_state]
            if m2.any():
                tg = w_start_state[m2]
                best[tg] = cj[m2]
                arg[tg] = ends_arg[sa[m2]]
        score = best + em[t]
        bp[t] = arg
    s = S - 1 if score[S - 1] >= score[S - 2] else S - 2
    total = score[s]
    path = np.empty(T, dtype=np.int32)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s = bp[t, s]
    first = np.full(L, -1); last = np.full(L, -1)
    first_f = np.full(L, -1); last_f = np.full(L, -1)
    sc = np.zeros(L); cnt = np.zeros(L)
    frozen = np.zeros(L, bool)      # first rendition of the token is over (path rewound past it)
    jumps = []
    for t in range(T):
        s = int(path[t])
        if t > 0 and s < path[t - 1] - 1:      # a rewind (not the s+1 -> s madd re-entry)
            i0 = s // 2
            jumps.append((t, int(path[t - 1]) // 2, i0))
            frozen[i0:] |= first[i0:] >= 0
            first_f[i0:] = -1
            last_f[i0:] = -1
        if s % 2 == 1:
            i = s // 2
            if first[i] < 0:
                first[i] = t
            if not frozen[i]:
                last[i] = t
            if first_f[i] < 0:
                first_f[i] = t
            last_f[i] = t
            sc[i] += em[t, s]
            cnt[i] += 1
    return Alignment(first, last, first_f, last_f, np.where(cnt > 0, sc / np.maximum(cnt, 1), -30.0),
                     float(total / T), jumps, path)


def collapse(phonemes: str):
    """Collapse runs of identical phonemes (madd / shadda / ghunna lengths) into one token.
    Returns tokens, original index -> token index, and each token's run length."""
    toks, idx, run = [], [], []
    for ch in phonemes:
        if toks and toks[-1] == ch:
            run[-1] += 1
        else:
            toks.append(ch)
            run.append(1)
        idx.append(len(toks) - 1)
    return toks, idx, run


# ----------------------------------------------------------------------------- ayah level

def envelope_db(wav: np.ndarray, hop_ms: int = 10, win_ms: int = 30) -> np.ndarray:
    """RMS level in dB relative to the recording's loud level (90th percentile), per 10 ms."""
    hop = SR * hop_ms // 1000
    win = SR * win_ms // 1000
    n = max(1, (len(wav) - win) // hop + 1)
    sq = np.concatenate([[0.0], np.cumsum(wav.astype(np.float64) ** 2)])
    i = np.arange(n) * hop
    rms = np.sqrt((sq[np.minimum(i + win, len(wav))] - sq[i]) / win + 1e-12)
    ref = np.percentile(rms, 90) + 1e-9
    return 20 * np.log10(rms / ref + 1e-9)


@dataclass
class Params:
    offset_ms: float = -30.0         # added to every frame time (calibrated on ground truth)
    jump_penalty: float = -8.0       # log-prob cost of rewinding to an earlier word; None = off
    rendition: str = "first"         # which rendition of a repeated phrase times the word
    silence_db: float = -28.0        # below this (re loud level) counts as silence
    min_silence_ms: int = 250        # shortest pause that ends a word early
    ghunna_frac: float = 1.0         # idgham with ghunna across words: where in the held sound the
                                     # second word starts (0 = its onset, 1 = its release)
    idgham_frac: float = 0.0         # same for idgham without ghunna (a doubled consonant)
    lead_ins: bool = True            # allow isti'adha / basmala before ayah 1


@dataclass
class AyahResult:
    rows: list                       # [[word, startMs, endMs], ...]
    confidence: float                # 0..1, see README
    score: float                     # mean per-frame log-prob of the path
    min_word_score: float            # worst word's mean token log-prob
    lead_in: str                     # '', 'basmala', 'istiaatha', 'istiaatha+basmala'
    repeats: int                     # rewinds taken (repeated phrases)
    duration_ms: int


def _vocab_ids(em_vocab: dict, toks: list) -> list:
    return [em_vocab[t] for t in toks]


def align_ayah(logp: np.ndarray, env: np.ndarray, surah: int, ayah: int, vocab: dict, blank: int,
               p: Params = Params(), frame_ms: float = 40.0, txt: AyahText = None,
               lead_candidates=None) -> AyahResult:
    """logp: (T, V) frame log-posteriors; env: envelope_db(wav) (one value per 10 ms).
    txt overrides the ayah's own text (several ayahs in one file, or part of an ayah);
    lead_candidates overrides which lead-ins are tried, e.g. ["basmala", "istiaatha+basmala"]."""
    txt = txt or ayah_text(surah, ayah)
    dur_ms = int(len(env) * 10 + 20)
    candidates = [("", "")]
    if p.lead_ins and ayah == 1:
        ist, bas = lead_in_phonemes("istiaatha"), lead_in_phonemes("basmala")
        if surah in (1, 9):
            candidates = [("", ""), ("istiaatha", ist)]
        else:
            candidates = [("", ""), ("basmala", bas), ("istiaatha", ist), ("istiaatha+basmala", ist + bas)]
    if lead_candidates is not None:
        ist, bas = lead_in_phonemes("istiaatha"), lead_in_phonemes("basmala")
        table = {"": "", "basmala": bas, "istiaatha": ist, "istiaatha+basmala": ist + bas}
        candidates = [(k, table[k]) for k in lead_candidates]
    best = None
    for name, pre in candidates:
        toks, o2t, run = collapse(pre + txt.phonemes)
        # a run that straddles the lead-in/ayah border would glue them: break it
        n_pre = len(pre)
        if n_pre and o2t[n_pre] == o2t[n_pre - 1]:
            toks, o2t, run = collapse(pre)
            t2, o2, r2 = collapse(txt.phonemes)
            o2t = o2t + [x + len(toks) for x in o2]
            toks, run = toks + t2, run + r2
        ws_tok = [o2t[n_pre + w] if n_pre + w < len(o2t) else len(toks) - 1 for w in txt.word_starts]
        # the held sound of an idgham may be written into the previous word's phonemes
        # (tanween + waw/ya): the word then opens inside a run that began before it
        shared = [w > 0 and n_pre + w < len(o2t) and o2t[n_pre + w] == o2t[n_pre + w - 1]
                  for w in txt.word_starts]
        if len(toks) > logp.shape[0]:
            continue
        # words for the rewind arcs: lead-in is one pseudo word, then each distinct word start
        wf = sorted(set(([0] if n_pre else []) + ws_tok))
        al = ctc_align(logp, _vocab_ids(vocab, toks), blank, word_first_tok=wf,
                       jump_penalty=p.jump_penalty, repeatable=np.asarray(run) > 1)
        if best is None or al.score > best[0].score:
            best = (al, name, toks, ws_tok, run, shared)
    if best is None:
        raise RuntimeError("audio shorter than the text")
    al, name, toks, ws_tok, run, shared = best
    first = al.tok_first if p.rendition == "first" else al.tok_first_final
    last = al.tok_last if p.rendition == "first" else al.tok_last_final
    L = len(toks)
    W = txt.n_words
    starts, ends_tok = [], []
    for w in range(W):
        a = ws_tok[w]
        b = (ws_tok[w + 1] - 1) if w + 1 < W else L - 1
        b = max(a, b)
        f = first[a]
        # a word opening on a long run (ghunna of an idgham that began in the previous word's
        # tanween/nun) starts where the run is released, as the ground-truth sources mark it
        if w > 0 and (txt.merged[w] or shared[w]) and run[a] >= 2 and last[a] >= f:
            f = f + (last[a] - f) * (p.ghunna_frac if run[a] >= 3 else p.idgham_frac)
        starts.append(f * frame_ms + p.offset_ms)
        ends_tok.append((last[b] + 1) * frame_ms + p.offset_ms)
    # monotone clean-up (identical starts happen when a word was fully assimilated)
    for w in range(1, W):
        if starts[w] < starts[w - 1]:
            starts[w] = starts[w - 1]
    rows = []
    for w in range(W):
        s = max(0.0, starts[w])
        nxt = starts[w + 1] if w + 1 < W else float(dur_ms)
        # a word runs to the next word unless a real pause intervenes
        lo = int(min(max(ends_tok[w], s), nxt) // 10)
        hi = int(nxt // 10)
        e = nxt - 10 if w + 1 < W else nxt
        seg = env[lo:hi] < p.silence_db if hi > lo else np.zeros(0, bool)
        if seg.size:
            need = p.min_silence_ms // 10
            runlen = 0
            for k, q in enumerate(seg):
                runlen = runlen + 1 if q else 0
                if runlen >= need:
                    e = (lo + k - runlen + 1) * 10
                    break
            else:
                if w + 1 == W and runlen > 0:      # trailing silence at the end of the file
                    e = (lo + len(seg) - runlen) * 10
        e = max(e, s + 10)
        rows.append([w + 1, int(round(s)), int(round(min(e, dur_ms) if dur_ms > s + 10 else e))])
    n_pre_tok = ws_tok[0]
    ts = al.tok_score[n_pre_tok:]
    word_sc = []
    for w in range(W):
        a = ws_tok[w]
        b = ws_tok[w + 1] if w + 1 < W else L
        if b > a:
            word_sc.append(float(np.mean(al.tok_score[a:b])))
    mean_tok = float(np.mean(ts)) if len(ts) else -30.0
    min_word = min(word_sc) if word_sc else -30.0
    # confidence: half "share of words the model clearly heard" (mean posterior of the word's
    # phonemes >= 0.5), half the mean phoneme posterior. Wrong audio scores ~0, see README.
    heard = float(np.mean(np.asarray(word_sc) >= np.log(0.5))) if word_sc else 0.0
    conf = 0.5 * heard + 0.5 * float(np.exp(mean_tok)) if word_sc else 0.0
    return AyahResult(rows, round(conf, 4), al.score, min_word, name, len(al.jumps), dur_ms)


def baseline_rows(surah: int, ayah: int, dur_ms: int) -> list:
    """Trivial baseline: share the file's duration out by letter count."""
    words = surah_words(surah)[ayah - 1]
    n = [max(1, len(re.sub("[^ء-يٱ]", "", w))) for w in words]
    tot = sum(n)
    rows, acc = [], 0
    for i, k in enumerate(n):
        s = dur_ms * acc / tot
        acc += k
        rows.append([i + 1, int(s), int(dur_ms * acc / tot)])
    return rows


def sanity_flags(r: AyahResult) -> list:
    """Cheap structural warnings for review; empty for an unremarkable ayah."""
    flags = []
    if r.confidence < 0.6:
        flags.append("low-confidence")
    if r.min_word_score < np.log(0.2):
        flags.append("weak-word")
    if r.repeats:
        flags.append(f"repeated-phrase-x{r.repeats}")
    if r.lead_in:
        flags.append("lead-in:" + r.lead_in)
    if any(e - s < 60 for _, s, e in r.rows):
        flags.append("very-short-word")
    return flags


def concat_text(ayahs: list) -> AyahText:
    """Text of several consecutive ayahs recited in one file (each ends with a stop)."""
    phon, ws, mg = "", [], []
    for s, a in ayahs:
        t = ayah_text(s, a)
        ws += [len(phon) + w for w in t.word_starts]
        mg += [False] + list(t.merged[1:])
        phon += t.phonemes
    return AyahText(phon, ws, len(ws), mg)


def slice_text(t: AyahText, w0: int, w1: int) -> AyahText:
    """Words w0..w1-1 (0-based) of a text, for a file that holds part of an ayah."""
    a = t.word_starts[w0]
    b = t.word_starts[w1] if w1 < t.n_words else len(t.phonemes)
    return AyahText(t.phonemes[a:b], [w - a for w in t.word_starts[w0:w1]], w1 - w0,
                    [False] + list(t.merged[w0 + 1:w1]))
