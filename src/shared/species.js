  var FISH_HUES = [18, 38, 350, 52, 200, 288]

  /**
   * Drawable species. `depth` is body height over body length, `tail` and
   * `dorsal` select fin geometry, and `size` scales the whole fish against the
   * common growth curve.
   */
  var FISH_SPECIES = [
    {
      id: 'betta', size: 1.02, depth: 0.65, offset: 0, eyeX: 0.6, eyeY: -0.12,
      top: [[-1, -0.06], [-0.86, -0.22], [-0.62, -0.44], [-0.32, -0.62], [0.02, -0.68], [0.34, -0.64], [0.62, -0.5], [0.84, -0.3], [0.97, -0.1], [1, 0]],
      bottom: [[-1, 0.06], [-0.86, 0.22], [-0.6, 0.4], [-0.28, 0.54], [0.06, 0.58], [0.38, 0.54], [0.66, 0.42], [0.86, 0.24], [0.97, 0.08], [1, 0]],
    },
    {
      id: 'guppy', size: 0.82, depth: 0.52, offset: 0, eyeX: 0.58, eyeY: -0.1,
      top: [[-1, -0.05], [-0.86, -0.16], [-0.6, -0.28], [-0.3, -0.38], [0, -0.42], [0.3, -0.42], [0.6, -0.36], [0.82, -0.24], [0.96, -0.08], [1, 0]],
      bottom: [[-1, 0.05], [-0.86, 0.16], [-0.6, 0.28], [-0.28, 0.38], [0.06, 0.4], [0.4, 0.36], [0.68, 0.28], [0.84, 0.18], [0.96, 0.06], [1, 0]],
    },
    {
      id: 'angel', size: 1.25, depth: 0.9, offset: 0, eyeX: 0.56, eyeY: -0.5,
      top: [[-1, -0.05], [-0.78, -0.28], [-0.5, -0.62], [-0.18, -0.9], [0.15, -0.94], [0.45, -0.74], [0.72, -0.46], [0.9, -0.2], [1, -0.02]],
      bottom: [[-1, 0.06], [-0.82, 0.3], [-0.6, 0.6], [-0.3, 0.86], [0.05, 0.94], [0.4, 0.82], [0.7, 0.52], [0.9, 0.22], [1, 0.02]],
    },
    {
      id: 'tetra', size: 0.64, depth: 0.55, offset: 0, eyeX: 0.56, eyeY: -0.12,
      top: [[-1, -0.05], [-0.8, -0.16], [-0.5, -0.3], [-0.15, -0.4], [0.2, -0.44], [0.55, -0.4], [0.8, -0.28], [0.95, -0.12], [1, 0]],
      bottom: [[-1, 0.05], [-0.8, 0.18], [-0.55, 0.32], [-0.2, 0.44], [0.15, 0.46], [0.5, 0.4], [0.8, 0.26], [0.95, 0.12], [1, 0]],
    },
  ]

  // New indices append to the stored species list; the first four remain stable.
  FISH_SPECIES.push(Object.assign({}, FISH_SPECIES[2], { id: 'discus', size: 1.2 }))
  FISH_SPECIES.push(Object.assign({}, FISH_SPECIES[3], { id: 'ram', size: 0.9, depth: 0.8 }))

  for (var extraSpecies = 0; extraSpecies < 6; extraSpecies += 1) {
    FISH_SPECIES.push(Object.assign({}, FISH_SPECIES[extraSpecies === 4 ? 4 : extraSpecies === 5 ? 2 : 5], { id: ['acara','flame','pearl','arowana','goldDiscus','blackAngel'][extraSpecies], size: extraSpecies === 3 ? 1.7 : 1.0 }))
  }

  /** Collectible species use stable indices so older fish retain their appearance. */
  var SPECIES_INFO = [
    { key: 'betta', rarity: 0 }, { key: 'guppy', rarity: 0 },
    { key: 'angel', rarity: 0 }, { key: 'tetra', rarity: 0 },
    { key: 'discus', rarity: 0 }, { key: 'ram', rarity: 0 },
    { key: 'acara', rarity: 1 }, { key: 'flame', rarity: 1 },
    { key: 'pearl', rarity: 1 }, { key: 'arowana', rarity: 2 },
    { key: 'goldDiscus', rarity: 2 }, { key: 'blackAngel', rarity: 2 },
  ]
  var SECOND_CHAPTER = [
    { key: 'oscar', rarity: 1 }, { key: 'bichir', rarity: 1 },
    { key: 'tigerBarb', rarity: 0 }, { key: 'danio', rarity: 0 },
    { key: 'rainbow', rarity: 1 }, { key: 'cory', rarity: 0 },
  ]
  SECOND_CHAPTER.forEach(function (info) {
    SPECIES_INFO.push(info)
    FISH_SPECIES.push(Object.assign({}, FISH_SPECIES[5], { id: info.key }))
  })

const visualProfiles = [
  [1.1,.9,2.2,.045,.016], [.9,.9,4.1,.05,.012], [1.15,.7,2,.035,.016],
  [.62,1.2,5.4,.045,.01], [1.25,.7,2.25,.028,.012], [.86,.9,3.4,.04,.012],
  [1.05,.9,3.1,.04,.012], [.95,.9,3.1,.04,.012], [1.15,.8,2.8,.04,.012],
  [1.7,.7,2.2,.035,.011], [1.25,.7,2.25,.028,.012], [1.15,.7,2,.035,.016],
  [1.45,.8,2.7,.04,.012], [1.65,.75,2.6,.05,.012], [.8,1.1,4.4,.045,.01],
  [.65,1.2,5,.045,.01], [1.1,1,3.6,.04,.012], [.85,.8,3,.04,.012],
]
FISH_SPECIES.forEach((species, index) => {
  const [atlasScale, swimSpeed, frequency, tail, fin] = visualProfiles[index]
  Object.assign(species, {atlasScale, swimSpeed, motion: {frequency, tail, fin}})
})
export { FISH_HUES, FISH_SPECIES, SPECIES_INFO }
