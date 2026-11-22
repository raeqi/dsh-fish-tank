/** Refresh all inline WebP atlases after changing the source artwork. */
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const client = new URL('client.js', root)
let source = await readFile(client, 'utf8')
for (const [name, path] of [
  ['FISH_ATLAS_SOURCE', 'assets/tropical-fish-atlas.webp'],
  ['RARE_FISH_ATLAS_SOURCE', 'assets/rare-fish-atlas.webp'],
  ['PLANT_ATLAS_SOURCE', 'assets/aquatic-leaves.webp'],
]) {
  const pattern = new RegExp(`var ${name} = '[^']*'`)
  if (!pattern.test(source)) throw new Error(`Atlas declaration missing: ${name}`)
  const atlas = await readFile(new URL(path, root))
  source = source.replace(pattern, `var ${name} = 'data:image/webp;base64,${atlas.toString('base64')}'`)
}
const { frames } = JSON.parse(await readFile(new URL('assets/tropical-fish-atlas.json', root), 'utf8'))
source = source.replace(/var FISH_ATLAS_FRAMES = [^\n]+/, `var FISH_ATLAS_FRAMES = ${JSON.stringify(frames)}`)
await writeFile(client, source)
