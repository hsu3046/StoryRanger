# Story Ranger — Illustration Asset Prompts

> **Format**: Cinematic 2.39:1 anamorphic widescreen.
> **Style**: Modern children's storybook — painterly watercolor + soft gouache, refined editorial. Jon Klassen / Carson Ellis / Beatrice Alemagna lineage.
> **Generator**: `gpt-image-2` (low tier), via ChatGPT chat with image attachments — see attachment guide below.
> **Render in app**: 2.39:1 frame, full-bleed background, auto center-crop, accepts `.webp / .png / .jpg / .jpeg`.

---

## 📌 캐릭터 reference 첨부 — 일관성의 핵심

**Scene을 만들 때 가장 중요한 작업**은 텍스트 프롬프트가 아니라 **이미 생성한 캐릭터 reference 이미지를 함께 첨부하는 것**입니다. 텍스트만으로는 매 scene마다 hero 얼굴이 미묘하게 달라지고, 21장이 모이면 "다른 책 같다" 느낌이 듭니다. 첨부 한 번이 텍스트 수정 10번보다 효과적입니다.

### 🅰️ ChatGPT (권장)

새 채팅에서 메시지 작성:

1. **메시지 입력창의 📎 클립 아이콘**으로 등장 캐릭터의 reference 이미지를 모두 첨부합니다.
   - **hero.png는 반드시** (모든 scene)
   - **scene에 등장하는 동료/조연**도 함께 (아래 매핑 표 참고)
   - 보통 1~5장 첨부
2. 첨부 후 prompt 본문에 다음 한 줄을 **맨 위**에 추가합니다:
   > `Use the attached images as character reference. The hero, Toto, and any companions must look EXACTLY like their attached portrait — same face, hair, outfit, proportions. Treat the attachments as the canonical character design.`
3. 그 아래에 shared baseline + scene-specific prompt를 붙입니다.
4. 결과가 캐릭터 외형을 안 따라가면 짧게 후속 요청:
   > `The hero in this image doesn't match the attached reference — chestnut shoulder-length hair, navy overalls, freckles. Regenerate to match the reference precisely.`

### 🅱️ Midjourney
- 캐릭터 reference URL을 `--cref <url>` 로 (multiple refs는 `--cref url1 url2`)
- `--sref <url>` 로 스타일 reference도 함께 (예: cover image)
- `--cw 100` (character weight) 으로 외형 매칭 강도 조절

### 🅲 Nanobanana / Gemini Imagen
- 이미지 첨부 + prompt에 `"Match the characters in the attached images exactly"` 명시
- multi-image 권장 (hero + 동료 함께)

### 🅳 OpenAI API (`client.images.generate` w/ images param)
gpt-image-2가 multi-image conditioning을 지원하면:
```ts
client.images.generate({
  model: "gpt-image-2",
  prompt: "...",
  images: [heroImg, totoImg, scarecrowImg], // reference characters
  size: "1792x1024", // 가장 가까운 wide, 후처리로 2.39:1 crop
});
```

---

## 📊 Scene별 등장 캐릭터 매핑 — 첨부할 reference

다음 표대로 각 scene 생성 시 해당 캐릭터 파일을 첨부하세요. 모든 scene에 hero + toto 기본. 동료/조연은 그 scene에 등장할 때만.

| # | Scene file | 첨부할 reference (`public/stories/wizard-of-oz/characters/`) |
|---|---|---|
| 01 | `01-kansas-farm.webp` | `hero.png` + `toto.png` + `aunt-em.png` |
| 02a | `02a-toto-grass.webp` | `hero.png` + `toto.png` |
| 02b | `02b-cellar-door.webp` | `hero.png` (Toto는 소리만, off-screen) |
| 03 | `03-munchkinland.webp` | `hero.png` + `toto.png` + `glinda.png` |
| 04 | `04-yellow-road.webp` | `hero.png` + `toto.png` |
| 05a | `05a-scarecrow-pole.webp` | `hero.png` + `toto.png` + `scarecrow.png` |
| 05b | `05b-orchard.webp` | `hero.png` + `toto.png` + `tinman.png` |
| 06 | `06-back-on-road.webp` | `hero.png` + `toto.png` *(generic — 동료 없는 컴포지션, 빈 우측)* |
| 07 | `07-forest-edge.webp` | `hero.png` + `toto.png` + `lion.png` |
| 08 | `08-party-on-road.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 09 | `09-dark-forest.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 10 | `10-river.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 11 | `11-poppy-field.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 12 | `12-past-poppies.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 13 | `13-emerald-gate.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 14 | `14-throne-room.webp` | `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 15 | `15-west-journey.webp` | `hero.png` + `toto.png` *(winged monkeys만, 동료는 background)* |
| 16 | `16-witch-castle.webp` | `hero.png` + `wicked-witch.png` |
| 17 | `17-witch-melts.webp` | `hero.png` + `wicked-witch.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 18 | `18-wizard-unmasked.webp` | `hero.png` + `toto.png` + `wizard.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 19 | `19-balloon-launch.webp` | `hero.png` + `toto.png` + `wizard.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 20 | `20-glinda-south.webp` | `hero.png` + `glinda.png` + `scarecrow.png` + `tinman.png` + `lion.png` |
| 21 | `21-kansas-return.webp` | `hero.png` + `toto.png` + `aunt-em.png` |

