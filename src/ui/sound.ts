/**
 * Seed sounds, synthesised with Web Audio (no audio files): a short wooden "tok" when a
 * komwe drops into a pit, a duller knock for a lift and a rattle for a capture.
 * Muted state lives in storage; nothing plays until the first user gesture unlocks audio.
 */
import { store } from './storage';

let ctx: AudioContext | null = null;
let muted = !store.sound();
let last = 0;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A damped wooden knock: a low sine with a fast pitch drop plus a filtered click. */
function knock(freq: number, gain: number, at = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.13);
  // the click of seed on wood
  const n = a.createBufferSource();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.025), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  n.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * 6;
  f.Q.value = 3;
  const ng = a.createGain();
  ng.gain.value = gain * 0.6;
  n.connect(f).connect(ng).connect(a.destination);
  n.start(t);
}

export const sound = {
  get muted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    store.setSound(!m);
    if (!m) knock(520, 0.12);
  },
  /** One seed dropped. Rate-limited so very fast sowings don't turn into noise. */
  sow(pit: number) {
    const now = performance.now();
    if (now - last < 28) return;
    last = now;
    knock(430 + (pit % 8) * 22 + Math.random() * 30, 0.09);
  },
  lift() { knock(260, 0.12); },
  place() { knock(600, 0.1); },
  capture() { for (let k = 0; k < 4; k++) knock(340 + Math.random() * 160, 0.08, k * 0.035); },
  end() { knock(200, 0.07); },
};
