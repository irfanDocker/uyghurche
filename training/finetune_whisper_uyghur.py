"""
finetune_whisper_uyghur.py
Fine-tune OpenAI Whisper on Uyghur speech data.

RECOMMENDED RUNTIME: Google Colab (free T4 GPU) or Kaggle (free P100).

Quick start in Colab:
  1. Upload this file (or paste its contents into a cell)
  2. Set HUGGINGFACE_TOKEN and HF_MODEL_ID below
  3. Runtime → Run all

Requirements (auto-installed below):
  transformers>=4.36  datasets  accelerate  evaluate
  jiwer  soundfile  librosa  tensorboard
"""

# ── 0. Install (uncomment in Colab) ───────────────────────────────────────────
# import subprocess, sys
# subprocess.run([sys.executable, "-m", "pip", "install", "-q",
#     "transformers", "datasets", "accelerate", "evaluate",
#     "jiwer", "soundfile", "librosa", "tensorboard",
#     "huggingface_hub"])

# ── 1. Configuration ──────────────────────────────────────────────────────────
import os

# ✏️  Fill these in:
HUGGINGFACE_TOKEN = os.environ.get("HF_TOKEN", "hf_YOUR_TOKEN_HERE")
HF_MODEL_ID       = "YOUR_HF_USERNAME/uyghur-whisper-small"   # where to push the model
DATASET_PATH      = "./uyghur_dataset"                         # local path OR HF dataset id

BASE_MODEL        = "openai/whisper-small"   # change to whisper-medium for higher quality
LANGUAGE          = "Uyghur"
TASK              = "transcribe"
LANG_CODE         = "ug"

# Training hyperparameters (tuned for ~10 h dataset, T4 GPU)
MAX_STEPS         = 5000
WARMUP_STEPS      = 500
BATCH_SIZE        = 16          # per-device; reduce to 8 if OOM
GRAD_ACCUM        = 1           # increase if batch is smaller
LEARNING_RATE     = 1e-5
FP16              = True        # set False for CPU-only
EVAL_STEPS        = 500
SAVE_STEPS        = 500
LOGGING_STEPS     = 25
MAX_AUDIO_SECS    = 30          # skip clips longer than this

OUTPUT_DIR        = "./whisper-uyghur-finetuned"

# ── 2. Auth ────────────────────────────────────────────────────────────────────
from huggingface_hub import login
login(token=HUGGINGFACE_TOKEN)

# ── 3. Load model & processor ─────────────────────────────────────────────────
from transformers import WhisperProcessor, WhisperForConditionalGeneration

print(f"Loading base model: {BASE_MODEL}")
processor = WhisperProcessor.from_pretrained(BASE_MODEL, language=LANGUAGE, task=TASK)
model     = WhisperForConditionalGeneration.from_pretrained(BASE_MODEL)

# Force the model to always decode in Uyghur
model.config.forced_decoder_ids = processor.get_decoder_prompt_ids(language=LANGUAGE, task=TASK)
model.config.suppress_tokens     = []
model.generation_config.language  = LANG_CODE
model.generation_config.task      = TASK

# ── 4. Load dataset ────────────────────────────────────────────────────────────
from datasets import load_from_disk, load_dataset, Audio

print(f"Loading dataset from: {DATASET_PATH}")
try:
    dataset = load_from_disk(DATASET_PATH)
except Exception:
    # Try as HF Hub dataset id
    dataset = load_dataset(DATASET_PATH, trust_remote_code=True)

# Ensure 16 kHz audio
dataset = dataset.cast_column("audio", Audio(sampling_rate=16_000))
print(f"Dataset: {dataset}")

# ── 5. Preprocessing ──────────────────────────────────────────────────────────
import torch

def prepare_batch(batch):
    audio   = batch["audio"]
    samples = audio["array"]
    sr      = audio["sampling_rate"]

    # Skip clips that are too long (saves memory)
    duration = len(samples) / sr
    if duration > MAX_AUDIO_SECS:
        return {"skip": True, "input_features": None, "labels": None}

    input_features = processor.feature_extractor(
        samples, sampling_rate=sr, return_tensors="pt"
    ).input_features[0]

    labels = processor.tokenizer(
        batch["sentence"],
        return_tensors="pt",
        truncation=True,
        max_length=448,
    ).input_ids[0]

    return {"input_features": input_features, "labels": labels, "skip": False}

