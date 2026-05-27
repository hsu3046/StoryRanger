# Story Ranger — Character Reference Prompts

> **Make these BEFORE the scene illustrations.** Use the resulting images as **image-conditioning references** when you generate scenes — that's how you keep Dorothy's face, Lion's mane, the Witch's silhouette identical across all 21 scenes.
>
> ## 🔁 v2.0 UPDATE — Generate on WHITE background, then remove
>
> The asset composer needs **transparent PNG** characters to drop on any
> scene. The image generator can't reliably output true transparency,
> so the workflow is two steps:
>
> **Step 1 — Generate on pure white** (#FFFFFF flat clean white). If
> you already have cream-background characters, re-generate by adding
> *"clean pure white background, no cream, no warm tint"* to the prompt.
>
> **Step 2 — Background removal** (turns the white into alpha):
>
> | Option | How | Quality |
> |---|---|---|
> | **[remove.bg](https://www.remove.bg/)** (recommended) | Drag-and-drop, free 4/day | Excellent on hair/mane/straw |
> | **ChatGPT image edit** | Upload + "remove the white background, transparent PNG" | Good, fast iteration |
> | **macOS Preview** | Select → "Instant Alpha" → drag over white | Quick but jagged on soft edges |
> | **Photoshop / Affinity / GIMP** | Select by color → delete | Best control |
>
> End result: 1024×1024 PNG with alpha channel. Verify in macOS Preview —
> background should show the checker pattern, not white.
>
> ---
>
> **Format**: 1:1 square (1024×1024 PNG). Generated on white background, then post-processed to transparent.
> **Generator**: `gpt-image-2` (low tier).
> **Style**: same painterly storybook tone as the scenes — Jon Klassen / Carson Ellis / Beatrice Alemagna lineage, refined editorial children's-book look.

---

## 📦 Character list

| # | Character | File | Appears in (scenes) |
|---|---|---|---|
| 1 | **The Hero** *(default name "Dorothy")* | `hero.png` | every scene |
| 2 | **Toto** | `toto.png` | every scene |
| 3 | **Scarecrow** | `scarecrow.png` | 05a, 06, 08–14, 16–20 |
| 4 | **Tin Man** | `tinman.png` | 05b, 06, 08–14, 16–20 |
| 5 | **Cowardly Lion** | `lion.png` | 07, 08–14, 16–20 |
| 6 | **Glinda the Good Witch** | `glinda.png` | 03, 20 |
| 7 | **Wicked Witch of the West** | `wicked-witch.png` | 15, 16, 17 |
| 8 | **Wizard of Oz** | `wizard.png` | 14, 18, 19 |
| 9 | **Aunt Em** | `aunt-em.png` | 01, 21 |

Place under `public/stories/wizard-of-oz/characters/`.

---

## 🎨 SHARED CHARACTER BASELINE — prepend to every character prompt

```
Painterly hand-finished children's storybook character reference sheet.
Layered watercolor washes, soft gouache, visible paper grain. Refined
editorial storybook style in the lineage of Jon Klassen, Carson Ellis,
and Beatrice Alemagna — modern, warm, slightly literary, never generic.

Single character, full body, 3/4 front view, standing in a neutral
relaxed pose, looking gently toward camera. Soft directional natural
lighting from the upper-left.

CRITICAL — CLEAN PURE WHITE BACKGROUND (#FFFFFF). No cream tint, no
parchment hint, no ground, no shadow on a surface, no props beyond what
the character actually carries or wears. Just the character isolated on
flat clean white, ready to be cleanly keyed out in post-processing.
Crisp character silhouette that reads well at small sizes. Feet should
sit at the bottom 10% of the canvas so all characters composite at the
same ground line.

1:1 square composition. No text, no letters, no labels, no watermarks.
```

Drop this baseline + the per-character description below into one prompt.

---

## 1. The Hero — `hero.png`  *(default name "Dorothy", but the player picks their own name + gender)*

```
THE HERO: A roughly 9-year-old child from a Kansas farm. Designed to feel
gender-neutral so any player — girl or boy — can comfortably see
themselves in the picture. Medium-length warm chestnut-brown hair that
falls just past the ears, slightly tousled and natural, tucked loosely
behind one ear (no long braids, no exaggeratedly short crop). Soft round
face with light freckles across the nose, big curious soft-brown eyes,
gentle small smile. Wears a faded sun-warmed plaid shirt in soft yellow
and dusty blue, sleeves rolled to the elbow, tucked into sturdy navy
denim overalls with a single brass button at the shoulder strap. Plain
brown ankle boots. One hand relaxed at the side, the other slightly
forward as if about to greet someone or pick something up. Mood: warm,
grounded, brave-in-an-ordinary-way. Not styled male or female —
deliberately readable as *any* kid looking at the picture.

Critical: avoid all strongly-gendered visual signals — no dresses, no
princess motifs, no overtly boyish styling, no pink/blue gendered color
coding. The look should be timeless 1900s prairie childhood — overalls,
plaid, soft warm earth tones, freckles, gentle posture.
```

> **Critical** — this image becomes the visual anchor for every scene. Generate this one first. Pick the best of 3–4 variants. Show it to someone *without* telling them the character's gender, ask "who is this?" — if they say "a kid" or "a child", you've nailed it. If they immediately say "a girl" or "a boy", regenerate with more neutral cues.

---

## 2. Toto — `toto.png`

```
TOTO: A small scruffy black Cairn terrier with bright dark intelligent
eyes, alert ears, a wet little black nose, and a hint of pink tongue. His
fur is tousled and a little wild around the face. He sits upright on a
warm cream surface, tail mid-wag, looking slightly to the side as if
hearing something. Friendly, curious, loyal. Small but never timid.
```

---

## 3. Scarecrow — `scarecrow.png`

```
SCARECROW: A life-sized friendly straw figure who has just been lifted
off his pole. Burlap-sack face with two painted round black eyes, a small
painted triangle nose, and a curved cheerful crescent-moon smile. Loose
straw pokes out from his sleeves, collar, and trouser cuffs. He wears a
patched indigo-blue jacket, oversized brown wool trousers held up with
rope, and a tall conical pointed hat in faded brown. His body droops
slightly because he's stuffed with straw, giving him a loose,
endearingly clumsy posture. Arms hang naturally, one slightly raised in
a friendly wave. Hopeful, sweet, a touch goofy.
```

---

## 4. Tin Man — `tinman.png`

```
TIN MAN: A slim man entirely made of hand-hammered tin. His head is
shaped like an upturned kettle with a small funnel for a hat, a
hinged-jaw mouth, gentle round painted eyes with subtle eyebrows. His
body is plates of polished tin gone soft with patina (cool blue-gray
highlights, hints of warm copper at the seams). Visible rivets at the
joints. He holds a long-handled wood axe lightly in one hand, head down.
A small brass oil can at his feet. Polite, sentimental, soft-spoken
posture — head slightly tilted, the other hand pressed gently to his
chest where his heart should be.
```

---

## 5. Cowardly Lion — `lion.png`

```
COWARDLY LION: A large warm-hearted lion with an enormous tawny-gold
mane that frames his face like a sunburst. Big soulful amber eyes,
slightly worried eyebrows, a glistening single tear at the corner of one
eye. His expression is shy and apologetic, not fierce. He stands mostly
on all fours but with his chest lifted, one front paw raised hesitantly
as if about to take a step. A small whisper of pink in his nose. Long
tufted tail curled gently around one hind leg. Despite his size, his
posture radiates timidity and tenderness — a gentle giant.
```

---

## 6. Glinda the Good Witch — `glinda.png`

```
GLINDA: A beautiful elder woman with a serene, kind face, soft warm
smile, gentle eyes the color of summer sky. Long golden-rose hair flows
softly over her shoulders, crowned with a delicate golden tiara set with
a single five-point star. She wears a pale rose-pink gown with layered
chiffon sleeves and faint shimmering accents that catch the light. In
one hand she holds a slender wand topped with a small golden star. A
faint warm glow surrounds her, as if she's lit from within. Posture
upright, graceful, welcoming.
```

---

## 7. Wicked Witch of the West — `wicked-witch.png`

```
WICKED WITCH OF THE WEST: A tall slender older woman with deep sage-green
skin, a long thin nose with a slight hook, a pointed chin, and dark
narrow eyes glittering with mischief. Wild dark gray hair escapes from
under a tall pointed black hat with a broad brim. She wears a long
flowing black robe cinched with a dark red sash, the hem frayed slightly
as if always windblown. In one hand she holds a battered broomstick
upright. Her smile is sly and crooked — playfully villainous, classic
fairy-tale, never grotesque or horror. Age-appropriate for ages 6–11.
```

---

## 8. Wizard of Oz — `wizard.png`

```
WIZARD OF OZ (unmasked, the real man): A short, kindly older gentleman
in his 60s, balding on top with tufts of soft white hair at the sides
and small round wire spectacles slipped halfway down his nose. He has a
gentle apologetic face — slightly sheepish smile, raised eyebrows like a
man who's been caught. He wears a wrinkled white collared shirt, a
buttoned brown wool vest with brass buttons, simple brown trousers, and
worn leather shoes. In one hand he holds a small brass speaking-trumpet
(megaphone). Warm, harmless, regretful posture.
```

---

## 9. Aunt Em — `aunt-em.png`

```
AUNT EM: A kind weathered Kansas farm woman in her late 40s. Iron-gray
hair pulled neatly back into a low bun, a few softer strands escaping
around her temples. Warm tired eyes with fine wrinkles at the corners,
weathered cheeks from years of prairie sun, a quiet patient smile. She
wears a simple ankle-length gray cotton dress with long sleeves and a
spotless white apron tied at the waist. Sturdy brown ankle boots. Her
hands are folded calmly in front of her — strong, capable, working
hands. A grounded, deeply caring presence — the kind of grown-up
children feel safe with.
```

---

## ✅ After generating

1. Save each as `<file>.png` (or `.webp`) in `public/stories/wizard-of-oz/characters/`.
2. **Skim them side by side as a sheet** — they should feel like they belong in the same book. If one looks stylistically off, regenerate it before moving on to scenes.
3. **When generating scene illustrations**, attach the relevant character image as a reference / image-conditioning input. This is what locks in Dorothy's exact face across all 21 scenes — text prompts alone will drift.

---

## 💡 Tips

- **Generate the Hero first.** They're in every scene; their consistency matters most. Generate 3–4 variants and pick the strongest, then use it as the conditioning anchor for all other characters too (so the whole cast feels like one illustrator's hand).
- **Use a consistent seed if your tool exposes one** — keeps stylistic noise constant across the cast.
- **If the model adds props/scenery you didn't ask for**, add `"plain warm cream paper background, no props, no scene, isolated character"` more forcefully in a second-pass edit.
- **The Wicked Witch is the only one that can drift scary.** If a generation looks too intense, regenerate with the prompt hint `"warm illustrative style, age-appropriate for 6-year-olds, mischievous not menacing"`.
- **Aunt Em + Wizard appear in only 2–3 scenes each** — lower priority than the four main companions, but worth doing so the framing scenes (01, 21) have authentic warmth.
