"""
generate_vocab.py
Translate a list of English words → Uyghur using Meta NLLB-200,
then format them as data.js entries ready to paste in.

Usage:
  pip install requests tqdm

  # From a text file (one English word/phrase per line):
  python generate_vocab.py --token hf_YOUR_TOKEN --words words.txt --category food11

  # Inline word list:
  python generate_vocab.py --token hf_YOUR_TOKEN --category animals3 \
      --words "lion,tiger,elephant,giraffe,zebra,wolf,fox,bear,deer,camel"

Output:
  - Prints data.js-ready entries to stdout
  - Saves to <category>_generated.js
"""

import re, time, argparse, unicodedata
from pathlib import Path

try:
    import requests
    from tqdm import tqdm
except ImportError:
    raise SystemExit("Run: pip install requests tqdm")

# ── Config ────────────────────────────────────────────────────────────────────
NLLB_API        = "https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M"
TRANS_API       = "https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M"
SRC_LANG        = "eng_Latn"
TGT_LANG        = "uig_Arab"      # Uyghur in Arabic script
RATE_LIMIT_DELAY = 0.6            # seconds between calls

# ── NLLB translation ──────────────────────────────────────────────────────────
def translate(text: str, token: str, src=SRC_LANG, tgt=TGT_LANG, retries=3) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"inputs": text, "parameters": {"src_lang": src, "tgt_lang": tgt}}
    for attempt in range(retries):
        try:
            r = requests.post(NLLB_API, headers=headers, json=payload, timeout=30)
            if r.status_code == 503:
                wait = r.json().get("estimated_time", 20)
                print(f"\n  [model loading — waiting {wait:.0f}s…]")
                time.sleep(min(wait, 60))
                continue
            r.raise_for_status()
            return r.json()[0]["translation_text"].strip()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"\n  [error: {e}]")
                return ""
    return ""

# ── Latin transliteration (Uyghur ULY scheme) ────────────────────────────────
# Maps common Uyghur Arabic-script characters → Latin (ULY)
ARABIC_TO_LATIN = {
    "ئ": "", "ا": "a", "ە": "e", "ب": "b", "پ": "p", "ت": "t",
    "ج": "j", "چ": "ch","خ": "x", "د": "d", "ر": "r", "ز": "z",
    "ژ": "zh","س": "s", "ش": "sh","غ": "gh","ف": "f", "ق": "q",
    "ك": "k", "گ": "g", "ڭ": "ng","ل": "l", "م": "m", "ن": "n",
    "ھ": "h", "و": "o", "ۇ": "u", "ۆ": "ö", "ۈ": "ü", "ۋ": "w",
    "ې": "e", "ى": "i", "ي": "y", "ي": "y",
    # vowel marks / diacritics (skip)
    "ً": "", "ٌ": "", "ٍ": "", "َ": "",
    "ُ": "", "ِ": "", "ّ": "", "ْ": "",
    " ": " ",
}

def uyghur_to_latin(text: str) -> str:
    """Best-effort Uyghur Arabic script → Latin transliteration."""
    result = []
    for ch in unicodedata.normalize("NFC", text):
        result.append(ARABIC_TO_LATIN.get(ch, ch))
    lat = "".join(result).strip()
    # Capitalise first letter
    return lat[:1].upper() + lat[1:] if lat else lat

def make_tip(latin: str) -> str:
    """Split on vowels to create a simple syllable hint."""
    # Simple: split at every 2-3 chars on vowel boundaries
    vowels = set("aeiouöüAEIOUÖÜ")
    parts, chunk = [], ""
    for i, ch in enumerate(latin):
        chunk += ch
        if ch in vowels and len(chunk) >= 2 and i < len(latin) - 1:
            parts.append(chunk)
            chunk = ""
    if chunk:
        parts.append(chunk)
    return "-".join(parts) if len(parts) > 1 else latin

def format_entry(english: str, uyghur: str, level: int = 1) -> str:
    latin = uyghur_to_latin(uyghur)
    tip   = make_tip(latin)
    # Pad fields for alignment
    u = f'"{uyghur}"'
    l = f'"{latin}"'
    e = f'"{english}"'
    t = f'"{tip}"'
    return f'      {{ uyghur: {u:<25} latin: {l:<20} english: {e:<35} tip: {t:<20} level: {level} }},'

# ── Load word list ────────────────────────────────────────────────────────────
def load_words(source: str) -> list[str]:
    path = Path(source)
    if path.exists():
        words = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    else:
        # treat as comma-separated inline list
        words = [w.strip() for w in source.split(",")]
    return [w for w in words if w and not w.startswith("#")]

# ── Assign difficulty level ───────────────────────────────────────────────────
def guess_level(english: str) -> int:
    """Very rough heuristic: longer/less common words get higher level."""
    if len(english) <= 4:  return 1
    if len(english) <= 7:  return 2
    return 3

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token",    required=True, help="Hugging Face API token")
    parser.add_argument("--words",    required=True, help="Path to word list .txt OR comma-separated words")
    parser.add_argument("--category", required=True, help="Category key for data.js, e.g. food11")
    parser.add_argument("--level",    type=int, default=0,
                        help="Override difficulty level (1-3). 0 = auto-detect.")
    args = parser.parse_args()

    words = load_words(args.words)
    print(f"Loaded {len(words)} words to translate → Uyghur\n")

    lines = [f"    {args.category}: ["]
    failed = []

    for word in tqdm(words, unit="word"):
        uyghur = translate(word, args.token)
        if not uyghur:
            failed.append(word)
            lines.append(f"      // FAILED: {word}")
        else:
            level = args.level if args.level else guess_level(word)
            lines.append(format_entry(word, uyghur, level))
        time.sleep(RATE_LIMIT_DELAY)

    lines.append("    ],")
    output = "\n".join(lines)

    # Print to terminal
    print(f"\n{'='*60}")
    print("Generated data.js entries — paste into data.js before phraseGroups:")
    print('='*60)
    print(output)
    print('='*60)

    # Save to file
    out_file = Path(f"{args.category}_generated.js")
    out_file.write_text(output, encoding="utf-8")
    print(f"\nAlso saved to: {out_file.resolve()}")

    if failed:
        print(f"\n⚠ Failed to translate ({len(failed)} words): {', '.join(failed)}")
        print("  Re-run with just these words, or translate manually.")

    # Remind about app.js registration
    print(f"""
Next steps:
  1. Review the generated entries above (check Uyghur script is correct)
  2. Paste into data.js before the phraseGroups: section
  3. Add to app.js STUDY_CATS:
       {args.category}: {{ name: '…', emoji: '…', color: '…' }},
  4. git add . && git commit -m "Add {args.category} vocabulary"
""")

if __name__ == "__main__":
    main()
