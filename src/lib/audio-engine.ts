"use client";

import { Howl, Howler } from "howler";

/**
 * Lightweight audio engine on top of Howler.js.
 *
 * - BGM: one track at a time, automatic crossfade between scenes.
 * - SFX: cached per key, small pool so the same effect can overlap with
 *   itself (e.g. two attacks in quick succession). Each key resolves its
 *   file extension via a fallback chain (mp3 → ogg → wav → m4a).
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

/** Named SFX keys — keep in sync with files in /public/audio/sfx/ */
export const SFX = {
  MEDAL: "medal-earned",
  CHOICE: "choice-select",
  SEND: "free-input-send",
  STAT_UP: "stat-up",
  COMPANION: "companion-joined",
  /** Item used (e.g. potion in battle). */
  ITEM: "ruby-click",
  /** Battle attack lands (hit / crit). */
  ATTACK: "attack",
  /** Battle attack misses (target dodges). */
  DODGE: "dodge",
  /** Battle won — short victory stinger. */
  VICTORY: "victory",
  /** Battle lost — short defeat stinger. */
  DEFEAT: "defeat",
} as const;

/**
 * Extensions an SFX may ship as, tried in order. Howler only does codec
 * selection (it picks the first src whose codec the browser supports, then
 * never retries on a 404), so a key that exists only as `.ogg` while the
 * browser also "supports" `.mp3` would 404 and stay silent. We therefore
 * drive the fallback ourselves — exactly like the image layer trying each
 * extension until one actually loads.
 */
const SFX_EXTS = ["mp3", "ogg", "wav", "m4a"] as const;

/** Same idea for BGM (mp3 first — most music ships as mp3, so no wasted 404). */
const BGM_EXTS = ["mp3", "ogg", "m4a", "wav"] as const;

class AudioEngine {
  private bgmCache = new Map<string, Howl>();
  private sfxCache = new Map<string, Howl>();
  /** Keys whose play was requested while their extension was still resolving —
   *  fired from the resolved Howl's `onload` so the first occurrence of a
   *  fallback-only (e.g. wav-only) effect isn't swallowed. */
  private sfxWantPlay = new Set<string>();
  private currentBgm: Howl | null = null;
  private currentBgmKey: string | null = null;
  private muted = false;
  /** Per-channel volumes (0–1), seeded from the historic mix defaults. The
   *  Settings sliders adjust these live (narration/voice is a separate <audio>
   *  element handled in NarrationAudio, not routed through Howler). */
  private bgmVolume = BGM_VOLUME;
  private sfxVolume = SFX_VOLUME;
  /** Howl → scheduled stop() timeout. Cleared on cancel. */
  private pendingStops = new Map<Howl, ReturnType<typeof setTimeout>>();

