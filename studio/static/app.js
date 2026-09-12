const $ = (selector) => document.querySelector(selector);
const form = $('#generate-form');
const style = $('#style');
const lyrics = $('#lyrics');
const title = $('#title');
const abc = $('#abc');
const generateButton = $('#generate-button');
const errorBox = $('#form-error');
const idleState = $('#idle-state');
const runningState = $('#running-state');
const resultState = $('#result-state');
const timer = $('#timer');
let timerHandle = null;
let startedAt = 0;
let latestResult = null;
let assistantTimerHandle = null;
let assistantStartedAt = 0;
let assistantSaveHandle = null;
let transcriptionTimerHandle = null;
let transcriptionStartedAt = 0;
let latestTranscription = null;
let modelProfilesLoaded = false;
let transcriptionComparison = null;
let studioStatus = null;
let queueRefreshBusy = false;
let queueUiInitialized = false;
let knownQueueStates = new Map();
let draggedQueueId = null;
let listeningRoomItems = [];
const THEMES = new Set(['studio', 'midnight', 'light', 'yotsuba', 'yotsuba-b', 'futaba', 'burichan']);

function applyTheme(theme, persist = true) {
  const selected = THEMES.has(theme) ? theme : 'studio';
  document.documentElement.dataset.theme = selected;
  $('#theme-select').value = selected;
  document.querySelector('meta[name="color-scheme"]').content = ['studio', 'midnight'].includes(selected) ? 'dark' : 'light';
  if (persist) localStorage.setItem('yue2-studio-theme', selected);
}

function syncIntro(intro, minimized) {
  intro.classList.toggle('minimized', minimized);
  const button = intro.querySelector('.intro-toggle');
  button.textContent = minimized ? 'Show intro' : 'Minimize intro';
  button.setAttribute('aria-expanded', String(!minimized));
}

function initializeIntros() {
  document.querySelectorAll('.tab-intro').forEach((intro) => {
    const key = `yue2-intro-${intro.id}-minimized`;
    const saved = localStorage.getItem(key);
    syncIntro(intro, saved === null ? true : saved === 'true');
    intro.querySelector('.intro-toggle').addEventListener('click', () => {
      const minimized = !intro.classList.contains('minimized');
      syncIntro(intro, minimized);
      localStorage.setItem(key, String(minimized));
    });
  });
}

function initializeTranscriptionComparison() {
  if (transcriptionComparison || !window.TranscriptionComparisonPlayer) return;
  transcriptionComparison = new window.TranscriptionComparisonPlayer({
      audio: $('#transcription-source'),
      playButton: $('#comparison-play'),
      seek: $('#comparison-seek'),
      current: $('#comparison-current'),
      duration: $('#comparison-duration'),
      mix: $('#comparison-mix'),
      originalAmount: $('#comparison-original-amount'),
      midiAmount: $('#comparison-midi-amount'),
      stereo: $('#comparison-stereo'),
      status: $('#comparison-status'),
    });
  if (latestTranscription) transcriptionComparison.load(latestTranscription);
}

initializeTranscriptionComparison();
window.addEventListener('transcription-player-ready', initializeTranscriptionComparison);

const example = {
  title: 'Nine Lives in Production',
  style: 'English, Eurobeat, playful high-energy night-drive mood, 155 BPM, driving four-on-the-floor kick, galloping synth bass, bright saw-lead arpeggios, distorted rhythm guitar, agile confident tenor vocal, stacked shout harmonies, dramatic risers, glossy wide 1990s dance mix',
  lyrics: `[Intro]\nGreen lights, blue screen\nShip it like a midnight dream\n\n[Verse]\nPaws on the keyboard, moon in the glass\nChasing down a bug and I’m moving fast\nCoffee went cold but the build runs clean\nLittle black cat in a coding machine\n\n[Pre-Chorus]\nOne more function, one more sign\nEvery warning turns to green in time\n\n[Chorus]\nVibe code, ride the neon line\nNine lives running and the night is mine\nPush to production, hear that engine purr\nFast little changes in a digital blur\nVibe code, no looking back\nTail in the air on a midnight track\n\n[Verse]\nRubber-duck talking to the dashboard glow\nI don’t know the road, but the instincts know\nTests all passing as the sunrise starts\nShipping tiny miracles in modular parts\n\n[Pre-Chorus]\nOne more function, one more sign\nEvery warning turns to green in time\n\n[Chorus]\nVibe code, ride the neon line\nNine lives running and the night is mine\nPush to production, hear that engine purr\nFast little changes in a digital blur\nVibe code, no looking back\nTail in the air on a midnight track\n\n[Bridge]\nIf the server falls, I land on my feet\nPatch the broken rhythm, bring it back on beat\n\n[Chorus]\nVibe code, ride the neon line\nNine lives running and the night is mine\nPush to production, hear that engine purr\nFast little changes in a digital blur\nVibe code, no looking back\nTail in the air on a midnight track\n\n[Outro]\nGreen lights, blue screen\nShip it like a midnight dream`,
};

const demonstratedGenres = [
  'Afro Trap', 'Afro-Jazz', 'Alternative Dance', 'Ambient', 'Arabic Pop', 'Bachata', 'Barbershop', 'Bhangra',
  'Big Band', 'Bluegrass', 'Boogie Woogie', 'Boy Band', 'Celtic Rock', 'Christian Rock', 'City Pop',
  'Classical Music', 'Comedy', 'Cool Jazz', 'Country Gospel', 'Country Pop', 'Country Rock', 'Cyber Metal',
  'Dance-Pop', 'Dance-Punk', 'Dark Ambient', 'Disco', 'Dixieland', 'Easy Listening', 'Electronic Dance Music',
  'Electropop', 'Emo', 'Emo-Pop', 'Enka', 'Ethio-Jazz', 'Eurobeat', 'Flamenco', 'Folktronica', 'Funk',
  'Funk Rock', 'Glam Metal', 'Grime', 'Heartland Rock', 'Hi-NRG', 'Honky Tonk', 'Indie Rock',
  'Industrial Hip Hop', 'Industrial Metal', 'Italo-Disco', 'Jazz-Funk', 'Jazz-Rock', 'J-Pop', 'Jump Blues',
  'Lo-Fi Hip Hop', 'Metal', 'Nu-Disco', 'Pop Rock', 'R&B', 'Rap Metal', 'Reggaetón', 'Rock & Roll',
  'Soft Rock', 'Soul', 'Soul Blues', 'Southern Gospel', 'Southern Soul', 'Space Rock', 'Swing',
  'Swing Revival', 'Thrash Metal', 'Yacht Rock',
];

const officialExamples = [
  { title: '今晚不眠 (Tonight Awake)', genre: 'City Pop / Nu-Disco', language: 'Mandarin', mode: 'Full plan', source: 'Official YuE2', style: 'City Pop, upbeat, danceable, groovy bass, electric guitar, synth, energetic, joyful, neon city night' },
  { title: 'Easy Listening', genre: 'Easy Listening', language: 'Japanese', mode: 'Full plan', source: 'Official YuE2 catalog', style: 'Japanese, gentle melancholic easy listening, delicate piano melody, breathy expressive flute, soft clear female vocal, downtempo lo-fi hip-hop beat, warm bassline, atmospheric synth pads, tranquil introspective mix' },
  { title: 'Jump Blues', genre: 'Jump Blues', language: 'English', mode: 'Full plan', source: 'Official YuE2 catalog', style: 'English, swinging 160 BPM jump blues, honking sax section, walking upright slap bass, boogie-woogie piano, shiny archtop chops, brass punches, crowd-shout hooks, dance-floor fire' },
  { title: 'Bluegrass', genre: 'Bluegrass', language: 'English', mode: 'Direct', source: 'Official YuE2 catalog', style: 'English, lively bluegrass, brisk banjo picking, fiddle motifs, upright bass, acoustic guitar, mandolin, harmonica, festive group harmonies, handclaps, spirited live ensemble' },
  { title: 'Barbershop', genre: 'Barbershop', language: 'English', mode: 'Full plan', source: 'Official YuE2 catalog', style: 'English, upbeat 1940s barbershop quartet a cappella, lead tenor baritone and bass male voices, playful swing rhythm, finger snaps, bright close harmonies, crisp phrasing, vintage nightclub mix' },
  { title: 'Dark New Wave', genre: 'Alternative Dance', language: 'English', mode: 'Full plan', source: 'Official YuE2 catalog', style: 'English, dark synthpop, 1980s new wave and darkwave, mid-tempo hypnotic groove, driving analog synth bass, classic drum machine, minimalist verses, emotional chorus lift, atmospheric pads, intimate vocal' },
  { title: 'Sunrise Demo', genre: 'Indie Pop', language: 'English', mode: 'Direct', source: 'Official audio.cpp demo', style: 'English, indie pop, bright acoustic guitar, soft drums, warm lead vocal, polished demo mix' },
  { title: 'Skyline Demo', genre: 'Piano Pop', language: 'English', mode: 'Full plan', source: 'Official audio.cpp demo', style: 'English, piano pop, clear lead vocal, gentle bass, soft drums, warm chorus harmonies' },
  { title: 'Jazz-Funk Cover Demo', genre: 'Jazz-Funk', language: 'English', mode: 'Melody', source: 'Official audio.cpp demo', style: 'English, jazz funk cover, warm Rhodes, round bass, light drums, relaxed vocal, clean live band feel' },
];
let officialCatalogExamples = [];
let officialCatalogLoaded = false;
let officialExampleLimit = 24;

const generationPresets = {
  default: { label: 'Recommended baseline', steps: 32, cfg: 1.0, semanticTemp: 1.0, semanticTopP: 0.95, semanticTopK: 100, abcTemp: 0.7, abcTopP: 0.9, abcTopK: 30 },
  controlled: { label: 'Tighter choices and more consistency', steps: 32, cfg: 1.1, semanticTemp: 0.85, semanticTopP: 0.9, semanticTopK: 60, abcTemp: 0.55, abcTopP: 0.85, abcTopK: 20 },
  semi: { label: 'Noticeably broader musical choices', steps: 32, cfg: 1.0, semanticTemp: 1.15, semanticTopP: 0.97, semanticTopK: 160, abcTemp: 0.85, abcTopP: 0.94, abcTopK: 45 },
  very: { label: 'Maximum variation; coherence may drop', steps: 32, cfg: 1.0, semanticTemp: 1.4, semanticTopP: 0.99, semanticTopK: 300, abcTemp: 1.05, abcTopP: 0.98, abcTopK: 90 },
  draft: { label: 'Fast flow preview with default sampling', steps: 8, cfg: 1.0, semanticTemp: 1.0, semanticTopP: 0.95, semanticTopK: 100, abcTemp: 0.7, abcTopP: 0.9, abcTopK: 30 },
};

