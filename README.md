# Whiskerwave Studio

Local-first AI music creation for Windows: YuE2 song generation through
audio.cpp, Ollama-assisted songwriting, SheetSage2 transcription, ABC/MIDI
remixing, a shared GPU-safe queue, and searchable local libraries.

Whiskerwave runs on your machine and opens as a browser-based GUI. Generated
music, lyrics, transcriptions, prompts, seeds, and settings remain in local
folders unless you explicitly download a first-party YuE2 guide example.

## Install on Windows

1. Download or clone this repository to a folder with plenty of free space.
2. Double-click **`Install Whiskerwave Studio.bat`**.
3. Press a number to choose an installation:
   - **Recommended:** YuE2 Q8 + SheetSage2.
   - **Compact:** YuE2 Q4 generation only.
   - **Complete:** every YuE2 precision + SheetSage2.
   - **Custom:** choose each component.
4. Approve any missing prerequisite installs when prompted.
5. When it finishes, double-click **`Start Whiskerwave Studio.bat`**.

The installer is resumable. Rerun it after a network interruption or required
Windows restart. **`Manage Models.bat`** adds optional models later, and
**`Update Whiskerwave Studio.bat`** updates a Git clone and rebuilds the tested
audio.cpp dependency without deleting user work.

### Requirements

- 64-bit Windows 10/11.
- NVIDIA RTX GPU and a current NVIDIA driver.
- Roughly 8 GB VRAM for Q4, 10 GB for Q8, or 14 GB for BF16. More headroom is
  helpful for long songs and transcription.
- Internet access during installation.
- At least 15 GB free for Compact, 30 GB for Recommended, or 55 GB for Complete.

The interactive installer can use `winget` to install Git, Python 3.11, CMake,
Ninja, Visual Studio 2022 C++ Build Tools, the NVIDIA CUDA Toolkit, FFmpeg, and
optional Ollama. These tools are not bundled in this repository.

YuE2 support is newer than audio.cpp v0.7.3, so the installer builds a pinned,
tested revision of audio.cpp's `dev` branch. Model downloads are pinned too.
audio.cpp itself is not vendored.

## What is included

- The Whiskerwave Python server and browser GUI.
- Vendored SpessaSynth browser runtime and GeneralUser GS SoundFont for offline
  MIDI monitoring—no npm installation is needed.
- Interactive Windows install, model-management, update, and launch scripts.
- One example output: **Nine Lives in Production**, a Eurobeat song about a
  software-engineer cat. No other generated or downloaded songs are included.

Downloaded dependencies, model weights, runtime files, and new user libraries
are excluded by `.gitignore`.

## Using the studio

- **Compose:** enter sound direction and tagged lyrics, choose Full, Melody, or
  Direct planning, select a generation preset and model precision, then queue a
  song. A fixed seed reproduces a setup; random mode visibly rolls each request.
- **Lyric Assistant:** connects only to a local Ollama server. It can complete a
  brief, invent a whole song, brainstorm genres, draft, and revise. Assistant
  context never reaches YuE2 unless you explicitly send a result to Compose.
- **Transcribe / Remix:** SheetSage2 turns audio into YuE2-oriented ABC and MIDI.
  Compare the source and synthesized MIDI with the mix slider, edit the score,
  then send it to Compose in another genre.
- **Guide:** concise prompting/formatting practices and the official YuE2 demo
  catalog. Reference packs are downloaded only when requested.

Compose, Lyric Assistant, and Transcribe share one persistent queue so GPU-heavy
jobs run one at a time. Their results appear in separate local libraries.

### Ollama is optional

Music generation does not require Ollama. For the Lyric Assistant, install
[Ollama](https://ollama.com/), pull at least one chat model, and leave Ollama
running. For example:

```powershell
ollama pull qwen3:8b
```

Whiskerwave automatically lists models exposed at `http://127.0.0.1:11434`.
Set `OLLAMA_URL` before launch if your local server uses another address.

### Choose a GPU

The app uses CUDA device 0 by default. To choose another device, launch from
PowerShell:

```powershell
$env:YUE2_GPU = "1"
py -3.11 .\studio\server.py
```

Use `nvidia-smi` to see device indexes. Do not assume Windows Task Manager and
audio.cpp list multiple GPUs in the same order.

## Storage layout

```text
audio.cpp/                 downloaded source, build, and model weights
lyrics/                    saved Lyric Assistant results
outputs/                   generated songs and exact request metadata
transcriptions/            source audio, MIDI, ABC, and timed events
official-yue2-examples/    optional first-party reference packs
studio/runtime/            queue state, logs, caches, pending uploads
```

Deleting a library card in the GUI permanently removes its matching folder.
Keep backups of anything important.

## Troubleshooting

- **Installer cannot find a new prerequisite:** close the installer, restart
  Windows if requested, then rerun it.
- **Build fails:** confirm `nvcc --version`, `cmake --version`, and Visual Studio
  Build Tools with the Desktop C++ workload are installed.
- **CUDA out of memory:** close other GPU applications, use **Free VRAM**, choose
  Q4, shorten the song, or run transcription and generation separately.
- **Lyric Assistant is offline:** start Ollama and confirm `ollama list` shows a
  model.
- **Interrupted model download:** rerun the same installer/model-manager choice;
  `.part` downloads resume automatically.

## Release checks

The repository includes dependency-free smoke tests for the local HTTP security
boundary and resumable model downloads. Before packaging a release, run:

```powershell
python -m unittest discover -s tests -v
node --check studio/static/app.js
node --check studio/static/midi-player.js
```

A final release candidate should also be installed from a clean Windows folder
and exercised on an NVIDIA GPU because the CUDA build and model inference paths
cannot be covered by the lightweight source checks.

## License

Original Whiskerwave Studio code and documentation are available for
non-commercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Commercial use is not granted. Third-party software, model weights, the
SoundFont, and model-generated/reference media retain their own terms; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
