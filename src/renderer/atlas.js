import artworkSource from '../../assets/tropical-fish-atlas.webp'
import rareArtworkSource from '../../assets/rare-fish-atlas.webp'
import chapterArtworkSource from '../../assets/chapter-two.webp'
import plantSource from '../../assets/aquatic-leaves.webp'
import metadata from '../../assets/tropical-fish-atlas.json'
import chapter from '../../assets/chapter-two.json'

export { artworkSource, rareArtworkSource, chapterArtworkSource }
export const fishFrames = metadata.frames
export const chapterAtlasSize = [chapter.width, chapter.height]
const sources = [artworkSource, rareArtworkSource, chapterArtworkSource, plantSource]
const images = [null, null, null, null]
const ready = [false, false, false, false]

function loadAtlases(indices) {
  if (typeof Image === 'undefined') return
  for (const i of indices) {
    if (images[i] !== null) continue
    const index = i
    const image = images[index] = new Image()
    image.onload = () => { ready[index] = true }
    image.onerror = () => { console.error('[fish-tank] 图集加载失败，使用绘制回退') }
    image.src = sources[index]
  }
}

export function getFishAtlas(species = 0) {
  loadAtlases([0, 1, 2])
  const index = species >= 12 ? 2 : species >= 6 ? 1 : 0
  return ready[index] ? images[index] : null
}

export function getPlantAtlas() {
  loadAtlases([3])
  return ready[3] ? images[3] : null
}

export function getFishFrame(species) {
  const index = Math.max(0, Math.min(17, species | 0))
  if (index < 12) return fishFrames[index % 6]
  const chapterIndex = index - 12
  const w = chapter.width / chapter.columns
  const h = chapter.height / chapter.rows
  return [(chapterIndex % chapter.columns) * w, Math.floor(chapterIndex / chapter.columns) * h, w, h]
}
