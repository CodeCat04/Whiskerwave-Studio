#!/usr/bin/env python3
"""Offline SheetSage2 runner used by Whiskerwave Studio."""

import argparse
import json
import os
import sys
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--dtype", choices=("bf16", "fp32"), default="bf16")
    parser.add_argument("--melody-only", action="store_true")
    args = parser.parse_args()

    for path, label in ((args.model, "SheetSage2"), (args.base_model, "MERT2"), (args.audio, "audio")):
        if not path.exists():
            parser.error(f"{label} path does not exist: {path}")

    # Import the pinned local snapshot directly. This avoids network access and
    # Transformers' remote-code cache after installation.
    module_cache = Path(__file__).resolve().parent / "runtime" / "hf-modules"
    module_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_MODULES_CACHE"] = str(module_cache)
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    sys.path.insert(0, str(args.model.parent.resolve()))
    import torch
    from SheetSage2.modeling_sheetsage2 import SheetSage2Model

    if not torch.cuda.is_available():
        raise RuntimeError("SheetSage2 requires a working CUDA device in this Studio installation.")
    if args.device < 0 or args.device >= torch.cuda.device_count():
        raise RuntimeError(f"CUDA device {args.device} is not available.")
    device = f"cuda:{args.device}"
    dtype = torch.bfloat16 if args.dtype == "bf16" else torch.float32
    torch.set_num_threads(min(4, torch.get_num_threads()))
    started = time.monotonic()

    print(json.dumps({"stage": "loading", "device": torch.cuda.get_device_name(args.device)}), flush=True)
    model = SheetSage2Model.from_pretrained(
        str(args.model.resolve()),
        base_model_path=str(args.base_model.resolve()),
        local_files_only=True,
        torch_dtype=dtype,
        device_map={"": device},
    ).eval()

    def progress(value: dict) -> None:
        if value.get("stage") in {"encoding", "decoding", "notation", "complete"}:
            print(json.dumps(value, default=str), flush=True)

    result = model.transcribe(
        args.audio.resolve(),
        output_dir=args.output.resolve(),
        dtype=args.dtype,
        melody_only=args.melody_only,
        progress=progress,
    )
    summary = {
        "stage": "finished",
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "duration_seconds": result.get("duration_seconds", 0),
        "melody_notes": result.get("melody_notes", 0),
        "vocal_notes": result.get("vocal_notes", 0),
        "instrumental_notes": result.get("instrumental_notes", 0),
        "abc_measures": result.get("abc_measures", 0),
        "abc_error": result.get("abc_error"),
        "warnings": result.get("warnings", []),
        "peak_gpu_mib": result.get("peak_gpu_mib", 0),
    }
    print(json.dumps(summary, default=str), flush=True)
    if not result.get("abc"):
        raise RuntimeError(f"SheetSage2 did not produce ABC: {result.get('abc_error') or 'unknown reason'}")


if __name__ == "__main__":
    main()
