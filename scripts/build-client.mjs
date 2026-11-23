import { build } from 'esbuild'
await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  format: 'iife',
  globalName: 'DshFishTank',
  target: ['es2020'],
  outfile: 'client.js',
  loader: { '.webp': 'dataurl', '.jpg': 'dataurl', '.png': 'dataurl' },
  legalComments: 'none',
})