  constructor() {
    // Warm every known SFX up front so the working file extension is resolved
    // during page load. On a cold cache the first trigger would otherwise be
    // swallowed while the 404/codec fallback chain settles (the play() is
    // queued on a Howl that then fails to load). Only ever runs client-side —
    // getAudio() returns a no-op stub on the server.
    for (const key of Object.values(SFX)) this.getOrCreateSfx(key);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Set the background-music volume (0–1), applied live to the current track.
   *
   * Uses a short `fade()` rather than `volume()`. On a continuously-playing
   * Web Audio track, Howler's `volume()` writes the gain with
   * `setValueAtTime`, which gets masked by the fade-in's `linearRampToValueAtTime`
   * still sitting on the AudioParam's automation timeline — so the audible gain
   * never moves (verified: gain stayed 0.18 after volume(0)). `fade()` issues a
   * new linearRamp, which DOES move the gain (it's exactly what the fade-in used).
   */
  setBgmVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    const cb = this.currentBgm;
    if (!cb) return;
    if (cb.playing()) {
      cb.fade(cb.volume(), this.bgmVolume, 100);
    } else {
      cb.volume(this.bgmVolume);
    }
  }

  /** Set the sound-effects volume (0–1), applied to every cached effect. */
  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    for (const h of this.sfxCache.values()) h.volume(this.sfxVolume);
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
        next.volume(this.bgmVolume);
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
    next.fade(startVol, this.bgmVolume, CROSSFADE_MS);

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
    if (sfx.state() === "loaded") {
      sfx.play();
    } else {
      // Still resolving its extension — defer the play to the resolved Howl's
      // onload (carries through to the fallback file if this one 404s), so the
      // very first trigger of a fallback-only effect isn't silently dropped.
      this.sfxWantPlay.add(key);
    }
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

  /**
   * Build a BGM Howl for `key` at extension index `i`, falling back to the
   * next extension on a load failure. Howler never retries past the first
   * codec-supported source, so an `.ogg`-only track would 404 on a hardcoded
   * `.mp3` and stay silent. If the failing track is still the one we want
   * playing, fade the working Howl in directly — playBgm's original
   * play()/fade() were queued on the dead Howl and will never fire.
   */
  private loadBgm(
    cacheKey: string,
    key: string,
    storyId: string | undefined,
    i: number,
  ): Howl | null {
    if (i >= BGM_EXTS.length) {
      this.bgmCache.delete(cacheKey);
      if (this.currentBgmKey === cacheKey) {
        this.currentBgm = null;
        this.currentBgmKey = null;
      }
      console.warn(
        `[audio] BGM not found (tried ${BGM_EXTS.join("/")}): ${cacheKey}`,
      );
      return null;
    }
    const url = storyId
      ? `/stories/${storyId}/audio/bgm/${key}.${BGM_EXTS[i]}`
      : `/audio/bgm/${key}.${BGM_EXTS[i]}`;
    try {
      const howl = new Howl({
        src: [url],
        loop: true,
        volume: this.bgmVolume,
        // Web Audio mode (html5:false) plays reliably after Howler's global
        // unlock on first user gesture. html5:true streams but each track
        // creates its own <audio> element that iOS refuses to play unless
        // `.play()` is invoked inside a gesture handler — which we can't
        // guarantee from useEffect-driven scene transitions.
        html5: false,
        preload: true,
        onloaderror: () => {
          // 404 or undecodable codec — advance to the next extension.
          const replacement = this.loadBgm(cacheKey, key, storyId, i + 1);
          if (replacement && this.currentBgmKey === cacheKey) {
            this.cancelPendingStop(replacement);
            this.currentBgm = replacement;
            replacement.volume(0);
            replacement.play();
            replacement.fade(0, this.bgmVolume, CROSSFADE_MS);
          }
        },
        onplayerror: (_id, err) => {
          console.warn(`[audio] BGM play failed: ${url}`, err);
        },
      });
      this.bgmCache.set(cacheKey, howl);
      return howl;
    } catch {
      return this.loadBgm(cacheKey, key, storyId, i + 1);
    }
  }

  private getOrCreateBgm(
    cacheKey: string,
    key: string,
    storyId?: string,
  ): Howl | null {
    return (
      this.bgmCache.get(cacheKey) ?? this.loadBgm(cacheKey, key, storyId, 0)
    );
  }

  /**
   * Build a Howl for `key` at extension index `i`, falling back to the next
   * extension on a load failure (missing file or undecodable codec). The most
   * recent attempt is what stays in the cache, so once the chain settles the
   * cache holds a Howl backed by a file that actually loads.
   */
  private loadSfx(key: string, i: number): Howl | null {
    if (i >= SFX_EXTS.length) {
      this.sfxCache.delete(key);
      this.sfxWantPlay.delete(key); // no playable file — give up
      return null;
    }
    try {
      const howl = new Howl({
        src: [`/audio/sfx/${key}.${SFX_EXTS[i]}`],
        volume: this.sfxVolume,
        pool: 4,
        onload: () => {
          // A play requested while the extension was still resolving (the
          // initial Howl 404'd) lands here once a working file is ready.
          if (this.sfxWantPlay.delete(key)) howl.play();
        },
        onloaderror: () => {
          // This extension 404'd or the browser can't decode it — try next.
          this.loadSfx(key, i + 1);
        },
      });
      this.sfxCache.set(key, howl);
      return howl;
    } catch {
      return this.loadSfx(key, i + 1);
    }
  }

  private getOrCreateSfx(key: string): Howl | null {
    return this.sfxCache.get(key) ?? this.loadSfx(key, 0);
  }
}

// The singleton lives on globalThis (not a module-scoped `let`) so it survives
// dev hot-reloads. HMR re-evaluates this module, which would orphan the running
// BGM on the old instance while a fresh module-scoped instance (currentBgm =
// null) answers getAudio() — making volume changes silently hit the wrong
// engine. One instance keyed on globalThis avoids that whole class of bug.
type AudioGlobal = typeof globalThis & { __storyRangerAudio?: AudioEngine };

/** Lazy singleton — safe to call from any client component or effect. */
export function getAudio(): AudioEngine {
  if (typeof window === "undefined") {
    return {
      setMuted: () => {},
      isMuted: () => false,
      setBgmVolume: () => {},
      setSfxVolume: () => {},
      playBgm: () => {},
      stopBgm: () => {},
      playSfx: () => {},
    } as unknown as AudioEngine;
  }
  const g = globalThis as AudioGlobal;
  g.__storyRangerAudio ??= new AudioEngine();
  return g.__storyRangerAudio;
}
