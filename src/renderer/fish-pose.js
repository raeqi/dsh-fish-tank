import { clamp, isNumber } from '../shared/math.js'
import { FISH_SPECIES } from '../shared/species.js'
import { getFishFrame } from './atlas.js'

// A visual pose is derived from simulation data and never writes back into it.
export function fishPose(fish, scale, time, reducedMotion = false) {
  const index = clamp(fish.species | 0, 0, FISH_SPECIES.length - 1)
  const species = FISH_SPECIES[index]
  const frame = getFishFrame(index)
  const growth = clamp(isNumber(fish.growth) ? fish.growth : .2, 0, 1)
  const depth = clamp((fish.y - .08) / .76, 0, 1)
  const length = (43 + growth * 50) * scale * 1.55 * (.92 + depth * .20) * (species?.atlasScale ?? 1)
  const motion = species?.motion ?? { frequency: 2.8, tail: .045, fin: .012 }
  const phase = reducedMotion ? 0 : (isNumber(fish.swimPhase) ? fish.swimPhase : time * motion.frequency + (fish.seed || 0) * .37)
  return { index, species: species?.id, frame, growth, depth, length, tall: length * frame[3] / frame[2], phase, motion, angle: isNumber(fish.angle) ? fish.angle : 0 }
}

export function tailOffset(u, v, pose) {
  const tail = Math.pow(Math.max(0, 1 - u), 2)
  const fins = Math.pow(Math.abs(v - .5) * 2, 2) * (1 - u * .45)
  return Math.sin(pose.phase - (1 - u) * 4.2) * tail * pose.motion.tail
    + Math.sin(pose.phase * 1.5 + u * 5) * fins * pose.motion.fin
}
