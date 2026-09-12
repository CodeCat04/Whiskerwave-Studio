import { WorkletSynthesizer } from "/spessasynth-lib.js";

const GM_PROGRAM = {
  acoustic_piano: 0,
  electric_piano: 4,
  chromatic_percussion: 9,
  organ: 19,
  acoustic_guitar: 24,
  clean_electric_guitar: 27,
  distorted_electric_guitar: 30,
  acoustic_bass: 32,
  electric_bass: 33,
  violin: 40,
  viola: 41,
  cello: 42,
  contrabass: 43,
  orchestral_harp: 46,
  timpani: 47,
  string_ensemble: 48,
  synth_strings: 50,
  voice: 52,
  orchestra_hit: 55,
  trumpet: 56,
  trombone: 57,
  tuba: 58,
  french_horn: 60,
  brass_section: 61,
  soprano_and_alto_sax: 65,
  tenor_sax: 66,
  baritone_sax: 67,
  oboe: 68,
  english_horn: 69,
  bassoon: 70,
  clarinet: 71,
  flutes: 73,
  synth_lead: 80,
  synth_pad: 89,
};

const DRUM_CHANNEL = 9;
const NOTE_VELOCITY = 100;

function fmtTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function eventsToNotes(payload) {
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
  const starts = new Map();
  const notes = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    // SheetSage2 stores every melody onset and its end time on a shared
    // beat/chord/structure timeline.
    if (Array.isArray(event.values?.melody)) {
      const start = Number(event.time);
      if (!Number.isFinite(start)) continue;
      for (const melody of event.values.melody) {
        const pitch = Number(melody?.pitch);
        const end = Number(melody?.end_time);
        const track = Number(melody?.track);
        if (Number.isFinite(pitch) && Number.isFinite(end) && end > start) {
          notes.push({
            pitch: Math.max(0, Math.min(127, Math.round(pitch))),
            start: Math.max(0, start),
            end,
            instrument: track === 0 ? "voice" : "acoustic_piano",
          });
        }
      }
      continue;
    }
    if (event.type === "start") {
      const index = Number(event.index);
      const pitch = Number(event.pitch);
      const start = Number(event.start_time);
      if (Number.isInteger(index) && Number.isFinite(pitch) && Number.isFinite(start)) {
        starts.set(index, {
          pitch: Math.max(0, Math.min(127, Math.round(pitch))),
          start: Math.max(0, start),
          instrument: String(event.instrument || "acoustic_piano"),
        });
      }
    } else if (event.type === "end") {
      const note = starts.get(Number(event.start_event_index));
      const end = Number(event.end_time);
      if (note && Number.isFinite(end)) {
        notes.push({ ...note, end: Math.max(note.start + 0.01, end) });
        starts.delete(Number(event.start_event_index));
      }
    }
  }
  return notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
}

class TranscriptionComparisonPlayer {
  constructor(elements) {
    this.audio = elements.audio;
    this.playButton = elements.playButton;
    this.seek = elements.seek;
    this.current = elements.current;
    this.durationLabel = elements.duration;
    this.mix = elements.mix;
    this.originalAmount = elements.originalAmount;
    this.midiAmount = elements.midiAmount;
    this.stereo = elements.stereo;
    this.status = elements.status;

    this.context = null;
    this.synth = null;
    this.enginePromise = null;
    this.notePromise = null;
    this.sourceNode = null;
    this.sourceGain = null;
    this.sourcePanner = null;
    this.midiGain = null;
    this.midiPanner = null;
    this.notes = [];
    this.channels = new Map();
    this.nextChannel = 0;
    this.cursor = 0;
    this.scheduler = null;
    this.frame = null;
    this.loadToken = 0;
    this.ready = false;
    this.item = null;

    this.playButton.addEventListener("click", () => this.togglePlayback());
    this.audio.addEventListener("play", () => this.onPlay());
    this.audio.addEventListener("pause", () => this.onPause());
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("loadedmetadata", () => this.updateTimeline());
    this.audio.addEventListener("durationchange", () => this.updateTimeline());
    this.seek.addEventListener("input", () => this.previewSeek());
    this.seek.addEventListener("change", () => this.commitSeek());
    this.mix.addEventListener("input", () => this.applyMix());
    this.stereo.addEventListener("change", () => this.applyMix());
    this.applyMixLabels();
    this.renderTimeline();
  }

