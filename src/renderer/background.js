import aquarium from '../../assets/aquarium-cinematic.jpg'

// The backdrop owns its own asynchronous asset state; the renderer can always
// use the procedural scene until an image has decoded successfully.
let image = null
let ready = false
export function drawBackdrop(context, width, height) {
  if (image === null && typeof Image !== 'undefined') {
    image = new Image()
    image.onload = () => { ready = true }
    image.onerror = () => { ready = false }
    image.src = aquarium
  }
  if (!ready || !image.naturalWidth || !image.naturalHeight) return false
  const fit = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const w = image.naturalWidth * fit
  const h = image.naturalHeight * fit
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
  return true
}
