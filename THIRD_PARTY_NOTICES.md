# Licensing scope and third-party notices

The root `LICENSE` applies to the original Whiskerwave Studio application code,
interface, launchers, and documentation in this project. It permits
non-commercial use, modification, and redistribution under the PolyForm
Noncommercial License 1.0.0. It does not relicense third-party components,
model weights, downloaded reference examples, or user-provided/generated media.

Third-party material retains its own license and attribution, including:

- `audio.cpp/` is not distributed in this repository. The installer clones it
  from <https://github.com/0xShug0/audio.cpp>; it is Apache License 2.0 and its
  own license is retained in the downloaded checkout.
- The SpessaSynth browser runtime in `studio/static/` is derived from
  <https://github.com/spessasus/SpessaSynth> and is Apache License 2.0; see
  `studio/static/LICENSE-SpessaSynth.txt`.
- `studio/static/GeneralUserGS.sf3` is the compressed GeneralUser GS SoundFont
  by S. Christian Collins distributed with SpessaSynth. It retains the terms
  supplied by its author and is not covered by the Whiskerwave license.
- YuE2, SheetSage2, and MERT model weights: use the terms published
  with each model distribution. The installers download weights from their
  respective Hugging Face repositories; those weights are not covered by the
  Whiskerwave Studio license.
- Files downloaded from the official YuE2 demo into
  `official-yue2-examples/`: remain official YuE2 reference material and are not
  relicensed by Whiskerwave Studio.
- `outputs/nine-lives-in-production/audio.wav` is a YuE2-generated demonstration
  bundled with Whiskerwave Studio. Its inclusion does not relicense YuE2 or its
  model weights.

This notice is a scope statement, not a replacement for any third-party license.
