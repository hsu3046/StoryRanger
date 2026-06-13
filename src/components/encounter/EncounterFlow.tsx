"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type {
  AttackerId,
  Character,
  CompanionId,
  CompanionMoods,
  PartyHp,
  SpeakerId,
} from "@/types/story";
import type { EncounterDef } from "@/types/encounter";
import type { BattleState } from "@/lib/battle-engine";
import type { Challenge } from "@/lib/education";
import { encounterIntroLine } from "@/lib/encounter-lines";
import { assetUrl } from "@/lib/asset-paths";
import { getAudio, SFX } from "@/lib/audio-engine";

import { BattleScreen } from "../battle/BattleScreen";
import { EncounterCaption } from "./EncounterCaption";
import { monstersFor } from "@/data/monsters";

export interface EncounterResult {
  encounterId: string;
  outcome: "victory" | "defeat" | "escaped";
  /** Final HP per attacker after the battle. */
  partyHp: PartyHp;
  /** Attackers KO'd this encounter — appended to PlayState.fallenAttackers. */
  fallenAttackers: AttackerId[];
  itemsGained: string[];
  /** Consumables spent during the battle — removed from inventory. */
  itemsConsumed: string[];
  moodBoost?: { companionId: CompanionId; delta: number }[];
}

interface Props {
  encounter: EncounterDef;
  /** True when this encounter id is already in PlayState.completedEncounters.
   *  Battles deliberately RE-TRIGGER on branch revisits (looping stories are
   *  a supported authoring pattern) — but drops / encounter rewards /
   *  moodBoost are granted on the FIRST clear only, so a loop can't be
   *  farmed. Gates both the grant (onComplete) and the victory-screen list. */
  alreadyCleared?: boolean;
  storyId: string;
  /** Story id to resolve DERIVED monster-sprite paths against — a cloned
   *  story passes its clone source here (content lookups keep `storyId`).
   *  Defaults to `storyId` for every non-clone. */
  assetStoryId?: string;
  companions: CompanionId[];
  companionMoods: CompanionMoods;
  /** Persistent HP carried in from PlayState. */
  partyHp: PartyHp;
  partyMaxHp: PartyHp;
  fallenAttackers: AttackerId[];
  /** Resolves to an image base path WITHOUT extension. `mode` swaps in the
   *  battle-stance art for the combat phase. */
  characterImageBase: (
    id: SpeakerId | CompanionId,
    mode?: "default" | "battle",
  ) => string;
  /** The story's protagonist id — maps the battle "hero" attacker to its
   *  speaker/sprite/name. */
  heroId: SpeakerId;
  /** Character roster — forwarded to BattleScreen for sprite sizing. */
  characters: readonly Character[];
  /** Player inventory — forwarded to BattleScreen's in-battle item row. */
  inventory: string[];
  /** Saved battle snapshot — when present we skip the alert splash and
   *  remount BattleScreen on this exact state (refresh-resume). */
  initialBattleState?: BattleState;
  /** Fires on every BattleState change so the parent can persist it. */
  onBattleStateChange?: (state: BattleState) => void;
  onComplete: (result: EncounterResult) => void;
  /** "Try again" after a defeat — restart this battle fresh (parent restores
   *  the party + re-mounts via a key bump). */
  onRetry?: () => void;
  /** Open the parent's Settings modal — surfaced inside battle. */
  onOpenSettings?: () => void;
  /** Player's age (from onboarding) — forwarded to BattleScreen for challenge
   *  difficulty tiering. */
  age: number;
  /** When set, called with a missed challenge so the home "Check Your Answers"
   *  review can collect it. Undefined in admin preview / demo (no recording). */
  recordWrongChallenge?: (challenge: Challenge) => void;
}

type Phase = "intro" | "alert" | "body";

/** How long the intro narration line lingers before the alert splash. */
const INTRO_DURATION_MS = 1500;
/** How long the alert splash plays before the battle starts. */
const ALERT_DURATION_MS = 2200;

/**
 * Battle encounter overlay. Dramatic alert splash (monsters + headline) →
 * straight into the BattleScreen. No "Ready!" confirmation; the splash
 * itself is the pacing beat.
 *
 * Story-style encounters were folded into Scene (`reward`) and Branch
 * (`puzzle` / `requires` / `reward` / `onFailMode`) in v3.
 */
