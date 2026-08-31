Original prompt: I’m not liking what we have. For now make me my own copy of this Celestefall on GitHub And get it running in place of what we have.

- Forked `bennyfrancis/Celestefall` to `ijustcreate/Celestefall`, preserving the original GameMaker project and MIT license.
- Added a dependency-free browser adaptation under `docs/` with the original demo art, pixel-step movement, jumping, wall cling/jump, one-way drop-through, moving solids, rider carrying, camera follow, particles, pause/reset/fullscreen, keyboard controls, and responsive touch controls.
- Added BCD iframe ready/init/close messaging plus `render_game_to_text` and `advanceTime` testing hooks.
- Automated canvas smoke test passed for movement, jumping, landing, moving platforms, camera/state output, and browser console errors.
- Portrait 390×844 visual QA passed for the zoomed/cropped arena, joystick, Jump/Grab buttons, safe-area spacing, embedded close-button clearance, and zero console warnings/errors.
- TODO: tune the web port against direct side-by-side GameMaker runtime footage if a licensed HTML5 export becomes available; current port is source-guided, not an exported GameMaker binary.
