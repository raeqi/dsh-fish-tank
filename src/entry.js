import { STORAGE_KEY, TOKENS_PER_PELLET, EXPANSION_TOKENS, BIRTH_PELLETS, MANUAL_FEED, HUNGER_RATE, STARVE_MS, HUNGRY, JOURNEY_TOKENS } from './core/config.js'
import { createStore } from './core/store.js'
import { usageTotal } from './core/state.js'
import { SPECIES_INFO } from './shared/species.js'
import { drawFish } from './renderer/fish.js'
import { drawScene, disposeWebGLFish } from './renderer/scene.js'
import { artworkSource, rareArtworkSource, chapterArtworkSource } from './renderer/atlas.js'
import { createPage } from './ui/page.js'
import { DICTS } from './ui/dictionaries.js'
export { STORAGE_KEY, TOKENS_PER_PELLET, EXPANSION_TOKENS, BIRTH_PELLETS, MANUAL_FEED, HUNGER_RATE, STARVE_MS, HUNGRY, JOURNEY_TOKENS, createStore, usageTotal, SPECIES_INFO, drawFish, drawScene, disposeWebGLFish }
export const getArtwork = () => artworkSource
export const getRareArtwork = () => rareArtworkSource
export const getChapterArtwork = () => chapterArtworkSource
window.__ModuleLoader__.load({
  id: '@local/dsh-fish-tank',
  factory(require) {
    const React = require('react')
    const core = { STORAGE_KEY, TOKENS_PER_PELLET, EXPANSION_TOKENS, BIRTH_PELLETS, MANUAL_FEED, HUNGER_RATE, STARVE_MS, HUNGRY, JOURNEY_TOKENS, createStore, usageTotal, SPECIES_INFO, drawFish, drawScene, disposeWebGLFish, getArtwork, getRareArtwork, getChapterArtwork }
    const createUi = createPage(React, core)
    return { inject: ['slots', 'locale'], apply(ctx) {
      const store = createStore()
      const ui = createUi(store)
      ctx.effect(() => ctx.locale.register('fishTank', DICTS), 'fish-tank: dictionaries')
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'fish-tank', locale: 'fishTank' }, ui.FishTankPage)), 'fish-tank: page')
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'fish-tank', order: 20, locale: 'fishTank', label: () => ctx.locale.bind('fishTank')('panel') }, ui.FishTankIcon)), 'fish-tank: sidebar entry')
    }}
  },
})
