import { clamp, isNumber } from '../shared/math.js'
import { FISH_SPECIES } from '../shared/species.js'
import { paint } from './color.js'
import { getFishAtlas } from './atlas.js'
import { fishPose, tailOffset } from './fish-pose.js'
  /**
   * Colors for one fish. A darker back, a saturated flank, a pale belly, and
   * fin tints with a darker edge that keeps translucent membranes readable.
   * Hunger drains saturation so a starving fish looks washed out before it dies.
   */
  function fishPalette(fish, species) {
    var hue = species.id === 'betta' ? 210 + (fish.seed % 32) : species.id === 'guppy' ? 35 : isNumber(fish.hue) ? fish.hue : 0
    var vitality = clamp(1 - fish.hunger * 0.85, 0.12, 1)
    var sat = 18 + 56 * vitality
    if (species.id === 'angel') {
      return {
        back: paint(155, 16, 32 + 8 * vitality, 1),
        mid: paint(155, 10, 74, 1),
        belly: paint(48, 18, 90, 1),
        band: paint(180, 16, 7, 0.85 * vitality),
        rim: paint(hue, 20, 100, 0.75),
        finBase: paint(160, 12, 78, 0.64),
        finMid: paint(150, 10, 64, 0.42),
        finTip: paint(140, 14, 84, 0.1),
        accent: paint(hue + 196, 56, 92, 0.55),
        eye: paint(hue + 34, 58, 24, 1),
      }
    }
    if (species.id === 'tetra') {
      return {
        back: paint(204, 40, 38, 1),
        mid: paint(200, 30, 74, 1),
        belly: paint(196, 16, 96, 1),
        band: paint(190, 96, 62, 0.95),
        hot: paint(356, 92, 50, 1),
        rim: paint(200, 50, 92, 0.7),
        finBase: paint(200, 40, 92, 0.72),
        finMid: paint(196, 30, 88, 0.5),
        finTip: paint(192, 24, 96, 0.16),
        accent: paint(190, 100, 86, 0.6),
        eye: paint(210, 54, 22, 1),
      }
    }
    if (species.id === 'guppy') {
      return {
        back: paint(hue + 8, sat + 6, 34 + 4 * vitality, 1),
        mid: paint(hue, sat + 14, 56 + 4 * vitality, 1),
        belly: paint(hue + 12, sat * 0.45, 90, 1),
        band: paint(hue + 40, 80, 26, 0.34),
        rim: paint(hue + 20, 100, 90, 0.7),
        finBase: paint(25, 82, 51, 0.88),
        finMid: paint(12, 80, 56, 0.8),
        finTip: paint(39, 90, 71, 0.36),
        accent: paint(hue + 150, 94, 76, 0.22),
        eye: paint(202, 48, 22, 1),
      }
    }
    return {
      back: paint(hue + 8, sat + 6, 28 + 4 * vitality, 1),
      mid: paint(hue, sat + 12, 52 + 4 * vitality, 1),
      belly: paint(hue + 16, sat * 0.45, 84, 1),
      band: paint(hue + 182, 90, 58, 0.3),
      rim: paint(hue + 34, 100, 86, 0.7),
      finBase: paint(hue + 4, sat + 8, 50, 1),
      finMid: paint(hue + 16, sat + 4, 62, 0.96),
      finTip: paint(hue + 34, sat * 0.85, 82, 0.46),
      accent: paint(hue + 160, 92, 78, 0.18),
      eye: paint(36, 68, 24, 1),
    }
  }

  /** Smooth closed spline through `points`, each an [x, y] pair in pixels. */
  function smoothClosedPath(context, points) {
    var count = points.length
    context.beginPath()
    context.moveTo(points[0][0], points[0][1])
    for (var index = 0; index < count; index += 1) {
      var before = points[(index - 1 + count) % count]
      var start = points[index]
      var end = points[(index + 1) % count]
      var after = points[(index + 2) % count]
      context.bezierCurveTo(
        start[0] + (end[0] - before[0]) / 6,
        start[1] + (end[1] - before[1]) / 6,
        end[0] - (after[0] - start[0]) / 6,
        end[1] - (after[1] - start[1]) / 6,
        end[0],
        end[1],
      )
    }
    context.closePath()
  }

  /** Smooth open spline through `points`, used for rim lights and streamers. */
  function smoothOpenPath(context, points) {
    var count = points.length
    context.beginPath()
    context.moveTo(points[0][0], points[0][1])
    for (var index = 0; index < count - 1; index += 1) {
      var before = points[index === 0 ? 0 : index - 1]
      var start = points[index]
      var end = points[index + 1]
      var after = points[index + 2 < count ? index + 2 : count - 1]
      context.bezierCurveTo(
        start[0] + (end[0] - before[0]) / 6,
        start[1] + (end[1] - before[1]) / 6,
        end[0] - (after[0] - start[0]) / 6,
        end[1] - (after[1] - start[1]) / 6,
        end[0],
        end[1],
      )
    }
  }

  /** Lateral sway of the body centerline at `t` (0 tail root, 1 snout), in pixels. */
  function spine(t, ry, phase) {
    return Math.sin(phase - (1 - t) * 1.9) * ry * 0.13 - ry * 0.05 * (1 - t)
  }

  /** Map one normalized outline into pixels, bending it with the swim phase. */
  function outlinePoints(edge, rx, ry, phase, species) {
    var points = []
    for (var index = 0; index < edge.length; index += 1) {
      var nx = edge[index][0]
      var ny = edge[index][1]
      points.push([nx * rx, (ny + species.offset) * ry + spine((nx + 1) / 2, ry, phase)])
    }
    return points
  }

  /** Body silhouette of one fish as one closed spline. */
  function bodyPath(context, rx, ry, species, phase) {
    var top = outlinePoints(species.top, rx, ry, phase, species)
    var bottom = outlinePoints(species.bottom, rx, ry, phase, species).reverse()
    smoothClosedPath(context, top.concat(bottom))
  }

  /** Rim light along the back only. */
  function backEdgePath(context, rx, ry, species, phase) {
    smoothOpenPath(context, outlinePoints(species.top, rx, ry, phase, species))
  }

  /** Vertical outline position at normalized `x`, used to root fins on the body. */
  function outlineY(edge, nx) {
    for (var index = 1; index < edge.length; index += 1) {
      if (nx <= edge[index][0] || index === edge.length - 1) {
        var span = edge[index][0] - edge[index - 1][0]
        var ratio = span === 0 ? 0 : (nx - edge[index - 1][0]) / span
        return edge[index - 1][1] + (edge[index][1] - edge[index - 1][1]) * ratio
      }
    }
    return edge[edge.length - 1][1]
  }

  /** Point on the back edge at normalized `nx`. */
  function backPoint(rx, ry, species, phase, nx) {
    var t = (nx + 1) / 2
    return [nx * rx, (outlineY(species.top, nx) + species.offset) * ry + spine(t, ry, phase)]
  }

  /** Point on the belly edge at normalized `nx`. */
  function bellyPoint(rx, ry, species, phase, nx) {
    var t = (nx + 1) / 2
    return [nx * rx, (outlineY(species.bottom, nx) + species.offset) * ry + spine(t, ry, phase)]
  }

  /**
   * Fan-shaped fin outline: a sector from `origin` toward `direction`, with an
   * elliptical reach and a scalloped edge that ripples with the swim phase.
   */
  function fanPoints(originX, originY, direction, spread, reachX, reachY, scallops, phase, notch) {
    var points = []
    var steps = 14
    for (var step = 0; step <= steps; step += 1) {
      var offset = -spread + (2 * spread * step) / steps
      var radius = 1 + 0.045 * Math.sin(scallops * offset + phase)
      if (notch > 0) radius -= notch * Math.cos((offset / spread) * Math.PI * 0.5) ** 6
      var angle = direction + offset
      points.push([
        originX + Math.cos(angle) * reachX * radius,
        originY + Math.sin(angle) * reachY * radius,
      ])
    }
    return points
  }

  /** Fill one fin membrane, then draw its rays. */
  function paintMembrane(context, points, originX, originY, palette, phase, rayCount) {
    smoothClosedPath(context, points)
    var radius = 1
    for (var index = 0; index < points.length; index += 1) {
      var dx = points[index][0] - originX
      var dy = points[index][1] - originY
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy))
    }
    var gradient = context.createRadialGradient(originX, originY, radius * 0.1, originX, originY, radius)
    gradient.addColorStop(0, palette.finBase)
    gradient.addColorStop(0.5, palette.finMid)
    gradient.addColorStop(1, palette.finTip)
    context.save()
    context.globalAlpha = 0.86
    context.fillStyle = gradient
    context.fill()
    context.restore()
    context.strokeStyle = paint(0, 0, 8, 0.18)
    context.lineWidth = Math.max(0.5, radius * 0.016)
    context.stroke()
    if (rayCount > 0) {
      context.strokeStyle = 'rgba(255,255,255,.13)'
      context.lineWidth = Math.max(0.4, radius * 0.012)
      for (var ray = 1; ray < rayCount; ray += 1) {
        var target = points[Math.round((ray / rayCount) * (points.length - 1))]
        context.beginPath()
        context.moveTo(originX, originY)
        context.quadraticCurveTo(
          originX + (target[0] - originX) * 0.55,
          originY + (target[1] - originY) * 0.55,
          target[0],
          target[1],
        )
        context.stroke()
      }
    }
  }

  /** Caudal fin behind the body; each species has its own fan. */
  function caudalFin(context, rx, ry, species, palette, phase) {
    var root = spine(0, ry, phase)
    var radians = Math.PI / 180
    var wag = Math.sin(phase) * 3
    var spread
    var reachX
    var reachY
    var scallops
    var notch = 0
    var rays
    if (species.id === 'betta') {
      spread = 76
      reachX = 1.05
      reachY = 1.05
      scallops = 8
      rays = 9
    } else if (species.id === 'guppy') {
      spread = 66
      reachX = 0.85
      reachY = 1.05
      scallops = 6
      rays = 6
    } else if (species.id === 'angel') {
      spread = 34
      reachX = 0.5
      reachY = 0.62
      scallops = 3
      notch = 0.45
      rays = 3
    } else {
      spread = 28
      reachX = 0.44
      reachY = 0.46
      scallops = 3
      notch = 0.55
      rays = 3
    }
    var points = fanPoints(
      -rx,
      root,
      (180 + wag) * radians,
      spread * radians,
      reachX * rx,
      reachY * rx,
      scallops,
      phase,
      notch,
    )
    points.unshift([-rx, root])
    points.push([-rx, root])
    context.save()
    paintMembrane(context, points, -rx, root, palette, phase, rays)
    if (species.id === 'guppy') {
      for (var spot = 0; spot < 7; spot += 1) {
        var spotAngle = (spot / 7) * Math.PI * 2
        context.fillStyle = paint(0, 0, 100, 0.16)
        context.beginPath()
        context.arc(-rx * 1.4 + Math.cos(spotAngle) * rx * 0.14, root + Math.sin(spotAngle) * rx * 0.55, Math.max(0.4, rx * 0.04), 0, Math.PI * 2)
        context.fill()
      }
    }
    context.restore()
  }

  /** Dorsal and anal membranes attach along the body, with swept trailing tips. */
  function attachedFin(context, rx, ry, species, palette, phase, side) {
    var angel = species.id === 'angel'
    var betta = species.id === 'betta'
    var edge = side < 0 ? species.top : species.bottom
    var base = []
    for (var i = 0; i <= 7; i += 1) {
      var nx = -0.88 + i * 0.18
      base.push([nx * rx, outlineY(edge, nx) * ry + spine((nx + 1) / 2, ry, phase)])
    }
    var tipX = angel ? -0.28 : betta ? -1.05 : -0.32
    var tipY = angel ? 1.95 : betta ? 1.25 : 0.96
    var wave = Math.sin(phase * 0.8 + side) * rx * 0.045
    var points = base.concat([
      [tipX * rx + wave, side * (angel ? ry * tipY : rx * tipY * 0.5)],
      [-(angel ? 0.64 : 1.18) * rx + wave, side * (angel ? ry * 1.42 : rx * 0.45)],
      [-rx * 0.98, side * ry * 0.35]
    ])
    paintMembrane(context, points, rx * 0.1, side * ry * 0.4, palette, phase, 0)
    context.save()
    smoothClosedPath(context, points)
    context.clip()
    context.strokeStyle = angel ? 'rgba(22,40,29,.28)' : 'rgba(228,249,239,.2)'
    context.lineWidth = Math.max(0.4, rx * 0.011)
    for (var ray = 0; ray < 14; ray += 1) {
      var u = ray / 14
      context.beginPath()
      context.moveTo(rx * (0.32 - u * 1.12), side * ry * 0.35)
      context.lineTo(rx * (tipX - u * 0.9) + wave, side * ry * (tipY + u * 0.6))
      context.stroke()
    }
    context.restore()
    if (angel && side > 0) {
      context.strokeStyle = 'rgba(217,231,208,.65)'
      context.lineWidth = Math.max(0.6, rx * 0.016)
      for (var feeler = 0; feeler < 2; feeler += 1) {
        context.beginPath()
        context.moveTo(rx * (0.42 - feeler * 0.12), ry * 0.56)
        context.bezierCurveTo(rx * 0.15, ry * 1.2, rx * 0.08 + wave, ry * 1.8, -rx * 0.4 + wave, ry * (2.1 - feeler * 0.2))
        context.stroke()
      }
    }
  }

  function dorsalFin(context, rx, ry, species, palette, phase) {
    attachedFin(context, rx, ry, species, palette, phase, -1)
  }

  function analFin(context, rx, ry, species, palette, phase) {
    attachedFin(context, rx, ry, species, palette, phase, 1)
  }

  /** Small pectoral fin in front of the body. */
  function pectoralFin(context, rx, ry, palette, phase) {
    var flap = Math.sin(phase * 1.7) * 0.5
    context.save()
    context.translate(rx * 0.34, ry * 0.2)
    context.rotate(flap * 0.5 - 0.6)
    var gradient = context.createLinearGradient(0, 0, -rx * 0.2, ry * 0.12)
    gradient.addColorStop(0, 'rgba(255,255,255,.36)')
    gradient.addColorStop(1, 'rgba(255,255,255,.05)')
    context.fillStyle = gradient
    context.beginPath()
    context.moveTo(0, 0)
    context.quadraticCurveTo(-rx * 0.18, -ry * 0.1, -rx * 0.26, ry * 0.16)
    context.quadraticCurveTo(-rx * 0.1, ry * 0.22, 0, ry * 0.05)
    context.closePath()
    context.fill()
    context.restore()
  }

  /** Eye, gill line, and a mouth that opens on the pellet it just ate. */
  function fishFace(context, fish, rx, ry, species, palette, phase, time) {
    var eyeX = species.eyeX * rx
    var eyeY = (species.eyeY + species.offset) * ry + spine((species.eyeX + 1) / 2, ry, phase)
    var eyeR = Math.max(0.9, rx * 0.062)
    context.save()
    context.fillStyle = paint(0, 0, 100, 0.94)
    context.beginPath()
    context.ellipse(eyeX, eyeY, eyeR * 1.02, eyeR, 0, 0, Math.PI * 2)
    context.fill()
    var iris = context.createRadialGradient(eyeX + eyeR * 0.25, eyeY - eyeR * 0.25, eyeR * 0.05, eyeX, eyeY, eyeR)
    iris.addColorStop(0, paint(0, 0, 96, 0.5))
    iris.addColorStop(0.4, palette.eye)
    iris.addColorStop(1, paint(210, 50, 10, 1))
    context.fillStyle = iris
    context.beginPath()
    context.arc(eyeX, eyeY, eyeR * 0.86, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = 'rgba(4,8,14,.94)'
    context.beginPath()
    context.arc(eyeX, eyeY, eyeR * 0.4, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = 'rgba(255,255,255,.97)'
    context.beginPath()
    context.arc(eyeX + eyeR * 0.32, eyeY - eyeR * 0.34, Math.max(0.4, eyeR * 0.16), 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = paint(0, 0, 8, 0.14)
    context.lineWidth = Math.max(0.5, rx * 0.012)
    context.beginPath()
    context.arc(rx * 0.34, ry * 0.05, ry * 0.55, -1.05, 0.4)
    context.stroke()

    var biting = isNumber(fish.biteAt) && fish.biteAt > 0 && time * 1000 - fish.biteAt < 280
    var mouthY = ry * (species.offset + 0.04) + spine(1, ry, phase)
    if (biting) {
      context.fillStyle = paint(0, 0, 6, 0.6)
      context.beginPath()
      context.ellipse(rx * 0.94, mouthY, rx * 0.04, ry * 0.12, 0, 0, Math.PI * 2)
      context.fill()
    } else {
      context.strokeStyle = paint(0, 0, 8, 0.42)
      context.lineWidth = Math.max(0.4, rx * 0.012)
      context.beginPath()
      context.moveTo(rx * 0.9, mouthY - ry * 0.03)
      context.quadraticCurveTo(rx * 0.97, mouthY + ry * 0.09, rx * 1.0, mouthY + ry * 0.02)
      context.stroke()
    }
    context.restore()
  }

  /** Pattern overlay for the body, clipped to the silhouette. */
  function fishPattern(context, fish, rx, ry, species, palette, phase) {
    context.save()
    bodyPath(context, rx, ry, species, phase)
    context.clip()
    context.lineWidth = Math.max(0.28, rx * 0.009)
    for (var row = -3; row <= 3; row += 1) {
      for (var column = -6; column < 5; column += 1) {
        var sx = (column + (row % 2) * 0.5) * rx * 0.14
        var sy = row * ry * 0.18
        context.strokeStyle = row < 0 ? 'rgba(225,250,231,.13)' : 'rgba(8,25,24,.07)'
        context.beginPath()
        context.ellipse(sx, sy, rx * 0.1, ry * 0.12, 0, -1.1, 1.1)
        context.stroke()
      }
    }
    if (species.id === 'angel') {
      context.fillStyle = palette.band
      var bands = [-0.68, -0.12, 0.61]
      for (var band = 0; band < bands.length; band += 1) {
        var bandX = rx * bands[band]
        context.beginPath()
        context.moveTo(bandX, -ry * 1.4)
        context.lineTo(bandX + rx * 0.14, -ry * 1.4)
        context.lineTo(bandX + rx * 0.08, ry * 1.4)
        context.lineTo(bandX - rx * 0.06, ry * 1.4)
        context.closePath()
        context.fill()
      }
      var warm = context.createLinearGradient(0, -ry, 0, 0)
      warm.addColorStop(0, paint(fish.hue + 30, 40, 78, 0.35))
      warm.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = warm
      context.fillRect(-rx, -ry, rx * 2, ry * 2)
    } else if (species.id === 'tetra') {
      var neon = context.createLinearGradient(0, -ry * 0.5, 0, ry * 0.1)
      neon.addColorStop(0, paint(188, 100, 82, 0.05))
      neon.addColorStop(0.35, paint(188, 100, 70, 0.98))
      neon.addColorStop(1, paint(196, 96, 54, 0.12))
      context.fillStyle = neon
      context.beginPath()
      context.moveTo(-rx * 0.88, -ry * 0.24)
      context.lineTo(rx * 0.66, -ry * 0.3)
      context.lineTo(rx * 0.72, ry * 0.06)
      context.lineTo(-rx * 0.9, ry * 0.14)
      context.closePath()
      context.fill()
      var hot = context.createLinearGradient(-rx * 0.3, 0, rx * 0.8, 0)
      hot.addColorStop(0, paint(356, 92, 54, 0.85))
      hot.addColorStop(0.3, paint(356, 92, 52, 0.92))
      hot.addColorStop(1, paint(356, 92, 50, 0.98))
      context.fillStyle = hot
      context.beginPath()
      context.moveTo(-rx * 0.88, ry * 0.12)
      context.lineTo(rx * 0.94, -ry * 0.02)
      context.lineTo(rx * 0.9, ry * 0.4)
      context.lineTo(-rx * 0.88, ry * 0.72)
      context.closePath()
      context.fill()
    } else if (species.id === 'guppy') {
      context.fillStyle = paint(fish.hue + 40, 80, 28, 0.28)
      for (var spot = 0; spot < 10; spot += 1) {
        var angle = (fish.seed + spot * 61) * 0.021
        context.beginPath()
        context.arc(Math.cos(angle) * rx * 0.6, Math.sin(angle * 1.7) * ry * 0.4, Math.max(0.4, rx * 0.04), 0, Math.PI * 2)
        context.fill()
      }
    } else {
      var sheen = context.createRadialGradient(rx * 0.05, -ry * 0.45, rx * 0.05, rx * 0.05, -ry * 0.2, rx * 1.1)
      sheen.addColorStop(0, palette.accent)
      sheen.addColorStop(0.55, 'rgba(255,255,255,.05)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = sheen
      context.fillRect(-rx, -ry, rx * 2, ry * 2)
      context.strokeStyle = paint(0, 0, 100, 0.07)
      context.lineWidth = Math.max(0.4, rx * 0.008)
      for (var scale = 0; scale < 8; scale += 1) {
        var sx = -rx * 0.7 + scale * rx * 0.26
        context.beginPath()
        context.arc(sx, ry * 0.12, ry * 0.32, -2.3, 0.25)
        context.stroke()
      }
    }
    context.restore()
  }

  /** CPU fallback: flex the photographed silhouette in narrow, overlapping strips. */
  function drawSpriteFish(context, fish, width, height, time, scale, alpha, reducedMotion) {
    var fishAtlas = getFishAtlas(fish.species)
    if (fishAtlas === null) return false
    var pose = fishPose(fish, scale, time, reducedMotion)
    var frame = pose.frame
    var facing = Math.cos(pose.angle) < 0 ? -1 : 1
    var heading = 1
    var breathing = reducedMotion ? 0 : Math.sin(time * 1.1 + (fish.seed || 0)) * 0.6 * scale
    context.save()
    context.globalAlpha = alpha === undefined ? 1 : alpha
    context.translate(fish.x * width, fish.y * height + breathing)
    context.scale(facing * heading, 1)
    context.rotate(Math.sin(pose.angle) * facing * 0.13)
    var blur = Math.abs(pose.depth - 0.53) * 1.2
    context.filter = 'saturate(' + (1 - fish.hunger * 0.55).toFixed(3) + ') brightness(' + (1 - fish.hunger * 0.1).toFixed(3) + ') blur(' + blur.toFixed(2) + 'px)'
    var slices = reducedMotion ? 1 : 20
    for (var i = 0; i < slices; i += 1) {
      var u = (i + .5) / slices
      var sw = frame[2] / slices
      var y = tailOffset(u, .5, pose) * pose.tall
      // The fallback has no fin mask, so the trailing slices also drift
      // sideways; that keeps the tail and rear fin edges in motion.
      var sway = reducedMotion ? 0 : Math.sin(pose.phase * 1.6 + u * 5) * pose.motion.fin * pose.tall * (1 - u)
      context.drawImage(fishAtlas, frame[0] + i * sw, frame[1], Math.min(sw + .75, frame[2] - i * sw), frame[3],
        -pose.length * .52 + i * pose.length / slices + sway, -pose.tall * .5 + y,
        pose.length / slices + .5, pose.tall)
    }
    context.restore()
    return true
  }

  /**
   * Draw one fish at its scene position.
   * @param context - 2D canvas context.
   * @param fish - simulated fish with position, angle, growth, hunger, and species.
   * @param width - tank width in CSS pixels.
   * @param height - tank height in CSS pixels.
   * @param time - seconds since the page started the tank.
   * @param scale - size scale derived from the tank size.
   * @param alpha - overall opacity for fading ghosts.
   */
  export function drawFish(context, fish, width, height, time, scale, alpha, reducedMotion) {
    if (drawSpriteFish(context, fish, width, height, time, scale, alpha, reducedMotion)) return
    var species = FISH_SPECIES[((fish.species | 0) % FISH_SPECIES.length + FISH_SPECIES.length) % FISH_SPECIES.length]
    var growth = clamp(isNumber(fish.growth) ? fish.growth : 0.2, 0, 1)
    var rx = (14 + 25 * growth) * species.size * scale
    var ry = rx * species.depth
    var x = fish.x * width
    var y = fish.y * height + Math.sin(time * 1.6 + (fish.seed || 0) * 0.11) * 1.6 * scale
    var facing = Math.cos(fish.angle) < 0 ? -1 : 1
    var phase = time * (fish.species === 2 ? 2.1 : 4.3 + growth * 1.1) + (fish.seed || 0) * 0.37
    var palette = fishPalette(fish, species)
    context.save()
    context.globalAlpha = alpha === undefined ? 1 : alpha
    context.translate(x, y)
    context.scale(facing * (0.08 + 0.92 * Math.abs(Math.cos(fish.angle))), 1)
    context.rotate(Math.sin(fish.angle) * facing * 0.2)
    caudalFin(context, rx, ry, species, palette, phase)
    dorsalFin(context, rx, ry, species, palette, phase)
    analFin(context, rx, ry, species, palette, phase)
    bodyPath(context, rx, ry, species, phase)
    var body = context.createLinearGradient(0, -ry, 0, ry)
    body.addColorStop(0, palette.back)
    body.addColorStop(0.42, palette.mid)
    body.addColorStop(0.67, palette.belly)
    body.addColorStop(0.88, palette.mid)
    body.addColorStop(1, palette.belly)
    context.fillStyle = body
    context.fill()
    fishPattern(context, fish, rx, ry, species, palette, phase)
    context.save()
    bodyPath(context, rx, ry, species, phase)
    context.clip()
    var backShade = context.createLinearGradient(0, -ry, 0, ry * 0.4)
    backShade.addColorStop(0, 'rgba(4,16,26,.45)')
    backShade.addColorStop(0.5, 'rgba(4,16,26,.1)')
    backShade.addColorStop(1, 'rgba(4,16,26,0)')
    context.fillStyle = backShade
    context.fillRect(-rx * 1.2, -ry * 1.4, rx * 2.4, ry * 2.8)
    var bellyGlow = context.createRadialGradient(rx * 0.06, ry * 0.55, ry * 0.05, rx * 0.06, ry * 0.55, rx * 0.9)
    bellyGlow.addColorStop(0, 'rgba(255,255,255,.18)')
    bellyGlow.addColorStop(0.6, 'rgba(255,255,255,.05)')
    bellyGlow.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = bellyGlow
    context.fillRect(-rx * 1.2, -ry * 1.4, rx * 2.4, ry * 2.8)
    var specular = context.createRadialGradient(rx * 0.04, -ry * 0.62, ry * 0.05, rx * 0.04, -ry * 0.62, rx * 0.62)
    specular.addColorStop(0, 'rgba(255,255,255,.26)')
    specular.addColorStop(0.55, 'rgba(255,255,255,.05)')
    specular.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = specular
    context.fillRect(-rx * 1.2, -ry * 1.4, rx * 2.4, ry * 2.8)
    context.restore()
    bodyPath(context, rx, ry, species, phase)
    context.strokeStyle = paint(fish.hue, 52, 10, 0.34)
    context.lineWidth = Math.max(0.6, rx * 0.016)
    context.stroke()
    backEdgePath(context, rx, ry, species, phase)
    context.strokeStyle = palette.rim
    context.lineWidth = Math.max(0.5, rx * 0.02)
    context.stroke()
    pectoralFin(context, rx, ry, palette, phase)
    fishFace(context, fish, rx, ry, species, palette, phase, time)
    context.restore()
  }
