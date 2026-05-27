# Story Ranger — Background Asset Prompts (v2.0)

> **Purpose**: Reusable scene **backgrounds with NO characters**. The composer layers characters + monsters on top of these at runtime, giving us hundreds of unique adventure scenes from a small asset set.
>
> **Format**: Cinematic 2.39:1 (1792×750), **JPEG or WebP**.
> **Style**: same painterly storybook tone as the main 21 scenes (Jon Klassen / Carson Ellis / Beatrice Alemagna lineage).
> **Save to**: `public/stories/wizard-of-oz/backgrounds/<key>.jpeg` (per-story folder)
> **Code recognizes**: `.webp / .png / .jpg / .jpeg` (auto fallback via composer).

---

## 📦 Total: ~15 backgrounds

| # | Key | Where it's used (side adventures / encounters) |
|---|---|---|
| 1 | `road-yellow-noon` | Default road encounter, traveling battle |
| 2 | `road-yellow-dusk` | Evening encounter, more tense |
| 3 | `forest-clearing` | Wolf pack, Kalidah encounter |
| 4 | `forest-deep` | Lost-in-woods, ghost encounter |
| 5 | `river-bank` | Crossing puzzle, river creature |
| 6 | `mountain-pass` | High-altitude battle, eagle scene |
| 7 | `cave-entrance` | Dungeon entrance choice |
| 8 | `cave-interior` | Underground battle, spider |
| 9 | `cornfield-tall` | Hide-and-seek, crow encounter |
| 10 | `orchard-twilight` | Magic apple, hidden NPC |
| 11 | `munchkin-back-alley` | Munchkin shop, info NPC |
| 12 | `witch-castle-corridor` | Witch's spy, escape |
| 13 | `prairie-storm` | Cyclone aftermath, debris |
| 14 | `swamp-misty` | Will-o-wisp, frog NPC |
| 15 | `abandoned-cottage` | Mysterious door, treasure |

---

## 🎨 SHARED BASELINE — prepend to every prompt

```
Cinematic 2.39:1 anamorphic widescreen children's storybook background.
Painterly hand-finished look: layered watercolor washes, soft gouache,
visible paper grain. Warm parchment palette with intentional accent
colors — modern editorial storybook style in the lineage of Jon Klassen,
Carson Ellis, and Beatrice Alemagna. Refined composition with strong
negative space and atmospheric depth. Soft directional natural light
from the upper-left.

CRITICAL — NO CHARACTERS, NO PEOPLE, NO ANIMALS, NO CREATURES in the
image. This is a LANDSCAPE-ONLY background that will be composited with
character PNGs in code. Leave a clear empty "stage" area in the
foreground / middle ground (lower 2/3 of the frame) where small figures
will be placed later — that area should be visually quiet (path, ground,
floor), not dominated by detail.

No text, letters, signs, or watermarks anywhere in the image.
```

---

## 🗺️ BACKGROUND PROMPTS

### 1. `road-yellow-noon`
```
The yellow brick road in midday sun, winding from the lower-left
foreground into rolling emerald hills. Tall grass on both sides bends
gently. Bright cumulus clouds in a warm blue sky. The yellow bricks
glow. Stage area (lower 1/3) is empty road, ready for figures.
```

### 2. `road-yellow-dusk`
```
The same yellow brick road, now at dusk. Long warm shadows stretch
across the bricks. Sky burns soft orange-pink fading to deep blue
above. A single distant tree silhouetted on the horizon. Quiet, edge
of mystery. Stage area in the lower-center is empty road.
```

### 3. `forest-clearing`
```
A small grassy clearing in a temperate forest. Tall trees on left and
right frame the scene, opening to a soft middle ground with patches of
sunlight breaking through the canopy. Scattered ferns at the edges. The
center is open grass — perfect stage for an encounter. Late-afternoon
light, warm but slightly tense.
```

### 4. `forest-deep`
```
Deep inside an old forest. Towering gnarled trees, twisting roots, a
narrow winding path. Deep blue-violet shadows with slivers of warm
golden light cutting through high canopy. Atmospheric, slightly
mysterious, never frightening. Stage area is the narrow open path
running through the lower center.
```

