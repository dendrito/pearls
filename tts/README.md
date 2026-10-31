# Pearls · AI voice

Audio for the AI-translated chapters (Berakhot, Kashrut, Family Purity, Giyur, Emuna and the rest as they are
translated): 1,218 sections, about 625,000 words, about 70 hours. One MP3 per section, `ai-BB-CC-SS.mp3`, plus
`manifest.json` with the length of each.

## Files

- `pearls_tts.py`: the generator. Engines: `kokoro` (CPU is fine), `chatterbox` and `chatterbox-turbo` (GPU).
  It resumes: files already made are skipped.
- `text/`: the sections as JSON. Remake them after new translations with `python3 tts/export_texts.py`.
- `lexicon.tsv`: how to say Hebrew terms (term, tab, respelling). Edit freely.
- `Pearls_TTS.ipynb`: the same, as a notebook for free GPU servers.

## What the voice reads

- The section title, then the text.
- Source citations in brackets, such as "(SA OḤ 167:1)" or "(Devarim 8:10)", are left out, because they're for the
  eye. Add `--keep-refs` to read them, with the abbreviations spoken in full.
- Hebrew script is left out. ḥ is read as "kh", and the terms in `lexicon.tsv` are respelled.
- `--dry` prints exactly what will be spoken, without making any audio.

## Free servers

| Where | GPU | Limits | Use for |
|---|---|---|---|
| Google Colab (free) | T4 | Sessions last a few hours and disconnect when idle; daily GPU quota varies | Chatterbox: open `Pearls_TTS.ipynb`; it saves to Drive and resumes |
| Kaggle Notebooks | T4 ×2 / P100 | 30 GPU hours a week, 12-hour sessions; turn on Internet in settings | Chatterbox: upload the kit as a Dataset, copy it to `/kaggle/working`, run the same commands with `--out /kaggle/working/audio`, then "Save Version" to keep the output |
| Any CPU: Colab without a GPU, your own computer | none | none | Kokoro, about 2× real time |

Chatterbox on a T4 runs at roughly real time, so the whole set takes several Colab or Kaggle sessions. Try one book
first (`--only 10`).

## Commands

    pip install chatterbox-tts kokoro-onnx soundfile          # plus ffmpeg
    python pearls_tts.py --engine chatterbox --only 17-11 --sections 1 --out samples
    python pearls_tts.py --engine chatterbox --out audio            # everything
    python pearls_tts.py --engine kokoro --voice bf_emma --out audio-kokoro

## Rules

- Label it "AI voice" in the app, like the AI translations.
- Only clone a voice (`--voice clip.wav`) that you have the right to use, such as your own. Never clone Har Bracha's
  narrators.
- Chatterbox output carries Resemble AI's inaudible watermark (Perth).
- `chatterbox-turbo` needs a `--voice` clip (about 10 seconds); plain `chatterbox` has a built-in voice.
