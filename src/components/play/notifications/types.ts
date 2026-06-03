/**
 * Shape of a single top-of-screen notification (medal / item / companion).
 * ONE data object describes every kind; NotificationCard renders the variant
 * from `chips` (item) vs `accent === "accent"` (medal) vs the neutral default
 * (companion). This replaces the former three bespoke toast components.
 */
export type NotifKind = "medal" | "item" | "companion";

/** A single "icon + label ×N" chip inside an item notification. */
export interface NotifChip {
  icon?: string;
  label: string;
  count?: number;
}

export interface Notif {
  /** Stable key for AnimatePresence (e.g. `medal:<id>` or an auto counter). */
  id: string;
  kind: NotifKind;
  /** Emoji/glyph shown before the text (medal big icon, companion 🎉/👋). */
  icon?: string;
  /** Small handwritten eyebrow ("New medal!", "Received"). */
  eyebrow?: string;
  /** Primary line (medal name, companion message). */
  title?: string;
  /** Item "×N" chips — present only for the item variant. */
  chips?: NotifChip[];
  /** "accent" = celebratory medal styling (pill + accent ring); else neutral. */
  accent?: "accent" | "neutral";
  /** Auto-dismiss after this many ms (default 3800; medals pass 2000). */
  durationMs?: number;
}
