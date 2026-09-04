# BCD Encore Royale mobile performance acceptance criteria

Run `tests/mobile-performance.mjs` against a local static server before merging
any rendering or asset-loading change. Keep raw JSON and screenshots under
`output/performance/` out of Git.

| Area | Acceptance criterion |
| --- | --- |
| Phone orientation | At 390x844 portrait and 844x390 landscape, both normal and iframe runs render Ash, Player2, the four creature rigs, visible floor, and touch controls with no console errors. |
| High refresh | On an actual 120 Hz phone, the 120 Hz profile must not increase simulation speed and its p95 render interval should remain at or below 13.4 ms. Desktop Chromium normally reports a 60 Hz cadence; use its `observedRefreshHz` field to label that result as a 60 Hz regression sample, not a high-refresh pass. |
| Startup/decode | DOM-ready plus all authored rigs loaded must complete without a long task over 100 ms on the target phone. Each distinct Spine source bundle is fetched/decoded once per page; duplicate Player2 rigs must reuse the decoded source image. |
| Frame pacing | During five seconds of active arena simulation, no frame exceeds 50 ms and fewer than 2% of frames exceed 120% of the display-frame budget. |
| Long tasks and heap | The run records no more than one long task over 50 ms after startup, and used JS heap must settle (less than 10% growth over a second five-second run without changing costumes). |
| Iframe | `?embed=1` and a real iframe both set embedded layout, reserve the parent Close-button area, and preserve the same playable/rendered state as standalone. |
| Thermal and culling | Run the matrix three times consecutively on physical phones. The third run's p95 must not regress more than 20% from the first. Traversing all three chambers must retain offscreen culling and not create an increasing heap trend. |
| Authored-rig parity | Compare portrait screenshots for idle, run, jump, wall cling, forward/up/down sword, and creature attack/death. No source rig may fall back to a programmatic shape while its asset is available; costume color changes must leave face, hair, weapon, and slash art intact. |

The harness uses a desktop Chromium profile to catch regressions. It is not a
substitute for Safari/Chrome device measurements or thermal testing; record
those device results alongside the generated matrix before release.

## Engine architecture

The renderer is designed so device cost is bounded by what is visible, not by
the total room population:

1. **Shared source assets:** immutable Spine JSON, atlas text, and decoded
   bitmaps are fetched and decoded once per distinct character bundle. Each
   actor still owns its skeleton state, so animation and costume behavior stay
   independent.
2. **Pose and world compositing:** dense Spine meshes are cached into small
   pose canvases only when their timeline advances, while static arena art is
   composited into a world layer. Normal frames blit those prepared surfaces.
3. **Spatial remote simulation:** remote players live in 160px world cells.
   Rendering and projectile hit tests query only intersecting cells; capture
   occupancy is updated on incoming network state rather than scanning every
   player on every fixed tick. The visible remote draw budget prevents a dense
   crowd from stealing frame time from the local player.
