# Story Ranger — Audio Asset Prompts

> **BGM**: 6 Wizard-of-Oz scene tracks + 6 engine-general mood tracks (battle / victory / farewell / puzzle / night-rest / sneak). Generate with **Suno** (custom mode + Instrumental flag).
> **SFX**: 10 one-shots. Use **freesound.org** / **pixabay.com** (CC0) for fastest results — Suno is overkill for sub-2s stings, but works if you prefer one source.
> **Export**: MP3 128 kbps. Place files at the exact paths below. Code auto-loads on the filename via [src/lib/audio-engine.ts](src/lib/audio-engine.ts). Missing files = silent (game still works).

---

## 📦 What gets used where

| BGM key (in scenes.json) | Plays during | File path |
|---|---|---|
| `kansas-calm` | s01 Kansas farm, s21 Kansas return | `public/stories/wizard-of-oz/audio/bgm/kansas-calm.mp3` |
| `tornado` | s02a/b cyclone | `public/stories/wizard-of-oz/audio/bgm/tornado.mp3` |
| `munchkinland` | s03 Munchkinland, s20 Glinda south | `public/stories/wizard-of-oz/audio/bgm/munchkinland.mp3` |
| `yellow-road` | s04–s12 (all road/forest/river/poppy scenes) | `public/stories/wizard-of-oz/audio/bgm/yellow-road.mp3` |
| `emerald-city` | s13 gate, s14 throne, s18 unmasked, s19 balloon | `public/stories/wizard-of-oz/audio/bgm/emerald-city.mp3` |
| `witch-castle` | s15 west journey, s16 castle, s17 melts | `public/stories/wizard-of-oz/audio/bgm/witch-castle.mp3` |

| SFX key (in code) | Triggered when | File path |
|---|---|---|
| `medal-earned` | a new medal is awarded | `public/audio/sfx/medal-earned.mp3` |
| `page-turn` | any branch choice taken | `public/audio/sfx/page-turn.mp3` |
| `choice-select` | (reserved — hover/preview, future) | `public/audio/sfx/choice-select.mp3` |
| `free-input-send` | player taps Send on free input | `public/audio/sfx/free-input-send.mp3` |
| `stat-up` | (reserved — stat increase toast, future) | `public/audio/sfx/stat-up.mp3` |
| `companion-joined` | a branch that adds a companion | `public/audio/sfx/companion-joined.mp3` |
| `cyclone-whoosh` | scene-specific (Kansas → Oz transition, future) | `public/audio/sfx/cyclone-whoosh.mp3` |
| `ruby-click` | scene-specific (heels click at home ending, future) | `public/audio/sfx/ruby-click.mp3` |
| `door-creak` | scene-specific (Emerald gate opens, future) | `public/audio/sfx/door-creak.mp3` |
| `witch-melt` | scene-specific (s17 dissolve, future) | `public/audio/sfx/witch-melt.mp3` |

> 코어 4개 (medal-earned, page-turn, free-input-send, companion-joined)가 가장 자주 들리니 최우선. 나머지는 추후 트리거 추가 시 사용.

---

## 🎵 BGM 6곡 — Suno 프롬프트

