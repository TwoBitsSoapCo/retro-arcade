# Retro Arcade

Two fan-made tributes to classic arcade games that run in any modern web browser. Nothing to install.

| Game | Tribute to | Status |
|---|---|---|
| **Star Invaders** | Space Invaders (Taito, 1978) | Playable |
| **Vortex** | Tempest (Atari, 1981) | Playable |

Play online: https://twobitssoapco.github.io/retro-arcade/

## Playing locally

Double-clicking `index.html` may not work, because the strict security settings block scripts on `file://` pages in some browsers. Run a tiny local web server from this folder instead:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Then open http://localhost:8080.

## How it's built

- Plain HTML, CSS and JavaScript. No frameworks, no build step, no third-party code.
- Graphics are drawn on an HTML5 canvas at the original arcade resolution and scaled up.
- All sound is synthesized live with the Web Audio API. There are no audio files.
- Settings and high scores are saved in the player's own browser (localStorage). There is no server and no data collection.
- A strict Content Security Policy only allows the site's own files to load.

## Layout

```
index.html           home page (game picker)
css/arcade.css       shared styles
js/home.js           home page card animations
js/shared/           code shared by both games: sound, keyboard, storage, pixel font
invaders/            Star Invaders (sprites, sound, game logic, page wiring)
vortex/              Vortex (web shapes, sound, game logic, page wiring)
```

## Legal

These are non-commercial fan tributes. They are not affiliated with or endorsed by Taito or Atari. "Space Invaders" and "Tempest" are trademarks of their respective owners. All artwork, sound and code here were made from scratch. No original ROMs or assets are used.
