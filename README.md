# Bunny Brigade

A rabbits-vs-foxes lane battler with a merge backpack, built with TypeScript + Vite and drawn entirely on a canvas (no image files).

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). `npm run build` makes a static build in `dist/`.

While the dev server runs, **http://localhost:5173/sounds.html** is a sound board: the music tracks, every sound in the game, each class level, and a few mixes (a kill streak, a firefight, a case roll up to SSS) to listen to them together.

## How to play

- Fox gangsters walk in from the right. Any fox that gets past the left edge steals carrots; if your carrots (top-left of the road) reach 0 you lose the stage.
- **Prep time, then the wave**: before every wave you get prep time to open cases, merge, fuse and move pieces. Tap **START WAVE** when you are ready: the wave never starts by itself. During the wave the grid, tray and cases are **locked**. Clearing a wave plays a ribbon animation with your bonus cash, and prep time starts again.
- Rabbits with guns hold the **left half** of the road; melee rabbits (knife, shield, paws and their supers) charge anywhere.
- **Every soldier looks different**: cartoon rabbits and foxes in a three-quarter view (face turned toward you), each with its own fur, markings, ears, clothes and accessory. Rabbits wear overalls, vests, jackets, hoodies or tank tops, with scarves, glasses, bandanas, dog tags or freckles; their helmet shows their class. Each fox gang has its own outfit: thugs in tank tops and flat caps, gunners in suits and fedoras, sprayers in tracksuits, brutes in leather and bowlers, bombers in aviator gear, runners in racing vests and sweatbands, shadows in dark ninja wraps and headbands, and the boss, Big Red, in a pinstripe suit, a feathered fedora, a gold chain and a gold tooth.
- **They fight like squads, not a conga line**:
  - Rabbits take up a **formation**: shields in front, knives behind them, pistols and SMGs in the middle, rifles and rockets at the back. A big group stands in two or three staggered ranks that bow forward a little in the middle, every rabbit a little off the line, and each one keeps its spot even while a squadmate waits to respawn. Rifles, rockets and some other shooters drop to one knee to aim; with no fox close, rabbits fidget (a hop, a look over the shoulder, a check of the weapon). They hold their ground: ordinary hits only make them flinch, and they only walk back when pushed well off their spot. Shooters fire from their spot, and each squad **focuses fire** on one fox (a red target ring shows who is being focused). Shields stop the fox closest to the carrots; knives slip round the side to hunt gunmen, never straying too far. A badly hurt rabbit falls back to catch its breath (a sweat drop), then returns.
  - Foxes come in **packs** that march in a wedge behind a leader. Packs with brawlers stop at the edge of the fight, raise their weapons, wait for stragglers, then **charge together** ("!"). Fox gunmen stop to shoot only where some rabbit can hit back (no sniping from out of reach), and back away from a knife rabbit closing in. Thugs go round the shields for the shooters, bombers aim at bunched-up rabbits, and a hurt fox runs back for a moment before rejoining. Packs march at one pace (nobody stop-starts) and gunmen stay put once they have found a spot to shoot from.
  - **Smart squad**: shooters pick the most dangerous fox (no wasted overkill), back-pedal from brawlers while shooting, and step up (never past half the road) when a squadmate is hit just out of reach; shields and knives peel back to guard the shooters from Shadows and thugs, someone always goes after runners, and a last line covers the carrots; knives hunt in pairs and never dive alone into a pack; rabbits scatter from incoming fox rockets and dive out of a brute's row when it winds up a bull rush (a red band marks the row), while shields brace and block it ("BLOCK!"). A wave can never stall: foxes that stop making progress press forward.
  - **Fox skills**: foxes sprint, dodge and teleport. Thugs and runners put on bursts of speed (speed lines); thugs, sprayers, runners and shadows side-step shots ("MISS"); gunners under fire teleport sideways in a puff of smoke, leaving a fading afterimage; sprayers strafe up and down while they spray; brutes bull-rush a rabbit in their row, bowling it over and leaving it dizzy; bombers (and shadows) throw smoke bombs, and foxes inside the smoke are much harder to hit and get picked last. **Runners** (from wave 3) dodge round the rabbits and dash for the carrots; **Shadows** (from wave 5) teleport right next to your shooters and vanish in smoke when hurt. **Big Red** teleports forward, lets out a war cry that makes the whole gang faster (a red glow under every fox), and calls in two runners when it is half beaten.
