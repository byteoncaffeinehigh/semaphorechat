declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

let _ctx: AudioContext | null = null;
const getCtx = (): AudioContext => {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
};

// ─── call ringtone — generative (Brian Eno style) ────────────────────────────

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];
const BASS  = [130.81, 196.00];

const jitter = (base: number, range: number): number => base + (Math.random() - 0.5) * range * 2;

const playSynthNote = (c: AudioContext, freq: number, t: number, dur: number, vol: number): void => {
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.38);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t); osc.stop(t + dur + 0.05);
};

const playBassNote = (c: AudioContext, freq: number, t: number, dur: number, vol: number): void => {
  ([[1, vol], [2, vol * 0.25]] as [number, number][]).forEach(([h, v]) => {
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * h;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  });
};

const schedulePhrase = (c: AudioContext, startT: number): number => {
  const rest = [1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, 2);
  const noteIdxs = [0, ...rest];
  const offsets = [0, jitter(1.4, 0.22), jitter(3.0, 0.28)];

  noteIdxs.forEach((idx, i) => {
    let freq = PENTA[idx];
    if (Math.random() < 0.18) freq *= 0.5;
    const vol = jitter(0.11, 0.03);
    const dur = jitter(2.0, 0.4);
    playSynthNote(c, freq, startT + offsets[i], dur, vol);
  });

  const bassFreq = BASS[Math.random() < 0.65 ? 0 : 1];
  playBassNote(c, bassFreq, startT + jitter(0.7, 0.3), jitter(2.6, 0.4), 0.10);

  return jitter(5.8, 0.6);
};

let _ringtoneStopped = false;
let _ringtoneTimer: ReturnType<typeof setTimeout> | null = null;

export const startCallRingtone = (): void => {
  _ringtoneStopped = false;

  const loop = (): void => {
    if (_ringtoneStopped) return;
    const c = getCtx();
    if (c.state === "suspended") c.resume();
    const dur = schedulePhrase(c, c.currentTime + 0.05);
    _ringtoneTimer = setTimeout(loop, (dur - 0.35) * 1000);
  };

  loop();
};

export const stopCallRingtone = (): void => {
  _ringtoneStopped = true;
  if (_ringtoneTimer) { clearTimeout(_ringtoneTimer); _ringtoneTimer = null; }
  if (_ctx) {
    _ctx.close().catch(() => {});
    _ctx = null;
  }
};

export const playKeyClick = (): void => {
  try {
    const c = getCtx();
    const len = Math.floor(c.sampleRate * 0.018);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = 0.12;
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
  } catch {}
};

export const playNotificationBeep = (): void => {
  try {
    const c = getCtx();
    [880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, c.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.13 + 0.18);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + i * 0.13);
      osc.stop(c.currentTime + i * 0.13 + 0.18);
    });
  } catch {}
};