  load(item) {
    const token = ++this.loadToken;
    this.stopPlayback();
    this.item = item;
    this.notes = [];
    this.ready = false;
    this.audio.src = `${item.source_url}?v=${encodeURIComponent(item.id || Date.now())}`;
    this.audio.load();
    this.seek.max = String(Number(item.duration_seconds) || 0);
    this.durationLabel.textContent = fmtTime(Number(item.duration_seconds));
    this.setStatus("Loading note events and instrument sounds…", "loading");

    // Start the engine in the background, but do not await it here: Chromium
    // may keep an AudioWorklet suspended until the user's first Play click.
    this.ensureEngine().catch((error) => {
      if (token !== this.loadToken) return;
      console.error("MIDI synthesizer failed:", error);
      this.setStatus(`MIDI playback unavailable: ${error.message}`, "error");
      this.applyOriginalOnly();
    });
    this.notePromise = (async () => {
      const response = await fetch(item.events_url);
      if (!response.ok) throw new Error(`Note events: HTTP ${response.status}`);
      const events = await response.json();
      if (token !== this.loadToken) return;
      this.notes = eventsToNotes(events);
      this.resetCursor(0);
      this.ready = true;
      this.setStatus(
        `${this.notes.length.toLocaleString()} MIDI notes ready · first Play finishes loading the instrument bank`,
        "ready",
      );
    })().catch((error) => {
      if (token !== this.loadToken) return;
      console.error("MIDI note loading failed:", error);
      this.setStatus(`Note events unavailable: ${error.message}`, "error");
      this.applyOriginalOnly();
    });
    return this.notePromise;
  }

  async ensureEngine() {
    if (this.enginePromise) return this.enginePromise;
    this.enginePromise = this.initializeEngine();
    return this.enginePromise;
  }

  async initializeEngine() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("This browser does not support Web Audio.");
    this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.sourceGain = this.context.createGain();
    this.sourcePanner = this.context.createStereoPanner();
    this.midiGain = this.context.createGain();
    this.midiPanner = this.context.createStereoPanner();
    this.sourceNode = this.context.createMediaElementSource(this.audio);
    this.sourceNode.connect(this.sourceGain).connect(this.sourcePanner).connect(this.context.destination);
    this.midiGain.connect(this.midiPanner).connect(this.context.destination);
    this.applyMix();

