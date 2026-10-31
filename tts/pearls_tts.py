"""Pearls · AI voice for the AI-translated chapters.

Reads text/BB-CC.json (made by export_texts.py from www/books), writes one MP3 per section, ai-BB-CC-SS.mp3, plus
manifest.json (seconds per file). Re-running skips files that already exist, so a free server that disconnects can
pick up where it stopped.

  python pearls_tts.py --engine kokoro     --out out            # CPU is fine (about 2x real time)
  python pearls_tts.py --engine chatterbox --out out            # wants a GPU (Colab / Kaggle T4)
  python pearls_tts.py --engine chatterbox --only 10-03 --sections 1 --out samples   # one section, to listen first

Engines: kokoro (Apache 2.0, kokoro-onnx; model files from GitHub) and chatterbox (MIT, Resemble AI; weights from
Hugging Face; its audio carries Resemble's inaudible watermark). Voices: --voice am_michael (Kokoro) or
--voice ref.wav (Chatterbox: a clip of a voice you have the right to use; default is its built-in voice).
"""
import argparse, glob, json, os, re, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- text for the ear ----------
ABBR = {   # citation abbreviations, spoken in full when citations are kept
    "SA": "Shulkhan Arukh", "OḤ": "Orakh Khayim", "YD": "Yoreh De'ah", "EH": "Even Ha-ezer", "ḤM": "Khoshen Mishpat",
    "MB": "Mishna Berura", "BHL": "Bi'ur Halakha", "Rema": "Rema",
}
LETTERS = str.maketrans({"ḥ": "kh", "Ḥ": "Kh", "ĥ": "kh", "Ĥ": "Kh", "ḳ": "k", "Ḳ": "K", "ʿ": "", "ʾ": "", "­": ""})

def load_lexicon(path):
    lex = []
    if os.path.exists(path):
        for line in open(path, encoding="utf8"):
            line = line.rstrip("\n")
            if not line or line.startswith("#") or "\t" not in line: continue
            a, b = line.split("\t", 1); lex.append((re.compile(r"(?<![\w-])" + re.escape(a) + r"(?![\w-])"), b))
    return lex

def speakable(html, lex, keep_refs=False):
    t = re.sub(r"<sup[^>]*>.*?</sup>", "", html, flags=re.S)          # footnote markers
    t = re.sub(r"</p>\s*<p[^>]*>", "\n\n", t); t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"').replace("&#8217;", "’")
    if not keep_refs:   # source citations in brackets are for the eye: "(SA OḤ 167:1)", "(Devarim 8:10)", "(above 4:4)"
        for _ in range(2):
            t = re.sub(r"\s*\((?=[^()]*\d)[^()]*\)", "", t); t = re.sub(r"\s*\[(?=[^\[\]]*\d)[^\[\]]*\]", "", t)
    else:
        for a, b in ABBR.items(): t = re.sub(r"\b" + re.escape(a) + r"\b", b, t)
        t = re.sub(r"(\d+):(\d+)", r"\1, \2", t)
    t = re.sub(r"[\u0590-\u05FF\uFB1D-\uFB4F][\u0590-\u05FF\uFB1D-\uFB4F\s'\"׳״־-]*", " ", t)   # Hebrew script: the voice can't read it
    t = re.sub(r"\(\s*[,;:]?\s*\)|\[\s*\]|[\"“”']\s*[\"“”']", "", t)
    for rx, b in lex: t = rx.sub(b, t)                                 # whole-term respellings first
    t = t.translate(LETTERS)
    t = re.sub(r"(?<=[A-Za-z])['’](?!(?:ll|re|ve)\b)(?=[a-z]{2,})", "-", t)   # Sha'arei -> Sha-arei; keeps don't, God's, you'll
    t = re.sub(r"[ \t]+", " ", t)
    return [p.strip() for p in t.split("\n\n") if p.strip()]

def chunks(par, limit):
    sents = re.split(r"(?<=[.!?…:;])\s+(?=[\"“‘'A-Z0-9])", par)
    out, cur = [], ""
    for s in sents:
        while len(s) > limit:   # a very long sentence: break at a comma
            cut = s.rfind(", ", 0, limit); cut = cut + 1 if cut > limit // 3 else limit
            if cur: out.append(cur); cur = ""
            out.append(s[:cut].strip()); s = s[cut:].strip()
        if len(cur) + len(s) + 1 > limit and cur: out.append(cur); cur = s
        else: cur = (cur + " " + s).strip()
    if cur: out.append(cur)
    return out

