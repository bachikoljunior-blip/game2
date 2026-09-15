# Character tailoring repair — author record

Author: `/root/game2_ultra_art_sound_physics/character_art`, continuing the
formally accepted Ultra assignment, without re-delegation. This is source-known
production self-review, not independent/blind review or the integrator's acceptance.
Local base: `f869fc24b2bc0143e33eda8d104fe474f16cd1b7`, in the authorized
`game2-mpfb-pilot` worktree. Shared runtime and remotes were not edited.
All ten comparison elements remain **not measured**; the fixed deadline remains
`2026-09-20T07:51:53Z`. This repair is not a PS4 quality attainment claim.

## Actual source media and diagnosis

I viewed ten original native PNGs from CI run `34978382509`, source and runner
`e18820165d6008fedfca28d2cc7073a9c4b74b28`: player full/back/front face/three-quarter
face/profile; sentinel and retainer three-quarter faces; and warden three-quarter
face/profile/back. The fixture uses real WebGL production geometry and materials
at 960×720 with fixed neutral-stage lights and a synthetic idle. It is not ordinary
gameplay or a reference comparison.

The improved continuous head/skin exposed four specific garment defects:

- Shoulder plates formed detached black hoops outside the sleeve. The narrow
  closed top of a separate sleeve appeared as a round blue lid. The new sleeve
  has a rounded shoulder crown, the torso extends into that attachment, and each
  plate is formed from the same sleeve section with a narrow clearance and a
  closed 2 mm edge. Joint positions and motion are unchanged.
- A copied native neck band, an older rear collar, and three independently
  placed chest ribbons intersected. White fragments and blue cloth cuts were
  visible around the throat. A single sewn collar now starts at an intersection
  with the actual native neck and ends on the actual tunic surface. Its inner
  lining is continuous. Two overlapping lapels follow the tunic's surface; the
  under-lapel ends beneath the outer wrap. Original lower skin extraction
  triangles are clipped 7 mm under the sewn neckline so they cannot emerge over
  the shoulder. The exposed face and neck use the original interpolated UVs and
  normals. This is a real geometry cut hidden inside a garment seam, not a
  visibility/material-opacity trick.
- The warden's black cover copied individual face polygons, retaining saw teeth
  around its selection boundary and a black replica of the nose/lips. An
  originally formed cheek-and-chin shell is now fitted outside sampled native
  anatomy. Smooth bowed sections bridge local mouth relief, and the continuous
  rim is closed with 2 mm thickness. The centre upper rim leaves the actual nose
  clear. The new guard is not a recolored copy of the facial triangles. An
  intermediate fitting over-amplified curvature; its CPU projection was rejected
  and corrected before this checkpoint.
- The small tied knot contained a pale circular band cap that cut through the
  dark hair as visible triangles. The hair body remains closed; the band is a
  narrow winding surface following the same knot profile, with no interior disc.

The last collar mesh uses 64 sections, six rows for the outer collar and two for
its narrow lining. The first version used 96×12 for both and added unnecessary
samples to an almost linear surface. Current seam/ray tests and the final CPU
projection use the reduced mesh; no performance threshold was weakened.

## Preserved data and verification

- `20260915-character-tailoring-invariants.json` records exact comparisons to
  f869: all four stored native heads, eyes, hair, brows, shape profiles and bounds,
  and both posed hands with their grip offsets/landmarks are unchanged. All four
  original PNGs and the entire `character-motion.js` are byte-identical. Input,
  loading/readiness, texture materials, blade timing, authored poses, leg IK and
  cloth motion were not edited. Only the fitted guard changes in the large native
  data file; the worn-head neckline cut occurs in the runtime derivative helper.
- The same acquired CC0 MPFB source/targets remain present with original license
  and provenance. No new external source or reference-game content was added.
  Two offline derivations produced identical native-data bytes: SHA-256
  `18b4a2265516c11ef7a71da2ff47de00f172598acc58d1d6f4f0daf8c2fa3dc4`.
  The derivation report identifies the new guard construction and 4,112 triangles.
- 55/55 final native-asset, motion, legacy sculpt, presentation, cloth and tailoring
  tests passed. Four new meaningful checks examine actual sleeve/plate clearance
  with rays and welded shell edges; native skin/collar/tunic seam support; a closed
  guard rim with an unobstructed real nose; and opaque closed hair ahead of the
  wrapping band. The measured outer plate-to-sleeve gap is 2.42–5.78 mm across
  both shoulders and four rows, including the tessellated surface approximation.
- A direct geometry check found zero opposite averaged vertex normals and zero
  degenerate triangles in the 4,112-triangle warden shell and both first-row
  596-triangle shoulder shells. This addresses the earlier copied-mask normal
  residual; it does not certify actual visual quality.
- All four final terrain regressions passed: 1,680 poses across six discoveries
  and eight facings, planted sloped running, steep-bank state blends and
  parry/block contact. Lowest clearance is -0.444 mm at sun-ring, within the
  unchanged -4 mm allowance. Suite duration was 154.283 seconds, not device frame
  timing. The preceding denser-collar candidate also passed, but that preliminary
  result is not substituted for this final geometry.
- Fresh production build passed: isolated application JS `index-8dxEipyP.js`,
  3,949.07 kB / 1,375.92 kB gzip. The four fingerprinted PNG names/bytes are
  unchanged. Integration must generate its own final fingerprint.
- Player and warden final geometry totals are 53,492 and 61,140 triangles, with
  57 and 59 draw meshes. The player adds 4,950 triangles over f869. Closed armour
  surfaces have a real geometry cost; these totals are not quality scores, GPU
  timing or mobile measurements.
- Actual-rig CPU front/back and head/shoulder projections were generated and
  viewed while repairing. The final player views show the supported collar,
  continuous lining and fitted shoulder shells, with the pale knot cap removed.
  Warden views confirmed removal of the saw-tooth boundary and black nose copy;
  the guard remains a broad, plain formed surface. These CPU projections omit
  WebGL lighting/shadows and are not native acceptance media.

## Limits and handoff

The new silhouette, face guard proportions, fabric folds, seams, material response
and animation attachment need current native stills and motion review. The broad
shirt and upper sleeves remain simplified; the folded collar is understated and
the cheek guard may still need art-direction adjustment. The small knot is a
modest authored addition to the short-hair sample, not a completed historical
hairstyle. Prior limits on fixed facial expression and static native hand grasp
remain. No extra decorations were added to conceal these limitations.

The integrator's independent cloth review reported a remaining side-seam normal
difference between separate front/back hakama meshes: up to 15° at run frame 14,
138.9° at flat-ground death frame 10, and 159° at sun-ring death frame 13. Those
are not automatically smoothing defects when cloth folds back; actual video must
judge the shading and fold. This repair leaves the cloth geometry/normals and
motion unchanged. Knee/hem visual closure and PS4-level clothing are not claimed.

The runtime was frozen at `2026-09-15T14:25:01Z`. The separate local commit is
returned to the integrator for current native capture, independent review and
integration/publication judgment.
