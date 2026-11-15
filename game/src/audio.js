// Procedural sound: every effect is synthesised with WebAudio, so the game ships
// no audio files and makes no network request. A shot is a short noise burst with
// a low thump, a reload is two clicks, a hit is a tick, the bomb is a beep that
// quickens, and a round win is a small two-note rise.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst(dur, freq, gain, type = 'lowpass') {
    if (!ensure() || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(freq, dur, gain, type = 'sine', when = 0) {
    if (!ensure() || !enabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock() {
      ensure();
    },
    setEnabled(v) {
      enabled = v;
    },
    shot() {
      burst(0.09, 2400, 0.5);
      tone(140, 0.08, 0.4, 'triangle');
    },
    enemyShot() {
      burst(0.08, 1500, 0.22);
    },
    reload() {
      tone(900, 0.05, 0.25, 'square');
      tone(600, 0.05, 0.25, 'square', 0.12);
    },
    hit() {
      tone(1400, 0.05, 0.3, 'square');
    },
    kill() {
      tone(1400, 0.06, 0.3, 'square');
      tone(1800, 0.08, 0.3, 'square', 0.07);
    },
    hurt() {
      tone(180, 0.15, 0.4, 'sawtooth');
    },
    explosion() {
      burst(0.7, 300, 0.9);
      tone(60, 0.6, 0.6, 'sine');
    },
    beep() {
      tone(1100, 0.07, 0.3, 'square');
    },
    plant() {
      tone(700, 0.1, 0.3, 'square');
      tone(1000, 0.12, 0.3, 'square', 0.12);
    },
    roundWin() {
      tone(523, 0.14, 0.3, 'triangle');
      tone(784, 0.2, 0.3, 'triangle', 0.14);
    },
    roundLose() {
      tone(392, 0.16, 0.3, 'triangle');
      tone(262, 0.24, 0.3, 'triangle', 0.16);
    },
    buy() {
      tone(1200, 0.05, 0.25, 'square');
      tone(1600, 0.06, 0.25, 'square', 0.06);
    },
    denied() {
      tone(220, 0.12, 0.3, 'square');
    },
  };
}
