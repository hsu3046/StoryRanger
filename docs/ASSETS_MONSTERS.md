# Story Ranger — Monster Asset Prompts (v2.0)

> **Purpose**: Monster sprites for battle / encounter scenes. Composer layers them on top of backgrounds at runtime.
>
> **Format**: 1024×1024 **PNG on a pure white background** (#FFFFFF). After generation, run through a background remover so the composer can drop them on any scene.
> **Style**: **IDENTICAL** to the existing character refs + scene illustrations (Jon Klassen / Carson Ellis / Beatrice Alemagna lineage, painterly watercolor + soft gouache, paper grain). Same brush, same light source, same warmth.
> **Save to**: `public/stories/wizard-of-oz/monsters/<key>.png` (per-story folder) (after background removal — see post-processing section below).

---

## 📦 Total: 15 monsters (mix of hostile + friendly NPCs)

Each entry includes a **stat block** for v2.0c battle balancing:

- **HP**: hit points
- **AC**: armor class (the D20 roll needs to meet/exceed this to hit)
- **DMG**: damage dice per attack (e.g. `1d4` = 1–4 damage)
- **TYPE**: `hostile` / `neutral` / `friendly`
- **DROPS**: optional item granted on victory or befriending
- **NOTES**: special behavior

| # | Key | Type | HP | AC | DMG | Drops |
|---|---|---|---|---|---|---|
| 1 | `wolf` | hostile | 4 | 12 | 1d4 | wolf-fang |
| 2 | `wolf-alpha` | hostile | 8 | 13 | 1d6 | wolf-pelt |
| 3 | `wolf-pup` | neutral | 2 | 10 | 1d2 | befriendable |
| 4 | `crow-scout` | hostile | 2 | 14 | 1d2 | feather-of-flight |
| 5 | `crow-flock` | hostile | 6 | 13 | 1d4 | feather-bundle |
| 6 | `kalidah` | hostile | 12 | 14 | 2d4 | kalidah-claw |
| 7 | `fighting-tree` | hostile | 10 | 11 | 1d6 | enchanted-acorn |
| 8 | `hammerhead` | hostile | 8 | 15 | 1d6 | stone-flake |
| 9 | `winged-monkey` | hostile | 6 | 13 | 1d4 | monkey-feather |
| 10 | `swamp-beast` | hostile | 10 | 12 | 1d6 | swamp-pearl |
| 11 | `cave-spider` | hostile | 4 | 13 | 1d4 + 1 | silk-thread |
| 12 | `bat-swarm` | hostile | 3 | 15 | 1d3 | bat-wing |
| 13 | `goblin-scout` | hostile | 5 | 12 | 1d4 | tarnished-coin |
| 14 | `mouse-king` | friendly | — | — | — | gives mouse-call (1 free escape) |
| 15 | `wisp` | neutral | 3 | 16 | — | gives wisp-light (reveals hidden) |

---

## 🎨 SHARED BASELINE — prepend to every monster prompt

```
Painterly hand-finished children's storybook character reference sheet.
Layered watercolor washes, soft gouache, visible paper grain. Refined
editorial storybook style in the lineage of Jon Klassen, Carson Ellis,
and Beatrice Alemagna — modern, warm, slightly literary, never generic.
This monster MUST visually match the existing hero/Scarecrow/Tin Man/Lion
character refs and the 21 scene illustrations from the same book — same
brush style, same warmth, same paper texture.

Single creature, full body, 3/4 front view, mid-action pose (alert,
leaping, calling — never an aggressive snarl). Soft directional natural
lighting from the upper-left (matches the rest of the cast).

CRITICAL:
- Pure WHITE background (#FFFFFF), flat and clean — no scene, no ground,
  no shadow on a surface, no props. Just the creature isolated on white.
  (We'll remove the white in post to get a transparent PNG.)
- Age-appropriate for ages 6–11 — mischievous, curious, mysterious, but
  NEVER scary, gory, or horror-style. Soft eyes, no bared fangs, no
  blood. Even villains feel like a classic fairy-tale illustration.
- Crisp silhouette that reads clearly at small sizes (256×256 thumbnail).
- Consistent in style + scale across the whole monster cast — they
  should feel like they belong in the same book as the hero.
- 1024×1024 square. Feet near the bottom 10% of the canvas so all
  monsters composite at the same ground line.
- No text, letters, labels, or watermarks.
```

---

## 👹 MONSTER PROMPTS

### 1. `wolf` — Forest Wolf (basic hostile)
```
A lean grey forest wolf. Bristled silver fur with darker underbelly,
sharp golden eyes, ears alert and forward. Mid-stride pose with one
paw lifted, head lowered slightly. Tail straight. Quietly menacing but
gentle in style — more "watchful predator" than "snarling beast". No
bared teeth.
```

### 2. `wolf-alpha` — Pack Leader (mini-boss)
```
A larger, more muscular silver-and-black wolf with thick mane around
the shoulders. Older — slight scar across one eye, but eyes calm and
intelligent. Standing tall, broad chest forward. Subtle silver glint
to the fur. Commanding presence.
```

### 3. `wolf-pup` — Lost Pup (befriendable)
```
A tiny fluffy grey wolf pup, oversized paws, big curious dark eyes,
ears too large for its head. Sitting back on its haunches looking up.
Adorable, soft, completely non-threatening. The kind of creature a
child wants to hug.
```

### 4. `crow-scout` — Witch's Scout (small hostile flier)
```
A glossy black crow, head tilted in curiosity, one wing slightly
extended. Sharp intelligent eye. Iridescent purple-green sheen in the
black feathers. Perched mid-air as if just about to land. Sly but not
sinister.
```

### 5. `crow-flock` — Murder of Crows (swarm)
```
A cluster of 5–7 black crows in flight, wings overlapping at different
angles, all swirling toward the viewer. Dynamic motion, feathers
loose. Painterly silhouettes — silhouette dominant, individual crows
suggested rather than rendered in full detail. Slightly threatening
but stylized.
```

### 6. `kalidah` — Tiger-Bear Hybrid (mini-boss)
```
The legendary Kalidah of Oz: body of a bear (heavy, shaggy brown fur),
head of a tiger (orange-and-black striped, broad muzzle, amber eyes).
Standing on four legs, head low, shoulders raised. Powerful but
illustrated soft — more "big mythological beast" than "scary
predator". Painterly.
```

### 7. `fighting-tree` — Animated Tree
```
A small gnarled tree come to life. Twisted dark trunk with a face
suggested in the bark — two knothole eyes and a crooked mouth.
Branches reach forward like arms. Roots pulled up from the ground,
walking. A few amber leaves still cling to the branches. Mischievous,
not evil.
```

### 8. `hammerhead` — Rock Person (Hammerhead of Oz)
```
A stocky humanoid creature made of smooth grey-brown stone, head
shaped like a wide flat hammer. Short stubby arms and legs. Standing
with arms crossed. A single grumpy line for a mouth, two pebble eyes.
Looks more cranky than dangerous — like a stone troll having a bad
day.
```

### 9. `winged-monkey` — Witch's Messenger
```
A small grey-brown monkey with large leathery bat-like wings spread
mid-flight. Mischievous expression, dark beady eyes, slight smirk.
Wears a tiny red cap and vest (Oz tradition). Posture playful rather
than threatening. Dynamic flying pose.
```

### 10. `swamp-beast` — Bog Creature
```
A slimy bog creature emerging from unseen water — only upper half
visible. Mossy green skin, large gentle round eyes (more "lonely
swamp giant" than monster), a few lily pads stuck to the head.
Webbed hands, one slightly raised as if reaching. Soft and shy
despite being big.
```

### 11. `cave-spider` — Crystal Cave Spider
```
A medium-sized spider with a smooth dark-purple body, eight delicate
legs, eight tiny shimmering eyes. Translucent web-glow on the
underside. Posed on a strand of web, mid-descent. Stylized to look
curious rather than creepy — large soft eyes, no fangs visible.
```

### 12. `bat-swarm` — Cave Bats
```
A swirl of 6–8 small brown bats in dynamic flight, wings overlapping,
some closer some farther. Painterly silhouettes against the
transparent background. Suggested rather than detailed, sense of
flutter and motion. Soft moonlit edges.
```

### 13. `goblin-scout` — Forest Goblin
```
A small green-grey goblin, knee-high, big triangular ears, oversized
nose, mischievous wide grin. Patchwork brown leather vest. Carrying a
crooked wooden stick. Squatting forward, alert. Comic and slightly
cute — straight out of a 1900s storybook.
```

### 14. `mouse-king` — Field Mouse King (friendly NPC)
```
A small field mouse standing proudly on its hind legs. Wears a tiny
woven golden crown and a regal red cape that drapes over its
shoulders. Bright intelligent eyes, whiskers raised. One paw on its
chest. Looks dignified and welcoming. Friendly NPC, not a monster.
```

### 15. `wisp` — Will-o-Wisp (neutral spirit)
```
A glowing pale-blue spectral wisp — like a soft floating flame about
the size of an apple. Translucent core with luminous halo, faint
sparkles trailing. No face, just a gentle presence. Suggests
mysterious guidance rather than danger. Soft watercolor glow effect.
```

---

## ⚔️ Stat block reference (for v2.0c battle code)

```ts
export interface MonsterStats {
  id: string;
  name: string;
  type: "hostile" | "neutral" | "friendly";
  hp: number;
  ac: number;        // dice roll vs this to hit
  damageDie: string; // e.g. "1d4", "1d6+1"
  drops?: string[];
  notes?: string;
}
```

(코드는 v2.0c에서 별도 `src/data/monsters.ts` 로 작성. docs는 prompt + 디자인 spec만.)

---

## 🪄 Post-processing — turn white background into transparent

The generator outputs PNG on white. Run each file through a background remover:

| Option | How | Quality |
|---|---|---|
| **[remove.bg](https://www.remove.bg/)** (recommended) | Drag-and-drop, free 4/day | Excellent edges, even on fur/feathers |
| **ChatGPT image edit** | Upload + "remove the white background, transparent PNG" | Good, fast iteration |
| **macOS Preview** | Select → "Instant Alpha" → drag over white | Quick but jagged on soft edges |
| **Photoshop / Affinity** | Select Color Range → delete | Best control, slow |

Output spec: 1024×1024 PNG, alpha channel preserved. Verify in Preview — background should show the checker pattern, not white.

## ✅ After generating

1. Save each as `public/monsters/<key>.png` (transparent, post-processed) matching the keys above.
2. The composer + battle UI auto-picks up files by key.
3. Missing monsters fall back to a generic silhouette placeholder.

---

## 💡 Tips

- **Style anchor**: attach `hero.png` (or any character ref) to the ChatGPT message as a style reference, with a note like *"match the brush style of the attached character — same watercolor, same warmth, same lighting."* This is the single best trick for keeping the monster cast feeling like it belongs in the same book.
- **Generate `wolf`, `crow-scout`, `kalidah`, `mouse-king`, `wisp` first** — these cover the widest variety of encounter feels (basic hostile, swarm, mini-boss, friendly NPC, mysterious).
- **Same-canvas rule**: all monsters should look like they're standing on the same invisible floor — keep their feet roughly at the bottom 10% of the canvas, so they composite at the same ground line in any background.
- **Soft eye rule**: every creature, even villains, should have eyes that read as "expressive" not "blank". Big soft eyes = age-appropriate friendly storybook tone.
- **White means white**: the bg must be a flat clean white (#FFFFFF) — not cream, not light gray. Pure white is what remove.bg keys on. If the model draws a cream/parchment hint, re-prompt with *"clean pure white background only, no warm tint."*
