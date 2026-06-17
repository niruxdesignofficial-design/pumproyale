// Lightweight sound hook layer. Audio playback is stubbed: the game calls
// sound.play("jump") etc. at the right moments, and CC0 audio buffers can be
// dropped in later without touching gameplay code.
//
// To enable audio: place CC0 .ogg/.mp3 files in client/public/audio, load them
// into `buffers` (e.g. via the WebAudio API on first user gesture), and play in
// `play()`.

export type SoundName = "jump" | "bump" | "eliminate" | "win" | "lose" | "countdown";

class SoundManager {
  private enabled = false;

  /** Enable once the user has interacted (browsers block audio before that). */
  enable(): void {
    this.enabled = true;
  }

  play(_name: SoundName): void {
    if (!this.enabled) return;
    // Intentionally a no-op until audio assets are added. Hook point for SFX.
  }
}

export const sound = new SoundManager();
