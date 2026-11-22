/** Refresh the inline atlas after replacing the source WebP or frame metadata. */
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const atlas = await readFile(new URL('assets/tropical-fish-atlas.webp', root))
const { frames } = JSON.parse(await readFile(new URL('assets/tropical-fish-atlas.json', root), 'utf8'))
const client = new URL('client.js', root)
let source = await readFile(client, 'utf8')
if (!source.includes('var FISH_ATLAS_SOURCE =') || !source.includes('var FISH_ATLAS_FRAMES =')) throw new Error('Atlas declarations missing')
source = source.replace(/var FISH_ATLAS_SOURCE = '[^']*'/, `var FISH_ATLAS_SOURCE = 'data:image/webp;base64,${atlas.toString('base64')}'`)
source = source.replace(/var FISH_ATLAS_FRAMES = [^\n]+/, `var FISH_ATLAS_FRAMES = ${JSON.stringify(frames)}`)
await writeFile(client, source)
