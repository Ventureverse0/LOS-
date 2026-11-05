let labAudioCtx: AudioContext | null = null;

function getLabAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!labAudioCtx) {
    labAudioCtx = new Ctx();
  }
  if (labAudioCtx.state === "suspended") {
    labAudioCtx.resume().catch(() => {});
  }
  return labAudioCtx;
}

export function playLaunchRailSound(speedRatio: number, muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const clamped = Math.min(1.5, Math.max(0.4, speedRatio));

  // Electromagnetic rail sweep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(150 * clamped, now);
  osc.frequency.exponentialRampToValueAtTime(620 * clamped, now + 0.08);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(320, now + 0.22);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

export function playBeaconResonanceSound(comboIndex: number, muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Harmonic series chord scaled by combo
  const baseFreq = 329.63 * Math.pow(1.06, Math.min(8, comboIndex)); // E4 upward
  const ratios = [1, 1.25, 1.5, 2.0];

  ratios.forEach((ratio, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = idx === 3 ? "sine" : "triangle";
    const t0 = now + idx * 0.045;
    osc.frequency.setValueAtTime(baseFreq * ratio, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.075 / (1 + idx * 0.2), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.38);
  });
}

export function playHazardTelegraphSound(muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(260, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.26);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

export function playShockImpactSound(weight: number, muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const w = Math.min(1.4, Math.max(0.35, weight));

  // Sub-bass kinetic thud
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(125 * w, now);
  osc.frequency.exponentialRampToValueAtTime(36, now + 0.26);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14 * w, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

export function playBoostJumpSound(muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(340, now + 0.14);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

export function playStageClearFanfare(muted: boolean): void {
  if (muted) return;
  const ctx = getLabAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  const notes = [440, 554.37, 659.25, 880, 1108.73];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i >= 3 ? "sine" : "triangle";
    const t0 = now + i * 0.075;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.085, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.45);
  });
}