const settingInfo = {
  title: ['Song title', 'The filename and Listening room label. It is metadata only and does not currently guide YuE2.', 'Put musical or lyrical direction in Sound direction instead.'],
  model: ['YuE2 model profile', 'All three profiles are the same YuE2-3B checkpoint at different precision. Q8 is the recommended balance; BF16 uses more memory for maximum numerical fidelity; Q4 is smallest and may alter detail or voice.', 'Changing precision can change the result even with the same seed.'],
  style: ['Sound direction', 'The only text YuE2 receives about genre, tempo, instruments, vocals, mood, and production. A useful order is language, primary genre, mood, BPM, instruments, vocal character, then mix.', 'Be specific and coherent. Conflicting styles and multiple vocal descriptions reduce control.'],
  lyrics: ['Lyrics', 'The singable text and section structure. Use simple headers such as [Verse], [Pre-Chorus], [Chorus], [Bridge], [Instrumental], and [Outro]. Song length follows this structure and the token ceiling.', 'Keep BPM, instruments, explanations, and mix notes out of this box.'],
  planning: ['Planning mode', 'Full writes melody and chords before audio and is the normal choice for an original song. Melody is intended for a supplied tune or cover. Direct skips the symbolic score for faster experiments.', 'Use Full unless you have a specific reason to preserve a melody or skip planning.'],
  abc: ['ABC score conditioning', 'An optional symbolic melody/chord score. With Melody mode, supply melody without chord symbols when you want flexible reharmonization. Full can preserve both melody and chords.', 'A supplied score strongly anchors melody, so remove it when seeking a substantially different composition.'],
  settings: ['Generation settings', 'These controls govern inference quality, randomness, prompt guidance, and maximum token counts. The preset menu changes the related sampling controls together.', 'Start with Default or Semi-creative. Change one control at a time when diagnosing results.'],
  preset: ['Generation preset', 'Applies a coordinated set of flow steps, CFG, and music/score sampling values. It never changes the model, lyrics, style, token ceilings, planning mode, or seed behavior.', 'Semi-creative is a sensible first step for more variety. Very creative trades predictability and lyric accuracy for exploration.'],
  'seed-mode': ['Seed behavior', 'Random rolls and visibly displays a new seed every time Generate is clicked. Fixed reuses the exact value until you change it.', 'Use Random for new ideas. Use Fixed for reproducing a take or comparing one controlled setting change.'],
  seed: ['Seed value', 'The initial random state for the musical generation. Identical inputs and profile with a fixed seed are intended to be repeatable; changing it can alter melody, arrangement, and vocal identity.', 'In Random mode, clicking Generate rolls this box first so it shows the exact seed being used for that take.'],
  steps: ['Flow steps', 'Controls the acoustic flow-matching stage. More steps can improve refinement but take longer. This is primarily a quality/speed control, not a creativity control.', 'Use 32 for final work, 16 for quicker comparisons, and 8 for rough previews.'],
  cfg: ['CFG scale', 'Classifier-free guidance controls how strongly semantic generation follows the text condition. Full and Melody default to 1.0; Direct uses 1.01. Excessive guidance can destabilize the result.', 'The official model card suggests 1.2 only as an experiment for stronger text guidance.'],
  'semantic-max': ['Song token limit', 'A maximum ceiling for semantic music tokens. It prevents runaway generation but is not a precise duration slider; lyrics and score structure still drive length.', 'Keep 9000 for normal songs. Lower it only to deliberately cap output; truncation can cause abrupt endings.'],
  'semantic-temp': ['Music temperature', 'Controls randomness while YuE2 chooses semantic music tokens. Higher values explore less likely choices; lower values are more conservative.', 'Default is 1.0. Semi-creative uses 1.15 and Very creative uses 1.4. High values can reduce coherence or lyric accuracy.'],
  'semantic-top-p': ['Music top-p', 'Nucleus sampling keeps the smallest candidate set whose combined probability reaches this value. Raising it allows a broader pool of music-token choices.', 'Use temperature as the main creativity knob and top-p as a supporting limit.'],
  'semantic-top-k': ['Music top-k', 'Limits each semantic choice to the K most likely candidates. A larger number permits more unusual musical continuations; a smaller number is more focused.', 'The default is 100. Creative presets raise it together with temperature and top-p.'],
  'abc-max': ['Score token limit', 'The maximum number of tokens YuE2 may spend writing its ABC melody/chord plan. It is a safety ceiling, not an exact number of measures.', 'Keep 4096 for full songs. Too low can truncate the score before the intended ending.'],
  'abc-temp': ['Score temperature', 'Controls randomness in generated melody, rhythm, and harmony during symbolic planning. It has no practical role in Direct mode and less relevance when a complete score is supplied.', 'Raise moderately for broader compositions; extreme values can weaken musical structure.'],
  'abc-top-p': ['Score top-p', 'Nucleus sampling limit for the symbolic score. Higher values admit more possible melody/chord tokens; lower values favor common score continuations.', 'Adjust it with Score temperature rather than treating it as an independent quality control.'],
  'abc-top-k': ['Score top-k', 'Caps symbolic planning to the K most likely score tokens at each step. Higher values permit more unusual melodic and harmonic decisions.', 'The default is 30. Creative presets increase it while keeping values within a practical range.'],
};

function updateCounts() {
  $('#style-count').textContent = `${style.value.length} / 2000`;
  $('#lyrics-count').textContent = `${lyrics.value.length.toLocaleString()} characters`;
}

function selectedMode() {
  return form.elements.cot.value;
}

function syncCfg() {
  const cfg = $('#cfg');
  if (cfg.dataset.edited !== 'true') cfg.value = selectedMode() === 'off' ? '1.01' : '1.0';
  const hasScore = abc.value.trim().length > 0;
  const direct = selectedMode() === 'off';
  if (direct && hasScore) {
    errorBox.textContent = 'ABC conditioning is disabled in Direct mode. Choose Melody or Full.';
    errorBox.hidden = false;
  } else if (errorBox.textContent.includes('ABC conditioning')) {
    errorBox.hidden = true;
  }
}

function syncSeedMode() {
  const fixed = $('#seed-mode').value === 'fixed';
  $('#seed').readOnly = !fixed;
  $('#seed-use-label').textContent = fixed ? 'reused every song' : 'rerolls on Generate';
}

function rollSeed() {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  const value = 1 + (randomValue[0] % 2147483646);
  $('#seed').value = value;
  return value;
}

function updatePresetSummary() {
  const selected = $('#generation-preset').value;
  $('#preset-summary').textContent = generationPresets[selected]?.label || 'Manually edited values';
}

function applyGenerationPreset(name, persist = true) {
  const preset = generationPresets[name];
  if (!preset) return;
  const values = {
    steps: preset.steps,
    cfg: selectedMode() === 'off' && name === 'default' ? 1.01 : preset.cfg,
    'semantic-temp': preset.semanticTemp,
    'semantic-top-p': preset.semanticTopP,
    'semantic-top-k': preset.semanticTopK,
    'abc-temp': preset.abcTemp,
    'abc-top-p': preset.abcTopP,
    'abc-top-k': preset.abcTopK,
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  $('#generation-preset').value = name;
  $('#cfg').dataset.edited = name === 'default' ? 'false' : 'true';
  updatePresetSummary();
  if (persist) saveDraft();
}

function markPresetCustom() {
  $('#generation-preset').value = 'custom';
  $('#cfg').dataset.edited = 'true';
  updatePresetSummary();
  saveDraft();
}

function showSettingInfo(key) {
  const copy = settingInfo[key];
  if (!copy) return;
  $('#info-title').textContent = copy[0];
  $('#info-body').textContent = copy[1];
  $('#info-tip').textContent = `Practical tip: ${copy[2]}`;
  $('#info-dialog').showModal();
}

function updateModelDescription() {
  const option = $('#yue-model').selectedOptions[0];
  $('#model-description').textContent = option?.dataset.description || 'One YuE2-3B checkpoint is available in several precision profiles.';
}

function fmtTime(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function beginTimer() {
  startedAt = Date.now();
  timer.textContent = '00:00';
  clearInterval(timerHandle);
  timerHandle = setInterval(() => { timer.textContent = fmtTime((Date.now() - startedAt) / 1000); }, 1000);
}

function stopTimer(seconds) {
  clearInterval(timerHandle);
  timerHandle = null;
  if (seconds !== undefined) timer.textContent = fmtTime(seconds);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function queueKindLabel(job) {
  if (job.kind === 'compose') return 'Compose';
  if (job.kind === 'transcription') return 'Transcribe';
  const labels = { surprise: 'Assistant · creative brief', complete_surprise: 'Assistant · complete surprise', brainstorm: 'Assistant · genres', draft: 'Assistant · lyrics', revise: 'Assistant · revision' };
  return labels[job.assistant_mode] || 'Lyric Assistant';
}

function showQueuePanel() {
  const panel = $('#work-queue');
  panel.classList.remove('collapsed');
  $('#queue-collapse').textContent = '−';
  $('#queue-collapse').setAttribute('aria-expanded', 'true');
  localStorage.setItem('whiskerwave-queue-collapsed', 'false');
  requestAnimationFrame(() => {
    if (panel.style.right !== 'auto') return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - panel.offsetHeight - 8))}px`;
  });
}

async function queuePost(url, body = {}) {
  return requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function cancelQueueItem(job) {
  if (!confirm(`Cancel the waiting ${queueKindLabel(job)} job “${job.title}”?`)) return;
  try {
    await queuePost('/api/queue/cancel', { id: job.id });
    await refreshQueue();
  } catch (error) {
    alert(error.message);
  }
}

async function sendQueueOrder(ids) {
  try {
    await queuePost('/api/queue/reorder', { ids });
    await refreshQueue();
  } catch (error) {
    await refreshQueue();
    alert(error.message);
  }
}

function pendingQueueIds() {
  return [...document.querySelectorAll('#queue-pending .queue-item')].map((item) => item.dataset.id);
}

function moveQueueItem(job, direction) {
  const ids = pendingQueueIds();
  const index = ids.indexOf(job.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  sendQueueOrder(ids);
}

async function openQueueResult(job) {
  const tab = job.result_tab === 'assistant' ? 'assistant' : job.result_tab === 'transcribe' ? 'transcribe' : 'compose';
  if (tab === 'compose') {
    const records = await loadHistory();
    const item = records.find((record) => record.id === job.result_id);
    if (item) showResult(item);
    switchTab(tab);
    (item ? resultState : $('#history')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (tab === 'assistant') {
    const records = await loadLyricsHistory();
    const item = records.find((record) => record.id === job.result_id);
    if (item) restoreLyricsToAssistant(item);
    else {
      switchTab(tab);
      $('#lyrics-history').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    const records = await loadTranscriptions();
    const item = records.find((record) => record.id === job.result_id);
    if (item) showTranscription(item);
    switchTab(tab);
    (item ? $('#transcription-result') : $('#transcription-history')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function queueItemCard(job, pendingJobs = []) {
  const card = document.createElement('article');
  card.className = `queue-item ${job.status}`;
  card.dataset.id = job.id;
  card.dataset.status = job.status;
  if (job.status === 'pending') {
    card.draggable = true;
    card.addEventListener('dragstart', (event) => {
      draggedQueueId = job.id;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', job.id);
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!draggedQueueId || draggedQueueId === job.id) return;
      const dragging = document.querySelector(`#queue-pending .queue-item[data-id="${draggedQueueId}"]`);
      if (!dragging) return;
      const before = event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
      $('#queue-pending').insertBefore(dragging, before ? card : card.nextSibling);
    });
    card.addEventListener('drop', (event) => { event.preventDefault(); sendQueueOrder(pendingQueueIds()); });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); draggedQueueId = null; });
  }
  const order = document.createElement('span'); order.className = 'queue-order';
  order.textContent = job.status === 'pending' ? String(job.position || '') : job.status === 'processing' ? '▶' : job.status === 'completed' ? '✓' : '!';
  const main = document.createElement('div'); main.className = 'queue-item-main';
  const kind = document.createElement('em'); kind.className = 'queue-kind'; kind.textContent = queueKindLabel(job);
  const titleText = document.createElement('b'); titleText.textContent = job.title || queueKindLabel(job);
  const detail = document.createElement('span'); detail.textContent = job.status === 'failed' ? job.error || 'Job failed' : job.detail || '';
  main.append(kind, titleText, detail);
  const controls = document.createElement('div'); controls.className = 'queue-item-controls';
  if (job.status === 'pending') {
    const index = pendingJobs.findIndex((item) => item.id === job.id);
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Move earlier'; up.disabled = index <= 0; up.addEventListener('click', () => moveQueueItem(job, -1));
    const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.title = 'Move later'; down.disabled = index < 0 || index >= pendingJobs.length - 1; down.addEventListener('click', () => moveQueueItem(job, 1));
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'queue-cancel'; cancel.textContent = '×'; cancel.title = 'Cancel waiting job'; cancel.addEventListener('click', () => cancelQueueItem(job));
    controls.append(up, down, cancel);
  } else if (job.status === 'completed') {
    const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View'; view.addEventListener('click', () => openQueueResult(job)); controls.append(view);
  } else {
    const state = document.createElement('span'); state.className = `queue-state ${job.status}`; state.textContent = job.status; controls.append(state);
  }
  card.append(order, main, controls);
  return card;
}