print("Preprocessing …")
dataset = dataset.map(prepare_batch, remove_columns=dataset["train"].column_names, num_proc=1)
dataset = dataset.filter(lambda x: not x["skip"])
dataset = dataset.remove_columns(["skip"])
print(f"After filter: {dataset}")

# ── 6. Data collator ──────────────────────────────────────────────────────────
from dataclasses import dataclass
from typing import Any, Dict, List, Union

@dataclass
class DataCollatorSpeechSeq2SeqWithPadding:
    processor: Any

    def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]):
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch   = self.processor.tokenizer.pad(label_features, return_tensors="pt")

        # Replace padding with -100 (ignored in loss)
        labels = labels_batch["input_ids"].masked_fill(
            labels_batch.attention_mask.ne(1), -100
        )
        # Remove bos token prepended by tokenizer if present
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch

collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)

# ── 7. Evaluation metric (WER — Word Error Rate) ───────────────────────────────
import evaluate

wer_metric = evaluate.load("wer")

def compute_metrics(pred):
    pred_ids   = pred.predictions
    label_ids  = pred.label_ids
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

    pred_str  = processor.tokenizer.batch_decode(pred_ids,  skip_special_tokens=True)
    label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    wer = 100 * wer_metric.compute(predictions=pred_str, references=label_str)
    return {"wer": wer}

# ── 8. Training arguments ─────────────────────────────────────────────────────
from transformers import Seq2SeqTrainingArguments

training_args = Seq2SeqTrainingArguments(
    output_dir                  = OUTPUT_DIR,
    per_device_train_batch_size = BATCH_SIZE,
    gradient_accumulation_steps = GRAD_ACCUM,
    learning_rate               = LEARNING_RATE,
    warmup_steps                = WARMUP_STEPS,
    max_steps                   = MAX_STEPS,
    gradient_checkpointing      = True,
    fp16                        = FP16,
    eval_strategy               = "steps",
    per_device_eval_batch_size  = 8,
    predict_with_generate       = True,
    generation_max_length       = 225,
    save_steps                  = SAVE_STEPS,
    eval_steps                  = EVAL_STEPS,
    logging_steps               = LOGGING_STEPS,
    report_to                   = ["tensorboard"],
    load_best_model_at_end      = True,
    metric_for_best_model       = "wer",
    greater_is_better           = False,
    push_to_hub                 = True,
    hub_model_id                = HF_MODEL_ID,
    hub_strategy                = "every_save",
    hub_token                   = HUGGINGFACE_TOKEN,
)

# ── 9. Trainer ────────────────────────────────────────────────────────────────
from transformers import Seq2SeqTrainer

trainer = Seq2SeqTrainer(
    args            = training_args,
    model           = model,
    train_dataset   = dataset["train"],
    eval_dataset    = dataset["test"],
    data_collator   = collator,
    compute_metrics = compute_metrics,
    processing_class = processor,
)

model.config.use_cache = False   # required for gradient checkpointing

# ── 10. Train ─────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"Fine-tuning {BASE_MODEL} → {HF_MODEL_ID}")
print(f"Steps: {MAX_STEPS}  |  LR: {LEARNING_RATE}  |  Batch: {BATCH_SIZE}")
print(f"{'='*60}\n")

trainer.train()

# ── 11. Push final model to Hub ───────────────────────────────────────────────
print("\nPushing final model to Hugging Face Hub …")
trainer.push_to_hub()
processor.push_to_hub(HF_MODEL_ID, token=HUGGINGFACE_TOKEN)
print(f"\n✅ Done!  Model live at: https://huggingface.co/{HF_MODEL_ID}")
print(f"\nNext step: update ASR_GROQ_MODEL in app.js to use your HF Inference endpoint.")