### 5. `river-bank`
```
A wide gentle river flowing left-to-right across the middle of the
frame. Smooth ripples reflect the sky. Pebble + grass riverbank in the
foreground (the stage area). On the far bank: low rolling green hills.
Soft golden hour light. Painterly water surface.
```

### 6. `mountain-pass`
```
A narrow rocky path winding between tall slate-grey mountain cliffs
under a vast pale sky. Distant snow-capped peaks beyond. A few hardy
wildflowers cling to the rocks. Cool wind feel. Stage area is the open
path foreground. Sense of altitude and quiet challenge.
```

### 7. `cave-entrance`
```
The dark mouth of a stone cave set into a mossy cliff face. Boulders
and roots frame the entrance. Inside: pitch-black inviting unknown.
Outside: warm afternoon light. A few fireflies hovering near the
threshold. Stage area is the open ground just outside the cave mouth.
```

### 8. `cave-interior`
```
Inside a vast underground cavern. Glowing crystal clusters embedded in
the walls give off a soft blue-green light. Stalactites overhead.
Smooth stone floor in the foreground (stage area). Mysterious,
peaceful, slightly magical. Distant tunnel opening on the far right.
```

### 9. `cornfield-tall`
```
Inside a vast golden cornfield. Towering corn stalks rise on both sides
forming a natural corridor. Warm side lighting filters through the
stalks. Open patch of bare earth in the lower center (stage area). A
soft breeze in the leaves.
```

### 10. `orchard-twilight`
```
An old apple orchard at twilight. Twisted dark trunks, red apples
catching the last warm light, dappled shadows on grass. A clearing
between two rows of trees in the middle ground forms the stage area.
Slightly magical, hint of mystery.
```

### 11. `munchkin-back-alley`
```
A narrow cobblestone alley between two round Munchkin cottages with
curling thatched roofs and oversized flower pots. Warm lantern light
spills from one window. The alley opens onto a small courtyard stage
in the foreground. Whimsical, cozy.
```

### 12. `witch-castle-corridor`
```
A long cold stone corridor inside the Wicked Witch's castle. Tall
narrow Gothic windows let in slivers of green-tinted moonlight. A
woven rug runs down the center stone floor. Iron sconces with low
flickering flames. The middle of the floor is the stage area. Tense
but not horror.
```

### 13. `prairie-storm`
```
The flat Kansas prairie after the cyclone has passed. Wreckage of a
fence and a broken weather vane in the middle ground. Sky a swirl of
greys clearing to pale gold on the horizon. Tall grass flattened.
Stage area is the open ground in the lower-center.
```

### 14. `swamp-misty`
```
A misty swamp at early morning. Twisted half-submerged trees, lily
pads on dark water, low fog drifting at knee height. A narrow wooden
plank walkway crosses the foreground (stage area). Atmospheric,
slightly eerie, sense of the unknown — but watercolor-soft, never
horror.
```

### 15. `abandoned-cottage`
```
A small abandoned stone cottage in a forest clearing, ivy creeping up
the walls, wooden door slightly ajar. Late afternoon golden light
streaming sideways through the trees. Wildflowers scattered around the
threshold. Stage area is the open ground in front of the door.
Inviting mystery.
```

---

## ✅ After generating

1. Save as `public/backgrounds/<key>.{jpeg|webp}` exactly matching the keys above.
2. Composer auto-picks up files at those keys — no code change required.
3. If a background file is missing, composer falls back to a neutral parchment plate so the game still works.

---

## 💡 Tips

- **Generate the first 3 (road-noon, forest-clearing, cave-interior) first** — these are the most reused. Other backgrounds are nice-to-have for variety.
- **Stage area discipline**: if the model puts a tree/rock/detail right in the lower-center, re-prompt with `"leave the lower-center empty, simple ground only"`. Character compositing breaks if a feature is in the way.
- **Lighting consistency**: prompts all say "upper-left light source". This matches the existing 21 main scenes and the character refs — characters won't look out-of-place when composited.
- **Don't over-specify time of day** unless gameplay calls for it. Most backgrounds work for many encounters.
