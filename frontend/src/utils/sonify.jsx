// ─── data sonification engine ────────────────────────────────────────────────

// C4 major pentatonic + 3 ноты октавой выше = 8 нот
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

// 4 длительности: top 2 бита байта (0b00 → 0b11)
const DURATIONS = [0.10, 0.16, 0.22, 0.32];

// байт → { freq, duration, volume }
export const byteToNote = (byte) => ({
  freq:     SCALE[byte & 0x07],              // биты 0-2 → нота
  duration: DURATIONS[(byte >> 6) & 0x03],  // биты 6-7 → длительность
  volume:   0.08 + ((byte >> 2) & 0x0F) / 15 * 0.13, // биты 2-5 → громкость
});

// SHA-256 через Web Crypto
export const sha256 = async (text) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
};

// шестнадцатеричная строка хэша
export const toHex = (bytes) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

let _ctx = null;
const getCtx = () => {
  if (!_ctx || _ctx.state === "closed")
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
};

let _stopFlag = false;
const _timers = [];

const clearTimers = () => {
  _timers.forEach(clearTimeout);
  _timers.length = 0;
};

// играет массив байт; onNote(i) вызывается перед каждой нотой, onEnd — в конце
export const playSonification = (bytes, { onNote, onEnd, speed = 1 } = {}) => {
  _stopFlag = false;
  clearTimers();

  const c = getCtx();
  if (c.state === "suspended") c.resume();

  let t = c.currentTime + 0.05;
  let elapsed = 0;

  bytes.forEach((byte, i) => {
    const { freq, duration, volume } = byteToNote(byte);
    const gap = 0.025;
    const scaledDur = duration / speed;

    // Web Audio — планируем ноту заранее
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

    // UI callback — setTimeout синхронизирован с аудио
    const delay = elapsed * 1000;
    _timers.push(setTimeout(() => { if (!_stopFlag) onNote?.(i); }, delay));

    t += scaledDur + gap;
    elapsed += scaledDur + gap;
  });

  _timers.push(setTimeout(() => { if (!_stopFlag) onEnd?.(); }, elapsed * 1000));
};

export const stopSonification = () => {
  _stopFlag = true;
  clearTimers();
  if (_ctx) { _ctx.close(); _ctx = null; }
};