> 💡 **08~14의 "동료 셋이 다 동행" 가정** — 우리 게임은 분기에 따라 동료가 누락될 수 있지만, 일러스트는 한 장만 생성하는 게 단순합니다. 모든 동료를 함께 그려두고, 게임 상태(동료 누락)는 narration에서만 표현하는 방식.
>
> 첨부 reference가 많아져도 (5~6장) ChatGPT는 잘 처리합니다. 단 한 채팅에 너무 많은 reference를 누적하면 모델이 헷갈리므로, **scene 5개 단위로 새 채팅 시작** 권장.

---

## 🎨 SHARED STYLE BASELINE — 모든 scene prompt 앞에 prepend

```
Cinematic 2.39:1 anamorphic widescreen children's storybook illustration.
Painterly hand-finished look: layered watercolor washes, soft gouache,
visible paper grain, subtle ink linework only where it adds shape. Warm
parchment palette with intentional accent colors — editorial storybook
style of Jon Klassen, Carson Ellis, and Beatrice Alemagna, made a touch
more luminous and kid-friendly. Refined composition with strong negative
space and atmospheric depth. Soft directional natural light. No text,
letters, signs, or watermarks. Wide frame used deliberately — figures
rarely centered, often placed by rule of thirds against expansive
landscape or interior.

CHARACTER CONSISTENCY: Match every attached character reference image
exactly — same face, hair, outfit, proportions. The hero is a roughly
9-year-old child with chestnut shoulder-length hair, freckles, plaid
shirt + navy denim overalls, brown ankle boots — designed to feel
gender-neutral so any kid playing can see themselves. Always with TOTO,
a small scruffy black Cairn terrier.
```

---

## 🎬 SCENE PROMPTS

### Act 1 — Kansas & the Cyclone

#### `01-kansas-farm.webp` *(attach: hero + toto + aunt-em)*
```
Wide prairie at dusk under a strange yellow-green sky. The small weathered
gray farmhouse sits low-right against an immense flat horizon. Long wheat
grass leans hard in the wind. The hero stands at the porch looking out
toward the field, Toto running ahead through the grass barking. Aunt Em
is small in the doorway, calling out. Mood: hushed, ominous, beautiful.
Distant funnel cloud just forming on the horizon.
```

#### `02a-toto-grass.webp` *(attach: hero + toto)*
```
Low ground-level shot through the whipping wheat grass. The hero crouched
mid-frame scooping a startled Toto into their arms, both lit from above
by the bruised gold-green storm light. Loose debris (a single chicken
feather, a small wooden shingle) tumbles past in the foreground.
```

#### `02b-cellar-door.webp` *(attach: hero)*
```
Tilted, dynamic composition. A weathered wooden storm-cellar door slammed
half-open in the wind on the left. The small gray farmhouse on the right
already lifting at its corners, foundation beams visibly torn loose. Sky
swirling sickly green-yellow above. The hero lunging toward the cellar
from the middle ground. High tension, but not scary.
```

### Act 2 — Munchkinland & the Yellow Brick Road

#### `03-munchkinland.webp` *(attach: hero + toto + glinda)*
```
Sunlit fairytale village in a valley. Round whimsical cottages with
curling chimneys and oversized flowers in clusters. A semicircle of small
Munchkin townspeople gathered to the right, all gentle expressions.
Glinda the Good Witch floats gracefully on the left in a pale rose gown
with a soft halo glow and a star wand. A pair of dainty silver shoes
glints on the ground between them. The hero and Toto stand wide-eyed.
Composition leaves wide sky for cinematic feel.
```

#### `04-yellow-road.webp` *(attach: hero + toto)*
```
A road of yellow bricks winds from the lower-left foreground into rolling
emerald countryside. The road forks in the mid-distance — left branch
enters a tall golden cornfield, right branch curves toward an old apple
orchard with twisted dark trunks. The hero and Toto stand at the fork,
small in the wide frame. Soft late-morning light, painterly clouds.
```

#### `05a-scarecrow-pole.webp` *(attach: hero + toto + scarecrow)*
```
Inside a vast golden cornfield. The Scarecrow hangs on a wooden pole in
the mid-ground — burlap face with cheerful painted smile, blue patched
jacket, conical pointed hat, straw poking from sleeves. The hero small
in the lower foreground with Toto, looking up. Warm side lighting through
the corn stalks. Wide cinematic depth.
```

#### `05b-orchard.webp` *(attach: hero + toto + tinman)*
```
Twisted apple orchard at golden hour, dappled light through gnarled
branches. Red apples just out of reach. In the right third, the Tin Man
frozen mid-step holding an axe — kettle-shaped head, polished metal gone
dull with patina, gentle painted eyes. Moss-softened ground. The hero
approaching from the left middle ground with Toto, concerned expression.
```

#### `06-back-on-road.webp` *(attach: hero + toto)*
```
The yellow brick road winds through soft rolling green meadows. Painterly
clouds. Wildflowers along the verge. The hero and Toto walking in the
lower-left third. The right third of the frame is left mostly empty —
visually inviting whichever new companion will appear next. Quietly
hopeful mood.
```

