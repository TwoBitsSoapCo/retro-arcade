# Project notes for Claude

A static browser arcade with two tributes: Star Invaders (Space Invaders) and Vortex (Tempest). It will be hosted on GitHub Pages. The owner isn't a programmer, so explain things in plain language and do the work for them.

## Rules
- Static files only. No backend, no build step, no npm dependencies, no external CDNs or fonts. Every page carries a strict CSP meta tag (`script-src 'self'`, no inline scripts or styles), so put JS and CSS in files.
- Use classic `<script>` tags, not ES modules. Each game attaches to a namespace on `window` (`SI` for Star Invaders).
- Use tribute names only (Star Invaders, Vortex). Never use original ROMs, ripped sprites or sampled sounds.
- Keep this project completely separate from the owner's "Two Bits" work site.
- Validate anything read from localStorage (see `js/shared/storage.js`, keys prefixed `retro-arcade.`).

## Hosting
- Public repo `TwoBitsSoapCo/retro-arcade` (a separate repo on the owner's business account, at their request). GitHub Pages serves it from `main` at https://twobitssoapco.github.io/retro-arcade/. Pushing to `main` redeploys.
- Commits use the account's GitHub noreply email (set in this repo's local git config) so the business email stays private.

## Game architecture (both games)
- `game.js` holds a `Game` class with `update(input)` at a fixed 60 ticks/sec and `render(ctx)`. States include attract, ready, playing, dying, gameover and initials.
- `main.js` handles the page: the settings form (sanitized, saved to `<game>.settings`), Esc/P/M keys, screen scaling and the fixed-timestep loop (`settings.speed` scales the tick rate).
- Sound goes through `window.ArcadeAudio` (`tone`, `noise`). Game-specific effects live in `sound.js`.
- Star Invaders (`SI`) uses a 224x256 pixel screen and `PixelFont`. Vortex (`VX`) uses a 600x800 logical vector screen, drawn at device resolution, with `VectorFont`. Its entities are (lane, depth z) with z=0 at the rim; `webs.js` defines the 16 tube shapes. Mouse-spinner mode uses pointer lock.

## Testing
- Preview: `.claude/launch.json` config "arcade" (python http.server on 8080).
- The desktop browser pane throttles requestAnimationFrame while hidden. To check logic, run headless Node simulations that stub `document`, or use a temporary page that steps `game.update()` manually. Delete any such page afterward.
