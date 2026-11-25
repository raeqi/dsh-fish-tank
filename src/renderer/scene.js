import { drawFish } from './fish.js'
import { drawWebGLFish, disposeWebGLFish } from './webgl-fish.js'
import { drawBackdrop } from './background.js'
import { drawHabitat } from './habitat.js'
import { drawForeground } from './foreground.js'
import { drawWaterLight, drawWaterParticles, drawLensFinish } from './atmosphere.js'
import { drawCaustics, drawBackgroundPlants, drawFloor, drawHardscape, drawPlantBed } from './scenery.js'
import { drawFishShadows, drawPellets, drawBubbles, drawSplashes, drawRipples, drawGhosts, drawGlass, drawGardenCuttings, drawNursery, drawTurtle } from './effects.js'
export { disposeWebGLFish }

/** Compose independent visual passes over the latest simulation scene. */
export function drawScene(context, view, scene, timeMs) {
  const { width, height } = view
  if (!(width > 0) || !(height > 0)) return
  const time = view.reducedMotion ? 0 : timeMs / 1000
  const scale = Math.max(.4, Math.min(1.4, Math.min(width, height) / 420))
  context.clearRect(0, 0, width, height)
  if (!drawBackdrop(context, width, height)) {
    const water = context.createLinearGradient(0, 0, 0, height)
    water.addColorStop(0, '#78968a'); water.addColorStop(.34, '#294d43')
    water.addColorStop(.72, '#142e29'); water.addColorStop(1, '#101e19')
    context.fillStyle = water
    context.fillRect(0, 0, width, height)
    drawCaustics(context, width, height, time, scale)
    drawBackgroundPlants(context, width, height, time, scale, scene.garden)
    drawFloor(context, width, height, scale)
    drawHardscape(context, width, height, scale)
    drawPlantBed(context, width, height, time, scale, false)
  }
  drawHabitat(context, width, height, scene.tank?.habitatTier)
  drawWaterLight(context, width, height, time, view.reducedMotion)
  drawWaterParticles(context, width, height, time, view.reducedMotion)
  const zoom = scene.tank ? Math.sqrt(Math.max(1, Math.min(16, Math.max(1 + scene.tank.expansions * .12, scene.fish.length / 16), scene.fish.length / 8))) : 1
  const fishScale = scale / zoom
  drawFishShadows(context, scene, width, height, fishScale)
  drawGhosts(context, scene, width, height, time, fishScale)
  drawPellets(context, scene, width, height, scale)
  if (!drawWebGLFish(context, view, scene.fish, time, fishScale)) {
    for (const fish of scene.fish) drawFish(context, fish, width, height, time, fishScale, 1, view.reducedMotion)
  }
  drawForeground(context, width, height, time, view.reducedMotion)
  if (scene.garden) drawGardenCuttings(context, width, height, time, scale, scene.garden)
  if (scene.nursery) drawNursery(context, width, height, time, scale)
  if (scene.turtle) drawTurtle(context, scene.turtle, width, height, scale, time)
  drawSplashes(context, scene, width, height, scale)
  drawRipples(context, scene, width, height, scale)
  drawBubbles(context, scene, width, height, scale)
  drawGlass(context, width, height, time, scale)
  drawLensFinish(context, width, height)
}
