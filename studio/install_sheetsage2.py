#!/usr/bin/env python3
"""Download the pinned SheetSage2 and MERT2 checkpoints into audio.cpp/models."""

from pathlib import Path

from huggingface_hub import snapshot_download


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "audio.cpp" / "models"

CHECKPOINTS = (
    (
        "m-a-p/SheetSage2",
        "eab522a8168e8b8b8c4856bf8609cd86198f01fe",
        MODEL_DIR / "SheetSage2",
        ["assets/*", "render_assets/*", "requirements-render.txt", "render.py", "rendering_sheetsage2.py", "setup_render.py"],
    ),
    (
        "m-a-p/MERT-v2-FullSong",
        "d8ba1c745e733b3908ce6ad16ebeb17ac7600a42",
        MODEL_DIR / "MERT-v2-FullSong",
        ["assets/*"],
    ),
)


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for repo_id, revision, destination, ignore_patterns in CHECKPOINTS:
        print(f"Downloading {repo_id} -> {destination}", flush=True)
        snapshot_download(
            repo_id=repo_id,
            revision=revision,
            local_dir=destination,
            ignore_patterns=ignore_patterns,
        )
    print("SheetSage2 checkpoints are ready.", flush=True)


if __name__ == "__main__":
    main()
