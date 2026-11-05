let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playSoundEffect(type: "xp" | "complete" | "levelup" | "timer", enabled: boolean = true): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const playTone = (freq: number, startOffset: number, duration: number, gainPeak: number, wave: OscillatorType = "sine") => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now + startOffset);

    gain.gain.setValueAtTime(0.0001, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  if (type === "xp") {
    playTone(587.33, 0, 0.12, 0.06, "triangle"); // D5
    playTone(880, 0.06, 0.16, 0.06, "triangle"); // A5
  } else if (type === "complete") {
    playTone(523.25, 0, 0.15, 0.08, "triangle"); // C5
    playTone(659.25, 0.07, 0.18, 0.08, "triangle"); // E5
    playTone(783.99, 0.14, 0.25, 0.09, "triangle"); // G5
    playTone(1046.5, 0.21, 0.35, 0.09, "sine"); // C6
  } else if (type === "levelup") {
    playTone(440, 0, 0.14, 0.09, "triangle");
    playTone(554.37, 0.08, 0.16, 0.09, "triangle");
    playTone(659.25, 0.16, 0.18, 0.1, "triangle");
    playTone(880, 0.24, 0.32, 0.11, "sine");
    playTone(1108.73, 0.34, 0.45, 0.1, "sine");
  } else if (type === "timer") {
    playTone(783.99, 0, 0.2, 0.08, "sine");
    playTone(987.77, 0.15, 0.28, 0.08, "sine");
  }
}

export function triggerConfettiBurst(): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const container = document.createElement("div");
  container.className = "fixed inset-0 pointer-events-none z-[100] overflow-hidden";
  document.body.appendChild(container);

  const colors = ["#4cd7f6", "#06b6d4", "#ffb95f", "#4edea3", "#dfe2ef"];
  const count = 34;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    const color = colors[i % colors.length];
    const startX = 42 + (Math.random() - 0.5) * 24; // vw around center-top
    const startY = 12 + Math.random() * 10; // vh
    const tx = (Math.random() - 0.5) * 360;
    const ty = 120 + Math.random() * 260;
    const rot = (Math.random() - 0.5) * 640;

    dot.className = "confetti-particle absolute w-2 h-2 rounded-xs";
    dot.style.left = `${startX}vw`;
    dot.style.top = `${startY}vh`;
    dot.style.backgroundColor = color;
    dot.style.boxShadow = `0 0 8px ${color}`;
    dot.style.setProperty("--tx", `${tx}px`);
    dot.style.setProperty("--ty", `${ty}px`);
    dot.style.setProperty("--rot", `${rot}deg`);

    container.appendChild(dot);
  }

  window.setTimeout(() => {
    container.remove();
  }, 1100);
}
