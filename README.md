# Retro Gorilla

A 3D homage to the classic QBasic banana-throwing gorilla duel. Two gorillas stand on a city skyline and take turns lobbing explosive bananas at each other. You set the angle and power and allow for the wind. The buildings get blown apart as you go, and a hit is a knockout.

**Status:** playable; see the roadmap below.

## Features

- **Destructible voxel city.** Every storey is a block: blasts carve craters, floating chunks collapse into the street, rooftop water towers and antennas fall with them.
- **Deterministic physics.** The same throw in the same wind always lands in the same place. Gravity presets for Earth, Mars, the Moon and Jupiter.
- **Four weapons.** Banana (unlimited), Banana Bunch (splits into three at the top of its arc), Rubber Banana (bounces twice), Plantain Bomb (huge blast, barely notices the wind).
- **Wind and weather.** Wind changes a little every turn; rooftop flags, rain, snow and smoke all show which way it blows. Each round rolls a new skyline, time of day (dawn, day, dusk, night) and weather (clear, rain with lightning, fog, snow).
- **Cinematic camera.** Overview while aiming, follow-cam in flight, slow-motion replay on a knockout, victory chest-beat close-up. Hold to fast-forward, press S to skip.
- **CPU opponent** at three skill levels (Chimp, Ape, Silverback). It uses the same physics to plan its throws, then misses like a person would, getting closer each shot. The CPU thinks in a Web Worker so the game never stutters.
- **Two players on one keyboard**, plus a CPU-vs-CPU match playing behind the title screen.
- **Synthesized sound.** Every effect and the title music is generated in the browser with WebAudio: no audio files.
- **Built to run on laptops.** Low/Medium/High/Ultra presets, automatic detection on first run, and dynamic resolution that steps down to hold the frame rate.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Aim | Drag anywhere (slingshot: pull back and down) | ← → angle, ↑ ↓ velocity (Shift = ×5) |
| Throw | Release the drag, or the Throw button | Enter or Space |
| Pick weapon | Weapon buttons | 1–4 |
| Fast-forward flight | Hold the mouse button | Hold Space |
| Skip to the result | | S |
| Pause | ❚❚ button | Esc |

You can also type the angle (0–180°, measured from horizontal toward your opponent) and velocity (1–200) directly, like the original.

## Settings

Graphics preset (Auto, Low, Medium, High, Ultra), master/music/effects volume, slow-motion knockout replays on or off, and the aim preview (whole arc, first third, or off for the classic experience). Settings are saved in your browser.

## Build & run

```bash
npm install
npm run dev      # dev server
npm test         # sim tests (physics, weapons, rules, AI, settings, aiming)
npm run build    # production build in dist/
```

The game is a static site: serve `dist/` from any web server.

### Visual and performance scripts

With the dev server running, these drive the real game in Chromium on your GPU:

```bash
node scripts/flow.mjs http://localhost:5173/ shots   # title → setup → match → drag-aim → throw
node scripts/ko.mjs   http://localhost:5173/ shots   # plays a full match with perfect throws
node scripts/shot.mjs http://localhost:5173/ shots/title.png
```

## Tech

TypeScript, Vite, three.js and pmndrs postprocessing. The simulation (`src/sim`) is pure TypeScript with no rendering code: it computes a whole throw up front, and the renderer (`src/render`) replays the result at any speed. Fonts: Bungee and Barlow Semi Condensed (SIL Open Font License), bundled via Fontsource.

## License

[CPAL-1.0](LICENSE) © 2026 Blaine Bouvier. All art, code and sound are original and generated procedurally. The attribution notice shown on the title screen and in Settings must be kept (CPAL Exhibit B).
