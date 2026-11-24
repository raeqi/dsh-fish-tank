import { clamp } from '../shared/math.js'
import { drawFish } from './fish.js'
import { drawPlantBed, leaf, texture } from './scenery.js'
import { getFishAtlas, chapterAtlasSize as CHAPTER_ATLAS_SIZE } from './atlas.js'

  export function drawFishShadows(context, scene, width, height, scale) {
    context.save()
    for (var index = 0; index < scene.fish.length; index += 1) {
      var fish = scene.fish[index]
      if (fish.y < 0.62) continue
      var strength = clamp((fish.y - 0.62) / 0.22, 0, 1) * 0.3
      var x = fish.x * width
      var y = height * 0.9
      var shadow = context.createRadialGradient(x, y, 0, x, y, 16 * scale)
      shadow.addColorStop(0, 'rgba(24,42,38,' + strength.toFixed(3) + ')')
      shadow.addColorStop(1, 'rgba(24,42,38,0)')
      context.fillStyle = shadow
      context.fillRect(x - 16 * scale, y - 7 * scale, 32 * scale, 14 * scale)
    }
    context.restore()
  }

  /** Floating food with a soft highlight. */
  export function drawPellets(context, scene, width, height, scale) {
    for (var index = 0; index < scene.pellets.length; index += 1) {
      var pellet = scene.pellets[index]
      var x = pellet.x * width + Math.sin(pellet.wobble) * 1.2 * scale
      var y = pellet.y * height
      var radius = 2.4 * scale
      var food = context.createRadialGradient(x - radius * 0.4, y - radius * 0.4, radius * 0.2, x, y, radius * 1.4)
      food.addColorStop(0, 'rgba(255,214,150,.95)')
      food.addColorStop(0.6, 'rgba(226,150,62,.95)')
      food.addColorStop(1, 'rgba(150,86,26,.9)')
      context.fillStyle = food
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
  }

  /** Rising bubbles with a highlight, from two clusters near the floor. */
  export function drawBubbles(context, scene, width, height, scale) {
    context.save()
    for (var index = 0; index < scene.bubbles.length; index += 1) {
      var bubble = scene.bubbles[index]
      var x = bubble.x * width
      var y = bubble.y * height
      var radius = (1.6 + bubble.r) * scale
      context.strokeStyle = 'rgba(226,248,255,.5)'
      context.lineWidth = Math.max(0.8, 0.9 * scale)
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.stroke()
      context.fillStyle = 'rgba(255,255,255,.55)'
      context.beginPath()
      context.arc(x - radius * 0.3, y - radius * 0.35, Math.max(0.5, radius * 0.24), 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  /** Food-entry droplets and the golden motes of a birth. */
  export function drawSplashes(context, scene, width, height, scale) {
    context.save()
    for (var index = 0; index < scene.splashes.length; index += 1) {
      var splash = scene.splashes[index]
      var fade = 1 - splash.age / 0.75
      context.fillStyle = 'rgba(232,251,255,' + (0.5 * fade).toFixed(3) + ')'
      context.beginPath()
      context.arc(splash.x * width, splash.y * height, Math.max(0.6, 1.4 * scale), 0, Math.PI * 2)
      context.fill()
    }
    for (var sparkle = 0; sparkle < scene.sparkles.length; sparkle += 1) {
      var mote = scene.sparkles[sparkle]
      var life = 1 - mote.age / 1.6
      var radius = (3 + mote.age * 12) * scale
      var x = mote.x * width
      var y = mote.y * height
      context.strokeStyle = 'rgba(255,236,168,' + (0.5 * life).toFixed(3) + ')'
      context.lineWidth = Math.max(0.8, 1.2 * scale)
      for (var arm = 0; arm < 4; arm += 1) {
        var angle = arm * Math.PI / 2 + mote.age * 1.6
        context.beginPath()
        context.moveTo(x + Math.cos(angle) * radius * 0.4, y + Math.sin(angle) * radius * 0.4)
        context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
        context.stroke()
      }
    }
    context.restore()
  }

  /** Expanding rings where food broke the surface. */
  export function drawRipples(context, scene, width, height, scale) {
    context.save()
    for (var index = 0; index < scene.ripples.length; index += 1) {
      var ripple = scene.ripples[index]
      var age = ripple.age / 0.9
      var x = ripple.x * width
      var y = ripple.y * height
      context.strokeStyle = 'rgba(228,250,255,' + (0.5 * (1 - age)).toFixed(3) + ')'
      context.lineWidth = Math.max(0.8, 1.2 * scale)
      context.beginPath()
      context.ellipse(x, y, (4 + age * 30) * scale, (2 + age * 9) * scale, 0, 0, Math.PI * 2)
      context.stroke()
    }
    context.restore()
  }

  /** A dying fish sinking and fading out. */
  export function drawGhosts(context, scene, width, height, time, scale) {
    for (var index = 0; index < scene.ghosts.length; index += 1) {
      var ghost = scene.ghosts[index]
      var fade = clamp(1 - ghost.age / 3.2, 0, 1)
      var fish = {
        x: ghost.x,
        y: ghost.y,
        angle: ghost.fish.angle + ghost.age * 0.25,
        growth: ghost.fish.growth,
        hunger: 1,
        hue: ghost.fish.hue,
        species: ghost.fish.species,
        seed: ghost.fish.seed,
      }
      drawFish(context, fish, width, height, time, scale, fade * 0.55)
    }
  }

  /** Large dark plants in front of the fish that give the tank depth. */
  export function drawForegroundPlants(context, width, height, time, scale) {
    drawPlantBed(context, width, height, time, scale, true)
  }

  export function drawGardenCuttings(context, width, height, time, scale, garden) {
    var positions = [0.29,0.75,0.2,0.86,0.08]
    for (var patch = 0; patch < garden.patches - 3; patch += 1) {
      for (var blade = 0; blade < 7; blade += 1) {
        var length = (25 + texture(blade + patch * 19) * 30) * scale * (0.75 + garden.growth * 0.5)
        leaf(context, width * positions[patch] + (blade - 3) * 3 * scale, height * (0.94 - patch * 0.004), length, length * 0.15,
          (blade - 3) * 0.26, 0.65, Math.sin(time * 0.6 + patch + blade) * 0.025)
      }
    }
  }

  export function drawTurtle(context, turtle, width, height, scale, time) {
    var chapterAtlas = getFishAtlas(12)
    if (!turtle || !chapterAtlas) return
    var cellWidth = CHAPTER_ATLAS_SIZE[0] / 4, cellHeight = CHAPTER_ATLAS_SIZE[1] / 2
    var size = 56 * scale
    context.save()
    context.translate(turtle.x * width, height * 0.91 + Math.sin(time * 1.2) * scale)
    context.scale(turtle.facing, 1)
    context.drawImage(chapterAtlas, cellWidth * 2, cellHeight, cellWidth, cellHeight, -size / 2, -size / 2, size, size)
    context.restore()
  }

  export function drawNursery(context, width, height, time, scale) {
    context.save()
    var x = width * 0.24, y = height * 0.88
    var chapterAtlas = getFishAtlas(12)
    if (chapterAtlas) {
      var cw = CHAPTER_ATLAS_SIZE[0] / 4, ch = CHAPTER_ATLAS_SIZE[1] / 2, size = 28 * scale
      context.drawImage(chapterAtlas, cw * 3, ch, cw, ch, x - size / 2, y - size / 2, size, size)
      context.restore()
      return
    }
    for (var egg = 0; egg < 6; egg += 1) {
      context.fillStyle = 'rgba(237,218,150,' + (0.65 + Math.sin(time * 1.2 + egg) * 0.12).toFixed(3) + ')'
      context.beginPath()
      context.ellipse(x + egg % 3 * 4 * scale, y + Math.floor(egg / 3) * 3 * scale, 1.5 * scale, 2 * scale, 0, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  export function drawGlass(context, width, height, time, scale) {
    context.save()
    var surface = context.createLinearGradient(0, 0, 0, height * 0.16)
    surface.addColorStop(0, 'rgba(229,246,224,.12)')
    surface.addColorStop(1, 'rgba(214,246,255,0)')
    context.fillStyle = surface
    context.fillRect(0, 0, width, height * 0.16)
    context.strokeStyle = 'rgba(235,255,241,.25)'
    context.lineWidth = Math.max(0.8, 1.1 * scale)
    for (var line = 0; line < 2; line += 1) {
      context.beginPath()
      for (var x = 0; x <= width; x += 6) {
        var y = 3 + line * 5 + Math.sin(x * 0.045 + time * (0.9 + line * 0.3)) * (1.6 + line * 0.8)
        if (x === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
    }
    var sheen = context.createLinearGradient(0, 0, width * 0.7, height)
    sheen.addColorStop(0, 'rgba(255,255,255,.035)')
    sheen.addColorStop(0.35, 'rgba(255,255,255,.02)')
    sheen.addColorStop(0.6, 'rgba(255,255,255,0)')
    context.fillStyle = sheen
    context.fillRect(0, 0, width, height)
    var vignette = context.createRadialGradient(width / 2, height * 0.45, Math.min(width, height) * 0.25, width / 2, height * 0.5, Math.max(width, height) * 0.75)
    vignette.addColorStop(0, 'rgba(2,14,24,0)')
    vignette.addColorStop(1, 'rgba(2,14,24,.52)')
    context.fillStyle = vignette
    context.fillRect(0, 0, width, height)
    var floorShade = context.createLinearGradient(0, height * 0.86, 0, height)
    floorShade.addColorStop(0, 'rgba(4,20,28,0)')
    floorShade.addColorStop(1, 'rgba(4,20,28,.35)')
    context.fillStyle = floorShade
    context.fillRect(0, height * 0.86, width, height * 0.14)
    context.restore()
  }

  /**
   * Draw the whole tank.
   * @param context - 2D canvas context, already sized for `view`.
   * @param view - CSS width, height, and device pixel ratio.
   * @param scene - fish, pellets, ripples, bubbles, ghosts, splashes, sparkles.
   * @param timeMs - wall-clock time in milliseconds.
   */
