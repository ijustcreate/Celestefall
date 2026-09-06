# Encore release version

The user-facing release baseline is **1.0**. `BUILD_VERSION` in `game.js` identifies the running release and is sent in the ready handshake only after game startup. The BCD parent displays this reported value, never the URL nonce or a remote latest-version lookup.

For every subsequent published game release, increment `BUILD_VERSION` (1.1, 1.2, and so on; 2.0 for a major release) in the same commit as the changes. Preserve the ready handshake and the fresh asset URL helper. Test reload from the previous release and verify the new version appears after startup.

The `fresh` URL parameter is solely a cache bypass token. The HTML bootstrap applies it to first-party JS/CSS, and the game/rig loaders apply it to images, atlases, and JSON. The game does not register a service worker. The BCD worker scope is limited to the BCD app path.

## 1.1

The canonical public path is `/bcd-kc-encore/`. `/Celestefall/` remains compatible during migration. The BCD launcher must point to the canonical path after its Pages deployment succeeds.

Includes server-authoritative multiplayer code, safe random respawns, shared 50% heart drops and healing, falling bat corpses, platform-aligned capture markers with team-color fill/contested display, account display names, and health dots without a backing bar. Online play requires the dedicated WebSocket server described in `../server/README.md`. Until `authority-config.js` contains a verified public endpoint, the published game explicitly runs **OFFLINE PRACTICE**; the server code being present in GitHub does not mean a server is running.

Do not deploy multiple overlapping server processes or advertise live shared play before multi-client public verification. The unpublished WebGL2 renderer checkout remains separate; 1.1 retains the v1.0 Canvas renderer and the published Player Two idle-head fix.
