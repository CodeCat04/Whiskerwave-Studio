#!/usr/bin/env python3
"""Small dependency-free, resumable downloader for Whiskerwave model files."""

from __future__ import annotations

import argparse
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote


YUE2_REPO = "audio-cpp/Yue2-3B-GGUF"
YUE2_REVISION = "9c31f1c64f73d36799693aa89295b410c76928c3"
YUE2_SIDECARS = (
    "sidecars/yue2-model-config.json",
    "sidecars/yue2-generation-config.json",
    "sidecars/yue2-qwen.tiktoken",
    "sidecars/yue2-vae-config.json",
)
YUE2_FILES = {
    "q4": ("yue2-3b-q4_0.gguf", "yue2-vae-f16.gguf"),
    "q8": ("yue2-3b-q8_0.gguf", "yue2-vae-f16.gguf"),
    "bf16": ("yue2-3b-bf16.gguf", "yue2-vae-f32.gguf"),
    "all": (
        "yue2-3b-q4_0.gguf",
        "yue2-3b-q8_0.gguf",
        "yue2-3b-bf16.gguf",
        "yue2-vae-f16.gguf",
        "yue2-vae-f32.gguf",
    ),
}
EXPECTED_SIZES = {
    (YUE2_REPO, "sidecars/yue2-model-config.json"): 959,
    (YUE2_REPO, "sidecars/yue2-generation-config.json"): 466,
    (YUE2_REPO, "sidecars/yue2-qwen.tiktoken"): 2_561_218,
    (YUE2_REPO, "sidecars/yue2-vae-config.json"): 1_378,
    (YUE2_REPO, "yue2-3b-q4_0.gguf"): 2_665_632_320,
    (YUE2_REPO, "yue2-3b-q8_0.gguf"): 4_264_186_432,
    (YUE2_REPO, "yue2-3b-bf16.gguf"): 7_261_475_392,
    (YUE2_REPO, "yue2-vae-f16.gguf"): 265_218_656,
    (YUE2_REPO, "yue2-vae-f32.gguf"): 530_537_760,
}


def hf_url(repo: str, filename: str, revision: str = "main") -> str:
    encoded = "/".join(quote(part) for part in filename.split("/"))
    return f"https://huggingface.co/{repo}/resolve/{revision}/{encoded}?download=true"


def human_size(value: float) -> str:
    for suffix in ("B", "KiB", "MiB", "GiB", "TiB"):
        if value < 1024 or suffix == "TiB":
            return f"{value:.1f} {suffix}"
        value /= 1024
    return f"{value:.1f} TiB"


def download(url: str, destination: Path, expected_size: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    if destination.exists():
        if destination.stat().st_size == expected_size:
            print(f"Keeping verified {destination.name}")
            return
        if not partial.exists():
            destination.replace(partial)
        else:
            destination.unlink()
    existing = partial.stat().st_size if partial.exists() else 0
    if existing > expected_size:
        partial.unlink()
        existing = 0
    headers = {"User-Agent": "Whiskerwave-Studio/1.0"}
    if existing:
        headers["Range"] = f"bytes={existing}-"

    print(f"\n{destination.name}", flush=True)
    try:
        response = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
    except urllib.error.HTTPError as exc:
        if exc.code == 416 and partial.exists():
            actual_size = partial.stat().st_size
            if actual_size == expected_size:
                partial.replace(destination)
                print("  complete", flush=True)
                return
            partial.unlink()
            raise RuntimeError(
                f"Server rejected resume for incomplete {destination.name}: "
                f"{actual_size} of {expected_size} bytes. Run this again to restart the file."
            ) from exc
        raise

    status = getattr(response, "status", response.getcode())
    if existing and status != 206:
        existing = 0
        partial.unlink(missing_ok=True)
    remaining = int(response.headers.get("Content-Length") or 0)
    total = existing + remaining if remaining else 0
    mode = "ab" if existing else "wb"
    received = existing
    last_report = 0.0
    with response, partial.open(mode) as handle:
        while True:
            chunk = response.read(4 * 1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
            received += len(chunk)
            now = time.monotonic()
            if now - last_report >= 1.0:
                detail = human_size(received)
                if total:
                    detail += f" / {human_size(total)} ({received * 100 / total:.1f}%)"
                print(f"  {detail}", end="\r", flush=True)
                last_report = now
    if total and received != total:
        raise RuntimeError(f"Incomplete download for {destination.name}: {received} of {total} bytes")
    if received != expected_size:
        raise RuntimeError(f"Unexpected size for {destination.name}: {received} bytes; expected {expected_size}")
    partial.replace(destination)
    print(f"  {human_size(received)} complete" + " " * 20, flush=True)


def fetch(repo: str, revision: str, filename: str, destination: Path) -> None:
    download(hf_url(repo, filename, revision), destination, EXPECTED_SIZES[(repo, filename)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--yue2", choices=("none", "q4", "q8", "bf16", "all"), default="none")
    args = parser.parse_args()
    audio_models = args.root.resolve() / "audio.cpp" / "models"

    if args.yue2 != "none":
        target = audio_models / "Yue2-3B-GGUF"
        for name in (*YUE2_SIDECARS, *YUE2_FILES[args.yue2]):
            fetch(YUE2_REPO, YUE2_REVISION, name, target / name)

    print("\nRequested model files are ready.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDownload cancelled. Run this again to resume.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"\nDownload failed: {exc}\nRun this again to resume partial files.", file=sys.stderr)
        raise SystemExit(1)
