// ─── data sonification engine ────────────────────────────────────────────────

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
const DURATIONS = [0.10, 0.16, 0.22, 0.32];

export interface Note {
  freq: number;
  duration: number;
  volume: number;
}

export const byteToNote = (byte: number): Note => ({
  freq:     SCALE[byte & 0x07],
  duration: DURATIONS[(byte >> 6) & 0x03],
  volume:   0.08 + ((byte >> 2) & 0x0F) / 15 * 0.13,
});

export const sha256 = async (text: string): Promise<Uint8Array> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
};

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

let _ctx: AudioContext | null = null;
const getCtx = (): AudioContext => {
  if (!_ctx || _ctx.state === "closed")
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
};

let _stopFlag = false;
const _timers: ReturnType<typeof setTimeout>[] = [];

const clearTimers = (): void => {
  _timers.forEach(clearTimeout);
  _timers.length = 0;
};

export interface SonifyOptions {
  onNote?: (index: number) => void;
  onEnd?: () => void;
  speed?: number;
}

export const playSonification = (bytes: Uint8Array | number[], options: SonifyOptions = {}): void => {
  const { onNote, onEnd, speed = 1 } = options;
  _stopFlag = false;
  clearTimers();

  const c = getCtx();
  if (c.state === "suspended") c.resume();

  let t = c.currentTime + 0.05;
  let elapsed = 0;

  Array.from(bytes).forEach((byte, i) => {
    const { freq, duration, volume } = byteToNote(byte);
    const gap = 0.025;
    const scaledDur = duration / speed;

    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + scaledDur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + scaledDur + 0.01);

    const delay = elapsed * 1000;
    _timers.push(setTimeout(() => { if (!_stopFlag) onNote?.(i); }, delay));

    t += scaledDur + gap;
    elapsed += scaledDur + gap;
  });

  _timers.push(setTimeout(() => { if (!_stopFlag) onEnd?.(); }, elapsed * 1000));
};

export const stopSonification = (): void => {
  _stopFlag = true;
  clearTimers();
  if (_ctx) { _ctx.close(); _ctx = null; }
};
