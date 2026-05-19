"""
verify_translations.py
Run all words in data.js through Meta's NLLB-200 model (via HF Inference API)
and flag ones where the translation looks different from what's stored.

Usage:
  pip install requests tqdm
  python verify_translations.py --token hf_YOUR_TOKEN --output report.csv

Output: report.csv with columns:
  category, index, english, stored_uyghur, nllb_uyghur, match, similarity
"""

import re, csv, sys, time, argparse, unicodedata
from pathlib import Path

try:
    import requests
    from tqdm import tqdm
except ImportError:
    raise SystemExit("Run: pip install requests tqdm")

# ── Config ────────────────────────────────────────────────────────────────────
NLLB_API = "https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M"
SRC_LANG = "eng_Latn"
TGT_LANG = "uig_Arab"
SIMILARITY_THRESHOLD = 0.6   # flag if similarity drops below this
RATE_LIMIT_DELAY     = 0.5   # seconds between API calls (be a good citizen)

# ── Parse data.js ─────────────────────────────────────────────────────────────
DATA_JS = Path(__file__).parent.parent / "data.js"

ENTRY_RE = re.compile(
    r'\{\s*uyghur:\s*"([^"]+)"\s*,\s*latin:\s*"([^"]+)"\s*,\s*english:\s*"([^"]+)"',
    re.UNICODE
)
CAT_RE = re.compile(r'^\s{4}(\w+):\s*\[', re.MULTILINE)

def parse_data_js(path: Path):
    """Extract all vocab entries with their category from data.js."""
    text = path.read_text(encoding="utf-8")

    # Find category boundaries
    cat_positions = [(m.group(1), m.start()) for m in CAT_RE.finditer(text)]

    entries = []
    for entry_m in ENTRY_RE.finditer(text):
        pos = entry_m.start()
        # Determine which category this entry belongs to
        cat = "unknown"
        for cat_name, cat_pos in cat_positions:
            if cat_pos <= pos:
                cat = cat_name
        entries.append({
            "category": cat,
            "uyghur":   entry_m.group(1).strip(),
            "latin":    entry_m.group(2).strip(),
            "english":  entry_m.group(3).strip(),
        })
    return entries

# ── NLLB translation ──────────────────────────────────────────────────────────
def translate(text: str, token: str, retries=3) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "inputs": text,
        "parameters": {"src_lang": SRC_LANG, "tgt_lang": TGT_LANG},
    }
    for attempt in range(retries):
        try:
            r = requests.post(NLLB_API, headers=headers, json=payload, timeout=30)
            if r.status_code == 503:
                # Model loading — wait and retry
                wait = r.json().get("estimated_time", 20)
                print(f"\n  [model loading, waiting {wait:.0f}s…]")
                time.sleep(min(wait, 60))
                continue
            r.raise_for_status()
            return r.json()[0]["translation_text"].strip()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"\n  [error translating '{text}': {e}]")
                return ""
    return ""

# ── Similarity (normalised edit distance) ────────────────────────────────────
def normalise(s: str) -> str:
    """Strip harakat and normalise Unicode."""
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[ً-ْٰ]", "", s)  # Arabic diacritics
    return s.strip()

def levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n + 1):
            dp[j] = prev[j-1] if a[i-1] == b[j-1] else 1 + min(prev[j], dp[j-1], prev[j-1])
    return dp[n]

def similarity(a: str, b: str) -> float:
    na, nb = normalise(a), normalise(b)
    if not na and not nb: return 1.0
    if not na or not nb:  return 0.0
    dist = levenshtein(na, nb)
    return 1 - dist / max(len(na), len(nb))

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token",    required=True, help="Hugging Face API token (hf_…)")
    parser.add_argument("--output",   default="report.csv")
    parser.add_argument("--limit",    type=int, default=0, help="Only check first N words (0 = all)")
    parser.add_argument("--category", default="",  help="Only check one category")
    parser.add_argument("--threshold",type=float, default=SIMILARITY_THRESHOLD)
    args = parser.parse_args()

    print(f"Parsing {DATA_JS} …")
    entries = parse_data_js(DATA_JS)
    print(f"  Found {len(entries)} vocabulary entries.")

    if args.category:
        entries = [e for e in entries if e["category"] == args.category]
        print(f"  Filtered to category '{args.category}': {len(entries)} entries.")

    if args.limit:
        entries = entries[:args.limit]
        print(f"  Limited to first {args.limit} entries.")

    flagged = []
    out_rows = []

    print(f"\nTranslating via NLLB-200 (this will take a while for {len(entries)} words)…\n")

    for entry in tqdm(entries, unit="word"):
        english = entry["english"].split("/")[0].strip()   # use first meaning only
        nllb    = translate(english, args.token)
        sim     = similarity(entry["uyghur"], nllb)
        match   = sim >= args.threshold

        row = {
            "category":    entry["category"],
            "english":     entry["english"],
            "stored_uyghur": entry["uyghur"],
            "stored_latin":  entry["latin"],
            "nllb_uyghur": nllb,
            "similarity":  f"{sim:.2f}",
            "match":       "✓" if match else "⚠ FLAG",
        }
        out_rows.append(row)
        if not match:
            flagged.append(row)

        time.sleep(RATE_LIMIT_DELAY)

    # Write CSV
    out_path = Path(args.output)
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\n{'='*60}")
    print(f"Done. {len(out_rows)} words checked.")
    print(f"Flagged (similarity < {args.threshold}): {len(flagged)}")
    print(f"Report saved to: {out_path.resolve()}")
    print(f"{'='*60}")

    if flagged:
        print(f"\nTop flagged entries:")
        for r in flagged[:20]:
            print(f"  [{r['category']}] {r['english']}")
            print(f"    stored: {r['stored_uyghur']}  ({r['stored_latin']})")
            print(f"    NLLB:   {r['nllb_uyghur']}  (sim={r['similarity']})")

if __name__ == "__main__":
    main()