export function EncounterFlow({
  encounter,
  alreadyCleared = false,
  storyId,
  assetStoryId = storyId,
  companions,
  companionMoods,
  partyHp,
  partyMaxHp,
  fallenAttackers,
  characterImageBase,
  heroId,
  characters,
  inventory,
  initialBattleState,
  onBattleStateChange,
  onComplete,
  onRetry,
  onOpenSettings,
  age,
  recordWrongChallenge,
}: Props) {
  void characterImageBase; // only used inside BattleScreen now
  // Resume directly into the battle when we have a saved snapshot — the
  // intro line + alert splash are purely intro flair, not worth replaying on
  // refresh.
  const [phase, setPhase] = useState<Phase>(
    initialBattleState ? "body" : "intro",
  );

  const monsterIds =
    encounter.displayMonsters ?? encounter.body.monsterIds;
  // Stable per-encounter seed so the intro line doesn't re-roll each render
  // (and consecutive encounters read different lines).
  const introLine = useMemo(() => {
    const seed = [...encounter.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const lead = monsterIds[0];
    const name = lead ? (monstersFor(storyId)[lead]?.name ?? lead) : undefined;
    return encounterIntroLine({ kind: "battle", name, seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monsterIds[0] captured via id
  }, [encounter.id]);

  // Auto-advance intro → alert → body.
  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => setPhase("alert"), INTRO_DURATION_MS);
      return () => clearTimeout(t);
    }
    if (phase === "alert") {
      const t = setTimeout(() => setPhase("body"), ALERT_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  let body: React.ReactNode = null;

  if (phase === "intro") {
    // Dim + blur the scene behind, with a calm 1-line intro caption.
    body = (
      <div className="absolute inset-0 bg-ink/55">
        <EncounterCaption line={introLine} />
      </div>
    );
  } else if (phase === "alert") {
    body = (
      <EncounterAlertSplash
        monsterIds={monsterIds}
        storyId={storyId}
        assetStoryId={assetStoryId}
      />
    );
  } else {
    body = (
      <BattleScreen
        storyId={storyId}
        assetStoryId={assetStoryId}
        age={age}
        challengeType={encounter.challengeType ?? "mixed"}
        recordWrongChallenge={recordWrongChallenge}
        characterImageBase={(id) => characterImageBase(id, "battle")}
        heroId={heroId}
        characters={characters}
        onOpenSettings={onOpenSettings}
        inventory={inventory}
        initialState={initialBattleState}
        onStateChange={onBattleStateChange}
        victoryItems={alreadyCleared ? [] : (encounter.rewards.items ?? [])}
        suppressRewards={alreadyCleared}
        setup={{
          storyId,
          bg: encounter.intro.bg,
          monsterIds: encounter.body.monsterIds,
          partyHp,
          partyMaxHp,
          fallenAttackers,
          companions,
          companionMoods,
        }}
        onRetry={onRetry}
        onComplete={(res) => {
          // Repeat clears (intentional story loops) replay the battle for fun
          // but grant nothing — first clear only (see `alreadyCleared`).
          const firstClearVictory = res.outcome === "victory" && !alreadyCleared;
          onComplete({
            encounterId: encounter.id,
            outcome: res.outcome,
            partyHp: res.partyHp,
            fallenAttackers: res.fallenAttackers,
            itemsGained: firstClearVictory
              ? [...res.rewards, ...(encounter.rewards.items ?? [])]
              : [],
            itemsConsumed: res.itemsConsumed,
            moodBoost: firstClearVictory
              ? encounter.rewards.moodBoost
              : undefined,
          });
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Leaving the encounter: the battle blooms outward + fades, letting the
      // story scene (which zoom-reveals underneath) take over — a softer,
      // more deliberate hand-off than a plain cut.
      exit={{
        opacity: 0,
        scale: 1.06,
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
      }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      // Intro beat = let the scene show through, dimmed + blurred. Alert/battle
      // draw their own full backgrounds, so switch to a solid base then.
      className={`fixed inset-0 z-50 overflow-hidden ${
        phase === "intro" ? "backdrop-blur-md" : "bg-ink"
      }`}
    >
      {body}
    </motion.div>
  );
}

/**
 * Dramatic "encounter incoming!" splash — plays for ~1.7s before the
 * intro screen. Layers a red-flash burst + camera shake + giant
 * monster silhouette zoom + bold "ENCOUNTER!" headline so the player
 * actually feels something snap into focus.
 */
function EncounterAlertSplash({
  monsterIds,
  storyId,
  assetStoryId = storyId,
}: {
  monsterIds: string[];
  storyId: string;
  /** Derived sprite-path story id (clone source) — content stays storyId. */
  assetStoryId?: string;
}) {
  const primary = monsterIds[0];
  const catalog = monstersFor(storyId);

  // Group the pool by type (first-appearance order) so the roster chip shows
  // EVERY monster kind with its own count — e.g. "KALIDAH ×2 · WOLF". The old
  // label paired monsterIds[0]'s name with monsterIds.length (the TOTAL), so a
  // mixed pool wrongly read as one type with the whole-pool count.
  const groups: { id: string; name: string; count: number }[] = [];
  for (const id of monsterIds) {
    const g = groups.find((x) => x.id === id);
    if (g) g.count += 1;
    else groups.push({ id, name: catalog[id]?.name ?? id, count: 1 });
  }
  const rosterLabel = groups
    .map((g) => (g.count > 1 ? `${g.name} ×${g.count}` : g.name))
    .join(" · ");

  // "ENCOUNTER!" sting — fires once as the alert splash appears. The ref guards
  // against React StrictMode's double-invoked mount effect (dev) playing it
  // twice; the splash remounts per encounter so the ref resets each time.
  const stingPlayed = useRef(false);
  useEffect(() => {
    if (stingPlayed.current) return;
    stingPlayed.current = true;
    getAudio().playSfx(SFX.ENCOUNTER);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Layer 1 — red alert burst. Quick fade-in then ease out. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.7, 0.3, 0.45, 0.2] }}
        transition={{ duration: 1.4, times: [0, 0.15, 0.35, 0.55, 1] }}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(180,30,30,0.95) 0%, rgba(80,12,12,0.85) 45%, rgba(0,0,0,0.95) 100%)",
        }}
      />

      {/* Layer 2 — slashing diagonal bars (anime-style alert lines). */}
      <motion.div
        initial={{ opacity: 0, x: -200 }}
        animate={{ opacity: [0, 1, 0], x: [-200, 0, 200] }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(115deg, rgba(255,255,255,0) 0 60px, rgba(255,255,255,0.2) 60px 70px, rgba(255,255,255,0) 70px 120px)",
          mixBlendMode: "screen",
        }}
      />

      {/* Layer 3 — giant monster silhouette zoom-in from afar. */}
      {primary && (
        <motion.div
          initial={{ scale: 0.2, opacity: 0, filter: "brightness(0)" }}
          animate={{
            scale: [0.2, 1.6, 1.25],
            opacity: [0, 1, 1],
            filter: ["brightness(0)", "brightness(0.4)", "brightness(0.7)"],
          }}
          transition={{
            duration: 1.2,
            times: [0, 0.6, 1],
            ease: "easeOut",
          }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ext fallback */}
          <img
            src={assetUrl(
              `${catalog[primary]?.image ?? `/stories/${assetStoryId}/monsters/${primary}`}.webp`,
            )}
            onError={(e) => {
              const el = e.currentTarget;
              if (!el.src.endsWith(".png")) el.src = el.src.replace(".webp", ".png");
            }}
            alt=""
            draggable={false}
            className="max-h-[70vh] max-w-[70vw] object-contain drop-shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          />
        </motion.div>
      )}

      {/* Layer 4 — "ENCOUNTER!" headline with shake. */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{
          scale: [0.3, 1.2, 1, 1.05, 1],
          opacity: [0, 1, 1, 1, 1],
          rotate: [-6, 2, -1, 1, 0],
        }}
        transition={{ duration: 1, ease: "easeOut", times: [0, 0.35, 0.6, 0.8, 1] }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      >
        <p
          className="font-handwritten text-7xl font-bold text-paper sm:text-8xl"
          style={{
            textShadow:
              "0 0 30px rgba(255,80,80,0.9), 0 6px 30px rgba(0,0,0,0.95), 0 2px 0 rgba(0,0,0,0.95)",
            WebkitTextStroke: "3px rgba(120,8,8,0.95)",
            paintOrder: "stroke fill",
            letterSpacing: "0.04em",
          }}
        >
          ENCOUNTER!
        </p>
        {rosterLabel && (
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="max-w-[90vw] rounded-pill bg-ink/70 px-5 py-1.5 text-center text-lg font-semibold uppercase tracking-wide text-paper sm:text-xl"
          >
            {rosterLabel}
          </motion.p>
        )}
      </motion.div>

      {/* Layer 6 — single screen flash at the very end to wipe into
          the BattleScreen. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.95, 0] }}
        transition={{
          duration: ALERT_DURATION_MS / 1000,
          times: [0, 0.9, 0.97, 1],
        }}
        className="pointer-events-none absolute inset-0 bg-paper"
      />
    </div>
  );
}
