"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import type {
  AttackerId,
  Character,
  CompanionId,
  CompanionMoods,
  Hero,
  PartyHp,
  SpeakerId,
} from "@/types/story";
import type { EncounterDef } from "@/types/encounter";
import type { BattleState } from "@/lib/battle-engine";

import { BattleScreen } from "../battle/BattleScreen";
import { MONSTERS } from "@/data/monsters";

export interface EncounterResult {
  encounterId: string;
  outcome: "victory" | "defeat" | "escaped";
  /** Final HP per attacker after the battle. */
  partyHp: PartyHp;
  /** Attackers KO'd this encounter — appended to PlayState.fallenAttackers. */
  fallenAttackers: AttackerId[];
  itemsGained: string[];
  medalId?: string;
  moodBoost?: { companionId: CompanionId; delta: number }[];
  /** Encounter may force a transition to a specific main scene. */
  forceNextSceneId?: string;
}

interface Props {
  encounter: EncounterDef;
  storyId: string;
  hero: Hero;
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
  /** Character roster — forwarded to BattleScreen for sprite sizing. */
  characters: readonly Character[];
  /** Saved battle snapshot — when present we skip the alert splash and
   *  remount BattleScreen on this exact state (refresh-resume). */
  initialBattleState?: BattleState;
  /** Fires on every BattleState change so the parent can persist it. */
  onBattleStateChange?: (state: BattleState) => void;
  onComplete: (result: EncounterResult) => void;
  /** Open the parent's Settings modal — surfaced inside battle. */
  onOpenSettings?: () => void;
}

type Phase = "alert" | "body";

/** How long the alert splash plays before the battle starts. The
 *  encounter's intro narration is shown WITHIN this splash. */
const ALERT_DURATION_MS = 2400;

/**
 * Battle encounter overlay. Dramatic alert splash (with the encounter
 * intro narration baked in) → straight into the BattleScreen. No
 * "Ready!" confirmation; the splash itself is the pacing beat.
 *
 * Story-style encounters were folded into Scene (`reward`) and Branch
 * (`puzzle` / `requires` / `reward` / `onFailMode`) in v3.
 */
export function EncounterFlow({
  encounter,
  storyId,
  hero,
  companions,
  companionMoods,
  partyHp,
  partyMaxHp,
  fallenAttackers,
  characterImageBase,
  characters,
  initialBattleState,
  onBattleStateChange,
  onComplete,
  onOpenSettings,
}: Props) {
  void hero; // reserved for future hero-name interpolation
  void characterImageBase; // only used inside BattleScreen now
  // Resume directly into the battle when we have a saved snapshot — the
  // alert splash is purely intro flair, not worth replaying on refresh.
  const [phase, setPhase] = useState<Phase>(
    initialBattleState ? "body" : "alert",
  );

  // Auto-advance alert → body after the splash plays.
  useEffect(() => {
    if (phase !== "alert") return;
    const t = setTimeout(() => setPhase("body"), ALERT_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const monsterIds =
    encounter.displayMonsters ?? encounter.body.monsterIds;

  let body: React.ReactNode = null;

  if (phase === "alert") {
    body = (
      <EncounterAlertSplash
        monsterIds={monsterIds}
        storyId={storyId}
        narration={encounter.intro.narration}
      />
    );
  } else {
    body = (
      <BattleScreen
        storyId={storyId}
        characterImageBase={(id) => characterImageBase(id, "battle")}
        characters={characters}
        onOpenSettings={onOpenSettings}
        initialState={initialBattleState}
        onStateChange={onBattleStateChange}
        setup={{
          bg: encounter.intro.bg,
          monsterIds: encounter.body.monsterIds,
          partyHp,
          partyMaxHp,
          fallenAttackers,
          companions,
          companionMoods,
          introNarration: encounter.intro.narration,
        }}
        onComplete={(res) => {
          const forceNextSceneId =
            res.outcome === "victory"
              ? encounter.nextSceneOnVictory
              : res.outcome === "defeat"
                ? encounter.nextSceneOnDefeat
                : undefined;
          onComplete({
            encounterId: encounter.id,
            outcome: res.outcome,
            partyHp: res.partyHp,
            fallenAttackers: res.fallenAttackers,
            itemsGained: res.outcome === "victory" ? res.rewards : [],
            medalId:
              res.outcome === "victory" ? encounter.rewards.medalId : undefined,
            moodBoost:
              res.outcome === "victory"
                ? encounter.rewards.moodBoost
                : undefined,
            forceNextSceneId,
          });
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="fixed inset-0 z-50 overflow-hidden bg-ink"
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
  narration,
}: {
  monsterIds: string[];
  storyId: string;
  narration: string;
}) {
  const primary = monsterIds[0];
  const primaryName = primary ? MONSTERS[primary]?.name ?? primary : null;
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
            src={`${MONSTERS[primary]?.image ?? `/stories/${storyId}/monsters/${primary}`}.webp`}
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
        {primaryName && (
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="rounded-pill bg-ink/70 px-5 py-1.5 text-lg font-semibold uppercase tracking-wide text-paper sm:text-xl"
          >
            {monsterIds.length > 1
              ? `${primaryName} +${monsterIds.length - 1}`
              : primaryName}
          </motion.p>
        )}
      </motion.div>

      {/* Layer 5 — intro narration, fades in after the headline lands. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.5, ease: "easeOut" }}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-10 sm:pb-14"
        style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
      >
        <p
          className="mx-auto max-w-3xl text-center text-xl font-semibold leading-snug text-paper text-balance sm:text-2xl"
          style={{
            textShadow:
              "0 5px 18px rgba(20,12,4,0.95), 0 3px 6px rgba(20,12,4,0.95)",
            WebkitTextStroke: "2px rgba(20,12,4,0.7)",
            paintOrder: "stroke fill",
          }}
        >
          {narration}
        </p>
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
