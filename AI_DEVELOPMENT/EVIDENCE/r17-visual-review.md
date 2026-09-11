# Round 17 source-blind still review

Status: **FAIL; repairs required.** This is a model review of five static frames, not a
human blind study, motion review, or matched reference-gameplay comparison.

## Identity and isolation

- Source frames: GitHub Actions run
  [34602120671](https://github.com/bachikoljunior-blip/game2/actions/runs/34602120671),
  native 2532x1170 phone/MEDIUM captures.
- Set K, revealed only after both reviews were frozen: candidate
  `7c2ed042b0b9cb3eeef5fb5ff99e691eee5fc140`, build fingerprint
  `6c7515110a97af0f0f0292f5ea5676859d9829c874164ba9426b67a8da6cd4c7`.
- Set M, revealed only after both reviews were frozen: unchanged main baseline
  `4e6d23a40af33bb3ba409b3826e77666262ce353`, build fingerprint
  `69f5890f61b97100860f086837bad8c4808c7494ac3b7b7c3aa36006f104b45b`.
- The critic received no source, history, labels, previous scores, or mapping. A separate
  source-blind instance then tried to refute every finding. The raw ignored working files
  are `shots/r17-blind/review-{K,M}.json`, `comparison.json`, and `refutation.json`.
- Review JSON hashes: K `38edc8427741f24b3182ce4d586c5182729715f290c063bb4095bea00d60876e`;
  M `93c0ce530d12916af19ec3df0dd440253bae533782797ec6679ada4df250fc9d`;
  comparison `b8a195aa24a9183bcc58bcb3cd17d2a9d9177e51f6e3296cca3090c42442f996`;
  refutation `883480b84085b9955d7c6883e5c4e11017d1687a51353ec2f3fc7e55a9dcced6`.

## Result

The same critic scored K and M **45/100, FAIL**, with the same two blockers and one major.
This supports a practical tie for this evidence set; it does not prove byte-identical pixels
or a regression relative to scores from other critic instances.

The refuter retained four duplicated K/M blocker findings, narrowed both duplicated lantern
findings, and refuted none:

- **Foliage blocker survives:** primary pink crowns expose large straight-edged plate
  intersections, while the grove repeats column-and-chevron forms instead of separating
  trunk/branch, leaf-cluster, and whole-canopy scales.
- **Terrain blocker survives:** the dominant mountain is organised as a small number of
  repeated planar facets without enough overlapping subordinate shoulder forms. Fine surface
  variation already exists, so adding noise alone is not a repair.
- **Lantern narrowed from major to minor:** its foreground paper support/fold structure is
  weakly legible, but no supplied reference contains a comparably framed illuminated lantern.
  The earlier 8/255 rib contrast proposal is diagnostic only and is not a benchmark threshold.

The official publisher stills are unmatched in framing, lighting, climate, and capture
state. They support broad structural comparison only. Five stills cannot judge animation,
combat feel, camera behaviour, touch, audio, or performance. No product criterion changes
status solely from this review; repaired frames must pass the technical gate and another
independent review.

## Frame hashes

| Set | hero | wide | torii | valley | sun |
|---|---|---|---|---|---|
| K | `d1c002e9852b2b2086da8b045588854f2027f4d3978bbd07662eecd51120da75` | `45e1bdd68efdcec5ea5277e999e7107074ca806cc3682f548479ae08c7d741fa` | `ee8e83a417d40882064bf3423fd63e5d4170a667daa5f849a06f6ec0cd37ae20` | `7aa846d0da73b973fcde2f73ed127b770b738a3e296ad3dec65ffff5e4ae4aec` | `5623bb097823226f20d3bd29952f026cf69ef983ef57102aed0cf8c729f17aca` |
| M | `cec33b528d409a2977b1c6fa49f362909a530a5705a329cdeb948ccdefc657dc` | `b65551036da3c4a8005ef7b48b7340c48223d21584983a42f2afac0e6675b97b` | `f35416344da0dd58ca2886676ee4fa7d5d9881945f7bebeb600bafa06935cf01` | `2af5ccfbdbda7dc8762780743e8808276732f8a27bea54002b5f494bd8486ff2` | `5392c263da38ea26bcf9fbc852625268a7b54127a865f3a185f488d1d39abcb5` |
