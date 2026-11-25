import { texture } from './scenery.js'

const WIDTH = 1000
const HEIGHT = 560
const palettes = [
  ['#53674f', '#303c30', '#172b25', '#7c9154'],
  ['#667678', '#394c50', '#182e35', '#77a488'],
  ['#8a7051', '#4d4034', '#282c25', '#a5a661'],
]
let cachedTier = 0
let cachedLayer = null

// This is a static plane behind the fish. Rebuild only on a new habitat
// milestone, not as the fish move, grow or the tank is resized.
export function drawHabitat(context, width, height, tier = 0) {
  if (tier < 1 || typeof document === 'undefined') return
  if (cachedTier !== tier) {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const layer = canvas.getContext('2d')
    if (!layer) return
    paintHabitat(layer, tier)
    cachedTier = tier
    cachedLayer = canvas
  }
  context.drawImage(cachedLayer, 0, 0, width, height)
}

function paintHabitat(ctx, tier) {
  const style = (tier - 1) % palettes.length
  const colors = palettes[style]
  const center = 460 + texture(tier * 17) * 95
  const spread = .88 + texture(tier * 29) * .26
  const floor = 495
  const shadow = ctx.createRadialGradient(center, floor - 4, 5, center, floor - 4, 210)
  shadow.addColorStop(0, '#15261ec0')
  shadow.addColorStop(1, '#15261e00')
  ctx.save()
  ctx.translate(0, floor * .65)
  ctx.scale(1, .35)
  ctx.fillStyle = shadow
  ctx.fillRect(center - 210, floor - 210, 420, 420)
  ctx.restore()

  function stone(x, y, w, h, seed) {
    const ridge = w * (.32 + texture(seed) * .22)
    const gradient = ctx.createLinearGradient(x - w / 3, y - h, x + w, y)
    gradient.addColorStop(0, colors[0])
    gradient.addColorStop(.53, colors[1])
    gradient.addColorStop(1, colors[2])
    ctx.beginPath()
    ctx.moveTo(x - w, y)
    ctx.lineTo(x - w * .81, y - h * .51)
    ctx.lineTo(x - ridge, y - h * .91)
    ctx.lineTo(x + ridge * .56, y - h)
    ctx.lineTo(x + w * .78, y - h * .64)
    ctx.lineTo(x + w, y - h * .17)
    ctx.quadraticCurveTo(x + w * .18, y + h * .16, x - w, y)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.save()
    ctx.clip()
    for (let j = 0; j < 75; j += 1) {
      const point = seed * 133 + j * 3
      const u = texture(point)
      const v = texture(point + 1)
      ctx.fillStyle = j % 3 ? '#cfcea41c' : '#19251b48'
      ctx.fillRect(x + (u * 2 - 1) * w, y - v * h, 1 + texture(point + 2) * 3, .8)
    }
    ctx.restore()
  }

  if (style === 1) {
    // Offset shoulders and a dark recess, rather than a wall across the tank.
    ctx.fillStyle = colors[2]
    ctx.beginPath()
    ctx.ellipse(center, floor - 14, 96 * spread, 45, 0, 0, Math.PI * 2)
    ctx.fill()
    stone(center - 65 * spread, floor - 18, 77 * spread, 53, tier)
    stone(center + 58 * spread, floor - 9, 53 * spread, 79, tier + 2)
    stone(center - 4, floor - 53, 72 * spread, 24, tier + 4)
  } else if (style === 2) {
    // Branches echo the existing driftwood and leave gaps between their roots.
    for (let i = 0; i < 5; i += 1) {
      const tip = center + (i - 2) * 51 * spread
      const lift = 38 + texture(tier * 31 + i) * 54
      ctx.beginPath()
      ctx.moveTo(center + (i - 3) * 12, floor + 6)
      ctx.quadraticCurveTo((center + tip) / 2, floor - 12, tip, floor - lift)
      ctx.quadraticCurveTo((center + tip) / 2 + 4, floor - 3, center + i * 12, floor + 8)
      ctx.fillStyle = i % 2 ? colors[0] : colors[1]
      ctx.fill()
    }
    stone(center + 28, floor + 10, 64, 27, tier)
  } else {
    stone(center - 36, floor - 7, 92 * spread, 36, tier)
    stone(center + 32 * spread, floor - 2, 61, 25, tier + 2)
  }

  for (let i = 0; i < 4; i += 1) {
    const x = center + (i - 1.5) * 81 * spread
    const y = floor + 3 + texture(i + tier * 7) * 19
    stone(x, y, 7 + texture(tier * 23 + i) * 10, 5 + i % 3 * 2, tier + i + 10)
    for (let leaf = 0; leaf < 7; leaf += 1) {
      const skew = (leaf - 3) * 4.7
      const lift = 8 + texture(tier * 53 + i * 11 + leaf) * (style === 0 ? 32 : 20)
      ctx.fillStyle = leaf % 3 ? colors[3] : colors[0]
      ctx.beginPath()
      ctx.moveTo(x, y - 2)
      ctx.quadraticCurveTo(x + skew * .1, y - lift * .82, x + skew, y - lift)
      ctx.quadraticCurveTo(x + skew * .59 + 3, y - lift * .55, x, y - 2)
      ctx.fill()
    }
  }
}
