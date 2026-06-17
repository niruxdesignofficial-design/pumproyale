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

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private muted = false;

  /** Enable once the user has interacted (browsers block audio before that). */
  enable(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx: Ctor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    void this.preload();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
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

export const sound = new SoundManager();
