"use client";

import { Howl, Howler } from "howler";

/**
 * Lightweight audio engine on top of Howler.js.
 *
 * - BGM: one track at a time, automatic crossfade between scenes.
 * - SFX: cached per key, small pool so the same effect can overlap with
 *   itself (e.g. medal + page-turn in quick succession).
 * - Missing files fail silently — the game stays playable without audio.
 * - iOS/Safari autoplay: Howler's global unlock fires on the first user
 *   gesture; Web Audio mode (`html5: false`) lets later `.play()` calls
 *   work from useEffect-driven scene transitions.
 *
 * Race-condition handling — the original engine scheduled `old.stop()` via
 * `setTimeout` and *also* nulled `currentBgm` immediately. In React 18+
 * StrictMode this meant: mount → playBgm(A) → unmount → stopBgm (schedules
 * A.stop @650ms) → re-mount → playBgm(A) (cache-hit, fades same Howl in)
 * → @650ms the stale timeout fired and silenced A. We now track pending
 * stops by Howl and cancel them on every `playBgm` for the same Howl.
 */

// BGM sits well below narration so the voice reads clearly over the music.
// 0.18 lands narration ~15 dB above BGM — closer to pure audiobook balance,
// BGM still felt as ambience.
const BGM_VOLUME = 0.18;
const SFX_VOLUME = 0.7;
const CROSSFADE_MS = 1400;
const FADE_OUT_MS = 600;

class AudioEngine {
  private bgmCache = new Map<string, Howl>();
  private sfxCache = new Map<string, Howl>();
  private currentBgm: Howl | null = null;
  private currentBgmKey: string | null = null;
  private muted = false;
  /** Howl → scheduled stop() timeout. Cleared on cancel. */
  private pendingStops = new Map<Howl, ReturnType<typeof setTimeout>>();

  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
  }

  isMuted(): boolean {
    return this.muted;
  }

  playBgm(key: string, storyId?: string): void {
    const cacheKey = storyId ? `${storyId}/${key}` : key;
    const next = this.getOrCreateBgm(cacheKey, key, storyId);
    if (!next) return;

    // ALWAYS cancel any pending stop on `next` first — otherwise a stale
    // timeout from a recent stopBgm/crossfade-out will kill the playback
    // we're about to start (the StrictMode bug described in the file
    // header).
    this.cancelPendingStop(next);

    // Same Howl currently designated — just make sure it's actually
    // playing. Avoids restarting from 0 on every same-bgm scene change.
    if (this.currentBgm === next) {
      if (!next.playing()) {
        next.volume(BGM_VOLUME);
        next.play();
      }
      this.currentBgmKey = cacheKey;
      return;
    }

    // Different track requested — crossfade the previous one out.
    if (this.currentBgm) {
      const old = this.currentBgm;
      const startVol = old.volume();
      old.fade(startVol, 0, CROSSFADE_MS);
      this.scheduleStop(old, CROSSFADE_MS + 50);
    }

    // Fade in next. If it was mid-fadeout (same Howl reused soon after
    // stopBgm) start the fade from its current volume to avoid a hard cut.
    const startVol = next.playing() ? next.volume() : 0;
    if (!next.playing()) {
      next.volume(0);
      next.play();
    }
    next.fade(startVol, BGM_VOLUME, CROSSFADE_MS);

    this.currentBgm = next;
    this.currentBgmKey = cacheKey;
  }

  stopBgm(): void {
    if (!this.currentBgm) return;
    const old = this.currentBgm;
    const startVol = old.volume();
    old.fade(startVol, 0, FADE_OUT_MS);
    this.scheduleStop(old, FADE_OUT_MS + 50);
    this.currentBgm = null;
    this.currentBgmKey = null;
  }

  playSfx(key: string): void {
    const sfx = this.getOrCreateSfx(key);
    if (!sfx) return;
    sfx.play();
  }

  // ──────────────────────────────────────────────────────

  private scheduleStop(howl: Howl, delayMs: number): void {
    // Replace any existing scheduled stop for this Howl (don't pile up).
    this.cancelPendingStop(howl);
    const t = setTimeout(() => {
      howl.stop();
      this.pendingStops.delete(howl);
    }, delayMs);
    this.pendingStops.set(howl, t);
  }

  private cancelPendingStop(howl: Howl): void {
    const t = this.pendingStops.get(howl);
    if (t !== undefined) {
      clearTimeout(t);
      this.pendingStops.delete(howl);
    }
  }

  private getOrCreateBgm(
    cacheKey: string,
    key: string,
    storyId?: string,
  ): Howl | null {
    const cached = this.bgmCache.get(cacheKey);
    if (cached) return cached;
    const url = storyId
      ? `/stories/${storyId}/audio/bgm/${key}.mp3`
      : `/audio/bgm/${key}.mp3`;
    try {
      const howl = new Howl({
        src: [url],
        loop: true,
        volume: BGM_VOLUME,
        // Web Audio mode (html5:false) plays reliably after Howler's global
        // unlock on first user gesture. html5:true streams but each track
        // creates its own <audio> element that iOS refuses to play unless
        // `.play()` is invoked inside a gesture handler — which we can't
        // guarantee from useEffect-driven scene transitions.
        html5: false,
        preload: true,
        onloaderror: (_id, err) => {
          this.bgmCache.delete(cacheKey);
          if (this.currentBgmKey === cacheKey) {
            this.currentBgm = null;
            this.currentBgmKey = null;
          }
          console.warn(`[audio] BGM load failed: ${url}`, err);
        },
        onplayerror: (_id, err) => {
          console.warn(`[audio] BGM play failed: ${url}`, err);
        },
      });
      this.bgmCache.set(cacheKey, howl);
      return howl;
    } catch (err) {
      console.warn(`[audio] BGM Howl ctor failed: ${url}`, err);
      return null;
    }
  }

  private getOrCreateSfx(key: string): Howl | null {
    const cached = this.sfxCache.get(key);
    if (cached) return cached;
    try {
      const howl = new Howl({
        src: [
          `/audio/sfx/${key}.mp3`,
          `/audio/sfx/${key}.ogg`,
          `/audio/sfx/${key}.wav`,
          `/audio/sfx/${key}.m4a`,
        ],
        volume: SFX_VOLUME,
        pool: 4,
        onloaderror: () => {
          this.sfxCache.delete(key);
        },
      });
      this.sfxCache.set(key, howl);
      return howl;
    } catch {
      return null;
    }
  }
}

let _instance: AudioEngine | null = null;

/** Lazy singleton — safe to call from any client component or effect. */
export function getAudio(): AudioEngine {
  if (typeof window === "undefined") {
    return {
      setMuted: () => {},
      isMuted: () => false,
      playBgm: () => {},
      stopBgm: () => {},
      playSfx: () => {},
    } as unknown as AudioEngine;
  }
  if (!_instance) _instance = new AudioEngine();
  return _instance;
}

/** Named SFX keys — keep in sync with files in /public/audio/sfx/ */
export const SFX = {
  MEDAL: "medal-earned",
  PAGE_TURN: "page-turn",
  CHOICE: "choice-select",
  SEND: "free-input-send",
  STAT_UP: "stat-up",
  COMPANION: "companion-joined",
} as const;