# ---------- engines ----------
class KokoroEngine:
    limit = 400
    def __init__(self, voice, speed):
        from kokoro_onnx import Kokoro
        mdir = os.environ.get("KOKORO_DIR", HERE)
        for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
            p = os.path.join(mdir, f)
            if not os.path.exists(p):
                subprocess.run(["wget", "-q", "-O", p, f"https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/{f}"], check=True)
        self.k = Kokoro(os.path.join(mdir, "kokoro-v1.0.onnx"), os.path.join(mdir, "voices-v1.0.bin"))
        self.voice = voice or "am_michael"; self.speed = speed; self.lang = "en-gb" if self.voice[0] == "b" else "en-us"
        self.sr = 24000
    def say(self, text):
        a, sr = self.k.create(text, voice=self.voice, speed=self.speed, lang=self.lang); self.sr = sr
        return np.asarray(a, dtype=np.float32)

class ChatterboxEngine:
    limit = 260   # Chatterbox is steadier on short inputs
    def __init__(self, voice, speed, turbo=False, exaggeration=0.4, cfg=0.5):
        import torch
        dev = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        if dev == "cpu": print("note: no GPU found; Chatterbox on CPU is very slow", file=sys.stderr)
        if turbo:
            from chatterbox.tts_turbo import ChatterboxTurboTTS as M
        else:
            from chatterbox.tts import ChatterboxTTS as M
        self.m = M.from_pretrained(device=dev); self.sr = self.m.sr; self.torch = torch
        self.ref = voice if voice and os.path.exists(voice) else None
        self.kw = {} if turbo else {"exaggeration": exaggeration, "cfg_weight": cfg}
        if speed != 1.0: print("note: --speed is applied afterwards with ffmpeg for Chatterbox", file=sys.stderr)
    def say(self, text):
        self.torch.manual_seed(1234)   # the same text always gives the same reading
        wav = self.m.generate(text, audio_prompt_path=self.ref, **self.kw)
        return wav.squeeze(0).detach().cpu().numpy().astype(np.float32)

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["kokoro", "chatterbox", "chatterbox-turbo"], default="kokoro")
    ap.add_argument("--voice", default=None); ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--text", default=os.path.join(HERE, "text")); ap.add_argument("--out", default="out")
    ap.add_argument("--only", nargs="*", help="chapters, e.g. 10-03 17-01, or a book: 10")
    ap.add_argument("--sections", nargs="*", type=int); ap.add_argument("--keep-refs", action="store_true")
    ap.add_argument("--exaggeration", type=float, default=0.4); ap.add_argument("--cfg", type=float, default=0.5)
    ap.add_argument("--dry", action="store_true", help="print the text as it will be spoken, make no audio")
    a = ap.parse_args()
    lex = load_lexicon(os.path.join(HERE, "lexicon.tsv"))
    files = sorted(glob.glob(os.path.join(a.text, "*.json")))
    if a.only: files = [f for f in files if any(os.path.basename(f).startswith(o) for o in a.only)]
    os.makedirs(a.out, exist_ok=True)
    man_p = os.path.join(a.out, "manifest.json"); man = json.load(open(man_p)) if os.path.exists(man_p) else {}
    eng = None
    for f in files:
        ch = json.load(open(f, encoding="utf8"))
        for s in ch["sections"]:
            if a.sections and s["n"] not in a.sections: continue
            name = f"ai-{ch['id']}-{s['n']:02d}.mp3"; dst = os.path.join(a.out, name)
            pars = speakable(s["html"], lex, a.keep_refs); title = s["title"].translate(LETTERS)
            if a.dry: print(f"## {name}\n{title}.\n\n" + "\n\n".join(pars) + "\n"); continue
            if os.path.exists(dst): continue
            if eng is None:
                eng = KokoroEngine(a.voice, a.speed) if a.engine == "kokoro" else ChatterboxEngine(a.voice, a.speed, a.engine == "chatterbox-turbo", a.exaggeration, a.cfg)
            gap = lambda sec: np.zeros(int(eng.sr * sec), np.float32)
            parts = [eng.say(title + "."), gap(0.8)]
            for par in pars:
                for c in chunks(par, eng.limit): parts += [eng.say(c), gap(0.25)]
                parts.append(gap(0.35))
            audio = np.concatenate(parts); audio = audio / max(1e-6, float(np.abs(audio).max())) * 0.89
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp: wav = tmp.name
            import soundfile as sf; sf.write(wav, audio, eng.sr)
            af = ["-af", f"atempo={a.speed}"] if a.engine != "kokoro" and a.speed != 1.0 else []
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, *af, "-ac", "1", "-b:a", "64k", dst + ".part.mp3"], check=True)
            os.replace(dst + ".part.mp3", dst); os.remove(wav)
            man[name] = round(len(audio) / eng.sr / (a.speed if af else 1), 1); json.dump(man, open(man_p, "w"), indent=0)
            print(f"{name}  {man[name]:.0f}s", flush=True)
    print("done:", len(man), "files in", a.out)

if __name__ == "__main__":
    main()
