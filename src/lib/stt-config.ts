/**
 * Shared STT (speech-to-text) constants — used by the /api/stt route and the
 * client-side capture hook, so the recording cut-off and the server's size
 * gate can never drift apart.
 */

/** Hard cap on one push-to-talk recording. Choice labels are 2–6 words, so
 *  6 s is generous for a child reading one out — and it bounds both the
 *  upload size and the per-utterance transcription cost (~$0.0003). */
export const MAX_RECORDING_MS = 6_000;

/** Recordings shorter than this are discarded client-side — an accidental
 *  double tap can't produce a billable empty clip. */
export const MIN_RECORDING_MS = 350;

/** Server-side upload gate. 6 s of AAC is ~190 KB, opus ~70 KB — 1 MB leaves
 *  headroom for codec variance while still blocking abuse uploads. */
export const MAX_AUDIO_BYTES = 1_000_000;

/** At most this many choice labels accompany one clip (vocabulary biasing). */
export const MAX_LABELS = 8;
export const MAX_LABEL_CHARS = 120;