async function refreshQueue() {
  if (queueRefreshBusy) return;
  queueRefreshBusy = true;
  try {
    const data = await requestJson('/api/queue');
    const items = Array.isArray(data.items) ? data.items : [];
    const active = items.filter((item) => item.status === 'processing');
    const pending = items.filter((item) => item.status === 'pending').sort((a, b) => a.position - b.position);
    const finished = items.filter((item) => ['completed', 'failed'].includes(item.status)).slice(-8).reverse();
    $('#queue-active').replaceChildren(...active.map((item) => queueItemCard(item, pending)));
    $('#queue-pending').replaceChildren(...pending.map((item) => queueItemCard(item, pending)));
    $('#queue-finished-list').replaceChildren(...finished.map((item) => queueItemCard(item, pending)));
    $('#queue-finished').hidden = !finished.length;
    $('#queue-clear-finished').disabled = !finished.length;
    if (!active.length && !pending.length) {
      const empty = document.createElement('p'); empty.className = 'queue-empty'; empty.textContent = 'Nothing waiting. Add work from any tab.';
      $('#queue-pending').append(empty);
    }
    $('#queue-summary').textContent = active.length
      ? `${queueKindLabel(active[0])} running · ${pending.length} waiting`
      : pending.length ? `${pending.length} waiting` : 'Nothing waiting';
    if ($('#unload-button').textContent !== 'Freeing…') {
      $('#unload-button').disabled = Boolean(active.length);
      $('#unload-button').title = active.length ? 'Wait for the active queued job to finish' : 'Unload model weights from VRAM';
    }

    if (queueUiInitialized) {
      const newlyFinished = items.filter((item) => ['completed', 'failed'].includes(item.status) && !['completed', 'failed'].includes(knownQueueStates.get(item.id)));
      const composeFinished = newlyFinished.filter((item) => item.kind === 'compose' && item.status === 'completed');
      if (composeFinished.length) {
        const records = await loadHistory();
        const complete = composeFinished.at(-1);
        const result = records.find((item) => item.id === complete.result_id);
        if (result) showResult(result);
      }
      const assistantFinished = newlyFinished.filter((item) => item.kind === 'assistant' && item.status === 'completed');
      if (assistantFinished.length) {
        const records = await loadLyricsHistory();
        const complete = assistantFinished.filter((item) => item.assistant_mode === 'complete_surprise').at(-1);
        const result = complete ? records.find((item) => item.id === complete.result_id) : null;
        if (result) restoreLyricsToAssistant(result, false);
      }
      const transcriptionFinished = newlyFinished.filter((item) => item.kind === 'transcription' && item.status === 'completed');
      if (transcriptionFinished.length) {
        const records = await loadTranscriptions();
        const complete = transcriptionFinished.at(-1);
        const result = records.find((item) => item.id === complete.result_id);
        if (result) showTranscription(result);
      }
      if (newlyFinished.length) $('#queue-finished').open = true;
    }
    knownQueueStates = new Map(items.map((item) => [item.id, item.status]));
    queueUiInitialized = true;
  } catch (error) {
    $('#queue-summary').textContent = 'Queue unavailable';
  } finally {
    queueRefreshBusy = false;
  }
}

function initializeQueuePanel() {
  const panel = $('#work-queue');
  const clampPanel = () => {
    if (panel.style.right !== 'auto') return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - panel.offsetHeight - 8))}px`;
  };
  const collapsed = localStorage.getItem('whiskerwave-queue-collapsed') === 'true';
  panel.classList.toggle('collapsed', collapsed);
  $('#queue-collapse').textContent = collapsed ? '+' : '−';
  $('#queue-collapse').setAttribute('aria-expanded', String(!collapsed));
  try {
    const saved = JSON.parse(localStorage.getItem('whiskerwave-queue-position'));
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
      panel.style.left = `${Math.max(8, Math.min(saved.left, innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(saved.top, innerHeight - panel.offsetHeight - 8))}px`;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }
  } catch (_) { /* Use the default bottom-right position. */ }
  $('#queue-collapse').addEventListener('click', () => {
    const next = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', next);
    $('#queue-collapse').textContent = next ? '+' : '−';
    $('#queue-collapse').setAttribute('aria-expanded', String(!next));
    localStorage.setItem('whiskerwave-queue-collapsed', String(next));
    requestAnimationFrame(clampPanel);
  });
  const handle = $('#queue-drag-handle');
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`; panel.style.right = 'auto'; panel.style.bottom = 'auto';
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    panel.style.left = `${Math.max(8, Math.min(event.clientX - drag.dx, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(event.clientY - drag.dy, innerHeight - panel.offsetHeight - 8))}px`;
  });
  const finishDrag = () => {
    if (!drag) return;
    const rect = panel.getBoundingClientRect();
    localStorage.setItem('whiskerwave-queue-position', JSON.stringify({ left: rect.left, top: rect.top }));
    drag = null;
  };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  window.addEventListener('resize', clampPanel);
}