- Your army comes from the **grid** at the bottom:
  - a **weapon touching a rabbit** (side by side) becomes a squad of 2 soldiers carrying that weapon (orange joints show the link);
  - a rabbit touching no weapon sends a squad that fights with its paws;
  - a weapon touching no rabbit is **IDLE**.
- **Gear** pieces never fight; they boost what they touch (drag one to read what it does):
  - **Ammo Box**: weapons touching it attack faster.
  - **Scope**: guns touching it deal more damage and reach farther (scoped rabbits show a red laser).
  - **War Banner**: a rabbit touching it sends extra soldiers in each of its squads.
  - **Med Kit**: a rabbit touching it gets more HP and its squads heal over time.
- **Classes**: every piece has a class, from common to legendary: **E, D, C, B, A, S, SSS**. Merge two identical pieces of the same class to get the next class. A-class pieces shine, S-class pieces glow red with twinkles, SSS pieces have a moving rainbow frame with orbiting stars.
- **Cases**: **CASE** (cash, the price climbs a little each time) and **ELITE** (gems, never E-class) start a **roll** that takes over the screen. The case drops in and bursts open, and a big medallion flicks through pieces with their class and "1 in N" odds, slowing down until it lands. An A-class or better prize first lands as a lower class of the same piece, then cracks, shatters and comes back a class higher, again and again up to the real prize. The higher the class, the rarer it is (the class ladder at the bottom shows the odds). Every 25th case without an A-class or better is guaranteed one; a bar under the ladder counts toward it. Tap to skip ahead; tap again to collect.
- **Evolutions**: drop a piece on its recipe partner when both are the **same class, C or higher**, and they fuse into a super weapon of that class that fights in a new way. Two **A-class** (or better) partners make an **AWAKENED** super. Feed a super a same-class ingredient to raise it one class.
  | Recipe | Super weapon | What it does |
  |---|---|---|
  | Knife + Pistol | Gunblade | every 3rd slash sends a shock wave down its lane |
  | SMG + Ammo Box | Gatling | spins up to fire 2.5x faster the longer it shoots |
  | Rifle + Scope | Railgun | instant beam piercing up to 5 foxes in a line |
  | Riot Shield + Knife | Riot Ram | charges through the fox line, bowling them over |
  | Rocket + Grenade | Cluster Barrage | rockets burst into 4 bomblets |
  | Railgun + Cluster Barrage | Carrot Cannon (ultimate) | giant carrot shell that pierces, then explodes |