#### `07-forest-edge.webp` *(attach: hero + toto + lion)*
```
The yellow brick road enters a dark twisted forest in the upper-right
third. The Cowardly Lion leaps onto the road in the center, huge wild
golden mane, big amber eyes, slightly trembling lower lip — imposing
but secretly soft. The hero stands bravely facing him in the left
foreground with Toto, tiny but resolute. Dappled shadow through tree
canopy.
```

#### `08-party-on-road.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
The full party walking together along the yellow brick road in afternoon
light. The hero center, Scarecrow (loose straw figure), Tin Man (polished
metal), Cowardly Lion (rich golden mane) beside them. Toto trots ahead.
A faint green glow shimmers on the far horizon at the right edge — the
Emerald City. Warm, painterly, full of motion.
```

### Act 3 — The Trials

#### `09-dark-forest.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
Atmospheric dark forest interior. Tall gnarled trees, deep blue-violet
shadows, slivers of warm sunset breaking through canopy gaps. A wide
ravine cuts across the middle of the frame. Two pairs of glowing yellow
eyes peer between distant trunks. The hero and companions small in the
lower-left, considering the leap. Tense atmosphere, never frightening.
```

#### `10-river.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
A broad calm river with painterly ripples reflecting sky. Soft current
shown by trailing leaves. On the far bank: a blazing meadow of brilliant
red poppies stretching toward the horizon. Late-afternoon golden light.
The hero and companions small on the near bank in the lower-left third.
```

#### `11-poppy-field.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
An endless field of brilliant red poppies under a soft hazy gold sky.
The hero in the mid-ground stumbling sleepily, Toto cradled in their
arms yawning. Companions reaching to support them. Slight dreamy
soft-focus edges. The poppies dominate the lower 2/3 of the frame — a
sea of red. Warm, hypnotic mood.
```

#### `12-past-poppies.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
Open green plain just past the poppy field. Hundreds of tiny field mice
arranged in a neat caravan are carrying a small straw cart with the hero
snoring peacefully on it. Companions walking alongside. The Emerald City
sparkles bright on the horizon in the right third. Gentle storybook
charm, painterly. Wide cinematic.
```

#### `13-emerald-gate.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
Massive ornate green city gates studded with emeralds, soaring upward
beyond frame. The friendly elderly gatekeeper buckles a pair of
green-tinted spectacles onto the hero's face on the left foreground.
Past the gates, glittering green spires rise into a bright sky.
Companions and Toto behind, awaiting their turn. Warm cinematic depth.
```

#### `14-throne-room.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
Vast cathedral-like throne hall of shimmering green marble. An enormous
empty green throne dominates the upper-right. Dramatic shafts of green
light angle down. The hero and companions stand very small in the
lower-left third, looking up with awe. The space feels both magnificent
and slightly intimidating, but never scary.
```

### Act 4 — The West & Resolution

#### `15-west-journey.webp` *(attach: hero + toto)*
```
Bleak gray-violet hills under a stormy sky streaked with low orange
light. A flock of winged monkeys — illustrated soft and stylized, not
menacing — carry the hero through the air on the left. A distant jagged
castle silhouette sits on a sharp black peak in the right third.
Atmospheric, painterly, age-appropriate.
```

#### `16-witch-castle.webp` *(attach: hero + wicked-witch)*
```
Cold stone interior of the Wicked Witch's castle. The Wicked Witch in
the center-right: green skin, tall pointed black hat, dark robe, sneering
with a long bony finger raised. Soft sinister lighting in cool blues with
sickly green undertones. A wooden bucket of water on a high shelf in the
lower-left foreground catches a beam of light. The hero stands bravely
in the lower-center. Tense but classic fairy-tale, never horror.
```

#### `17-witch-melts.webp` *(attach: hero + wicked-witch + scarecrow + tinman + lion)*
```
The Wicked Witch dramatically dissolving into a swirl of black cloth and
a pointed hat amid rising steam, sun-yellow light bursting in through
high windows behind her. Water puddles on the stone floor. The hero and
companions watch with wide relieved eyes from the lower-right third —
expressions of wonder, not horror. Painterly, age-appropriate, almost
magical.
```

#### `18-wizard-unmasked.webp` *(attach: hero + toto + wizard + scarecrow + tinman + lion)*
```
The throne room from a low angle. Toto in the center foreground pulls
back a heavy emerald-green velvet curtain with his teeth. Behind it: the
Wizard — a small kindly older man in a brown vest and round spectacles,
pulling brass levers on a quirky contraption, looking sheepish and
apologetic. The hero and companions react with gentle surprise from the
right third. Warm forgiving atmosphere.
```

#### `19-balloon-launch.webp` *(attach: hero + toto + wizard + scarecrow + tinman + lion)*
```
The Emerald City square bathed in golden afternoon light. A great
patchwork green hot-air balloon rises in the center-mid, the Wizard
waving from the wicker basket. Loose ropes dangle. The hero in the lower
foreground reaches up, Toto wriggling in their arms. Companions watching
from the edges. Cinematic motion blur on the rising balloon.
```

#### `20-glinda-south.webp` *(attach: hero + glinda + scarecrow + tinman + lion)*
```
A serene southern garden in soft morning light. Glinda the Good Witch
glows gently in the center-right in a pale rose gown, kneeling kindly
toward the hero in the center-left. The silver shoes glint faintly on
the hero's feet. Scarecrow, Tin Man, and Cowardly Lion watch tenderly
from the right edge. Wide cinematic composition with lots of sky.
```

#### `21-kansas-return.webp` *(attach: hero + toto + aunt-em)*
```
Back at the gray Kansas farmhouse porch at dawn. Warm rose-gold sunrise
light floods the frame from the right. Aunt Em hugs the hero tightly in
the center. Toto barks happily at their feet. The prairie stretches
infinite beyond. Quiet, deeply emotional, painterly. Mirrors the opening
composition for visual symmetry.
```

---

## 🎬 COVER — `public/stories/wizard-of-oz/cover.webp` *(attach: hero + toto + scarecrow + tinman + lion)*

> **목적**: 게임 인트로 / 동화책 표지 / 영화 포스터의 hook이 되는 한 컷. 아이가 봤을 때 *"와, 들어가고 싶다"* 가 즉시 일어나야 함. 캐릭터들이 정면을 보고 있고, 뒤로 Oz 세계가 한눈에 펼쳐지는 hero shot.

```
[Use shared baseline]
HIGHLIGHT HERO-SHOT cover composition. The hero and three companions
stand together at the crest of a low golden hill on the yellow brick
road, posed as a group portrait facing the viewer head-on — the way a
movie poster or storybook cover frames its cast. Dramatic golden-hour
backlight from a low Oz sunset rims every figure with warm halos of
light. Slight low-angle perspective so the group feels brave and
slightly larger-than-life.