function switchTab(name) {
  const target = ['compose', 'assistant', 'transcribe', 'guide'].includes(name) ? name : 'compose';
  const active = document.querySelector('.tab-button.active')?.dataset.tab;
  if (active && active !== target) stopAllPlayback();
  document.querySelectorAll('.tab-page').forEach((page) => { page.hidden = page.id !== `${target}-page`; });
  document.querySelectorAll('.tab-button').forEach((button) => {
    const active = button.dataset.tab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  history.replaceState(null, '', target === 'compose' ? location.pathname : `#${target}`);
  localStorage.setItem('yue2-studio-tab', target);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stopAllPlayback() {
  transcriptionComparison?.pausePlayback();
  document.querySelectorAll('audio').forEach((player) => player.pause());
}

function beginAssistantTimer() {
  assistantStartedAt = Date.now();
  $('#assistant-timer').textContent = '00:00';
  clearInterval(assistantTimerHandle);
  assistantTimerHandle = setInterval(() => {
    $('#assistant-timer').textContent = fmtTime((Date.now() - assistantStartedAt) / 1000);
  }, 1000);
}

function stopAssistantTimer(seconds) {
  clearInterval(assistantTimerHandle);
  assistantTimerHandle = null;
  if (seconds !== undefined) $('#assistant-timer').textContent = fmtTime(seconds);
}

function beginTranscriptionTimer() {
  transcriptionStartedAt = Date.now();
  $('#transcription-timer').textContent = '00:00';
  clearInterval(transcriptionTimerHandle);
  transcriptionTimerHandle = setInterval(() => {
    $('#transcription-timer').textContent = fmtTime((Date.now() - transcriptionStartedAt) / 1000);
  }, 1000);
}

function stopTranscriptionTimer(seconds) {
  clearInterval(transcriptionTimerHandle);
  transcriptionTimerHandle = null;
  if (seconds !== undefined) $('#transcription-timer').textContent = fmtTime(seconds);
}

function safeDownloadName(value) {
  return (value || 'transcription').replace(/[^\w -]/g, '').trim() || 'transcription';
}

function deleteButton(kind, item) {
  const button = document.createElement('button');
  button.className = 'quiet-button delete-library-item';
  button.type = 'button';
  button.textContent = 'Delete';
  button.addEventListener('click', async () => {
    const label = item.title || item.source_filename || 'this item';
    if (!confirm(`Permanently delete “${label}” from this library and from disk? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      await requestJson('/api/library/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id: item.id }),
      });
      if (kind === 'output' && latestResult?.id === item.id) {
        $('#player').pause();
        $('#player').removeAttribute('src');
        resultState.hidden = true;
        idleState.hidden = false;
        latestResult = null;
      }
      if (kind === 'transcription' && latestTranscription?.id === item.id) {
        transcriptionComparison?.stopPlayback();
        $('#transcription-result').hidden = true;
        $('#transcription-empty').hidden = false;
        $('#transcription-abc').value = '';
        latestTranscription = null;
      }
      if (kind === 'output') await loadHistory();
      else if (kind === 'transcription') await loadTranscriptions();
      else await loadLyricsHistory();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });
  return button;
}

async function openLibraryFolder(kind, button) {
  button.disabled = true;
  try {
    await requestJson('/api/library/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }),
    });
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function showTranscription(item) {
  latestTranscription = item;
  $('#transcription-empty').hidden = true;
  $('#transcription-running').hidden = true;
  $('#transcription-result').hidden = false;
  $('#transcription-title').textContent = item.title || 'Transcription';
  const scoreLabel = item.score_mode === 'full' ? 'full lead sheet' : 'melody-only score';
  $('#transcription-meta').textContent = `${fmtTime(item.duration_seconds)} audio · ${item.note_count} notes · ${item.melody_instrument} · ~${item.estimated_bpm} BPM · ${scoreLabel} · ${item.model_label || 'SheetSage2'} · ${fmtTime(item.wall_seconds)} processing`;
  if (transcriptionComparison) {
    transcriptionComparison.load(item);
  } else {
    $('#comparison-status').textContent = 'Loading the local MIDI synthesizer…';
    $('#comparison-status').dataset.state = 'loading';
  }
  const base = safeDownloadName(item.title);
  $('#transcription-midi').href = item.midi_url;
  $('#transcription-midi').download = `${base}.mid`;
  $('#transcription-events').href = item.events_url;
  $('#transcription-events').download = `${base}-events.json`;
  $('#transcription-abc-download').href = item.abc_url;
  $('#transcription-abc-download').download = `${base}-score.abc`;
  $('#transcription-abc').value = item.abc || '';
}

function useTranscriptionInCompose(item = latestTranscription) {
  const score = item === latestTranscription ? $('#transcription-abc').value.trim() : String(item?.abc || '').trim();
  if (!score) {
    $('#transcription-error').textContent = 'This transcription has no pitched melody to use as ABC.';
    $('#transcription-error').hidden = false;
    return;
  }
  abc.value = score;
  const planningMode = item?.score_mode === 'full' ? 'full' : 'melody';
  const planningRadio = form.querySelector(`input[name="cot"][value="${planningMode}"]`);
  planningRadio.checked = true;
  $('#score-drawer').open = true;
  syncCfg();
  switchTab('compose');
  setTimeout(() => $('#score-drawer').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

function transcriptionCard(item) {
  const card = document.createElement('article');
  card.className = 'history-card transcription-history-card';
  const header = document.createElement('header');
  const name = document.createElement('h3'); name.textContent = item.title || 'Transcription';
  const date = document.createElement('time');
  const parsed = new Date(item.created_at);
  date.textContent = Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  header.append(name, date);
  const detail = document.createElement('p');
  detail.textContent = `${item.note_count} notes · ${item.melody_instrument} · ~${item.estimated_bpm} BPM · ${item.model_label || 'SheetSage2'}`;
  const audioLabel = document.createElement('p'); audioLabel.className = 'card-audio-label'; audioLabel.textContent = 'Original recording';
  const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = item.source_url;
  const actions = document.createElement('div'); actions.className = 'transcription-card-actions';
  const compare = document.createElement('button'); compare.className = 'history-download'; compare.type = 'button'; compare.textContent = 'Compare audio + MIDI'; compare.addEventListener('click', () => { showTranscription(item); $('#transcription-result').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const midi = document.createElement('a'); midi.className = 'history-download'; midi.href = item.midi_url; midi.download = `${safeDownloadName(item.title)}.mid`; midi.textContent = 'MIDI';
  const abcLink = document.createElement('a'); abcLink.className = 'quiet-button'; abcLink.href = item.abc_url; abcLink.download = `${safeDownloadName(item.title)}-score.abc`; abcLink.textContent = 'ABC';
  const use = document.createElement('button'); use.className = 'quiet-button'; use.type = 'button'; use.textContent = 'Use for remix'; use.disabled = !item.abc; use.addEventListener('click', () => useTranscriptionInCompose(item));
  actions.append(compare, midi, abcLink, use, deleteButton('transcription', item));
  card.append(header, detail, audioLabel, audio, actions);
  return card;
}

async function loadTranscriptions() {
  const container = $('#transcription-history');
  try {
    const data = await requestJson('/api/transcriptions');
    const items = Array.isArray(data.items) ? data.items : [];
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'empty-library'; empty.textContent = 'Completed transcriptions will appear here.'; container.append(empty);
      return [];
    }
    items.forEach((item) => container.append(transcriptionCard(item)));
    return items;
  } catch (error) {
    container.textContent = error.message;
    return [];
  }
}

async function loadOllamaModels() {
  const select = $('#ollama-model');
  const status = $('#ollama-status');
  try {
    const data = await requestJson('/api/ollama/models');
    select.replaceChildren();
    if (!data.models.length) throw new Error('No local Ollama models found');
    data.models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.name;
      const size = model.size ? ` · ${(model.size / (1024 ** 3)).toFixed(1)} GB` : '';
      option.textContent = `${model.name}${size}`;
      select.append(option);
    });
    const saved = localStorage.getItem('yue2-ollama-model');
    const preferred = data.models.find((model) => model.name === saved)
      || data.models.find((model) => /^Qwen3\.8-27B-Q8_0:latest$/i.test(model.name))
      || data.models.find((model) => /^qwen3\.8:27b$/i.test(model.name))
      || data.models[0];
    select.value = preferred.name;
    status.textContent = `${data.models.length} models ready`;
    status.className = 'mini-status ready';
  } catch (error) {
    select.replaceChildren(new Option('Ollama unavailable', ''));
    status.textContent = 'Ollama offline';
    status.className = 'mini-status error';
    $('#assistant-error').textContent = `${error.message}. Start Ollama, then reload this page.`;
    $('#assistant-error').hidden = false;
  }
}

function assistantPayload(mode) {
  return {
    mode,
    model: $('#ollama-model').value,
    brief: $('#song-brief').value.trim(),
    reference_context: $('#assistant-context').value.trim(),
    language: $('#assistant-language').value.trim(),
    length: $('#assistant-length').value,
    vocals: $('#assistant-vocals').value.trim(),
    must_include: $('#assistant-must').value.trim(),
    avoid: $('#assistant-avoid').value.trim(),
    direction: $('#assistant-direction').value.trim(),
    revision: $('#revision-request').value.trim(),
    current: {
      title: $('#assistant-title').value.trim(),
      style: $('#assistant-style').value.trim(),
      lyrics: $('#assistant-lyrics').value.trim(),
    },
  };
}

function saveAssistantDraft() {
  localStorage.setItem('yue2-assistant-draft', JSON.stringify(assistantPayload('draft')));
  localStorage.setItem('yue2-ollama-model', $('#ollama-model').value);
}

function restoreAssistantDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('yue2-assistant-draft'));
    if (!draft) return;
    const values = {
      'song-brief': draft.brief,
      'assistant-context': draft.reference_context,
      'assistant-language': draft.language,
      'assistant-length': draft.length,
      'assistant-vocals': draft.vocals,
      'assistant-direction': draft.direction,
      'assistant-must': draft.must_include,
      'assistant-avoid': draft.avoid,
    };
    Object.entries(values).forEach(([id, value]) => { if (value !== undefined) document.getElementById(id).value = value; });
    updateAssistantCounts();
  } catch (_) { /* Ignore a malformed local draft. */ }
}

function updateAssistantCounts() {
  $('#assistant-brief-count').textContent = `${$('#song-brief').value.length.toLocaleString()} / 30,000`;
  $('#assistant-context-count').textContent = `${$('#assistant-context').value.length.toLocaleString()} / 120,000`;
  $('#assistant-revision-count').textContent = `${$('#revision-request').value.length.toLocaleString()} / 30,000`;
}

function queueAssistantDraftSave() {
  updateAssistantCounts();
  clearTimeout(assistantSaveHandle);
  assistantSaveHandle = setTimeout(saveAssistantDraft, 350);
}

function showDirections(directions) {
  const list = $('#direction-list');
  list.replaceChildren();
  $('#assistant-direction').value = '';
  directions.forEach((direction, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'direction-card';
    const header = document.createElement('header');
    const name = document.createElement('h3'); name.textContent = direction.name;
    const state = document.createElement('span'); state.textContent = `OPTION ${index + 1}`;
    header.append(name, state);
    const sound = document.createElement('p'); sound.className = 'direction-style'; sound.textContent = direction.style;
    const reason = document.createElement('p'); reason.className = 'direction-reason'; reason.textContent = `${direction.rationale} · ${direction.structure_hint}`;
    card.append(header, sound, reason);
    card.addEventListener('click', () => {
      list.querySelectorAll('.direction-card').forEach((item, itemIndex) => {
        item.classList.remove('selected');
        item.querySelector('header span').textContent = `OPTION ${itemIndex + 1}`;
      });
      card.classList.add('selected');
      state.textContent = 'SELECTED';
      $('#assistant-direction').value = direction.style;
      saveAssistantDraft();
    });
    list.append(card);
  });
  $('#assistant-empty').hidden = true;
  $('#assistant-running').hidden = true;
  $('#song-result').hidden = true;
  $('#direction-results').hidden = false;
}

function showAssistantSong(song) {
  $('#assistant-title').value = song.title;
  $('#assistant-style').value = song.style;
  $('#assistant-lyrics').value = song.lyrics;
  $('#assistant-notes').textContent = song.notes || 'Ready to edit or move into Compose.';
  $('#assistant-empty').hidden = true;
  $('#assistant-running').hidden = true;
  $('#direction-results').hidden = true;
  $('#song-result').hidden = false;
  saveAssistantDraft();
}

function showSurpriseBrief(suggestions) {
  const fields = {
    brief: 'song-brief', reference_context: 'assistant-context', language: 'assistant-language',
    length: 'assistant-length', vocals: 'assistant-vocals', direction: 'assistant-direction',
    must_include: 'assistant-must', avoid: 'assistant-avoid',
  };
  Object.entries(fields).forEach(([key, id]) => {
    const input = document.getElementById(id);
    // Preserve constraints, including edits made while Ollama was responding.
    if (!input.value.trim() && suggestions[key]) input.value = suggestions[key];
  });
  if ($('#assistant-context').value.trim()) $('.assistant-context-drawer').open = true;
  updateAssistantCounts();
  saveAssistantDraft();
  $('#assistant-running').hidden = true;
  $('#assistant-empty').hidden = false;
  $('#assistant-empty h3').textContent = 'Your surprise brief is ready';
  $('#assistant-empty p').textContent = 'Review or edit it, then suggest directions or write the full song.';
}

async function runAssistant(mode) {
  const error = $('#assistant-error');
  error.hidden = true;
  if (!$('#ollama-model').value) {
    error.textContent = 'No Ollama model is available. Start Ollama and reload this page.';
    error.hidden = false;
    return;
  }
  if (!['surprise', 'complete_surprise', 'revise'].includes(mode) && !$('#song-brief').value.trim()) {
    error.textContent = 'Describe the song you want to write first.';
    error.hidden = false;
    $('#song-brief').focus();
    return;
  }
  saveAssistantDraft();
  const buttons = [$('#surprise-button'), $('#complete-surprise-button'), $('#brainstorm-button'), $('#draft-button'), $('#revise-button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await requestJson('/api/queue/enqueue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'assistant', payload: assistantPayload(mode) }),
    });
    $('#assistant-empty').hidden = false;
    $('#assistant-running').hidden = true;
    $('#assistant-empty h3').textContent = 'Added to the shared queue';
    $('#assistant-empty p').textContent = mode === 'complete_surprise'
      ? 'Ollama will invent the missing choices and place the completed song directly in the Writer’s room and Lyrics library.'
      : 'The result will appear in the Lyrics library when its turn finishes.';
    showQueuePanel();
    await refreshQueue();
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function applyGuideStyle(value) {
  style.value = value;
  updateCounts();
  saveDraft();
  switchTab('compose');
  style.focus();
  style.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderGenres(filter = '') {
  const needle = filter.trim().toLocaleLowerCase();
  const matches = demonstratedGenres.filter((genre) => genre.toLocaleLowerCase().includes(needle));
  const container = $('#genre-chip-list');
  container.replaceChildren();
  matches.forEach((genre) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = genre;
    button.title = `Add ${genre} to Sound direction`;
    button.addEventListener('click', () => {
      const current = style.value.trim();
      applyGuideStyle(current ? `${genre}, ${current}` : `${genre}, `);
    });
    container.append(button);
  });
  $('#genre-count').textContent = `${matches.length} shown`;
}

function guideCopyButton(label, value) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button';
  button.textContent = label;
  button.disabled = !value;
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = label; }, 1200);
  });
  return button;
}

function useOfficialExample(item) {
  title.value = item.title || 'Official YuE2 example';
  style.value = item.style || item.tags || '';
  lyrics.value = item.lyrics || '';
  abc.value = item.abc || '';
  const mode = item.collection === 'cover' ? 'melody' : item.mode === 'direct' ? 'off' : 'full';
  const radio = form.querySelector(`input[name="cot"][value="${mode}"]`);
  if (radio) radio.checked = true;
  $('#score-drawer').open = Boolean(abc.value);
  syncCfg();
  updateCounts();
  saveDraft();
  switchTab('compose');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function officialFile(item, name) {
  return (item.local_files || []).find((file) => file.name === name);
}

async function getOfficialReferencePack(item, button) {
  const prior = button.textContent;
  button.disabled = true;
  button.textContent = 'Downloading…';
  const status = $('#official-example-status');
  status.hidden = false;
  status.textContent = `Downloading the first-party reference files for ${item.title}…`;
  try {
    const result = await requestJson('/api/official-examples/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    });
    item.local_files = result.files;
    item.downloaded = true;
    status.textContent = `Saved ${result.files.length} files to ${result.folder}`;
    renderGuideExamples();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error-text');
    button.disabled = false;
    button.textContent = prior;
  }
}

async function openOfficialReferenceFolder(item, button) {
  button.disabled = true;
  try {
    await requestJson('/api/official-examples/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    });
  } catch (error) {
    $('#official-example-status').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function officialExampleCard(item) {
  const card = document.createElement('article'); card.className = 'panel guide-example-card official-example-card';
  const head = document.createElement('header');
  const heading = document.createElement('div');
  const source = document.createElement('span'); source.textContent = item.collection === 'cover' ? 'OFFICIAL SCORE EDIT' : 'OFFICIAL GENRE CATALOG';
  const name = document.createElement('h3'); name.textContent = item.title || item.genre || item.id;
  heading.append(source, name);
  const use = document.createElement('button'); use.type = 'button'; use.className = 'quiet-button'; use.textContent = 'Use in Compose';
  use.addEventListener('click', () => useOfficialExample(item));
  head.append(heading, use);

  const meta = document.createElement('p'); meta.className = 'guide-example-meta';
  const mode = item.collection === 'cover' ? 'Cover / score edit' : item.mode === 'planned' ? 'Full plan + ABC' : 'Direct generation';
  meta.textContent = [item.genre, item.languageLabel || item.language, mode].filter(Boolean).join(' · ');
  const prompt = document.createElement('p'); prompt.className = 'guide-example-prompt'; prompt.textContent = item.style || 'No style prompt published.';

  const music = officialFile(item, 'generated-song.mp3');
  const scoreMusic = officialFile(item, 'score-rendering.mp3');
  const players = document.createElement('div'); players.className = 'official-example-players';
  if (music) {
    const label = document.createElement('span'); label.textContent = 'Generated YuE2 song';
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = music.url;
    players.append(label, audio);
  }
  if (scoreMusic) {
    const label = document.createElement('span'); label.textContent = 'Original score rendering';
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = scoreMusic.url;
    players.append(label, audio);
  }

  const actions = document.createElement('div'); actions.className = 'official-example-actions';
  const get = document.createElement('button'); get.type = 'button'; get.className = item.downloaded ? 'quiet-button' : 'history-download';
  get.textContent = item.downloaded ? 'Refresh reference pack' : 'Get reference pack';
  get.addEventListener('click', () => getOfficialReferencePack(item, get));
  actions.append(get, guideCopyButton('Copy prompt', item.style));
  if (item.downloaded) {
    const open = document.createElement('button'); open.type = 'button'; open.className = 'quiet-button'; open.textContent = 'Open folder';
    open.addEventListener('click', () => openOfficialReferenceFolder(item, open));
    actions.append(open);
  }

  const details = document.createElement('details'); details.className = 'official-example-details';
  const summary = document.createElement('summary');
  summary.textContent = `View lyrics${item.abc ? ', ABC score' : ''}${item.downloaded ? ' and downloads' : ''}`;
  details.append(summary);
  if (item.lyrics) {
    const section = document.createElement('section');
    const sectionHead = document.createElement('div'); sectionHead.className = 'official-detail-head';
    const headingText = document.createElement('h4'); headingText.textContent = 'Lyrics';
    sectionHead.append(headingText, guideCopyButton('Copy lyrics', item.lyrics));
    const pre = document.createElement('pre'); pre.textContent = item.lyrics;
    section.append(sectionHead, pre); details.append(section);
  }
  if (item.abc) {
    const section = document.createElement('section');
    const sectionHead = document.createElement('div'); sectionHead.className = 'official-detail-head';
    const headingText = document.createElement('h4'); headingText.textContent = 'Raw ABC score';
    sectionHead.append(headingText, guideCopyButton('Copy ABC', item.abc));
    const pre = document.createElement('pre'); pre.textContent = item.abc;
    section.append(sectionHead, pre); details.append(section);
  }
  if (item.local_files?.length) {
    const downloads = document.createElement('div'); downloads.className = 'official-file-links';
    item.local_files.forEach((file) => {
      const link = document.createElement('a'); link.className = 'quiet-button'; link.href = file.url; link.download = file.name; link.textContent = file.label;
      downloads.append(link);
    });
    details.append(downloads);
  }
  card.append(head, meta, prompt);
  if (players.childElementCount) card.append(players);
  card.append(actions, details);
  return card;
}

function renderGuideExamples() {
  const container = $('#guide-example-list');
  container.replaceChildren();
  if (officialCatalogLoaded) {
    const needle = $('#official-example-search').value.trim().toLocaleLowerCase();
    const filter = $('#official-example-filter').value;
    const matches = officialCatalogExamples.filter((item) => {
      const searchable = [item.title, item.genre, item.languageLabel, item.style, item.source, item.editType].join(' ').toLocaleLowerCase();
      const filterMatch = filter === 'all' || (filter === 'downloaded' ? item.downloaded : filter === 'cover' ? item.collection === 'cover' : item.mode === filter);
      return filterMatch && (!needle || searchable.includes(needle));
    });
    matches.slice(0, officialExampleLimit).forEach((item) => container.append(officialExampleCard(item)));
    $('#official-example-count').textContent = `${Math.min(matches.length, officialExampleLimit)} of ${matches.length} shown · ${officialCatalogExamples.length} official examples`;
    $('#show-more-official-examples').hidden = matches.length <= officialExampleLimit;
    return;
  }
  officialExamples.forEach((item) => {
    const card = document.createElement('article'); card.className = 'panel guide-example-card';
    const head = document.createElement('header');
    const heading = document.createElement('div');
    const source = document.createElement('span'); source.textContent = item.source;
    const name = document.createElement('h3'); name.textContent = item.title;
    heading.append(source, name);
    const use = document.createElement('button'); use.type = 'button'; use.className = 'quiet-button'; use.textContent = 'Use prompt';
    use.addEventListener('click', () => applyGuideStyle(item.style));
    head.append(heading, use);
    const meta = document.createElement('p'); meta.className = 'guide-example-meta'; meta.textContent = `${item.genre} · ${item.language} · ${item.mode}`;
    const prompt = document.createElement('p'); prompt.className = 'guide-example-prompt'; prompt.textContent = item.style;
    card.append(head, meta, prompt);
    container.append(card);
  });
}

async function loadOfficialExamples(refresh = false) {
  const status = $('#official-example-status');
  status.hidden = false;
  status.classList.remove('error-text');
  status.textContent = refresh ? 'Refreshing the official YuE2 catalog…' : 'Loading the official YuE2 reference catalog…';
  try {
    const data = await requestJson(`/api/official-examples${refresh ? '?refresh=1' : ''}`);
    officialCatalogExamples = Array.isArray(data.examples) ? data.examples : [];
    officialCatalogLoaded = true;
    officialExampleLimit = 24;
    const planned = officialCatalogExamples.filter((item) => item.mode === 'planned').length;
    const covers = officialCatalogExamples.filter((item) => item.collection === 'cover').length;
    status.textContent = `${officialCatalogExamples.length} first-party examples loaded: ${planned} include a full symbolic plan, and ${covers} are cover / score-edit demonstrations. Download only the packs you want.`;
    renderGuideExamples();
  } catch (error) {
    officialCatalogLoaded = false;
    status.classList.add('error-text');
    status.textContent = `${error.message} Showing the built-in prompt samples instead.`;
    renderGuideExamples();
  }
}

async function refreshStatus() {
  try {
    const data = await requestJson('/api/status');
    studioStatus = data;
    const pill = $('#engine-status');
    pill.className = `status-pill ${data.ready && data.model_ready ? 'ready' : 'error'}`;
    pill.innerHTML = `<i></i>${data.ready && data.model_ready ? 'Engine ready' : 'Setup incomplete'}`;
    const gpu = data.gpus.find((item) => item.index === data.gpu);
    $('#gpu-status').textContent = gpu ? `GPU ${gpu.index} · ${gpu.name} · ${(gpu.memory_used_mb / 1024).toFixed(1)} / ${(gpu.memory_total_mb / 1024).toFixed(0)} GB` : `CUDA device ${data.gpu}`;
    syncTranscriptionModelUI();
    if (!modelProfilesLoaded && Array.isArray(data.model_profiles)) {
      const select = $('#yue-model');
      let wanted = 'yue2-q8';
      try { wanted = JSON.parse(localStorage.getItem('yue2-studio-draft') || '{}').model || wanted; } catch (_) { /* use Q8 */ }
      select.replaceChildren();
      data.model_profiles.filter((profile) => profile.installed).forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.label;
        option.dataset.description = profile.description;
        select.append(option);
      });
      if ([...select.options].some((option) => option.value === wanted)) select.value = wanted;
      else if ([...select.options].some((option) => option.value === 'yue2-q8')) select.value = 'yue2-q8';
      else if (select.options.length) select.selectedIndex = 0;
      modelProfilesLoaded = true;
      updateModelDescription();
    }
  } catch (error) {
    const pill = $('#engine-status');
    pill.className = 'status-pill error';
    pill.innerHTML = '<i></i>Engine offline';
  }
}

function syncTranscriptionModelUI() {
  const ready = Boolean(studioStatus?.sheetsage2_ready);
  const status = $('#transcription-model-status');
  const label = studioStatus?.sheetsage2_model || 'SheetSage2';
  status.textContent = ready ? (studioStatus?.transcribing ? 'Transcribing...' : `${label} ready`) : 'Model missing';
  status.className = `mini-status ${ready ? 'ready' : 'error'}`;
  $('#transcribe-button').disabled = !ready || Boolean(studioStatus?.transcribing);
  $('#transcribe-button span').textContent = 'Transcribe to score';
}

function payload() {
  return {
    title: title.value.trim(),
    model: $('#yue-model').value || 'yue2-q8',
    style: style.value.trim(),
    lyrics: lyrics.value.trim(),
    cot: selectedMode(),
    abc: abc.value.trim(),
    generation_preset: $('#generation-preset').value,
    seed_mode: $('#seed-mode').value,
    seed: Number($('#seed').value),
    num_inference_steps: Number($('#steps').value),
    cfg_scale: Number($('#cfg').value),
    semantic_max_tokens: Number($('#semantic-max').value),
    semantic_temperature: Number($('#semantic-temp').value),
    semantic_top_p: Number($('#semantic-top-p').value),
    semantic_top_k: Number($('#semantic-top-k').value),
    abc_max_tokens: Number($('#abc-max').value),
    abc_temperature: Number($('#abc-temp').value),
    abc_top_p: Number($('#abc-top-p').value),
    abc_top_k: Number($('#abc-top-k').value),
  };
}

function saveDraft() {
  const draft = payload();
  delete draft.abc;
  localStorage.setItem('yue2-studio-draft', JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('yue2-studio-draft'));
    if (!draft) return;
    const ids = {
      title: 'title', style: 'style', lyrics: 'lyrics', seed: 'seed',
      seed_mode: 'seed-mode',
      generation_preset: 'generation-preset',
      num_inference_steps: 'steps', cfg_scale: 'cfg', semantic_max_tokens: 'semantic-max',
      semantic_temperature: 'semantic-temp', semantic_top_p: 'semantic-top-p',
      semantic_top_k: 'semantic-top-k', abc_max_tokens: 'abc-max',
      abc_temperature: 'abc-temp', abc_top_p: 'abc-top-p', abc_top_k: 'abc-top-k',
    };
    for (const [key, value] of Object.entries(draft)) {
      const el = document.getElementById(ids[key]);
      if (el) el.value = value;
    }
    if (draft.cot) {
      const radio = form.querySelector(`input[name="cot"][value="${draft.cot}"]`);
      if (radio) radio.checked = true;
    }
    if (draft.generation_preset && draft.generation_preset !== 'default') $('#cfg').dataset.edited = 'true';
  } catch (_) { /* Ignore an old or malformed local draft. */ }
}

async function drawWaveform(url) {
  const canvas = $('#waveform');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(bytes.slice(0));
    const channel = buffer.getChannelData(0);
    const columns = Math.floor(canvas.width / 3);
    const stride = Math.max(1, Math.floor(channel.length / columns));
    ctx.fillStyle = '#8f7cff';
    for (let x = 0; x < columns; x += 1) {
      let peak = 0;
      const start = x * stride;
      for (let j = 0; j < stride; j += Math.max(1, Math.floor(stride / 80))) peak = Math.max(peak, Math.abs(channel[start + j] || 0));
      const height = Math.max(2, peak * canvas.height * .88);
      ctx.fillRect(x * 3, (canvas.height - height) / 2, 1.5, height);
    }
    await audioContext.close();
  } catch (_) {
    ctx.fillStyle = '#6f6e69';
    ctx.font = '12px ui-monospace';
    ctx.fillText('Waveform unavailable', 20, canvas.height / 2);
  }
}

function showResult(item) {
  latestResult = item;
  idleState.hidden = true;
  runningState.hidden = true;
  resultState.hidden = false;
  $('#result-title').textContent = item.title || 'Untitled';
  $('#result-meta').textContent = `${fmtTime(item.duration_seconds)} audio · ${fmtTime(item.wall_seconds)} render · ${item.model_label || 'YuE2-3B'} · ${item.cot} plan · seed ${item.seed}`;
  $('#result-style').textContent = item.style;
  $('#player').src = `${item.audio_url}?v=${Date.now()}`;
  $('#download-link').href = item.audio_url;
  $('#download-link').download = `${(item.title || 'yue2-song').replace(/[^\w -]/g, '').trim() || 'yue2-song'}.wav`;
  drawWaveform(item.audio_url);
}

function inferGenerationPreset(item) {
  if (item.generation_preset === 'custom') return 'custom';
  if (item.generation_preset && item.generation_preset in generationPresets) return item.generation_preset;
  const options = item.options || {};
  const pairs = [
    ['num_inference_steps', 'steps'], ['semantic_temperature', 'semanticTemp'],
    ['semantic_top_p', 'semanticTopP'], ['semantic_top_k', 'semanticTopK'],
    ['abc_temperature', 'abcTemp'], ['abc_top_p', 'abcTopP'], ['abc_top_k', 'abcTopK'],
  ];
  return Object.entries(generationPresets).find(([name, preset]) => pairs.every(([option, key]) => {
    if (options[option] === undefined) return true;
    const expected = Number(preset[key]);
    return Math.abs(Number(options[option]) - expected) < 0.000001;
  }) && (options.cfg_scale === undefined || Math.abs(Number(options.cfg_scale) - (name === 'default' && item.cot === 'off' ? 1.01 : Number(preset.cfg))) < 0.000001))?.[0] || 'custom';
}

function restoreSongToCompose(item) {
  const options = item.options || {};
  title.value = item.title || '';
  style.value = item.style || options.style || '';
  lyrics.value = item.lyrics || '';
  abc.value = options.abc || '';

  if (item.model_id && [...$('#yue-model').options].some((option) => option.value === item.model_id)) {
    $('#yue-model').value = item.model_id;
  }
  const mode = item.cot || options.cot || 'full';
  const radio = form.querySelector(`input[name="cot"][value="${mode}"]`);
  if (radio) radio.checked = true;

  const optionIds = {
    num_inference_steps: 'steps', cfg_scale: 'cfg', semantic_max_tokens: 'semantic-max',
    semantic_temperature: 'semantic-temp', semantic_top_p: 'semantic-top-p',
    semantic_top_k: 'semantic-top-k', abc_max_tokens: 'abc-max',
    abc_temperature: 'abc-temp', abc_top_p: 'abc-top-p', abc_top_k: 'abc-top-k',
  };
  Object.entries(optionIds).forEach(([key, id]) => {
    if (options[key] !== undefined) document.getElementById(id).value = options[key];
  });

  // Loading a saved take means reproducing its exact seed, even if that take
  // was originally created while Random every song was selected.
  $('#seed-mode').value = 'fixed';
  $('#seed').value = item.seed ?? 831001;
  $('#generation-preset').value = inferGenerationPreset(item);
  $('#cfg').dataset.edited = 'true';
  $('#score-drawer').open = Boolean(abc.value.trim());
  $('#abc-file').value = '';
  updateCounts();
  updateModelDescription();
  syncSeedMode();
  updatePresetSummary();
  syncCfg();
  saveDraft();
  document.querySelectorAll('#history audio').forEach((player) => player.pause());
  switchTab('compose');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncStarButton(button, starred) {
  button.classList.toggle('starred', starred);
  button.textContent = starred ? '★' : '☆';
  button.title = starred ? 'Remove star' : 'Star this output';
  button.setAttribute('aria-label', `${starred ? 'Remove star from' : 'Star'} ${button.dataset.title}`);
  button.setAttribute('aria-pressed', String(starred));
}

async function toggleOutputStar(item, button) {
  button.disabled = true;
  try {
    const result = await queuePost('/api/history/star', { id: item.id, starred: !item.starred });
    item.starred = result.starred;
    syncStarButton(button, item.starred);
    if (['starred', 'unstarred'].includes($('#listening-filter').value) || $('#listening-sort').value === 'starred') {
      renderListeningRoom();
    } else {
      const shown = filteredListeningRoomItems().length;
      const stars = listeningRoomItems.filter((value) => value.starred).length;
      $('#listening-count').textContent = `${shown} of ${listeningRoomItems.length} shown · ${stars} starred`;
    }
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function historyCard(item) {
  const card = document.createElement('article');
  card.className = 'history-card';
  const header = document.createElement('header');
  const name = document.createElement('h3');
  name.textContent = item.title || 'Untitled';
  const date = document.createElement('time');
  const parsed = new Date(item.created_at);
  date.textContent = Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const star = document.createElement('button'); star.type = 'button'; star.className = 'star-output'; star.dataset.title = item.title || 'Untitled';
  syncStarButton(star, Boolean(item.starred));
  star.addEventListener('click', () => toggleOutputStar(item, star));
  const headActions = document.createElement('div'); headActions.className = 'history-card-head-actions'; headActions.append(date, star);
  header.append(name, headActions);
  const prompt = document.createElement('p');
  prompt.textContent = item.style || '';
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = item.audio_url;
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  for (const value of [fmtTime(item.duration_seconds), item.model_label || 'YuE2-3B', item.cot, `seed ${item.seed}`]) {
    const chip = document.createElement('span'); chip.textContent = value; meta.append(chip);
  }
  const download = document.createElement('a');
  download.className = 'history-download';
  download.href = item.audio_url;
  download.download = `${(item.title || 'yue2-song').replace(/[^\w -]/g, '').trim() || 'yue2-song'}.wav`;
  download.textContent = 'Download WAV';
  const restore = document.createElement('button');
  restore.className = 'quiet-button restore-compose';
  restore.type = 'button';
  restore.textContent = 'Load into Compose';
  restore.addEventListener('click', () => restoreSongToCompose(item));
  const actions = document.createElement('div'); actions.className = 'history-card-actions'; actions.append(restore, download, deleteButton('output', item));
  const footer = document.createElement('div'); footer.className = 'history-card-footer'; footer.append(meta, actions);
  card.append(header, prompt, audio, footer);
  return card;
}

function filteredListeningRoomItems() {
  const needle = $('#listening-search').value.trim().toLocaleLowerCase();
  const filter = $('#listening-filter').value;
  const matches = listeningRoomItems.filter((item) => {
    const searchable = [item.title, item.style, item.lyrics, item.seed, item.model_id, item.model_label, item.cot, item.generation_preset]
      .filter((value) => value !== undefined && value !== null).join(' ').toLocaleLowerCase();
    const filterMatch = filter === 'all'
      || (filter === 'starred' && item.starred)
      || (filter === 'unstarred' && !item.starred)
      || (['full', 'melody', 'off'].includes(filter) && item.cot === filter)
      || (filter.startsWith('yue2-') && item.model_id === filter);
    return filterMatch && (!needle || searchable.includes(needle));
  });
  const sort = $('#listening-sort').value;
  return matches.sort((a, b) => {
    if (sort === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    if (sort === 'starred') return Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

function renderListeningRoom() {
  const container = $('#history');
  const items = filteredListeningRoomItems();
  container.replaceChildren();
  const stars = listeningRoomItems.filter((item) => item.starred).length;
  $('#listening-count').textContent = `${items.length} of ${listeningRoomItems.length} shown · ${stars} starred`;
  if (!items.length) {
    const empty = document.createElement('p'); empty.className = 'empty-library';
    empty.textContent = listeningRoomItems.length ? 'No Listening room outputs match this search and filter.' : 'Generated takes will appear here.';
    container.append(empty);
    return;
  }
  items.forEach((item) => container.append(historyCard(item)));
}

async function loadHistory() {
  const container = $('#history');
  try {
    const data = await requestJson('/api/history');
    listeningRoomItems = Array.isArray(data.items) ? data.items : [];
    renderListeningRoom();
    return listeningRoomItems;
  } catch (error) {
    container.textContent = error.message;
    return [];
  }
}

function restoreLyricsToAssistant(item, navigate = true) {
  const inputs = item.inputs || {};
  const values = {
    'song-brief': inputs.brief || '',
    'assistant-context': inputs.reference_context || '',
    'assistant-language': inputs.language || 'English',
    'assistant-length': inputs.length || 'standard',
    'assistant-vocals': inputs.vocals || '',
    'assistant-direction': inputs.direction || item.style || '',
    'assistant-must': inputs.must_include || '',
    'assistant-avoid': inputs.avoid || '',
    'revision-request': inputs.revision || '',
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  if (item.mode === 'brainstorm' && Array.isArray(item.directions)) {
    showDirections(item.directions);
  } else if (item.mode === 'surprise' && item.suggestions) {
    const fields = {
      brief: 'song-brief', reference_context: 'assistant-context', language: 'assistant-language', length: 'assistant-length',
      vocals: 'assistant-vocals', direction: 'assistant-direction', must_include: 'assistant-must', avoid: 'assistant-avoid',
    };
    Object.entries(fields).forEach(([key, id]) => {
      if (item.suggestions[key] !== undefined) document.getElementById(id).value = item.suggestions[key];
    });
    $('#direction-results').hidden = true;
    $('#song-result').hidden = true;
    $('#assistant-running').hidden = true;
    $('#assistant-empty').hidden = false;
    $('#assistant-empty h3').textContent = 'Your surprise brief is ready';
    $('#assistant-empty p').textContent = 'Review it, then queue genre directions or a complete song.';
  } else {
    showAssistantSong(item);
  }
  updateAssistantCounts();
  saveAssistantDraft();
  if (navigate) {
    switchTab('assistant');
    const target = item.lyrics ? $('#song-result') : $('#assistant-form');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function lyricsToCompose(item) {
  title.value = item.title || '';
  style.value = item.style || '';
  lyrics.value = item.lyrics || '';
  updateCounts();
  saveDraft();
  switchTab('compose');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lyricHistoryCard(item) {
  const card = document.createElement('article');
  card.className = 'history-card lyrics-card';
  const header = document.createElement('header');
  const name = document.createElement('h3'); name.textContent = item.title || 'Untitled lyric';
  const date = document.createElement('time');
  const parsed = new Date(item.created_at);
  date.textContent = Number.isNaN(parsed.valueOf()) ? '' : parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  header.append(name, date);
  const styleText = document.createElement('p'); styleText.textContent = item.style || item.notes || '';
  const preview = document.createElement('p'); preview.className = 'lyrics-preview';
  preview.textContent = item.mode === 'brainstorm'
    ? (item.directions || []).map((direction) => `${direction.name}: ${direction.style}`).join('\n')
    : item.mode === 'surprise' ? [item.suggestions?.brief, item.suggestions?.direction].filter(Boolean).join('\n') : item.lyrics || '';
  const meta = document.createElement('div'); meta.className = 'card-meta';
  const modeLabel = { surprise: 'creative brief', complete_surprise: 'complete surprise', brainstorm: 'genre directions', draft: 'full song', revise: 'revision' }[item.mode] || item.mode || 'draft';
  for (const value of [item.model || 'Ollama', modeLabel, `${Number(item.wall_seconds || 0).toFixed(1)}s`]) {
    const chip = document.createElement('span'); chip.textContent = value; meta.append(chip);
  }
  const actions = document.createElement('div'); actions.className = 'history-card-actions';
  const restore = document.createElement('button'); restore.className = 'quiet-button'; restore.type = 'button'; restore.textContent = 'Load in Assistant'; restore.addEventListener('click', () => restoreLyricsToAssistant(item));
  actions.append(restore);
  if (item.lyrics) {
    const compose = document.createElement('button'); compose.className = 'quiet-button restore-compose'; compose.type = 'button'; compose.textContent = 'Use in Compose'; compose.addEventListener('click', () => lyricsToCompose(item));
    actions.append(compose);
  }
  actions.append(deleteButton('lyrics', item));
  const footer = document.createElement('div'); footer.className = 'history-card-footer'; footer.append(meta, actions);
  card.append(header, styleText, preview, footer);
  return card;
}

async function loadLyricsHistory() {
  const container = $('#lyrics-history');
  try {
    const data = await requestJson('/api/lyrics');
    container.replaceChildren();
    if (!data.items.length) {
      const empty = document.createElement('p'); empty.className = 'empty-library'; empty.textContent = 'Completed lyric drafts will appear here.'; container.append(empty);
      return [];
    }
    data.items.forEach((item) => container.append(lyricHistoryCard(item)));
    return data.items;
  } catch (error) {
    container.textContent = error.message;
    return [];
  }
}

function clearComposeInputs() {
  const hasContent = title.value.trim() || style.value.trim() || lyrics.value.trim() || abc.value.trim();
  if (hasContent && !confirm('Clear the current Compose title, sound direction, lyrics, score, and generation settings? Saved library items will not be deleted.')) return;
  form.reset();
  title.value = '';
  style.value = '';
  lyrics.value = '';
  abc.value = '';
  $('#abc-file').value = '';
  $('#score-drawer').open = false;
  errorBox.hidden = true;
  applyGenerationPreset('default', false);
  rollSeed();
  updateCounts();
  syncSeedMode();
  syncCfg();
  saveDraft();
}

function clearAssistantInputs() {
  const ids = ['song-brief', 'assistant-context', 'assistant-vocals', 'assistant-direction', 'assistant-must', 'assistant-avoid', 'revision-request', 'assistant-title', 'assistant-style', 'assistant-lyrics'];
  const hasContent = ids.some((id) => document.getElementById(id).value.trim());
  if (hasContent && !confirm('Clear the current Lyric Assistant brief and draft? Saved lyrics-library items will not be deleted.')) return;
  clearTimeout(assistantSaveHandle);
  assistantSaveHandle = null;
  ids.forEach((id) => { document.getElementById(id).value = ''; });
  $('#assistant-language').value = 'English';
  $('#assistant-length').value = 'standard';
  $('#assistant-notes').textContent = '';
  $('#assistant-error').hidden = true;
  $('.assistant-context-drawer').open = false;
  $('#assistant-running').hidden = true;
  $('#direction-results').hidden = true;
  $('#song-result').hidden = true;
  $('#assistant-empty').hidden = false;
  $('#assistant-empty h3').textContent = 'Start with the idea';
  $('#assistant-empty p').textContent = 'Explore genres first, or let the assistant make a complete creative choice. Everything remains editable.';
  localStorage.removeItem('yue2-assistant-draft');
  updateAssistantCounts();
}

function clearTranscriptionInputs() {
  const hasContent = $('#transcription-file').files.length || $('#transcription-abc').value.trim();
  if (hasContent && !confirm('Clear the current Transcribe / Remix inputs and score desk? Saved transcription-library items will not be deleted.')) return;
  transcriptionComparison?.stopPlayback();
  $('#transcription-form').reset();
  $('#transcription-file').value = '';
  $('.audio-drop').classList.remove('has-file');
  $('#transcription-file-name').textContent = 'WAV, MP3, FLAC, OGG, M4A, AAC, WMA, WEBM, or MP4; maximum 500 MB';
  $('#transcription-abc').value = '';
  $('#transcription-result').hidden = true;
  $('#transcription-running').hidden = true;
  $('#transcription-empty').hidden = false;
  $('#transcription-error').hidden = true;
  latestTranscription = null;
  syncTranscriptionModelUI();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  if (selectedMode() === 'off' && abc.value.trim()) {
    errorBox.textContent = 'ABC conditioning requires Melody or Full planning mode.';
    errorBox.hidden = false;
    return;
  }
  saveDraft();
  generateButton.disabled = true;
  generateButton.querySelector('span').textContent = 'Adding…';
  try {
    await requestJson('/api/queue/enqueue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'compose', payload: payload() }),
    });
    idleState.hidden = false;
    runningState.hidden = true;
    resultState.hidden = true;
    idleState.querySelector('h3').textContent = 'Song added to the queue';
    idleState.querySelector('p').textContent = 'You can change these inputs and add another song while the shared queue works.';
    showQueuePanel();
    await refreshQueue();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector('span').textContent = 'Add song to queue';
  }
});

style.addEventListener('input', updateCounts);
lyrics.addEventListener('input', updateCounts);
abc.addEventListener('input', syncCfg);
form.querySelectorAll('input[name="cot"]').forEach((el) => el.addEventListener('change', () => {
  if ($('#generation-preset').value === 'default') applyGenerationPreset('default', false);
  else syncCfg();
  saveDraft();
}));
$('#generation-preset').addEventListener('change', (event) => {
  if (event.target.value === 'custom') {
    updatePresetSummary();
    saveDraft();
  } else {
    applyGenerationPreset(event.target.value);
  }
});
['steps', 'cfg', 'semantic-temp', 'semantic-top-p', 'semantic-top-k', 'abc-temp', 'abc-top-p', 'abc-top-k'].forEach((id) => {
  document.getElementById(id).addEventListener('input', markPresetCustom);
});
$('#seed-mode').addEventListener('change', () => { syncSeedMode(); saveDraft(); });
$('#yue-model').addEventListener('change', () => { updateModelDescription(); saveDraft(); });
document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  const insertion = `${lyrics.value.trim() ? '\n\n' : ''}[${button.dataset.section}]\n`;
  const start = lyrics.selectionStart;
  lyrics.setRangeText(insertion, start, lyrics.selectionEnd, 'end');
  lyrics.focus(); updateCounts();
}));
generateButton.addEventListener('click', () => {
  if ($('#seed-mode').value === 'random') {
    rollSeed();
    saveDraft();
  }
});
$('#random-seed').addEventListener('click', () => { rollSeed(); saveDraft(); });
document.querySelectorAll('.info-button').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  showSettingInfo(button.dataset.info);
}));
$('#info-close').addEventListener('click', () => $('#info-dialog').close());
$('#info-dialog').addEventListener('click', (event) => {
  if (event.target === $('#info-dialog')) $('#info-dialog').close();
});
$('#example-button').addEventListener('click', () => {
  title.value = example.title;
  style.value = example.style;
  lyrics.value = example.lyrics;
  abc.value = '';
  form.querySelector('input[name="cot"][value="full"]').checked = true;
  $('#score-drawer').open = false;
  $('#seed-mode').value = 'random';
  applyPreset('semi');
  syncSeedMode();
  syncCfg();
  updateCounts();
  saveDraft();
});
$('#clear-compose').addEventListener('click', clearComposeInputs);
$('#clear-assistant').addEventListener('click', clearAssistantInputs);
$('#clear-transcription').addEventListener('click', clearTranscriptionInputs);
$('#abc-file').addEventListener('change', async (event) => { const file = event.target.files[0]; if (file) { abc.value = await file.text(); syncCfg(); } });
$('#clear-score').addEventListener('click', () => { abc.value = ''; $('#abc-file').value = ''; syncCfg(); });
$('#copy-seed').addEventListener('click', async () => { if (latestResult) { await navigator.clipboard.writeText(String(latestResult.seed)); $('#copy-seed').textContent = 'Copied'; setTimeout(() => { $('#copy-seed').textContent = 'Copy seed'; }, 1200); } });
$('#refresh-history').addEventListener('click', loadHistory);
$('#listening-search').addEventListener('input', renderListeningRoom);
$('#listening-filter').addEventListener('change', renderListeningRoom);
$('#listening-sort').addEventListener('change', renderListeningRoom);
$('#refresh-lyrics').addEventListener('click', loadLyricsHistory);
document.querySelectorAll('.open-library').forEach((button) => button.addEventListener('click', () => openLibraryFolder(button.dataset.library, button)));
$('#unload-button').addEventListener('click', async () => { const button = $('#unload-button'); button.disabled = true; button.textContent = 'Freeing…'; try { await requestJson('/api/unload', { method: 'POST' }); await refreshStatus(); } catch (error) { alert(error.message); } finally { button.disabled = false; button.textContent = 'Free VRAM'; } });
document.querySelectorAll('.tab-button').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('#theme-select').addEventListener('change', (event) => applyTheme(event.target.value));
$('#transcription-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  $('.audio-drop').classList.toggle('has-file', Boolean(file));
  $('#transcription-file-name').textContent = file ? `${file.name} · ${(file.size / (1024 ** 2)).toFixed(1)} MB` : 'WAV, MP3, FLAC, OGG, M4A, AAC, WMA, WEBM, or MP4; maximum 500 MB';
});
$('#transcription-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('#transcription-error');
  error.hidden = true;
  const file = $('#transcription-file').files[0];
  if (!file) { error.textContent = 'Choose an audio file first.'; error.hidden = false; return; }
  if (file.size > 500000000) { error.textContent = 'Choose an audio file smaller than 500 MB.'; error.hidden = false; return; }
  const button = $('#transcribe-button');
  button.disabled = true;
  button.querySelector('span').textContent = 'Adding…';
  transcriptionComparison?.stopPlayback();
  const query = new URLSearchParams({
    filename: file.name,
    score_mode: $('#score-content').value,
  });
  try {
    await requestJson(`/api/queue/transcribe?${query}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    $('#transcription-running').hidden = true;
    $('#transcription-result').hidden = true;
    $('#transcription-empty').hidden = false;
    $('#transcription-empty h3').textContent = 'Transcription added to the queue';
    $('#transcription-empty p').textContent = 'You can queue another file now. The finished score will load into the Score desk and remain in the Transcription library.';
    showQueuePanel();
    await refreshQueue();
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Add transcription to queue';
  }
});
$('#use-transcription').addEventListener('click', () => useTranscriptionInCompose());
$('#refresh-transcriptions').addEventListener('click', loadTranscriptions);
$('#assistant-form').addEventListener('submit', (event) => { event.preventDefault(); runAssistant('draft'); });
$('#surprise-button').addEventListener('click', () => runAssistant('surprise'));
$('#complete-surprise-button').addEventListener('click', () => runAssistant('complete_surprise'));
$('#brainstorm-button').addEventListener('click', () => runAssistant('brainstorm'));
$('#revise-button').addEventListener('click', () => runAssistant('revise'));
$('#ollama-model').addEventListener('change', saveAssistantDraft);
['song-brief', 'assistant-context', 'assistant-language', 'assistant-length', 'assistant-vocals', 'assistant-direction', 'assistant-must', 'assistant-avoid', 'revision-request'].forEach((id) => {
  document.getElementById(id).addEventListener('input', queueAssistantDraftSave);
});
$('#genre-search').addEventListener('input', (event) => renderGenres(event.target.value));
$('#official-example-search').addEventListener('input', () => { officialExampleLimit = 24; renderGuideExamples(); });
$('#official-example-filter').addEventListener('change', () => { officialExampleLimit = 24; renderGuideExamples(); });
$('#refresh-official-examples').addEventListener('click', () => loadOfficialExamples(true));
$('#show-more-official-examples').addEventListener('click', () => { officialExampleLimit += 24; renderGuideExamples(); });
$('#queue-clear-finished').addEventListener('click', async () => { await queuePost('/api/queue/clear'); await refreshQueue(); });
document.querySelectorAll('.guide-model-button').forEach((button) => button.addEventListener('click', () => {
  $('#yue-model').value = button.dataset.model;
  updateModelDescription();
  saveDraft();
  switchTab('compose');
  $('#yue-model').scrollIntoView({ behavior: 'smooth', block: 'center' });
}));
document.querySelectorAll('.copy-recipe').forEach((button) => button.addEventListener('click', async () => {
  const recipe = document.getElementById(`recipe-${button.dataset.recipe}`).textContent;
  await navigator.clipboard.writeText(recipe);
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1200);
}));
$('#use-song-button').addEventListener('click', () => {
  title.value = $('#assistant-title').value.trim();
  style.value = $('#assistant-style').value.trim();
  lyrics.value = $('#assistant-lyrics').value.trim();
  saveDraft();
  updateCounts();
  switchTab('compose');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

restoreDraft();
restoreAssistantDraft();
updateAssistantCounts();
applyTheme(localStorage.getItem('yue2-studio-theme') || 'studio', false);
initializeIntros();
initializeQueuePanel();
updateCounts();
syncCfg();
syncSeedMode();
updatePresetSummary();
refreshStatus();
loadHistory();
loadTranscriptions();
loadLyricsHistory();
loadOllamaModels();
renderGenres();
loadOfficialExamples();
refreshQueue();
const initialHash = location.hash.replace('#', '');
const savedTab = localStorage.getItem('yue2-studio-tab');
const requestedTab = ['assistant', 'transcribe', 'guide'].includes(initialHash) ? initialHash : savedTab;
switchTab(['assistant', 'transcribe', 'guide'].includes(requestedTab) ? requestedTab : 'compose');
setInterval(refreshStatus, 10000);
setInterval(refreshQueue, 2000);
