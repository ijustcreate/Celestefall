# Celestefall web port

This folder is a dependency-free browser adaptation of the original GameMaker
Celestefall movement and collision demo. It keeps the upstream project intact
while making its demo playable on GitHub Pages, desktop browsers, and touch
devices.

The player character is now Bullet Age's original Ash rig, rendered directly
in the browser with the matching Spine 3.7 canvas runtime. Unity is not used by
the web build. The original pirate frames remain only as a load-failure
fallback. Bullet Age character art is excluded from the MIT license; see
`assets/ash/README.md` and `vendor/spine-3.7/LICENSE.txt`.

Controls: arrows/WASD or the analog stick to move, aim, look up, and crouch;
Space/A to jump; hold Shift/♪ to aim and release to fire; B/C to dash; V/L/⚔
for a sword strike; Down + Jump to drop through a one-way platform; and F for
fullscreen. Wall cling is automatic while airborne and pressing toward a wall.
There is intentionally no pause or manual reset control: the arena simulation
keeps running while its page remains open.

Original source and MIT license: <https://github.com/bennyfrancis/Celestefall>
