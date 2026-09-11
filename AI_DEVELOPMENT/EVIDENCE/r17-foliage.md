# Round 17 foliage repair evidence

Scope: `src/render/Foliage.js` only. This is structural evidence for the source-blind
K/M foliage blocker; it is not a visual PASS.

## Mechanism proved before repair

- The sakura tree generator set `crossLeaf: true`. `placeLeaves()` consequently emitted
  two quads at the exact same centre, rotated by ninety degrees, for every logical blossom
  cluster. The old generated mesh was 486 cards / 972 leaf triangles per sakura. This is
  an exact-centre plane intersection, not merely the critic's guess from a crop.
- The hero's much larger sacred tree is owned by `Props.js`, but read-only inspection was
  necessary to establish the dependency boundary: `_blossomCluster()` also builds a
  crossed pair and binds `FoliageSystem.blossomTexture`. Foliage can break a continuous
  lighting seam through alpha topology, but cannot remove that prop geometry. The Props
  owner must verify and, if necessary, replace its crossed pair separately.
- The grove repetition has two authored sources. Cedar used one deterministic tree mesh
  with four perfectly spaced whorls of three main laterals. The mid-distance bamboo atlas
  placed every spray on one of nine exact height bands and restricted every departure to
  0.56–1.28 rad before mirroring. Instance yaw and scale preserved both rhythms, producing
  the repeated column-and-chevron read in the valley crop.

## Repair

- Sakura now places five smaller, spatially separated cards around each branch tip and
  emits no exact-centre crossed pair. Its crown keeps a 0.605 canonical radius while leaf
  submission falls to 405 cards / 810 triangles.
- Five irregular two-lateral cedar whorls replace four regular three-lateral whorls.
  Smaller, more separated clusters expose the 1,624-triangle recursive wood scaffold.
- Each bamboo culm now jitters its attachment heights and alternates three reach classes
  (0.66, 0.92, 1.30) with distinct departure-angle bands. The atlas still contains four
  archetypes in the same 4x1 texture and the world still submits the same instanced card
  mesh.
- Five off-axis internal sky pockets interrupt uninterrupted blossom-card lighting seams.
  They stop inside the existing lobe mask, so the organic perimeter remains authoritative.

## Focused check

`node tools/check-foliage-r17.mjs` returns `PASS-STRUCTURE-ONLY`:

- sakura coincident card centres: **0**
- sakura leaf submission: **405 cards / 810 triangles** (old: 486 / 972)
- cedar: **1,624 wood triangles, 132 leaf cards / 264 leaf triangles**
- all four bamboo archetypes: **3 reach levels**, reach ratio **1.97x**,
  angle span **0.53–0.81 rad**, and **26/27** sampled bands off the old exact ninths

No draw call, instance target, atlas dimension, runtime asset, wind uniform, or per-frame
code path was added. Sakura submission drops 162 triangles per visible mesh instance;
cedar changes from the source-recorded 1,904 wood + 216 leaf triangles to 1,624 + 264,
a net drop of 232 triangles per visible mesh instance.

## Gates still open

Fresh phone/MEDIUM native hero and valley frames must prove that these exact semantic
regions changed, then the same images must survive native and 25% independent review.
The captured draw-call/triangle gate must also confirm the aggregate budget. The focused
test cannot see alpha minification, lighting seams, silhouette quality, motion, or the
remaining sacred-tree crossed geometry and therefore cannot certify BM-WORLD or BM-VIS.
