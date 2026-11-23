import plantAsset from '../../assets/aquarium-foreground.png'

let plant = null
let ready = false
function getPlant() {
  if (plant === null && typeof Image !== 'undefined') {
    plant = new Image()
    plant.onload = () => { ready = true }
    plant.onerror = () => { ready = false }
    plant.src = plantAsset
  }
  return ready && plant.naturalWidth && plant.naturalHeight ? plant : null
}

// A separate foreground plane adds parallax/occlusion without affecting fish
// movement or any persisted tank state.
export function drawForeground(ctx, width, height, time, reducedMotion = false) {
  const image = getPlant()
  if (!image) return
  const t = reducedMotion ? 0 : time
  const plantWidth = Math.min(width * .30, height * .70)
  const plantHeight = plantWidth * image.naturalHeight / image.naturalWidth
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.globalAlpha = .78
    ctx.filter = 'blur(1px) brightness(.72) saturate(.85)'
    ctx.translate(side < 0 ? width * -.01 : width * 1.01, height * 1.08)
    ctx.scale(side < 0 ? 1 : -1, 1)
    ctx.rotate((reducedMotion ? 0 : Math.sin(t * .42 + side) * .018) * side)
    ctx.drawImage(image, -plantWidth * .32, -plantHeight, plantWidth, plantHeight)
    ctx.restore()
  }
}