- The grid starts as a 4x3 block. The locked cells around it open three ways: some you **buy with cash** (each costs more than the last), some open when you **reach a stage** (2, 3, 4, 5), and some open after enough **knock-outs** (50, 150, 300, 500; the cell shows your progress).
- **Tap the road** during a wave to drop a carrot airstrike (recharges), and chain knock-outs for **combo** bonus cash.
- **Drag** pieces to move them. Drop a piece on an identical one (same type and class) to **merge** it into the next class (up to SSS).
- **Tap** a grid piece to rotate it; tap a tray piece to auto-place it.
- Drag a piece onto **SELL** to get some cash back.
- 10 waves per stage, with a boss on wave 10. Clearing a stage gives a fireworks party, 1 to 3 stars (for the carrots you kept) and gems; then **NEXT STREET** sends your squads on a 19 km sprint in under 3 seconds: they crouch, blast off, ten streets blur past, and they skid to a stop on the next street (Carrot Market, Maple Park, Old Town, then round again).
- The streets are alive: trees and bushes sway in the wind and whip away from explosions, leaves blow onto the road, birds scatter when bombs go off, bunny townsfolk peek out of windows and cheer when you clear a wave, and each street has its own life (a windmill and a hot-air balloon, a kite and butterflies, stars, fireflies, a neon sign and a rooftop cat).
- Pause (or press Space) and the x2 speed button are top-left and top-right. The speaker button (bottom-right) mutes the sound and remembers it.
- **Attacks**: every weapon looks and feels different: a wind-up pose, its own swing curve with a smear frame or its own recoil, its own muzzle flash shape, tracer and casing, a matching impact (slashes, stabs, blunt stars, bullet sparks, zaps, blasts) with a comic word (POW!, THUD!...), hit-stop and a camera kick on heavy hits, victims flinching and shedding tufts of their fur, and knock-outs that match what hit them (sliced, bonked, blasted, fried, bowled). Rabbits' effects are clean and bright, foxes' dirty and orange.
- **Sound**: every effect is synthesized and layered like a sound designer would build it (a sharp transient, a body, a sub thump, a tail, metal rings, crackle, brass, bells and choir), then mixed: sounds sit left or right where they happen on the road, share a room reverb, and big moments briefly hush the battle. Fox weapons sound deeper than the rabbits'. Every melee weapon has its own hit (knife slash, club thwack, shield clang, paw punch). Kill streaks climb a musical scale, merges ring higher for every class, and case prizes go from a ding to a full SSS epic.
- **Music**: an adaptive soundtrack (synthesized like the effects) that follows the game: a chill swung groove with marimba during prep time, a driving beat with brass stabs and a catchy lead hook during waves, a darker theme with choir, toms and low brass for the boss wave, a bright victory loop after the stage-clear fanfare, a snare roll and riser on the run to the next street, and it fades out on defeat. It changes on the beat (a wave kicks in right after the war horn), sits under the effects, dips under big moments and is muffled during case rolls, evolutions and pauses. The speaker button mutes music and effects together.

## Code map

- `src/theme.ts`: canvas size, layout, colours (one per class), font
- `src/attackfx.ts`: the per-weapon attack table (wind-up, lunge, squash, hit-stop, impact kind, comic words, knock-out style) for rabbits and foxes
- `src/sounds.ts`: every sound effect as a synth recipe (`SOUNDS`: its design, loudness, variants, pitch by level); `src/audio.ts`: the engine (renders them all once at load, then mixes: stereo position, reverb, compressor, limiter, ducking, voice limits); `src/music.ts`: the soundtrack (its instruments, the composed parts for each game phase, and a sequencer on the audio clock); `src/soundboard.ts` + `sounds.html`: the sound board
- `src/data.ts`: weapon, fox and item stats, classes, case odds, which grid cells open how, balance numbers
- `src/inventory.ts`: grid rules (placement, merging, rabbit-weapon links, gear boosts, `canFuse` for evolutions)
- `src/battle.ts`: units, the squad AI (`formation`, `rabbitBrain`, `foxBrain`, packs), projectiles, waves, the stage clear party and the run to the next street
- `src/looks.ts`: every soldier's own look (fur, markings, outfit, hat, accessory; the fox gangs' wardrobes)
- `src/draw/characters.ts`: the cartoon rabbits and foxes; each body is drawn once per look and expression into a small cached picture (ears and tails are their own pictures, turned live), so a crowded fight stays fast
- `src/game.ts`: input (drag/drop, buttons) tying the grid to the battle; cases (`openCase` ... `collectCase`), slot unlocks, evolutions
- `src/draw/scene.ts`: the three streets' static backdrops; `src/draw/street.ts`: everything on the street that moves (with `streetLife.ts`: townsfolk, windmill, kite, neon and the rest)
- `src/draw/roll.ts`: the case roll (stage, medallion, break-through cracks, class ladder)
- `src/draw/`: the rest of the drawing (weapons, HUD, panel, prep and wave clear, stage clear)
