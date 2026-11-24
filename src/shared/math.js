  export function clamp(value, min, max) {
    if (value < min) return min
    if (value > max) return max
    return value
  }

  export function isNumber(value) {
    return typeof value === 'number' && isFinite(value)
  }
  export function normalizeAngle(angle) {
    const turn = Math.PI * 2
    return ((angle + Math.PI) % turn + turn) % turn - Math.PI
  }
