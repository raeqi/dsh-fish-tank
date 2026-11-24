// Approximate body envelopes for the six atlas pictures. They add a little
// depth when a fish turns; they are not anatomical models or PBR materials.
const bodyEnvelopes = {
  betta:  [0.70, 0.40, 0.27, 0.14, 0.075],
  guppy:  [0.75, 0.42, 0.23, 0.10, 0.055],
  angel:  [0.69, 0.43, 0.25, 0.23, 0.085],
  tetra:  [0.62, 0.48, 0.35, 0.12, 0.055],
  discus:  [0.67, 0.48, 0.29, 0.34, 0.090],
  ram:    [0.70, 0.48, 0.28, 0.20, 0.085],
}

export function bodyEnvelope(species) {
  return bodyEnvelopes[species] || bodyEnvelopes.tetra
}

// The simulation angle describes movement in the screen plane, not a 3D yaw.
// Smooth a separate visual yaw when horizontal direction changes.
export function advanceVisualYaw(previous, movementAngle, dt, reducedMotion = false) {
  const target = Math.cos(movementAngle) < 0 ? Math.PI : 0
  if (!Number.isFinite(previous) || reducedMotion) return target
  let difference = Math.atan2(Math.sin(target - previous), Math.cos(target - previous))
  if (Math.abs(Math.abs(difference) - Math.PI) < 1e-6 && Math.sin(movementAngle) < 0) difference = -Math.PI
  const blend = 1 - Math.exp(-5 * Math.max(0, Math.min(.1, dt)))
  return previous + difference * blend
}