    const soundfontRequest = fetch("/GeneralUserGS.sf3").then((response) => {
      if (!response.ok) throw new Error(`SoundFont: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    await this.context.audioWorklet.addModule("/spessasynth_processor.min.js");
    const synth = new WorkletSynthesizer(this.context);
    synth.connect(this.midiGain);
    await synth.isReady;
    await synth.soundBankManager.addSoundBank(await soundfontRequest, "MuseScore_General");
    this.synth = synth;
    return synth;
  }

  async togglePlayback() {
    if (!this.item) return;
    if (!this.audio.paused) {
      this.audio.pause();
      return;
    }
    this.playButton.disabled = true;
    try {
      const engine = this.ensureEngine();
      // Resume before awaiting synth.isReady; Chromium does not initialize an
      // AudioWorklet while its AudioContext is suspended.
      await this.context.resume();
      this.setStatus("Finishing the local instrument bank…", "loading");
      await Promise.all([engine, this.notePromise]);
      if (!this.ready) throw new Error("The transcription notes are not available.");
      this.setStatus(
        `${this.notes.length.toLocaleString()} MIDI notes ready · drag the mix while it plays`,
        "ready",
      );
      if (this.audio.ended || this.audio.currentTime >= this.audio.duration - 0.02) {
        this.audio.currentTime = 0;
      }
      this.resetCursor(this.audio.currentTime);
      await this.audio.play();
    } catch (error) {
      console.error("Could not start comparison playback:", error);
      this.setStatus(`Could not start playback: ${error.message}`, "error");
    } finally {
      this.playButton.disabled = false;
    }
  }

  onPlay() {
    this.playButton.textContent = "❚❚";
    this.playButton.setAttribute("aria-label", "Pause comparison");
    this.resetCursor(this.audio.currentTime);
    clearInterval(this.scheduler);
    this.scheduler = setInterval(() => this.scheduleAhead(), 20);
    this.scheduleAhead();
    this.startTimelineFrame();
  }

  onPause() {
    this.playButton.textContent = "▶";
    this.playButton.setAttribute("aria-label", "Play comparison");
    clearInterval(this.scheduler);
    this.scheduler = null;
    this.synth?.stopAll();
    this.renderTimeline();
  }

  onEnded() {
    this.onPause();
    this.audio.currentTime = 0;
    this.resetCursor(0);
    this.renderTimeline();
  }

  stopPlayback() {
    this.audio.pause();
    clearInterval(this.scheduler);
    this.scheduler = null;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.synth?.stopAll();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.playButton.textContent = "▶";
  }

  pausePlayback() {
    this.audio.pause();
    clearInterval(this.scheduler);
    this.scheduler = null;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.synth?.stopAll();
    this.playButton.textContent = "▶";
    this.playButton.setAttribute("aria-label", "Play comparison");
  }

  scheduleAhead() {
    if (!this.ready || !this.synth || this.audio.paused) return;
    const position = this.audio.currentTime;
    const horizon = position + 0.08;
    const now = this.context.currentTime;
    while (this.cursor < this.notes.length && this.notes[this.cursor].start <= horizon) {
      const note = this.notes[this.cursor++];
      if (note.end <= position - 0.02) continue;
      const startAt = now + Math.max(0.005, note.start - position);
      const remaining = note.end - Math.max(note.start, position);
      const channel = this.channelFor(note.instrument);
      this.synth.noteOn(channel, note.pitch, NOTE_VELOCITY, { time: startAt });
      this.synth.noteOff(channel, note.pitch, { time: startAt + Math.max(0.03, remaining) });
    }
  }

  channelFor(instrument) {
    if (this.channels.has(instrument)) return this.channels.get(instrument);
    let channel;
    if (instrument === "drums") {
      channel = DRUM_CHANNEL;
    } else {
      channel = this.nextChannel++;
      if (channel === DRUM_CHANNEL) channel = this.nextChannel++;
      if (this.nextChannel === DRUM_CHANNEL) this.nextChannel++;
      while (channel >= this.synth.channelCount) this.synth.addNewChannel();
      this.synth.programChange(channel, GM_PROGRAM[instrument] ?? 0);
    }
    this.channels.set(instrument, channel);
    return channel;
  }

  resetCursor(position) {
    this.synth?.stopAll();
    let low = 0;
    let high = this.notes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.notes[middle].start < position) low = middle + 1;
      else high = middle;
    }
    this.cursor = low;
    for (let index = low - 1; index >= 0; index--) {
      const note = this.notes[index];
      if (note.start < position - 12) break;
      if (note.end > position) {
        const channel = this.channelFor(note.instrument);
        const at = this.context?.currentTime + 0.005;
        this.synth?.noteOn(channel, note.pitch, NOTE_VELOCITY, { time: at });
        this.synth?.noteOff(channel, note.pitch, { time: at + Math.max(0.03, note.end - position) });
      }
    }
  }

  previewSeek() {
    this.current.textContent = fmtTime(Number(this.seek.value));
  }

  commitSeek() {
    const wasPlaying = !this.audio.paused;
    this.audio.currentTime = Number(this.seek.value);
    this.resetCursor(this.audio.currentTime);
    if (wasPlaying) this.scheduleAhead();
    this.renderTimeline();
  }

  updateTimeline() {
    const duration = Number.isFinite(this.audio.duration)
      ? this.audio.duration
      : Number(this.item?.duration_seconds) || 0;
    this.seek.max = String(duration);
    this.durationLabel.textContent = fmtTime(duration);
    this.renderTimeline();
  }

  renderTimeline() {
    const position = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    if (document.activeElement !== this.seek) this.seek.value = String(position);
    this.current.textContent = fmtTime(position);
  }

  startTimelineFrame() {
    cancelAnimationFrame(this.frame);
    const update = () => {
      this.renderTimeline();
      if (!this.audio.paused) this.frame = requestAnimationFrame(update);
    };
    this.frame = requestAnimationFrame(update);
  }

  applyMixLabels() {
    const midi = Number(this.mix.value);
    this.originalAmount.textContent = `${100 - midi}%`;
    this.midiAmount.textContent = `${midi}%`;
  }

  applyMix() {
    this.applyMixLabels();
    const stereo = this.stereo.checked;
    this.mix.disabled = stereo;
    const midiAmount = Number(this.mix.value) / 100;
    if (!this.context || !this.sourceGain) return;
    const now = this.context.currentTime;
    if (stereo) {
      this.sourceGain.gain.setTargetAtTime(1, now, 0.01);
      this.midiGain.gain.setTargetAtTime(0.5, now, 0.01);
      this.sourcePanner.pan.setTargetAtTime(-1, now, 0.01);
      this.midiPanner.pan.setTargetAtTime(1, now, 0.01);
    } else {
      this.sourceGain.gain.setTargetAtTime(1 - midiAmount, now, 0.01);
      this.midiGain.gain.setTargetAtTime(midiAmount, now, 0.01);
      this.sourcePanner.pan.setTargetAtTime(0, now, 0.01);
      this.midiPanner.pan.setTargetAtTime(0, now, 0.01);
    }
  }

  applyOriginalOnly() {
    if (!this.context || !this.sourceGain) return;
    const now = this.context.currentTime;
    this.sourceGain.gain.setTargetAtTime(1, now, 0.01);
    this.midiGain.gain.setTargetAtTime(0, now, 0.01);
  }

  setStatus(message, state) {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }
}

window.TranscriptionComparisonPlayer = TranscriptionComparisonPlayer;
window.dispatchEvent(new Event("transcription-player-ready"));
