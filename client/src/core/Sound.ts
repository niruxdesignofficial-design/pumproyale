// WebAudio SFX layer. The game calls sound.play("click") etc.; buffers are the
// curated Kenney CC0 OGGs copied to /assets/audio by the asset pipeline. Audio is
// only created/resumed after the first user gesture (browsers block it before).

export type SoundName =
  | "click"
  | "back"
  | "confirm"
  | "error"
  | "hover"
  | "tick"
  | "go"
  | "goal"
  | "pickup"
  | "shoot"
  | "win"
  | "lose";

const FILES: Record<SoundName, string> = {
  click: "click",
  back: "back",
  confirm: "confirm",
  error: "error",
  hover: "hover",
  tick: "tick",
  go: "go",
  goal: "goal",
  pickup: "pickup",
  shoot: "shoot",
  win: "win",
  lose: "lose",
};

const VOLUME: Partial<Record<SoundName, number>> = {
  hover: 0.3,
  shoot: 0.5,
  tick: 0.6,
  pickup: 0.6,
};

type Ctor = typeof AudioContext;

const MASTER_VOL = 0.7;
const MUSIC_VOL = 0.085;
const STEP_DUR = 0.42; // seconds per arpeggio step
const MUTE_KEY = "pr-muted";

// A calm, looping pad + pentatonic arpeggio (the Kenney packs ship SFX only, so
// the music is synthesized). Four bars of gentle chords; an 8-note arpeggio rides
// on top of each bar.
const CHORDS: number[][] = [
  [130.81, 164.81, 196.0], // C
  [110.0, 130.81, 164.81], // Am
  [87.31, 130.81, 174.61], // F
  [98.0, 146.83, 196.0], // G
];
const ARP = [261.63, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63]; // C major pentatonic
const STEPS = 8 * CHORDS.length;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private muted = false;

  /** Enable once the user has interacted (browsers block audio before that). */
  enable(): void {
    if (this.ctx) {
      void this.ctx.resume();
      this.startMusic();
      return;
    }
    const Ctx: Ctor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.muted = loadMuted();
    this.master.gain.value = this.muted ? 0 : MASTER_VOL;
    this.master.connect(this.ctx.destination);
    void this.preload();
    this.startMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, this.ctx.currentTime, 0.05);
    }
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // ignore storage errors (private mode)
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Start the looping background music (idempotent). */
  private startMusic(): void {
    if (!this.ctx || !this.master || this.musicTimer !== null) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOL;
    this.musicGain.connect(this.master);
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  /** Lookahead scheduler: queue any notes due within the next ~0.3s. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      const inBar = this.step % 8;
      if (inBar === 0) {
        this.playPad(CHORDS[Math.floor(this.step / 8) % CHORDS.length]!, this.nextNoteTime);
      }
      this.playArp(ARP[this.step % ARP.length]!, this.nextNoteTime);
      this.step = (this.step + 1) % STEPS;
      this.nextNoteTime += STEP_DUR;
    }
  }

  private playPad(freqs: number[], time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const dur = STEP_DUR * 8;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.16, time + 1.2);
      g.gain.linearRampToValueAtTime(0, time + dur);
      osc.connect(g).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.1);
    }
  }

  private playArp(freq: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.45, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    osc.connect(g).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  private async preload(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.keys(FILES) as SoundName[]).map(async (name) => {
        try {
          const res = await fetch(`/assets/audio/${FILES[name]}.ogg`);
          const data = await res.arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch {
          // Missing audio is non-fatal (game stays silent for that cue).
        }
      }),
    );
  }

  play(name: SoundName): void {
    if (this.muted || !this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = VOLUME[name] ?? 0.85;
    src.connect(gain).connect(this.master);
    src.start();
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export const sound = new SoundManager();
