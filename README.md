# JUJUTSU SPAR — Stick Sorcerers

A 1v1 stick-fighter that runs entirely in the browser. Light and heavy
attacks, cursed techniques, Black Flash crits and Domain Expansions —
play VS CPU or local 2P on one keyboard.

**Live:** https://jujutsu-spar.vercel.app

## Fighters

- **VOID** — The Limitless
- **SHRINE** — The Dismantler
- **UMBRA** — The Shadow Caller
- **BRUTE** — The Divergent Fist

## How it plays

Land hits to charge Cursed Energy (CE). Cursed techniques cost 35 CE.
A full bar unleashes your Domain Expansion — inside it, your opening
barrage cannot miss. Heavy hits can spark a **Black Flash** for double
damage.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | A / D | Arrow keys |
| Jump | W | Up arrow |
| Block | S | Down arrow |
| Light attack | J | 1 |
| Heavy attack | K | 2 |
| Cursed technique | L | 3 |
| Domain Expansion (full CE) | U | 0 |

On touch devices, tap the title or a mode to go fullscreen in landscape;
there is also a manual FULLSCREEN button on the title screen.

## Run locally

No build step — it is plain HTML, CSS and JS (`index.html`, `style.css`,
`game.js`). Serve the folder with any static server:

```bash
npx serve .
```
