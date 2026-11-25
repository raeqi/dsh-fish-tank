import { clamp, isNumber } from '../shared/math.js'
import { FISH_HUES, FISH_SPECIES, SPECIES_INFO } from '../shared/species.js'
import { STORAGE_KEY, STATE_VERSION, INITIAL_FISH, BIRTH_PELLETS, MAX_PELLETS, JOURNEY_TOKENS, COLLECTION_GUARANTEE } from './config.js'

  function naturalCount(value, fallback) {
    return isNumber(value) ? Math.max(0, Math.floor(value)) : fallback
  }

  /** New game progress starts at zero when opening an older tank. */
  function readGame(parsed, fish, random) {
    var saved = parsed && parsed.game && typeof parsed.game === 'object' ? parsed.game : {}
    var archive = Array.isArray(saved.archive) ? saved.archive.filter(isFish).map(function (item) { return normalizeFish(item, random) }) : []
    var discovered = Array.isArray(saved.discovered) ? saved.discovered.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < SPECIES_INFO.length }) : []
    fish.concat(archive).forEach(function (item) { if (discovered.indexOf(item.species) < 0) discovered.push(item.species) })
    var nursery = saved.nursery
    if (!(nursery && typeof nursery === 'object' && isNumber(nursery.readyAt) && isNumber(nursery.createdAt) && Number.isInteger(nursery.species) && nursery.species >= 0 && nursery.species < SPECIES_INFO.length)) nursery = null
    else nursery = { species: nursery.species, readyAt: nursery.readyAt, createdAt: nursery.createdAt,
      generation: naturalCount(nursery.generation, 1), parentIds: Array.isArray(nursery.parentIds) ? nursery.parentIds.filter(function (id) { return typeof id === 'string' }).slice(0, 2) : [], care: naturalCount(nursery.care, 0) }
    var garden = saved.garden && typeof saved.garden === 'object' ? saved.garden : {}
    return {
      chapter: saved.chapter === 2 || Array.from({ length: 12 }, function (_, index) { return index }).every(function (index) { return discovered.indexOf(index) >= 0 }) ? 2 : 1,
      hunting: saved.hunting === true,
      hunted: naturalCount(saved.hunted, 0),
      turtle: saved.turtle && isNumber(saved.turtle.unlockedAt) ? { unlockedAt: saved.turtle.unlockedAt, x: clamp(isNumber(saved.turtle.x) ? saved.turtle.x : 0.5, 0.08, 0.92), facing: saved.turtle.facing === -1 ? -1 : 1 } : null,
      journeyProgress: naturalCount(saved.journeyProgress, 0) % JOURNEY_TOKENS,
      tickets: naturalCount(saved.tickets, 0), visitPity: clamp(naturalCount(saved.visitPity, 0), 0, 9),
      collectionMisses: clamp(naturalCount(saved.collectionMisses, 0), 0, COLLECTION_GUARANTEE - 1),
      feedingBalance: !parsed || saved.feedingBalance === true,
      breedPity: clamp(naturalCount(saved.breedPity, 0), 0, 7),
      pairIds: Array.isArray(saved.pairIds) ? saved.pairIds.filter(function (id) { return typeof id === 'string' }).slice(0, 2) : [],
      nursery: nursery, archive: archive, discovered: discovered,
      unlockedExpansions: naturalCount(saved.unlockedExpansions, 0),
      births: naturalCount(saved.births, 0), visits: naturalCount(saved.visits, 0),
      garden: { growth: clamp(isNumber(garden.growth) ? garden.growth : 0.32, 0, 1), patches: clamp(naturalCount(garden.patches, 3), 3, 8), cuttings: naturalCount(garden.cuttings, 0), pruned: naturalCount(garden.pruned, 0) },
      journal: Array.isArray(saved.journal) ? saved.journal.filter(function (entry) { return entry && ['hatched','visitor','eggs','pruned','planted','chapter','turtle','hunted'].indexOf(entry.type) >= 0 && isNumber(entry.at) && (entry.species === undefined || (Number.isInteger(entry.species) && entry.species >= 0 && entry.species < SPECIES_INFO.length)) }).slice(-20) : [],
    }
  }

  /** Deterministic speckle and pebble layout, generated once so frames do not flicker. */
  export function defaultStorage() {
    try { return typeof localStorage === 'undefined' ? null : localStorage }
    catch (error) { console.error('[fish-tank] 无法访问浏览器存储', error); return null }
  }

  export function createId(prefix, random) {
    return prefix + '-' + Math.floor(random() * 1000000000).toString(36)
  }

  export function createBubbles(random) {
    var bubbles = []
    for (var index = 0; index < 8; index += 1) {
      bubbles.push({
        x: 0.05 + random() * 0.9,
        y: 0.3 + random() * 0.6,
        r: 0.8 + random() * 1.5,
        speed: 0.012 + random() * 0.02,
        phase: random() * Math.PI * 2,
      })
    }
    return bubbles
  }

  function isFish(value) {
    return value !== null && typeof value === 'object'
      && isNumber(value.x) && isNumber(value.y)
      && isNumber(value.growth) && isNumber(value.hunger)
  }

  function normalizeFish(value, random) {
    return {
      id: typeof value.id === 'string' ? value.id : createId('fish', random),
      x: clamp(isNumber(value.x) ? value.x : 0.5, 0.05, 0.95),
      y: clamp(isNumber(value.y) ? value.y : 0.4, 0.08, 0.84),
      angle: isNumber(value.angle) ? value.angle : 0,
      growth: clamp(isNumber(value.growth) ? value.growth : 0.2, 0, 1),
      hunger: clamp(isNumber(value.hunger) ? value.hunger : 0.4, 0, 1),
      hue: isNumber(value.hue) ? ((value.hue % 360) + 360) % 360 : FISH_HUES[0],
      species: clamp(Math.floor(isNumber(value.species) ? value.species : random() * FISH_SPECIES.length), 0, FISH_SPECIES.length - 1),
      seed: isNumber(value.seed) ? value.seed : Math.floor(random() * 9973),
      starvingSince: isNumber(value.starvingSince) ? value.starvingSince : null,
      generation: naturalCount(value.generation, 0),
      origin: ['bred', 'visitor', 'starter'].indexOf(value.origin) >= 0 ? value.origin : 'starter',
      lastHuntAt: isNumber(value.lastHuntAt) ? value.lastHuntAt : 0,
      facing: Math.cos(value.angle || 0) < 0 ? -1 : 1,
    }
  }

  export function newFish(random, overrides) {
    var base = {
      id: createId('fish', random),
      x: 0.28 + random() * 0.44,
      y: 0.3 + random() * 0.36,
      angle: (random() - 0.5) * 0.9,
      growth: 0.18 + random() * 0.3,
      hunger: 0.25 + random() * 0.4,
      hue: FISH_HUES[Math.floor(random() * FISH_HUES.length)],
      species: Math.floor(random() * FISH_SPECIES.length),
      seed: Math.floor(random() * 9973),
      starvingSince: null,
      biteAt: 0,
      generation: 0,
      origin: 'starter',
      lastHuntAt: 0,
    }
    var fish = base
    if (overrides !== undefined) {
      for (var key in overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) fish[key] = overrides[key]
      }
    }
    return fish
  }

  export function freshState(nowMs, random) {
    var fish = []
    for (var index = 0; index < INITIAL_FISH; index += 1) {
      fish.push(newFish(random, {
        x: 0.28 + random() * 0.44,
        y: 0.3 + random() * 0.36,
        growth: 0.18 + random() * 0.3,
        hunger: 0.25 + random() * 0.4,
        species: [4, 1, 2][index],
      }))
    }
    return {
      _fresh: true,
      fish: fish,
      game: readGame(null, fish, random),
      accountMeter: null,
      ownerId: null,
      pellets: [],
      ripples: [],
      bubbles: createBubbles(random),
      ghosts: [],
      splashes: [],
      sparkles: [],
      reserve: 0,
      tokenSeen: {},
      tokensCounted: 0,
      tokenRemainder: 0,
      autoFed: 0,
      manualFed: 0,
      birthProgress: 0,
      lastBirthAt: 0,
      lastStepAt: nowMs,
      updatedAt: nowMs,
    }
  }

  /**
   * Read one stored tank, or start a fresh one. Stored hunger is left as of the
   * last save; the first catch-up advances it.
   * @param storage - Web Storage, or null when unavailable.
   * @param nowMs - current time in milliseconds.
   * @param random - source of randomness for a fresh tank.
   * @returns validated tank state.
   */
  /**
   * Validate one stored tank object into live state.
   * @param parsed - parsed JSON from browser storage or the Host tank file.
   * @param nowMs - current time in milliseconds.
   * @param random - randomness for rebuilt scene decoration.
   * @returns the restored state, or null when the object is not a tank.
   */
  export function storedState(parsed, nowMs, random) {
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.fish) || (isNumber(parsed.version) && parsed.version > STATE_VERSION)) return null
    var fish = []
    for (var index = 0; index < parsed.fish.length; index += 1) {
      if (isFish(parsed.fish[index])) fish.push(normalizeFish(parsed.fish[index], random))
    }
    if (!(fish.length > 0 || parsed.version === 2 || parsed.version === STATE_VERSION)) return null
    var tokenSeen = {}
    if (parsed.tokenSeen !== null && typeof parsed.tokenSeen === 'object') {
      var ids = Object.keys(parsed.tokenSeen)
      for (var seenIndex = 0; seenIndex < ids.length; seenIndex += 1) {
        var seen = parsed.tokenSeen[ids[seenIndex]]
        if (isNumber(seen) && seen >= 0) tokenSeen[ids[seenIndex]] = seen
      }
    }
    return {
      ownerId: typeof parsed.ownerId === 'string' ? parsed.ownerId : null,
      legacyRaw: parsed.version === STATE_VERSION ? null : JSON.stringify(parsed),
      game: readGame(parsed, fish, random),
      accountMeter: parsed.accountMeter && typeof parsed.accountMeter.id === 'string' && isNumber(parsed.accountMeter.total) ? { id: parsed.accountMeter.id, total: parsed.accountMeter.total } : null,
      fish: fish,
      _fresh: false,
      pellets: Array.isArray(parsed.pellets) ? parsed.pellets.filter(function (p) { return p && isNumber(p.x) && isNumber(p.y) && isNumber(p.wobble) }).slice(0, MAX_PELLETS).map(function (p) { return { id: typeof p.id === 'string' ? p.id : createId('food', random), x: clamp(p.x, 0.05, 0.95), y: clamp(p.y, 0.05, 0.9), wobble: p.wobble } }) : [],
      ripples: [],
      bubbles: createBubbles(random),
      ghosts: [],
      splashes: [],
      sparkles: [],
      reserve: isNumber(parsed.reserve) ? Math.max(0, Math.floor(parsed.reserve)) : 0,
      tokenSeen: tokenSeen,
      tokensCounted: isNumber(parsed.tokensCounted) ? Math.max(0, parsed.tokensCounted) : 0,
      tokenRemainder: isNumber(parsed.tokenRemainder) ? Math.max(0, parsed.tokenRemainder) : 0,
      autoFed: isNumber(parsed.autoFed) ? Math.max(0, Math.floor(parsed.autoFed)) : 0,
      manualFed: isNumber(parsed.manualFed) ? Math.max(0, Math.floor(parsed.manualFed)) : 0,
      birthProgress: isNumber(parsed.birthProgress)
        ? clamp(Math.floor(parsed.birthProgress), 0, BIRTH_PELLETS)
        : 0,
      lastBirthAt: isNumber(parsed.lastBirthAt) ? parsed.lastBirthAt : 0,
      lastStepAt: nowMs,
      updatedAt: isNumber(parsed.updatedAt) ? parsed.updatedAt : nowMs,
    }
  }

  export function readState(storage, nowMs, random) {
    var raw = null
    var readFailed = false
    if (storage !== null) {
      try { raw = storage.getItem(STORAGE_KEY) }
      catch (error) { readFailed = true; console.error('[fish-tank] 无法读取本机鱼缸', error) }
    }
    if (raw !== null && raw !== '') {
      try {
        var restored = storedState(JSON.parse(raw), nowMs, random)
        if (restored !== null) {
          if (restored.legacyRaw) restored.legacyRaw = raw
          return { state: restored, found: true, sourceRaw: raw, readOnly: false }
        }
      } catch (error) { console.error('[fish-tank] 本机鱼缸数据无法解析，保留原数据', error) }
    }
    return { state: freshState(nowMs, random), found: false, sourceRaw: raw, readOnly: readFailed || (raw !== null && raw !== '') }
  }

  export function publicFish(fish) {
    return {
      id: fish.id,
      x: fish.x,
      y: fish.y,
      angle: fish.angle,
      growth: fish.growth,
      hunger: fish.hunger,
      hue: fish.hue,
      species: fish.species,
      seed: fish.seed,
      starvingSince: fish.starvingSince,
      generation: fish.generation,
      origin: fish.origin,
      lastHuntAt: fish.lastHuntAt,
    }
  }

  export function normalizeAngle(angle) {
    if (!isNumber(angle)) return 0
    return Math.atan2(Math.sin(angle), Math.cos(angle))
  }

  /**
   * Sum the durable token usage of one Session-list row.
   * @param value - the row's `tokenUsage` projection view, when present.
   * @returns total input, output, and cache tokens.
   */
  export function usageTotal(value) {
    if (value === null || typeof value !== 'object') return 0
    var total = 0
    var fields = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
    for (var index = 0; index < fields.length; index += 1) {
      if (isNumber(value[fields[index]])) total += value[fields[index]]
    }
    return total
  }

  /**
   * Create the tank store over one storage.
   * @param options - optional storage, clock, and randomness (tests supply them).
   * @returns store with token intake, catch-up, feeding, stepping, and saving.
   */