THE GROUP, left to right:
- TIN MAN — leaning in slightly, polished tin catching a tiny sun-glint
  on his chest, axe resting at his side, gentle proud smile.
- SCARECROW — one straw arm slung loosely over the Tin Man's shoulder,
  beaming his painted crescent grin, straw whisping in the wind.
- THE HERO — dead center, chin slightly up, eyes calm and curious,
  chestnut hair lifted by the breeze, one hand resting on Toto's head.
  Toto sits alert at their feet, tongue out, looking straight at camera.
- COWARDLY LION — seated on his haunches at the right, enormous golden
  mane glowing in the backlight, gentle half-smile, one front paw lifted
  mid-step.

THE WORLD BEHIND THEM: the wide kingdom of Oz unfolds in deep
atmospheric distance. The EMERALD CITY glitters with green light on the
far right horizon. The yellow brick road sweeps in a graceful S-curve
down from the foreground into the rolling hills. A field of red poppies
blooms to the left. Painterly cumulus clouds drift across a sky that
fades from warm rose at the horizon to soft periwinkle above. A few
tiny silhouetted winged shapes hint at the magic ahead.

STYLE: Modern editorial children's storybook — refined painterly
watercolor + soft gouache, in the lineage of Jon Klassen, Carson Ellis,
and Beatrice Alemagna, but with the cinematic warmth of a Pixar /
Studio Ghibli key-art moment. Strong rule-of-thirds composition. Warm,
hopeful, slightly mythic. Cinematic 2.39:1 anamorphic frame. No text,
no title, no logo anywhere — just the image.

The whole composition should make a child look at it and immediately
want to step inside.
```

---

## 📱 PWA ICONS — `public/icons/icon-{192,512}.png`

**컨셉**: 펼쳐진 동화책에서 풍경과 캐릭터들이 입체적으로 팝업되어 나오는 장면.
**생성**: 1024×1024 정사각 (PNG), 후처리로 192·512 export.
**Reference 첨부 권장**: `hero.png` + `toto.png` + `scarecrow.png` + `tinman.png` + `lion.png` *(실루엣 일관성 — 작은 사이즈에서도 캐릭터 알아보게)*

```
Square 1024×1024 app icon. A pop-up storybook scene viewed from a slight
three-quarter angle. An open hardcover storybook with warm parchment
pages lies open in the lower half of the frame, the spine running
horizontally. Rising up from the pages in a magical paper-craft pop-up
effect: miniature scenery — a winding yellow brick road curving into the
distance, a small Emerald City silhouette glittering on the right
horizon, soft watercolor clouds drifting above.

Small storybook characters stand on the open pages like paper-cut
figures: the hero (a child in plaid shirt and navy overalls) leading
the way with Toto (a tiny black terrier) at their heels, the Scarecrow
in his blue patched jacket and pointed hat just behind, the Tin Man
catching a glint of sunlight, the Cowardly Lion with his golden mane
peeking out at the edge. All characters are simplified to bold,
recognizable silhouettes that read clearly at small sizes.

STYLE: Painterly watercolor + soft gouache, warm parchment palette with
a golden sunrise glow lighting the scene from the upper right. Soft
natural lighting. Refined editorial children's storybook style — Jon
Klassen / Carson Ellis lineage, modern and luminous. Subtle paper-grain
texture. Cinematic depth: the book solid and warm in the foreground,
the popping-up scenery soft and atmospheric above.

