# Project overlay: probe

Rules this project verified for itself. They have not earned a place in the shared kit — both
occurrences are here, and both turn on this project's camera being the measured subject.

## A fixed image region is not evidence until it says what it samples

An image-coordinate box is a claim about geometry, and geometry moves. Two rounds' numbers
were invalidated in a single verification pass, in two different ways, and neither raised an
error — the boxes returned perfectly reasonable statistics for pixels nobody meant to measure.

Every fixed region carries, next to its coordinates:

- **the pose** it is valid for, and **the visible subject** it samples. A box described only by
  its numbers cannot be checked by a reader, and one of these sampled ground and a structural
  leg while its name said canopy.
- **the camera it was validated against.** Position, target and field of view together. When
  the camera moves, every region validated against the old one is stale, and stale is neither
  pass nor fail: it is blocked until re-established.
- **a foreground check.** Two sky regions included foreground geometry that sat between the
  camera and the sky they claimed to measure.

The executable gate and the prose that describes it must agree about which poses it applies
to. One round's table reported all five framings passing a gate the apparatus only ever
applied to four of them.

Blocked is a real verdict here. A region whose camera has changed reports `blocked`, and a
round that reports `blocked` for a measurement it could not honestly make is doing better than
one that reports a number.
