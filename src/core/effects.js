// Transient animation state is separate from lifecycle and token rules.
export function stepEffects(state, stamp, dt, random) {
      for (var rippleIndex = state.ripples.length - 1; rippleIndex >= 0; rippleIndex -= 1) {
        state.ripples[rippleIndex].age += dt
        if (state.ripples[rippleIndex].age > 0.9) state.ripples.splice(rippleIndex, 1)
      }

      for (var splashIndex = state.splashes.length - 1; splashIndex >= 0; splashIndex -= 1) {
        var splash = state.splashes[splashIndex]
        splash.age += dt
        splash.x += splash.vx * dt
        splash.y += splash.vy * dt
        splash.vy += 0.09 * dt
        if (splash.age > 0.75) state.splashes.splice(splashIndex, 1)
      }

      for (var sparkleIndex = state.sparkles.length - 1; sparkleIndex >= 0; sparkleIndex -= 1) {
        state.sparkles[sparkleIndex].age += dt
        if (state.sparkles[sparkleIndex].age > 1.6) state.sparkles.splice(sparkleIndex, 1)
      }

      for (var ghostIndex = state.ghosts.length - 1; ghostIndex >= 0; ghostIndex -= 1) {
        var ghost = state.ghosts[ghostIndex]
        ghost.age += dt
        ghost.y += 0.05 * dt
        if (ghost.age > 3.4) state.ghosts.splice(ghostIndex, 1)
      }

      for (var bubbleIndex = 0; bubbleIndex < state.bubbles.length; bubbleIndex += 1) {
        var bubble = state.bubbles[bubbleIndex]
        bubble.y -= bubble.speed * dt
        bubble.x += Math.sin(stamp / 1000 + bubble.phase) * 0.014 * dt
        if (bubble.y < 0.08) {
          bubble.y = 0.9 + random() * 0.08
          bubble.x = 0.08 + random() * 0.84
        }
      }

}
