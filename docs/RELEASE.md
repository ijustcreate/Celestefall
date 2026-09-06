# Encore release version

The user-facing release baseline is **1.0**. `BUILD_VERSION` in `game.js` identifies the running release and is sent in the ready handshake only after game startup. The BCD parent displays this reported value, never the URL nonce or a remote latest-version lookup.

For every subsequent published game release, increment `BUILD_VERSION` (1.1, 1.2, and so on; 2.0 for a major release) in the same commit as the changes. Preserve the ready handshake and the fresh asset URL helper. Test reload from the previous release and verify the new version appears after startup.

The `fresh` URL parameter is solely a cache bypass token. The HTML bootstrap applies it to first-party JS/CSS, and the game/rig loaders apply it to images, atlases, and JSON. The external Supabase SDK retains its upstream URL. Celestefall does not register a service worker. The BCD worker scope is limited to the BCD app path.
