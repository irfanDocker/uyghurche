"""
prepare_dataset.py — Convert your Uyghur audio + text pairs into a
Hugging Face Dataset ready for fine-tuning.

Expected input layout (two supported formats):

FORMAT A — folder + CSV
  data/
    audio_001.wav
    audio_002.wav
    ...
    metadata.csv        ← columns: file_name, transcription

FORMAT B — paired folders
  data/
    audio/
      001.wav
      002.wav
    text/
      001.txt           ← one Uyghur sentence per file

Run:
  pip install datasets soundfile librosa tqdm
  python prepare_dataset.py --data_dir ./data --output_dir ./uyghur_dataset --format a
"""

import argparse, csv, os, json
from pathlib import Path
from tqdm import tqdm
import soundfile as sf

try:
    from datasets import Dataset, DatasetDict, Audio
except ImportError:
    raise SystemExit("Run: pip install datasets soundfile")


def load_format_a(data_dir: Path):
    """CSV metadata + audio files in same folder."""
    meta_path = data_dir / "metadata.csv"
    if not meta_path.exists():
        raise FileNotFoundError(f"metadata.csv not found in {data_dir}")

    rows = []
    with open(meta_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            audio_path = data_dir / row["file_name"]
            if audio_path.exists():
                rows.append({
                    "audio": str(audio_path),
                    "sentence": row["transcription"].strip(),
                })
            else:
                print(f"  [warn] missing audio: {audio_path}")
    return rows


def load_format_b(data_dir: Path):
    """Paired audio/ and text/ folders with matching filenames."""
    audio_dir = data_dir / "audio"
    text_dir  = data_dir / "text"

    rows = []
    for txt_file in sorted(text_dir.glob("*.txt")):
        stem = txt_file.stem
        # try common audio extensions
        audio_file = None
        for ext in [".wav", ".mp3", ".flac", ".ogg", ".m4a"]:
            candidate = audio_dir / (stem + ext)
            if candidate.exists():
                audio_file = candidate
                break
        if not audio_file:
            print(f"  [warn] no audio for {txt_file.name}")
            continue
        transcription = txt_file.read_text(encoding="utf-8").strip()
        if transcription:
            rows.append({"audio": str(audio_file), "sentence": transcription})
    return rows


def build_dataset(rows, test_split=0.05):
    """Split into train/test and cast to HF Dataset with Audio feature."""
    from datasets import Dataset, DatasetDict, Audio as AudioFeature

    n_test  = max(1, int(len(rows) * test_split))
    n_train = len(rows) - n_test

    train_rows = rows[:n_train]
    test_rows  = rows[n_train:]

    train_ds = Dataset.from_list(train_rows).cast_column("audio", AudioFeature(sampling_rate=16_000))
    test_ds  = Dataset.from_list(test_rows).cast_column("audio",  AudioFeature(sampling_rate=16_000))

    return DatasetDict({"train": train_ds, "test": test_ds})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir",   required=True, help="Root folder with audio + transcriptions")
    parser.add_argument("--output_dir", required=True, help="Where to save the HF dataset")
    parser.add_argument("--format",     default="a",   choices=["a", "b"])
    parser.add_argument("--test_split", default=0.05,  type=float)
    parser.add_argument("--push_to_hub",               help="HF repo ID to push to, e.g. yourname/uyghur-asr-data")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    print(f"Loading data from {data_dir} (format {args.format.upper()}) …")

    rows = load_format_a(data_dir) if args.format == "a" else load_format_b(data_dir)
    print(f"Found {len(rows)} examples.")

    if not rows:
        raise SystemExit("No valid audio+text pairs found. Check your data directory.")

    print("Building HF Dataset …")
    dataset = build_dataset(rows, test_split=args.test_split)
    print(f"  Train: {len(dataset['train'])}  |  Test: {len(dataset['test'])}")

    out = Path(args.output_dir)
    dataset.save_to_disk(str(out))
    print(f"Saved to {out}")

    # Also save a manifest JSON for quick inspection
    manifest = [{"audio": r["audio"], "sentence": r["sentence"]} for r in rows[:5]]
    (out / "sample_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Sample manifest written to sample_manifest.json")

    if args.push_to_hub:
        print(f"Pushing to Hugging Face Hub: {args.push_to_hub} …")
        dataset.push_to_hub(args.push_to_hub, private=True)
        print("Done! Dataset is on the Hub (private).")


if __name__ == "__main__":
    main()
