# Story Ranger

> Become the hero of a classic fairy tale. Your choices shape the story.

An interactive storybook adventure for kids who grew up watching YouTube — built so they can *do* instead of *watch*. Classic public-domain tales (starting with *The Wonderful Wizard of Oz*) become a world where the child plays the protagonist, makes meaningful choices, gains stats, and earns medals. Free typing, character voices, illustrated scenes, original soundtrack. Native-level English. No "learning app" feel.

**Status**: MVP in progress (Phase 0 — bootstrap)

## What makes it different

- **Agency** — your choice visibly changes the story (illustration, characters that follow you, scene branches)
- **RPG stats & medals** — courage, heart, brain, friendship grow; earn collectible medals like "Friend of the Lion"
- **In-world AI** — characters speak to you (no chatbot UI, no "I am an AI")
- **Free input** — type anything; the world responds in character
- **Cinematic** — illustrated scenes, character TTS voices, scene-based soundtrack

## Tech

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- Howler.js (sound), Framer Motion (UI)
- OpenAI `gpt-5-mini` (narration), `tts-1` (voices)
- Anonymous + localStorage (no account needed)
- PWA (install on iPad home screen)

## Run locally

```bash
cp .env.example .env.local   # add OPENAI_API_KEY
npm install
npm run dev
```

Open http://localhost:3000

### Choosing AI models

`.env.local` lets you override the default models per project:

```env
OPENAI_NARRATION_MODEL=gpt-5-mini   # gpt-5-nano | gpt-5-mini | gpt-5 | gpt-5.5
OPENAI_TTS_MODEL=tts-1              # tts-1 | tts-1-hd
```

- Start with the defaults (`gpt-5-mini` + `tts-1`) — they're the cheapest viable combo and good enough for MVP.
- Bump narration to `gpt-5` if you want richer prose for the free-input responses.
- Switch TTS to `tts-1-hd` for warmer character voices (≈2× cost).

Changes take effect after restarting the dev server (Next.js re-reads `.env.local` on boot).

## License

GNU GPL v3 © 2026 KnowAI (https://knowai.space)