CRITICAL ICON REQUIREMENTS:
- Square 1:1 composition, 1024×1024
- Safe padding: keep the entire scene within a centered 80% area (10%
  margin on each side) so it survives being masked into a circle or
  rounded square on iOS / Android home screens
- Background outside the scene should be a single warm cream-gold tone
  that blends smoothly with the artwork — no hard frame, no transparent
  edges
- Recognizable at 32×32 pixels — bold silhouettes, clear color blocks,
  minimal small detail
- No text, no letters, no labels, no logos anywhere in the image
```

**Export workflow**:
1. 1024×1024 PNG 생성
2. 그대로 `public/icons/icon-512.png` 으로 저장 (또는 512×512로 downscale)
3. 같은 파일을 192×192 로 downscale → `public/icons/icon-192.png`
4. [squoosh.app](https://squoosh.app) 또는 macOS Preview의 "Tools → Adjust Size" 로 빠르게 가능

**Maskable 검증** (선택): [maskable.app/editor](https://maskable.app/editor) 에 업로드 → 원형/스쿼클로 자동 마스킹 미리보기. 중요 요소가 마스크 밖으로 나가면 안전 padding을 더 키우세요.

---

## ✅ Workflow 권장 순서

1. **캐릭터 9장 완료** (✅) — Reference 풀 준비됨
2. **Cover 먼저 생성** — 5장 reference (hero + 동료 4) 첨부, 톤·스타일 anchor 정함
3. **Cover OK → Act 1 (s01~s02)** — 3장씩 batch, hero + Toto + Aunt Em refs
4. **Act 2 (s03~s08)** — 동료가 한 명씩 늘어가는 흐름. reference도 점진 추가
5. **Act 3 (s09~s14)** — 동료 풀 세트 + 새 chat 시작 (refs 누적 방지)
6. **Act 4 (s15~s21)** — Witch + Wizard + Glinda 등장. 각 act 마다 새 chat
7. **PWA 아이콘 마지막** — cover composition 응용

각 act 마다 ChatGPT 새 chat을 권장 — reference 누적으로 모델이 혼란스러워지는 걸 막습니다.

---

## 💡 Tips

- **첫 생성 후 항상 짧게 검토**: "hero의 얼굴이 attached reference와 일치하는가? plaid 셔츠 + 데님 overalls가 맞는가?" 안 맞으면 즉시 regenerate (이 단계 미루면 21장 일관성 무너짐).
- **컴포지션이 좋지만 캐릭터가 살짝 어긋났을 때**: ChatGPT에 결과 이미지 + reference 동시 첨부 후 `"Keep this composition but redo the hero's face to match the reference"` 라고 후속 요청.
- **Crop tip**: gpt-image-2가 1792×1024 출력 시 위·아래 137px씩 crop → 1792×750 (정확히 2.39:1).
- **WebP 변환**: 최종 PNG/JPG → [squoosh.app](https://squoosh.app)에서 WebP로. 평균 50–70% 사이즈 절약.
- **파일 떨어트리기만 하면 됨**: 코드는 이미 다 준비됨 (`scenes.json`의 경로 그대로). 확장자 자동 fallback (`webp → png → jpg → jpeg`), 비율 다르면 center crop.

---

## 🆕 추가 보강 Scene Prompts — 원작 누락 비트 (2026-05-27 추가)

원작 Oz 의 핵심 비트 중 현재 스토리 흐름에서 빠진 / 약화된 7개 장면. 각 prompt 는 위의 **🎨 SHARED STYLE BASELINE** 을 prepend 한 뒤 사용.

### 추가 Scene → 캐릭터 reference 매핑 (기존 표에 행 추가 권장)

| # | Scene file | 첨부할 reference (`public/stories/wizard-of-oz/`) |
|---|---|---|
| 02c-alt | `02c-tornado.webp` *(기존 교체 시)* | `characters/hero.png` + `characters/toto.png` (창문 silhouette만) |
| 02d | `02d-house-crashes.webp` | `characters/wicked-witch.png` *(발만 — east witch 로 재활용)* + `characters/glinda.png` *(멀리 반짝)* |
| 09a | `09a-mouse-queen-rescue.webp` | `characters/hero.png` + `characters/toto.png` + `characters/tinman.png` + `characters/scarecrow.png` + `characters/lion.png` + `monsters/mouse-king.png` *(여왕에 재활용)* |
| 13a | `13a-emerald-spectacles.webp` | `characters/hero.png` + `characters/toto.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` *(Guardian 신규 — 텍스트 묘사)* |
| 14a | `14a-wizard-faces.webp` | `characters/wizard.png` *(4가지 변형 중 base — 나머지 3가지는 신규)* |
| 15a | `15a-monkey-ambush.webp` | `characters/hero.png` + `characters/toto.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` + `monsters/winged-monkey.png` |
| 16a | `16a-castle-captive.webp` | `characters/hero.png` + `characters/lion.png` + `characters/wicked-witch.png` *(background)* |
| 18a | `18a-wizard-gifts.webp` | `characters/hero.png` + `characters/toto.png` + `characters/wizard.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` |

---

### Act 1 — Kansas & the Cyclone (보강)

#### `02c-tornado.webp` *(교체 버전, attach: hero + toto — 창문 silhouette)*
```
Sky-level dynamic shot of the small gray Kansas farmhouse mid-air inside a
colossal green-grey tornado funnel. The funnel curves dramatically across
the frame; splintered fence rails, hay bales, a barn door, and dust swirl
in concentric spirals around the house. The Kansas prairie far below tilts
away into receding fields. Sickly green sky above, dark stormy charcoal
toward horizon, one pale shaft of light catching the house. One window
glows warm amber — silhouette of the hero clutching Toto. Immense motion
and scale. Wide deliberate negative space at left.
```

#### `02d-house-crashes.webp` *(attach: wicked-witch — 발 reference + glinda)*
```
A small wooden Kansas farmhouse newly crashed at a slight tilt into a
bright Munchkin meadow of vivid wildflowers — daisies, poppies, bluebells.
Splinters and a settling puff of dust around the front-left corner. From
beneath that corner, two feet stick out wearing brightly striped red-and-
white stockings and pointed curly-toed silver slippers — the Wicked Witch
of the East (gentle classic children's-book implication, no blood). The
afternoon sky is freshly clear after the storm — soft blue with cotton-puff
clouds. In the middle distance, tiny Munchkin folk peek shyly from behind
bushes along a winding path of yellow brick, wide-eyed with wonder. A
faint pink shimmer hints at Glinda's arrival to the upper left. Vivid
Munchkin reds and yellows contrasting the weathered grey-brown of the
house. Tender and slightly comedic tone.
```

---

### Act 3 — Trials of the Road (보강)

#### `09a-mouse-queen-rescue.webp` *(attach: hero + toto + tinman + scarecrow + lion + mouse-king)*
```
In a shadowy old-growth forest clearing dappled with shafts of green-honey
light, the Tin Woodman stands triumphant mid-frame with his silver axe
held high; at his feet, a stunned-looking wildcat slinks away into the
underbrush at the right edge. On a moss-covered fallen log to the left, a
tiny field mouse — clearly noble, wearing a small twig crown and a delicate
pearl pendant — looks up gratefully at the hero. The hero kneels gently
to greet her, Toto sniffing curiously. Behind, the Scarecrow and Cowardly
Lion peek in with worried tenderness. A few smaller mice watch from
between roots. Ferns, mushrooms, fallen leaves cover the forest floor.
Deep forest greens with warm honey shafts of light.
```

---

### Act 4 — Emerald City + Witch + Return (보강)

#### `13a-emerald-spectacles.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
Just inside the great gates of the Emerald City, a kindly old Guardian of
the Gates with a long white beard, flowing green robes, and a tall green
velvet hat holds open a polished wooden box from which he offers green-
tinted round spectacles. The hero is fastening their pair, the Scarecrow
already has his perched crookedly on his straw face, the Tin Man examines
his curiously, and the Lion is failing to fit his over his snout — all
in good humor. Toto wears a tiny pair too. The Guardian smiles knowingly.
Behind the group, through the open gates, the Emerald City beyond GLOWS
with vivid green light — towers, spires, crystal-faceted domes shimmering.
Lush green ornamental gardens flank the entryway. Wondrous and slightly
comedic.
```

#### `14a-wizard-faces.webp` *(attach: wizard — 4 변형 중 base 얼굴 reference)*
```
A grand emerald-green throne hall split into FOUR glowing vision panels
arranged like a stained-glass altarpiece, framed by ornate emerald-and-gold
filigree. Upper-LEFT: a colossal floating disembodied bald head with closed
eyes and serene expression, surrounded by green smoke (use the attached
wizard reference for the face). Upper-RIGHT: an ethereal beautiful young
woman with iridescent butterfly wings and flowing pale gown, hovering on a
beam of light. Lower-LEFT: a tall shaggy beast with five legs, five eyes,
five arms — towering and stylised, intimidating but not gory. Lower-RIGHT:
a swirling ball of pure orange-gold fire on a green stone pedestal. The
four visions share a unified emerald light. Cathedral-altarpiece feel.
Rich emerald green palette with gold and warm flame accents.
```

#### `15a-monkey-ambush.webp` *(attach: hero + toto + scarecrow + tinman + lion + winged-monkey)*
```
On a barren rocky plateau under an oppressive yellow-grey sky, a flock of
winged monkeys swoops down from above in a diving formation — dark grey
fur, leathery brown wings, sharp glittering eyes, small fez-like caps on
some. The hero clutches Toto and stumbles backward, the Tin Man raises
his axe defensively, the Scarecrow flails to protect his straw, the
Cowardly Lion crouches mid-roar. The monkeys' wing-shadows cast long
sweeping shapes across the rocks. Wind whips dust into the air. Far
distance: a dark gothic castle silhouette — the Witch's castle. Cinematic
low-angle composition emphasising the descending threat. Ochre + slate-grey
+ cool violet palette with warm earth tones on the heroes. Menacing but
not nightmarish — kid-friendly.
```

#### `16a-castle-captive.webp` *(attach: hero + lion + wicked-witch — background silhouette)*
```
Inside a dim stone-walled scullery of the Wicked Witch's castle, the hero
is on their knees scrubbing a worn flagstone floor with a wooden bucket
beside them, dress dust-smudged. Their face shows quiet, determined
sadness — not despair. The Cowardly Lion, ragged and tired, lies chained
to a stone column nearby, his eyes locked sympathetically on the hero.
A pair of long shadowy crow-like familiars perch on a high beam watching.
Through a barred window high on the wall, a sliver of cold blue daylight
cuts the gloom. On a side shelf, a single silver slipper glints (the
witch covets it). Distant silhouette of the witch through an archway,
back turned. Cool slate + charcoal palette with one warm amber lantern
glow on the hero and Lion. Somber yet hopeful, child-appropriate.
```

#### `18a-wizard-gifts.webp` *(attach: hero + toto + wizard + scarecrow + tinman + lion)*
```
A warm cozy back-room of the Emerald Palace at twilight, green-tinged
lanterns glowing. The little old Wizard (slightly bald, kindly twinkling
eyes, simple green tunic — clearly just a man now) stands beside a low
oak table laden with three carefully-wrapped offerings. He is mid-
ceremony: with both hands he presents a heart-shaped silk pouch to the
Tin Man, whose metal chest plate is hinged open eagerly. To one side,
the Scarecrow already has a slit at the top of his head with bran-and-
needles spilling out — clutching it proudly with both straw hands. On
the other side, the Cowardly Lion sits patiently on his haunches, eyeing
a small glass dish of glowing golden liquid. The hero stands behind them,
hands clasped over their heart, smiling tearfully. Toto sits at their
feet. Warm candle-and-lantern light, intimate and emotional. Warm honey
+ amber + soft emerald palette.
```

---

### 스토리 흐름 통합 위치 안내

생성한 이미지를 `public/stories/wizard-of-oz/scenes/` 에 저장 후, `src/stories/wizard-of-oz/scenes.json` 에 다음과 같이 분기 통합:

```
ACT 1
  s02c_tornado → s02d_house_lands (NEW)         → s03_munchkinland

ACT 3
  s09_dark_forest → s09a_mouse_rescue (NEW)     → s10_river
  (혹은 lost-wolf-pup 처럼 side encounter 로 등록)

ACT 4
  s13_emerald_gate → s13a_spectacles (NEW)      → s14_throne
  s14_throne 의 image 만 → 14a-wizard-faces.webp 로 교체 (분기 변경 없음)
  s15_west_journey → s15a_monkey_attack (NEW)   → s16_witch_castle
  s16_witch_castle → s16a_captive (NEW)         → 기존 물 throwing 분기
  s18_unmasked → s18a_gifts (NEW)               → s19_balloon_launch
```

→ 신규 6 scene + image 교체 2 = **현재 25 scene → 31 scene** 으로 확장. 원작 충실도 + RPG 깊이 동시 향상.

---

### 작업 우선순위 추천

1. **02d-house-crashes** — 가장 큰 누락 비트 (원작에서 신발 받는 이유). Glinda 만남의 자연스러운 셋업
2. **18a-wizard-gifts** — 동화의 핵심 메시지 "너희는 이미 가지고 있었다". 게임의 RPG 스탯 시스템과 강하게 호응
3. **14a-wizard-faces** — image 교체만으로 임팩트 큼 (분기 추가 없이 가능)
4. **15a-monkey-ambush** — 마녀 위협의 무게감 부여
5. **16a-castle-captive** — Dorothy-Lion 우정 심화 + 물 throwing 동기 부여
6. **09a-mouse-queen-rescue** — s12 mouse-king-blessing 의 이유 부여
7. **13a-emerald-spectacles** — Wizard 사기 (s18) 의 복선

---

## 🆕 Trial / Farewell Scene Prompts — PatternPuzzle 트라이얼 + 작별 (2026-05-27 추가)

원작 s09 / s10 의 진행이 부족해 "어떻게 통과했는지" 의 mechanics 가 사라져 있던 점을 PatternPuzzle 기반 trial encounter 로 보강. 추가로 s20 → s21 사이의 동료 작별을 새 scene 으로 분리.

### 추가 scene 매핑 표 (기존 표 아래 행 추가용)

| # | Scene file | 첨부할 reference |
|---|---|---|
| 09a-trial | `09a-firefly-path.webp` *(encounter bg, optional — 기존 forest-deep 대체)* | `characters/hero.png` + `characters/toto.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` |
| 10a-trial | `10a-stepping-stones.webp` *(encounter bg, optional — 기존 river-bank 대체)* | `characters/hero.png` + `characters/toto.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` |
| 20a | `20a-farewell.webp` *(필수 — 새 scene)* | `characters/hero.png` + `characters/toto.png` + `characters/scarecrow.png` + `characters/tinman.png` + `characters/lion.png` |

---

### Trial — 다크 포레스트 (fireflies 패턴)

#### `09a-firefly-path.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
A deep moonlit old-growth forest at midnight. The hero and three companions
(Scarecrow, Tin Man, Cowardly Lion) stand in a hush of dark trunks and
tangled brambles in the lower third of the frame, looking forward. Through
the gloom, a winding trail of glowing fireflies — bright yellow-green
specks — traces a curving path forward into the deeper woods, pulsing in
a clearly RHYTHMIC pattern: left-cluster, right-cluster, right-cluster,
left-cluster — as if the forest itself is teaching them the safe steps.
Tiny phosphorescent mushrooms ring the bases of trees. Distant pale
moonbeams cut through the canopy in long diagonal shafts. The hero looks
intently at the firefly pattern, the Scarecrow leans curiously, the Tin
Man peers with one hand on his axe, the Lion's tail flicks low.
Cinematic 16:9 composition with strong forward depth — the firefly path
curves dramatically into the distance. Vintage children's storybook
watercolor illustration. Deep forest greens, indigo shadow, warm yellow-
green firefly glow as the lone accent color. Soft painterly textures,
classic L. Frank Baum-era Oz storybook tone, modernised — mysterious but
warmly inviting, not nightmarish. NO text, captions, or logos.

Negative: photorealistic, 3D render, CGI, anime, manga, dark horror,
gore, blood, harsh digital lines, watermarks.
```

---

### Trial — 강 건너기 (stepping stones)

#### `10a-stepping-stones.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
A swift rocky river crossing in the late afternoon. A chain of mossy
stepping stones (about 8 of them) crosses the rushing water in a
deliberately uneven serpentine line — and some of the stones GLOW softly
with a pale blue inner light, while others sit dark and slippery. The
hero stands on the near bank with Toto in their arms, weight forward,
about to step onto the first glowing stone. The Scarecrow waits behind
holding the Tin Man's metal hand for balance. The Cowardly Lion crouches
ready to spring. White foam churns around the dark stones; spray catches
the golden afternoon light. Reeds and yellow river-grass on both banks.
Forested far bank in the misty distance. Cinematic 16:9 composition,
slight overhead angle to show the stone pattern clearly. Vintage
children's storybook watercolor — warm afternoon golds and ochres on
the banks contrasted with cool blue-green water and the pale spectral
glow of the safe stones. Soft painterly textures, classic Oz storybook
tone, modernised — tense but hopeful. NO text, captions, or logos.

Negative: photorealistic, 3D render, CGI, anime, manga, gore, blood,
dark horror, harsh digital lines, watermarks.
```

---

### Farewell — 동료들과 작별 (s21_home 직전)

#### `20a-farewell.webp` *(attach: hero + toto + scarecrow + tinman + lion)*
```
A radiant late-afternoon meadow outside Glinda's southern palace — soft
golden hour light, scattered pink and white wildflowers, distant pastel-
spired towers blurring in pink-violet haze. In the foreground, an intimate
group embrace: the hero kneels in the center holding Toto in one arm, the
Scarecrow's straw arm wrapped warmly around their shoulders from one side,
the Tin Man pressing his metal hand to their other shoulder with a single
visible tear running down his cheek, the Cowardly Lion behind them all
nuzzling his huge mane gently against the hero's back. Every face shows
soft, brave, bittersweet love — none crying loudly, all holding it in
with grace. A few silvery glints catch on the hero's slippers (Glinda's
silver shoes). Glinda herself, small and pink in the distance, watches
with hands clasped over her heart. Cinematic 16:9 composition, golden
hour palette — honey gold, soft amber, dusty rose, sage green. Vintage
children's storybook watercolor illustration with luminous backlighting
and intimate close framing. Soft painterly textures, classic L. Frank
Baum-era Oz storybook tone, modernised — deeply tender and emotional,
the kind of scene a child reader closes the book on with happy tears.
NO text, captions, or logos.