### Suno 사용 팁 (2026 May)
1. **Custom Mode** 켜기
2. **Instrumental** 체크박스 ON (가사 생성 방지)
3. **Style of Music** 필드에 아래 "Style" 블록 그대로 복붙
4. **Title** 필드: 그냥 BGM 키 그대로 (`kansas-calm` 등)
5. **Length**: 60~90s 가량이면 충분 (게임 안 loop 처리)
6. 한 prompt 당 2–3개 variant 생성 후 가장 게임 분위기에 맞는 걸 채택
7. 음량은 export 후 [Audacity Loudness Normalize](https://manual.audacityteam.org/man/loudness_normalization.html) 같은 도구로 **-18 LUFS** 정도로 통일

---

### 1. `kansas-calm.mp3` — Story Opening (오프닝/엔딩)

**Style** (Suno에 복붙):
```
Instrumental fairy-tale opening theme for a children's storybook
adventure. THE HOOK: open cold with a delicate music-box motif — solo
celesta or glockenspiel plays a short, curious 4-note melodic signature
that immediately sounds like "Once upon a time…". After 4 bars, warm
soft strings swell in underneath, then a wistful solo woodwind (English
horn or oboe) takes up the melody and carries it forward with quiet
wonder. Subtle pizzicato heartbeat in the cellos keeps the piece
moving. Major key with a touch of modal mystery — peaceful but charged
with anticipation, as if magic is about to unfold just past the
horizon. Around 75 BPM. Studio Ghibli opening warmth (Laputa, Totoro
opening titles) crossed with a vintage Disney storybook prologue.
Loopable seamless, no vocals.
```

**Mood reference**: 지브리 *천공의 성 라퓨타* 오프닝, 디즈니 동화책 prologue, *How to Train Your Dragon* opening의 신비롭고 따뜻한 hook.

**Hook tip**: Suno가 곡 시작 시 곧장 main motif를 던지도록 prompt에 *"open cold with the hook motif"* 명시. 잔잔한 ambient bed로 시작해서 멜로디 늦게 나오면 안 됨 — 동화책 첫 페이지 같은 즉시성이 핵심.

---

### 2. `tornado.mp3` — Cyclone (s02 격렬)

**Style**:
```
Instrumental orchestral tension building for a children's storybook
chase scene. Low timpani roll, swirling tremolo strings, distant brass
swells, ascending pizzicato motif suggesting a spinning cyclone. Medium
tempo around 110 BPM. Cinematic and exciting but never frightening —
this is fairy-tale danger, not horror. Loopable. No vocals.
```

**Mood reference**: John Williams *E.T.* 위험 cue (밝은 긴장), Pixar 모험.

---

### 3. `munchkinland.mp3` — Bouncy fairy village (s03, s20)

**Style**:
```
Instrumental bouncy storybook playful piece. Pizzicato strings, plucked
harp, twinkling glockenspiel, light woodwinds (clarinet, piccolo).
Whimsical bright major key in 3/4 waltz feel, around 100 BPM. Joyful
village atmosphere, slightly mischievous. Loopable, seamless.
No vocals.
```

**Mood reference**: Danny Elfman lighter cues, *Amelie* 명랑한 부분.

---

### 4. `yellow-road.mp3` — JRPG Overworld March (s04~s12, 가장 자주 들림)

**Style**:
```
Instrumental heroic JRPG overworld march in the classic orchestral
videogame tradition of Koichi Sugiyama's Dragon Quest overworld themes
and Nobuo Uematsu's Final Fantasy field music. THE HOOK: open with a
bold French horn fanfare playing a confident catchy 8-note main theme
that an 8-year-old could hum after one listen, answered by bright
trumpets. Strings carry a flowing marching countermelody underneath.
Light snare brushes and rolling timpani drive a steady walking pulse
around 105 BPM. Cymbal swells punctuate phrase endings. Major key,
fully orchestral, triumphant and adventurous — "the brave party
crosses the great open world" feeling. Forward motion the whole way
through, never sleepy. Loopable seamless with a clean repeat point.
No vocals, no spoken word.
```

**Mood reference**: Dragon Quest III/V "Overworld" / "Adventure", Final Fantasy V "Four Hearts" overworld, Chrono Trigger field themes. 16-bit ~ 32-bit JRPG 영웅적 모험 march.

**Hook tip**: Suno에서 "in the style of Dragon Quest overworld" 또는 "classic JRPG field theme" 키워드가 잘 잡힙니다. 첫 4초 안에 main brass melody가 등장해야 hook. 시도 후 melody가 약하면 *"stronger main melody, more singable hook, more brass lead"* 후속 변형 요청.

> 이 트랙이 게임 시간 절반 이상을 차지하니, **반드시 멜로디 hook이 강한 variant**를 골라야 합니다. 4–5개 generate 후 가장 catchy한 것 선택.

---

### 5. `emerald-city.mp3` — Majestic arrival (s13~s14, s18~s19)

**Style**:
```
Instrumental majestic orchestral wonder cue. Soaring French horns, lush
strings, soft choir pad with wordless ah-vowels (no spoken lyrics),
shimmering harp glissandos, distant bell chimes. Slow grand tempo around
80 BPM. Awe-struck arrival feeling. Major key, luminous. Loopable. No
spoken vocals, only wordless choir is OK.
```

**Mood reference**: *Lord of the Rings* Rivendell, Studio Ghibli 위대한 도시 cue.

---

### 6. `witch-castle.mp3` — Dark but kid-appropriate (s15~s17)

**Style**:
```
Instrumental dark mysterious storybook cue. Low cellos and bassoon,
distant celesta motif on top, soft timpani heartbeat, sparse minor-key
piano. Slow tempo around 60 BPM. Spooky but age-appropriate for ages
6–11 — atmospheric and curious, not horror or genuinely scary. Loopable.
No vocals.
```

**Mood reference**: *Coraline* 가벼운 cue, *Over the Garden Wall*.

---

## 🎵 추가 BGM 6곡 — 더 다양한 무드 (엔진 공용)

위 6곡은 Wizard-of-Oz 씬에 매핑된 트랙입니다. 아래 6곡은 **특정 씬이 아니라 "분위기"** 단위로 만든 **엔진 공용 무드 트랙** — 어느 스토리에서든 `public/stories/<story>/audio/bgm/<key>.mp3` 에 떨어트리면 admin 의 BGM 드롭다운(Scene / Background) 에서 골라 쓸 수 있습니다. 기존 6곡으로 안 채워지던 빈틈(전투·승리·이별·퍼즐·휴식·잠입)을 메웁니다.

> **일관성 팁**: 위 6곡과 **같은 Suno 세션**에서 이어 생성하면 악기 톤·믹스 캐릭터가 비슷하게 유지됩니다. 같은 "fairy-tale storybook orchestra" 팔레트를 공유하도록 각 Style 블록에 동일한 키워드를 깔아뒀습니다.

---

### 7. `battle.mp3` — Combat (배틀 화면 / 인카운터)

**Style**:
```
[intro]
fast staccato strings, punchy snare-and-tom groove, 145 BPM

[verse]
bold brass riff charges in, energetic call-and-response between brass
and high strings, light cymbal crashes, heroic and adventurous,
major key with heroic minor lift, fully orchestral fairy-tale palette,
kid-friendly JRPG battle music, bright and exciting, never frightening

[chorus]
driving brass melody builds to full orchestral climax, horns and strings
in unison, timpani rolls, triumphant and heroic, forward momentum

[bridge]
high strings carry tension, brass punctuates, building intensity,
cymbal swells, adventurous and bold

[outro]
full orchestral statement, brass and strings together, heroic resolution,
fade into loop point

instrumental only, no vocals, no spoken word
```

**Mood reference**: Pokémon trainer-battle / Final Fantasy "Battle 1" / Chrono Trigger battle — kid-friendly 16-bit JRPG 전투. 긴장감 있되 무섭지 않게.

**Hook tip**: 첫 2초 안에 리듬+brass riff 가 동시에 터져야 함. Suno 가 ambient intro 로 시작하면 *"start immediately on the driving groove, no slow intro"* 후속 변형. 배틀은 짧게 자주 반복되니 loop point 깔끔한 variant 우선.

---

### 8. `victory.mp3` — Win fanfare (전투 승리 / 챕터 클리어)

**Style**:
```
Instrumental triumphant victory fanfare for a children's storybook game,
loopable. THE HOOK: open cold on a bright ascending brass fanfare (the
classic "you won!" flourish) in the first second, then settle into a warm,
jubilant march-like melody carried by horns and glockenspiel with rolling
timpani and shimmering harp. Tempo around 105 BPM. Joyful, celebratory,
proud — "the party cheers after the battle". Major key, luminous and
warm, fully orchestral fairy-tale palette. Keep it short and loopable so
it can play under a victory screen. No vocals.
```

**Mood reference**: JRPG 승리 팡파르(FF victory theme)를 길게 늘여 loop 가능하게. Mario course-clear 의 밝은 느낌.

**Hook tip**: 첫 1초 = 상승 brass flourish 필수("you won!"). 이후 melody 로 자연스럽게 이어지게.

---

### 9. `farewell.mp3` — Tender / parting (동료와 헤어짐, 가슴 뭉클한 순간)

**Style**:
```
Instrumental tender, bittersweet emotional cue for a children's storybook
— a gentle farewell as a friend leaves the party. Solo piano carries a
simple, heartfelt melody; warm soft strings swell underneath; a distant
solo English horn or cello answers the phrases. Sparse, intimate, lots of
breathing space. Very slow around 64 BPM. Wistful and hopeful, NOT
despairing — "we'll meet again", a few tears but mostly warmth. Major key
with a touch of minor color. Fully acoustic orchestral fairy-tale palette,
no synths. Loopable seamless. No vocals.
```

**Mood reference**: Joe Hisaishi 지브리 잔잔한 cue, *Up* "Married Life" 의 따뜻한 슬픔, *Spirited Away* "그날의 강". 새 companion-leave 연출(헤어짐 분기)에 딱.

---

### 10. `puzzle.mp3` — Curious thinking (Educational Challenge 게이트)

**Style**:
```
Instrumental light, playful, curious puzzle-solving theme for a children's
storybook. Bouncy pizzicato strings and a soft marimba/glockenspiel trade
a gentle inquisitive motif over a quiet ticking pulse (light woodblock or
muted plucks). Occasional twinkly bell when an idea clicks. Tempo around
92 BPM. Inquisitive, focused-but-fun — "hmm, let's figure this out" — never
tense. Major key, slightly quirky and cute. Unobtrusive so it can sit
UNDER on-screen math problems and reading. Fully orchestral fairy-tale
palette. Loopable seamless. No vocals.
```

**Mood reference**: *Professor Layton* 퍼즐 테마, *Animal Crossing* 낮 BGM, *Picross* 가벼운 사고 음악. 아이가 문제 푸는 동안 깔리는 배경이므로 멜로디가 도드라지지 않게.

---

### 11. `night-rest.mp3` — Cozy safe haven (밤 / 캠프파이어 / 안전한 휴식)

**Style**:
```
Instrumental warm, cozy nighttime rest theme for a children's storybook —
a campfire under a starry sky, safe and peaceful. Soft fingerpicked
acoustic guitar or gentle harp leads a simple lullaby-like melody; warm
low strings pad underneath; a distant solo flute drifts on top. Very slow
around 58 BPM. Restful, tender, secure — "the party settles in for the
night". Major key, lullaby warmth, lots of space and air. Fully acoustic
orchestral fairy-tale palette, no synths. Loopable seamless and very
gentle. No vocals.
```

**Mood reference**: Zelda 여관/모닥불 cue, *Stardew Valley* 저녁, 지브리 고요한 밤. 잔잔하지만 `kansas-calm`(오프닝의 신비로운 기대감)과 달리 **안도·휴식**에 무게.

---

### 12. `sneak.mp3` — Playful stealth (몰래 지나가기 / 장난스런 긴장)

**Style**:
```
Instrumental playful tiptoe sneaking theme for a children's storybook —
creeping quietly past a sleeping monster. Staccato pizzicato strings and a
muted bassoon "walking" bassline step along on a sneaky off-beat groove;
soft brushed percussion taps; an occasional cheeky muted-trumpet or
clarinet trill pokes in. Tempo around 96 BPM with a mischievous swing.
Suspenseful-but-fun and a little comedic — "shhh, don't wake it" — light
minor color but bright and never genuinely scary. Fully orchestral
fairy-tale palette. Loopable seamless. No vocals.
```

**Mood reference**: *Pink Panther* 라이트, Looney Tunes 살금살금, *Zelda* 잠입 cue 의 귀여운 버전.

---

> **드롭 경로**: `public/stories/<story-id>/audio/bgm/{battle, victory, farewell, puzzle, night-rest, sneak}.mp3`
> 코드 변경 불필요 — admin BGM 드롭다운이 폴더를 스캔해 자동 노출. 후처리(-18 LUFS, fade)는 기존 6곡과 동일.

---

## 🔊 SFX 10개 — Kenney CC0 팩에서 자동 매핑됨

[Kenney](https://kenney.nl/assets) 의 4개 CC0 audio 팩 (UI Audio, Interface Sounds, RPG Audio, Impact Sounds) 에서 적합한 사운드를 매핑해 [public/audio/sfx/](public/audio/sfx/) 에 이미 떨궈둔 상태입니다. 모두 **OGG** 포맷 (Howler가 자동 인식, audio-engine이 mp3/ogg/wav/m4a 모두 fallback).

| 우리 SFX | 매핑된 Kenney 파일 (CC0) | 출처 팩 |
|---|---|---|
| `medal-earned.ogg` | `impactBell_heavy_002.ogg` (heavy triumphant bell) | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `page-turn.ogg` | `bookFlip1.ogg` (실제 책장 넘기는 소리) | [RPG Audio](https://kenney.nl/assets/rpg-audio) |
| `choice-select.ogg` | `click_005.ogg` (soft UI click) | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `free-input-send.ogg` | `pluck_002.ogg` (string pluck, fairy wand 느낌) | Interface Sounds |
| `stat-up.ogg` | `confirmation_003.ogg` (positive rising chime) | Interface Sounds |
| `companion-joined.ogg` | `confirmation_001.ogg` (warm welcome) | Interface Sounds |
| `door-creak.ogg` | `doorOpen_1.ogg` (perfect wooden creak) | RPG Audio |
| `ruby-click.ogg` | `glass_002.ogg` (crystalline click) | Interface Sounds |
| `witch-melt.ogg` | `glitch_002.ogg` (digital dissolve, 마녀 소멸용 placeholder) | Interface Sounds |
| `cyclone-whoosh` | *(미매핑 — 현재 코드에서 trigger 안 됨, 추후 scene-specific trigger 추가 시 별도 다운로드)* | — |

### 🎯 들어보고 마음에 안 들면 교체하는 법

각 SFX는 Kenney 팩 안에 비슷한 variant가 여러 개 있습니다 (`bookFlip1/2/3.ogg`, `confirmation_001~004.ogg`, `pluck_001/002.ogg`, etc).

1. [Kenney 해당 팩 페이지](https://kenney.nl/assets/category:Audio) 에서 zip 다운로드
2. 마음에 드는 다른 variant 찾기
3. `public/audio/sfx/<우리키>.ogg` 에 덮어쓰기 (또는 mp3로 변환해서 같은 이름으로 저장)

`audio-engine.ts` 가 같은 키에 대해 `.mp3 / .ogg / .wav / .m4a` 모두 인식하니 확장자 신경 안 써도 됨.

### 📜 Suno로 직접 만들고 싶을 때

대안 prompt도 그대로 살려둡니다:

---

### 1. `medal-earned.mp3` (~2s)
**Pixabay/Freesound 검색어**: `medal earn fanfare`, `achievement chime`, `level up triumph short`
**Suno 대안 prompt**:
```
Short 2-second triumphant sting: a shimmering bell chime followed by a
soft brass fanfare burst. Joyful, kid-friendly, achievement celebration.
Single hit, no loop. No vocals.
```

### 2. `page-turn.mp3` (~0.6s)
**검색어**: `book page turn`, `paper flip soft`
**Suno 대안**:
```
Realistic 0.6-second sound of a child gently turning a page in a
hardcover storybook. Soft paper rustle with a hint of book spine creak.
```

### 3. `choice-select.mp3` (~0.3s)
**검색어**: `wooden click soft`, `button tap warm`
**Suno 대안**:
```
Very short 0.3-second warm wooden click with a tiny chime overtone. Soft
confirmation tap, like pressing a story button in a music box.
```

### 4. `free-input-send.mp3` (~0.8s)
**검색어**: `magic sparkle short`, `wand chime`, `pixie dust short`
**Suno 대안**:
```
Short 0.8-second magical sparkle sound — like a fairy wand twinkle. High
harp glissando + bright glockenspiel notes ascending. Warm, enchanted,
kid-friendly.
```

### 5. `stat-up.mp3` (~0.5s)
**검색어**: `glockenspiel chime short`, `level up pip`, `positive pip`
**Suno 대안**:
```
Short 0.5-second rising 3-note glockenspiel arpeggio in major key.
Pleasant, encouraging, "+1" feeling. Single hit, no echo tail.
```

### 6. `companion-joined.mp3` (~1.2s)
**검색어**: `warm welcome chime`, `magical join motif`
**Suno 대안**:
```
1.2-second warm welcoming motif. Soft clarinet or woodwind playing a
rising 4-note melody, finishing on a sustained chord with light bells.
Welcoming, friendly, "you have a new friend" feeling.
```

### 7. `cyclone-whoosh.mp3` (~1.5s)
**검색어**: `wind whoosh transition`, `cyclone short`, `whoosh tornado kid`
**Suno 대안**:
```
1.5-second wind whoosh transition sound. Rising wind that swirls and
peaks then fades. Cinematic but not too intense — for a storybook
cyclone scene transition. No music, just wind.
```

### 8. `ruby-click.mp3` (~0.5s)
**검색어**: `crystal click sparkle`, `glass tap twinkle`
**Suno 대안**:
```
Short 0.5-second sequence of two crystalline clicks (heel clicks)
followed by a brief shimmer. Magical, hopeful, "going home" feeling.
```

### 9. `door-creak.mp3` (~1.2s)
**검색어**: `wooden door open old`, `castle door creak short`
**Suno 대안**:
```
1.2-second old wooden door slowly opening with a gentle creak. Warm,
slightly mysterious but inviting — for revealing the Emerald City gate.
Not haunted-house scary.
```

### 10. `witch-melt.mp3` (~1.5s)
**검색어**: `bubbling dissolve magic`, `fizz poof short`, `magic vanish`
**Suno 대안**:
```
1.5-second magical dissolving sound — soft bubbling and hissing fizz
ending in a gentle "poof". Fairy-tale magical disappearance, not gross
or scary. Age-appropriate for ages 6.
```

---

## 🎚 Post-processing 권장

생성한 모든 파일을 [**Audacity**](https://www.audacityteam.org/) (무료) 에 일괄 import 후:

1. **BGM 6곡**:
   - Effect → **Loudness Normalization** → -18 LUFS
   - 시작·끝에 0.5s **Fade In/Out** (Suno가 abrupt cut 한 경우)
   - Export → MP3 128 kbps mono (스테레오 필요 없음)

2. **SFX 10개**:
   - **Truncate Silence** (시작·끝 milliseconds)
   - Loudness Normalization → -12 LUFS (BGM보다 살짝 큰 게 정상)
   - Export → MP3 128 kbps mono

---

## ✅ Drop-in 워크플로우

1. Suno에서 BGM 6곡 생성 (한 곡당 2–3 variant → best 선택)
2. Pixabay/Freesound에서 SFX 10개 다운로드 (또는 Suno로 생성)
3. Audacity 일괄 후처리 → MP3 export
4. **파일명 정확히 맞춰서** 아래 경로에 떨어트리기:
   ```
   public/audio/bgm/{kansas-calm, tornado, munchkinland, yellow-road, emerald-city, witch-castle}.mp3
   public/audio/sfx/{medal-earned, page-turn, choice-select, free-input-send, stat-up, companion-joined, cyclone-whoosh, ruby-click, door-creak, witch-melt}.mp3
   ```
5. 코드 변경 없이 자동 인식 — scene 진입 시 BGM crossfade 자동, 메달·페이지 turn·자유 입력 송신 시 SFX 자동 재생.

---

## 💡 Tips

- **iOS Safari 첫 진입 시 BGM 안 들리는 건 정상** — 사용자가 첫 분기를 탭하는 순간 Howler가 audio context를 unlock하면서 자동으로 BGM 시작됩니다.
- **BGM 사이 동일한 톤·악기 패밀리**가 게임 전체 일관성 핵심 — 가능하면 한 세션에서 6곡 다 생성하면 Suno의 instrument 특성이 비슷하게 유지됩니다.
- **너무 도드라진 멜로디는 피하세요** — TTS narration + 분기 텍스트 위에서 들리니, BGM은 ambient 한 분위기 위주가 좋습니다. 강한 hook이 있는 곡은 처음엔 좋다가 10번째 들으면 피곤해집니다.
- **SFX 라이센스**: pixabay.com/freesound.org CC0는 출처 표기 없이 상업 사용 가능. Suno는 [Suno terms](https://suno.com/terms) 확인 (일반적으로 personal/commercial OK, attribution 불필요).
- **음원 빠진 트랙 게임 영향 0** — `audio-engine.ts`의 `onloaderror` 콜백이 silent 처리. BGM 한두 개만 있어도 게임 동작에 문제 없으니 부담 없이 시작해보세요.
