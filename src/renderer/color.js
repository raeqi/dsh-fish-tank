  /** Compose an hsla() color string from numeric parts. */
  export function paint(hue, sat, light, alpha) {
    var h = ((hue % 360) + 360) % 360
    return 'hsla(' + h.toFixed(1) + ',' + sat.toFixed(1) + '%,' + light.toFixed(1) + '%,' + alpha.toFixed(3) + ')'
  }