Negative: photorealistic, 3D render, CGI, anime, manga, harsh digital
lines, watermarks, melodramatic, sappy, anime style.
```

---

### 스토리 흐름 통합 (구현 완료)

이 세 prompt 는 다음 코드 변경과 짝지어 이미 구현돼 있음 — 이미지만 떨어트리면 즉시 작동:

```
ACT 3 — Trials
  s09_dark_forest → (encounter: dark-forest-trial, mandatory)
                    bg: forest-deep (default) — 09a-firefly-path 로 교체 가능
                    PatternPuzzle 시퀀스: [✨🌿🦋🍄] 5-step pattern
                    success: silk-thread + brain+2 courage+1
                    fail: courage+1
                    → s10_river

  s10_river → (encounter: river-crossing-trial, mandatory)
              bg: river-bank (default) — 10a-stepping-stones 로 교체 가능
              choices:
                · Memorise stones (PatternPuzzle 5-step) → swamp-pearl + brain+2 friendship+1
                · Tin Man chops bridge (requires tinman companion) → friendship+2 mood+2
                · Wade through → courage+2
              → s11_poppies

ACT 4 — Farewell
  s20_glinda → s20a_farewell (NEW scene, image: 20a-farewell.webp)
              4 choices, 각각 다른 동료에게 작별 + statDelta 다름
              → s21_home (ending)
```

이미지 만드는 동안 게임 진입 시 — `09a-firefly-path.webp` / `10a-stepping-stones.webp` 가 없으면 자동 fallback 으로 기존 `forest-deep` / `river-bank` 사용 (extensions chain 자동). `20a-farewell.webp` 만 placeholder 가 떠도 분기 자체는 작동.
