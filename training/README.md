# Uyghur Whisper Fine-Tuning

Two scripts to turn your labeled Uyghur audio into a custom speech model and plug it back into the learning app.

---

## Prerequisites

- A free [Hugging Face](https://huggingface.co) account (for hosting the model)
- A free [Google Colab](https://colab.research.google.com) or [Kaggle](https://kaggle.com) account (for GPU)
- Your Uyghur audio data (WAV/MP3) + transcriptions

---

## Step 1 — Organise your data

Choose one of two layouts:

**Format A — single folder + CSV** *(recommended)*
```
data/
  metadata.csv          ← two columns: file_name, transcription
  audio_001.wav
  audio_002.wav
  ...
```

`metadata.csv` example:
```csv
file_name,transcription
audio_001.wav,سالام ئالەيكۇم
audio_002.wav,رەھمەت
audio_003.wav,ياخشىمۇسىز
```

**Format B — paired folders**
```
data/
  audio/
    001.wav
    002.wav
  text/
    001.txt             ← one Uyghur sentence per file
    002.txt
```

---

## Step 2 — Prepare the HF Dataset

```bash
pip install datasets soundfile librosa tqdm

# Format A
python prepare_dataset.py \
  --data_dir   ./data \
  --output_dir ./uyghur_dataset \
  --format     a

# Format B
python prepare_dataset.py \
  --data_dir   ./data \
  --output_dir ./uyghur_dataset \
  --format     b

# Optional: push dataset to HF Hub (private)
python prepare_dataset.py \
  --data_dir      ./data \
  --output_dir    ./uyghur_dataset \
  --format        a \
  --push_to_hub   YOUR_HF_USERNAME/uyghur-asr-data
```

Output: a `./uyghur_dataset/` folder with `train` and `test` splits.

---

## Step 3 — Fine-tune on Google Colab (free T4 GPU)

1. Open [colab.research.google.com](https://colab.research.google.com)
2. **Runtime → Change runtime type → T4 GPU**
3. Upload `finetune_whisper_uyghur.py` (or paste contents into a cell)
4. Edit the config block at the top:

```python
HUGGINGFACE_TOKEN = "hf_xxxxxxxxxxxx"           # your HF token
HF_MODEL_ID       = "yourname/uyghur-whisper-small"
DATASET_PATH      = "./uyghur_dataset"           # upload the folder too
```

5. Uncomment the `pip install` block at the top
6. **Runtime → Run all**

Training takes roughly:
| Dataset size | whisper-small | whisper-medium |
|---|---|---|
| 10 h | ~4–5 h on T4 | ~8–10 h on T4 |
| 20 h | ~7–8 h on T4 | ~14–16 h on T4 |

The best checkpoint is automatically pushed to your HF Hub repo.

---

## Step 4 — Enable your custom model in the app

Once training finishes, your model is live at:
```
https://huggingface.co/YOUR_HF_USERNAME/uyghur-whisper-small
```

### Option A — HF Inference API (free, slower)

In `app.js`, replace the Groq constants:
```javascript
// Old (Groq)
const ASR_GROQ_URL   = 'https://api.groq.com/openai/v1/audio/transcriptions';
const ASR_GROQ_MODEL = 'whisper-large-v3-turbo';

// New (HF Inference API — your custom model)
const ASR_GROQ_URL   = 'https://api-inference.huggingface.co/models/YOUR_HF_USERNAME/uyghur-whisper-small';
const ASR_GROQ_MODEL = '';   // not used for HF inference
```

And update `asrProcess()` to use HF format:
```javascript
const resp = await fetch(ASR_GROQ_URL, {
  method:  'POST',
  headers: { Authorization: `Bearer ${asrGetKey()}` },
  body:    blob,    // send raw audio, not FormData
});
```

### Option B — HF Inference Endpoint (fast, ~$0.06/hr when running)
1. Go to https://huggingface.co/YOUR_HF_USERNAME/uyghur-whisper-small → Deploy → Inference Endpoints
2. Create an endpoint, copy the URL
3. Use that URL in `ASR_GROQ_URL`

---

## Tips for better results

- **Audio quality**: 16 kHz mono WAV gives best results. Run `ffmpeg -i input.mp3 -ar 16000 -ac 1 output.wav` to convert.
- **Speaker diversity**: include multiple speakers if possible — improves generalisation.
- **Clip length**: 2–10 second clips work best. Avoid clips shorter than 0.5 s.
- **Transcription accuracy**: the model can only be as good as the labels. Double-check transcriptions.
- **`whisper-medium` vs `whisper-small`**: medium gives noticeably better Uyghur accuracy (~20 % WER improvement) but needs more VRAM. Use Colab Pro or Kaggle for medium.
