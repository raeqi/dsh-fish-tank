import { paint } from './color.js'
import { getPlantAtlas } from './atlas.js'

  var SAND_SPECKLES = []
  var PEEBLE_ROW = [[0.07, 0.93, 4], [0.12, 0.97, 2.6], [0.18, 0.92, 3.4], [0.31, 0.96, 2.6], [0.44, 0.93, 4], [0.58, 0.97, 2.4], [0.71, 0.92, 3.2], [0.82, 0.96, 2.6], [0.93, 0.93, 4]]
  ;(function seedSand() {
    var seed = 20240407
    for (var index = 0; index < 160; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      var x = seed / 2147483648
      seed = (seed * 1103515245 + 12345) % 2147483648
      var y = seed / 2147483648
      seed = (seed * 1103515245 + 12345) % 2147483648
      var size = seed / 2147483648
      SAND_SPECKLES.push({ x: x, y: 0.855 + y * 0.145, r: 0.5 + size * 1.3, tone: size > 0.5 ? 'light' : 'dark' })
    }
  }())

  export function drawCaustics(context, width, height, time, scale) {
    context.save()
    context.globalCompositeOperation = 'lighter'
    for (var row = 0; row < 4; row += 1) {
      for (var column = 0; column < 5; column += 1) {
        var x = width * ((column + 0.5) / 5) + Math.sin(time * 0.35 + row * 1.7 + column * 0.9) * width * 0.045
        var y = height * (0.16 + row * 0.2) + Math.cos(time * 0.28 + column * 1.4 + row) * height * 0.05
        var radius = (26 + 12 * Math.sin(time * 0.6 + row + column * 1.3)) * scale
        var glow = context.createRadialGradient(x, y, 0, x, y, Math.max(6, radius))
        var strength = 0.022 + 0.014 * Math.sin(time * 0.5 + row * 2 + column)
        glow.addColorStop(0, 'rgba(196,244,255,' + Math.max(0, strength).toFixed(3) + ')')
        glow.addColorStop(1, 'rgba(196,244,255,0)')
        context.fillStyle = glow
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
      }
    }
    context.restore()
  }

  /** Stable procedural texture: independent of the simulation's random source. */
  export function texture(seed) {
    var n = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return n - Math.floor(n)
  }

  /** A tapered leaf with a shaded membrane and a fine midrib. */
  export function leaf(context, x, y, length, breadth, angle, tone, sway) {
    context.save()
    context.translate(x, y)
    context.rotate(angle + sway)
    context.beginPath()
    context.moveTo(0, 0)
    context.bezierCurveTo(-breadth, -length * 0.28, -breadth * 0.65, -length * 0.8, breadth * 0.1, -length)
    context.bezierCurveTo(breadth * 0.8, -length * 0.7, breadth, -length * 0.3, 0, 0)
    var color = context.createLinearGradient(-breadth, 0, breadth, -length)
    color.addColorStop(0, paint(145 - tone * 12, 30 + tone * 10, 9 + tone * 12, 1))
    color.addColorStop(0.48, paint(115 - tone * 12, 36 + tone * 10, 19 + tone * 20, 1))
    color.addColorStop(1, paint(100, 38, 26 + tone * 25, 1))
    context.fillStyle = color
    context.fill()
    var plantAtlas = getPlantAtlas()
    if (plantAtlas && length > 20) {
      context.save()
      context.clip()
      var species = breadth / length < 0.08 ? 2 : breadth / length < 0.18 ? 1 : 0
      context.globalAlpha = 0.42
      context.drawImage(plantAtlas, species % 3 * 512, Math.floor(species / 3) * 512, 512, 512,
        -breadth, -length, breadth * 2, length)
      context.restore()
    }
    context.strokeStyle = paint(81, 38, 65, 0.22)
    context.lineWidth = 0.55
    context.beginPath()
    context.moveTo(0, 0)
    context.quadraticCurveTo(breadth * 0.12, -length * 0.5, breadth * 0.1, -length * 0.94)
    context.stroke()
    context.restore()
  }

  /** Feathery stem plants behind the swimming area, tallest at either side. */
  export function drawBackgroundPlants(context, width, height, time, scale, garden) {
    for (var i = 0; i < 46; i += 1) {
      var u = texture(i + 12)
      var x = (u < 0.5 ? u * 0.65 : 0.7 + (u - 0.5) * 0.6) * width
      var tall = height * (0.22 + texture(i + 65) * 0.57) * (garden ? 0.9 + garden.growth * 0.18 : 1)
      var base = height * (0.87 + texture(i + 71) * 0.05)
      var sway = Math.sin(time * 0.48 + i) * 5 * scale
      context.strokeStyle = '#294835'
      context.lineWidth = 1.1 * scale
      context.beginPath()
      context.moveTo(x, base)
      context.quadraticCurveTo(x + sway, base - tall * 0.5, x + sway * 2, base - tall)
      context.stroke()
      for (var j = 1; j <= 11; j += 1) {
        var v = j / 11
        var lx = x + sway * v * 2
        var ly = base - tall * v + texture(i * 31 + j) * 6 * scale
        var len = (7 + 17 * Math.sin(v * Math.PI)) * (0.6 + texture(i * 33 + j) * 0.8) * scale
        var tone = 0.12 + texture(i * 23 + j) * 0.38
        leaf(context, lx, ly, len, len * 0.16, -0.9, tone, sway * 0.005)
        leaf(context, lx, ly - 3 * scale, len, len * 0.16, 0.95, tone, sway * 0.005)
      }
    }
  }

  /** Pale river sand slopes upward at the planted edges. */
  export function drawFloor(context, width, height, scale) {
    var sandTop = height * 0.84
    var sand = context.createLinearGradient(0, sandTop, 0, height)
    sand.addColorStop(0, '#777968')
    sand.addColorStop(0.34, '#b5ae91')
    sand.addColorStop(0.7, '#c8bfa1')
    sand.addColorStop(1, '#978a6d')
    context.fillStyle = sand
    context.beginPath()
    context.moveTo(0, height * 0.8)
    context.bezierCurveTo(width * 0.25, height * 0.88, width * 0.3, height * 0.85, width * 0.5, height * 0.88)
    context.bezierCurveTo(width * 0.72, height * 0.88, width * 0.8, height * 0.83, width, height * 0.8)
    context.lineTo(width, height)
    context.lineTo(0, height)
    context.closePath()
    context.fill()
    context.save()
    context.clip()
    for (var i = 0; i < 2300; i += 1) {
      var x = texture(i * 3) * width
      var y = (0.8 + texture(i * 3 + 1) * 0.2) * height
      var r = (0.25 + texture(i * 3 + 2) * 0.7) * scale
      context.fillStyle = i % 3 ? 'rgba(54,49,33,.19)' : 'rgba(255,245,209,.36)'
      context.fillRect(x, y, r * 1.8, r)
    }
    context.restore()
  }

  /** Forked driftwood and fractured river stones anchor the planted islands. */
  export function drawHardscape(context, width, height, scale) {
    context.save()
    context.lineCap = 'round'
    var branches = [
      [0.18,0.89,0.26,0.72,0.36,0.55,17],
      [0.23,0.8,0.17,0.66,0.13,0.48,10],
      [0.27,0.72,0.34,0.68,0.43,0.7,7],
      [0.31,0.65,0.32,0.51,0.3,0.41,5],
      [0.13,0.5,0.17,0.46,0.19,0.39,3],
      [0.8,0.88,0.74,0.76,0.69,0.65,11],
      [0.76,0.8,0.85,0.7,0.89,0.56,6],
      [0.72,0.73,0.65,0.72,0.59,0.76,4]
    ]
    for (var b = 0; b < branches.length; b += 1) {
      var p = branches[b]
      var thick = p[6] * scale
      var x0 = p[0] * width, y0 = p[1] * height
      var x1 = p[2] * width, y1 = p[3] * height
      var x2 = p[4] * width, y2 = p[5] * height
      var normal = Math.atan2(y2 - y0, x2 - x0) + Math.PI / 2
      var nx = Math.cos(normal), ny = Math.sin(normal)
      context.beginPath()
      context.moveTo(x0 + nx * thick, y0 + ny * thick)
      context.quadraticCurveTo(x1 + nx * thick * 0.6, y1 + ny * thick * 0.6, x2, y2)
      context.quadraticCurveTo(x1 - nx * thick * 0.4, y1 - ny * thick * 0.4, x0 - nx * thick, y0 - ny * thick)
      context.closePath()
      var wood = context.createLinearGradient(x0 - nx * thick, y0 - ny * thick, x0 + nx * thick, y0 + ny * thick)
      wood.addColorStop(0, '#1c2419')
      wood.addColorStop(0.4, '#554b31')
      wood.addColorStop(0.6, '#756344')
      wood.addColorStop(1, '#282c1c')
      context.fillStyle = wood
      context.fill()
      context.save()
      context.clip()
      for (var grain = 0; grain < 12; grain += 1) {
        var offset = (texture(grain + b * 31) - 0.5) * thick * 2
        context.strokeStyle = grain % 2 ? 'rgba(13,19,10,.4)' : 'rgba(164,143,92,.25)'
        context.lineWidth = (0.4 + texture(grain) * 0.6) * scale
        context.beginPath()
        context.moveTo(x0 + nx * offset, y0 + ny * offset)
        context.quadraticCurveTo(x1 + nx * offset * 0.7, y1 + ny * offset * 0.7, x2 + nx * offset * 0.2, y2 + ny * offset * 0.2)
        context.stroke()
      }
      context.restore()
    }
    for (var i = 0; i < 14; i += 1) {
      var side = i < 8
      var x = width * (side ? 0.07 + texture(i + 9) * 0.26 : 0.74 + texture(i + 7) * 0.2)
      var y = height * (0.89 + texture(i + 32) * 0.04)
      var radius = (12 + texture(i + 41) * 27) * scale
      var stone = context.createLinearGradient(x - radius, y - radius, x + radius, y)
      stone.addColorStop(0, '#8b9381')
      stone.addColorStop(0.35, '#535f50')
      stone.addColorStop(0.36, '#39463c')
      stone.addColorStop(1, '#202e26')
      context.beginPath()
      context.moveTo(x - radius, y)
      context.lineTo(x - radius * 0.75, y - radius * 0.72)
      context.lineTo(x + radius * 0.1, y - radius * 1.1)
      context.lineTo(x + radius * 0.76, y - radius * 0.6)
      context.lineTo(x + radius, y - radius * 0.1)
      context.closePath()
      context.fillStyle = stone
      context.fill()
      context.strokeStyle = 'rgba(183,191,151,.18)'
      context.lineWidth = 0.7 * scale
      context.beginPath()
      context.moveTo(x - radius * 0.66, y - radius * 0.68)
      context.lineTo(x + radius * 0.05, y - radius * 0.4)
      context.lineTo(x + radius * 0.5, y - radius * 0.1)
      context.stroke()
    }
    context.restore()
  }

  /** Broad Anubias rosettes, red stems and ribbon grass with gentle water movement. */
  export function drawPlantBed(context, width, height, time, scale, foreground) {
    var clusters = foreground ? [[0.015,0.98,0.3],[0.98,0.98,0.27]] :
      [[0.08,0.91,0.24],[0.17,0.91,0.3],[0.26,0.88,0.18],[0.86,0.9,0.25],[0.95,0.9,0.35]]
    for (var c = 0; c < clusters.length; c += 1) {
      var p = clusters[c]
      for (var i = 0; i < 12; i += 1) {
        var angle = (texture(i + c * 17) - 0.5) * 2.6
        var length = height * p[2] * (0.35 + texture(i + c * 11 + 66) * 0.65)
        var sway = Math.sin(time * 0.55 + i * 0.7 + c) * 0.035
        leaf(context, p[0] * width + (texture(i + 4) - 0.5) * 35 * scale, p[1] * height,
          length, length * (foreground ? 0.055 : 0.17), angle, foreground ? 0.4 : 0.65, sway)
      }
    }
    if (!foreground) {
      // A little red Rotala at the right gives the composition a warm accent.
      for (var stem = 0; stem < 9; stem += 1) {
        var x = width * (0.83 + stem * 0.017)
        var tall = height * (0.24 + texture(stem + 11) * 0.24)
        for (var j = 1; j <= 10; j += 1) {
          var y = height * 0.87 - j / 10 * tall
          var sway = Math.sin(time * 0.5 + stem) * j * scale * 0.2
          context.strokeStyle = '#6c6750'
          context.lineWidth = 0.7 * scale
          context.beginPath()
          context.moveTo(x, height * 0.87)
          context.lineTo(x + sway, y)
          context.stroke()
          for (var side = -1; side <= 1; side += 2) {
            context.fillStyle = paint(22 + j * 0.6, 27, 20 + j * 2.8, 0.94)
            context.beginPath()
            context.ellipse(x + sway + side * 5 * scale, y, (5 + texture(stem * 12 + j) * 4) * scale, 1.8 * scale, side * -0.5, 0, Math.PI * 2)
            context.fill()
          }
        }
      }
      // Low, small-leaved groundcover between rocks and the open sand.
      for (var tuft = 0; tuft < 100; tuft += 1) {
        var u = texture(tuft + 500)
        if (u > 0.32 && u < 0.76) continue
        var x = u * width
        var y = height * (0.9 + texture(tuft + 81) * 0.05)
        leaf(context, x, y, (7 + texture(tuft + 61) * 9) * scale, 3 * scale,
          (texture(tuft + 3) - 0.5) * 2, 0.7, 0)
      }
    }
  }

  /** Soft shadow a fish casts on the floor. */
