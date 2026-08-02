/**
 * C1 — a fixed image region is not evidence until it says what it samples.
 *
 * Both originating cases are transcribed from this repository's failure record rather than
 * invented; a case set written to fit its own rule proves nothing. F-004 is the wide framing's
 * box that sampled ground and a structural leg while its name said canopy, and F-005 is the
 * set of boxes that predated a full position/target/FOV change, two of which also included
 * foreground geometry in front of the sky they claimed to measure.
 *
 * There is no adopted rule about region validity, so the baseline is the default never-fires
 * predicate — the honest baseline for "there was no rule".
 */

/** Fires when a fixed image-coordinate region may not be used as evidence. */
export function candidate(probe) {
  if (!probe || probe.kind !== 'region') return false;
  if (!probe.pose || !probe.subject) return true;
  if (probe.validatedForCamera !== probe.camera) return true;
  return probe.foregroundChecked === false;
}

export const cases = [
  {
    id: 'F-004-wide-box-without-a-named-subject',
    kind: 'originating_failure',
    expect: 'fire',
    input: { kind: 'region', pose: 'wide', subject: null, camera: 'cam-a', validatedForCamera: 'cam-a', foregroundChecked: true },
  },
  {
    id: 'F-005-boxes-predating-a-camera-change',
    kind: 'originating_failure',
    expect: 'fire',
    input: { kind: 'region', pose: 'valley', subject: 'terrain', camera: 'cam-b', validatedForCamera: 'cam-a', foregroundChecked: true },
  },
  {
    id: 'F-005-sky-boxes-with-foreground-intrusion',
    kind: 'originating_failure',
    expect: 'fire',
    input: { kind: 'region', pose: 'wide', subject: 'sky', camera: 'cam-b', validatedForCamera: 'cam-b', foregroundChecked: false },
  },
  {
    id: 'F-004-corrected-canopy-box',
    kind: 'regression',
    expect: 'quiet',
    input: { kind: 'region', pose: 'wide', subject: 'sakura canopy', camera: 'cam-b', validatedForCamera: 'cam-b', foregroundChecked: true },
  },
  {
    id: 'whole-frame-percentile',
    kind: 'boundary',
    expect: 'quiet',
    input: { kind: 'frame', statistic: 'p99.9 luma', value: 236 },
  },
  {
    id: 'collision-publish-verify-served',
    kind: 'collision',
    expect: 'quiet',
    input: { kind: 'release', verdict: 'pass', servedDigest: 'a', expectedDigest: 'a' },
  },
  {
    id: 'collision-critic-finding',
    kind: 'collision',
    expect: 'quiet',
    input: { kind: 'finding', problem: 'the terminator is a hard line', hypothesis: 'no contact softening' },
  },
  {
    id: 'collision-scan-null-result',
    kind: 'collision',
    expect: 'quiet',
    input: { kind: 'scan', verdict: 'pass', detected: 0, declaredMinimum: null },
  },
];
