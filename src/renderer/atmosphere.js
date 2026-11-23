// Independent rendering passes: they consume only a 2D context, dimensions,
// and animation time. None can mutate the tank's simulation state.
export function drawWaterLight(ctx, width, height, time, reducedMotion = false) {
  const t = reducedMotion ? 0 : time
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.filter = 'blur(14px)'
  ctx.globalAlpha = .65
  for (let i = 0; i < 4; i += 1) {
    const x = width * (0.10 + i * 0.18) + Math.sin(t * .11 + i * 1.8) * width * .012
    const ray = ctx.createLinearGradient(x, 0, x + width * .13, height * .76)
    ray.addColorStop(0, 'rgba(243,255,204,.10)')
    ray.addColorStop(.48, 'rgba(205,243,188,.035)')
    ray.addColorStop(1, 'rgba(155,220,197,0)')
    ctx.fillStyle = ray
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + width * .08, 0)
    ctx.lineTo(x + width * .29, height * .76)
    ctx.lineTo(x + width * .08, height * .76)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export function drawWaterParticles(ctx, width, height, time, reducedMotion = false) {
  const t = reducedMotion ? 0 : time
  ctx.save()
  for (let i = 0; i < 35; i += 1) {
    const seed = (i * 137.508) % 360
    const x = ((seed / 360 + Math.sin(t * .08 + i) * .01) % 1) * width
    const y = ((i * .6180339 + t * (.0015 + i % 3 * .0004)) % .85 + .05) * height
    const radius = i % 9 === 0 ? 1.7 : .65 + (i % 3) * .22
    ctx.fillStyle = i % 9 === 0 ? 'rgba(210,247,215,.16)' : 'rgba(231,255,232,.23)'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawLensFinish(ctx, width, height) {
  ctx.save()
  const tint = ctx.createLinearGradient(0, 0, 0, height)
  tint.addColorStop(0, 'rgba(2,22,19,.02)')
  tint.addColorStop(.68, 'rgba(1,24,21,.025)')
  tint.addColorStop(1, 'rgba(2,13,13,.24)')
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, width, height)
  const edge = ctx.createRadialGradient(width * .5, height * .45, height * .25, width * .5, height * .48, Math.max(width, height) * .67)
  edge.addColorStop(0, 'rgba(0,12,12,0)')
  edge.addColorStop(1, 'rgba(0,9,9,.48)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
