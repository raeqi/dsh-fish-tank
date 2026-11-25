import { clamp, isNumber } from '../shared/math.js'
import { FISH_HUES, FISH_SPECIES, SPECIES_INFO } from '../shared/species.js'
import { defaultStorage, readState, freshState, storedState, createId, newFish, publicFish } from './state.js'
import { absorbTokens as applyTokens, creditRewards } from './ledger.js'
import { stepMotion } from './motion.js'
import { stepEffects } from './effects.js'
import { STORAGE_KEY, BACKUP_KEY, STATE_VERSION, BASE_SPACE, EXPANSION_TOKENS, MAX_PELLETS, EAT_HUNGER, GROWTH_PER_PELLET, BIRTH_PELLETS, BIRTH_COOLDOWN_MS, MANUAL_FEED, AUTO_FEED_GAP_MS, HUNGRY, HUNGER_RATE, STARVE_MS, AWAY_CAP_SECONDS, AWAY_STEP_SECONDS, HATCH_MS, COLLECTION_GUARANTEE, HABITAT_LEVELS } from './config.js'

  export function createStore(options) {
    var settings = options || {}
    var storage = settings.storage === undefined ? defaultStorage() : settings.storage
    var now = settings.now === undefined ? function () { return Date.now() } : settings.now
    var random = settings.random === undefined ? Math.random : settings.random
    var initial = readState(storage, now(), random)
    var state = initial.state
    var found = initial.found
    var localSourceRaw = initial.sourceRaw
    var localReadOnly = initial.readOnly
    var ready = false
    var saveFailed = false
    var lastAutoFeedAt = 0
    var notices = { died: 0, born: 0 }

    function tankSpace() {
      var expansions = Math.max(state.game.unlockedExpansions, Math.floor(state.tokensCounted / EXPANSION_TOKENS))
      state.game.unlockedExpansions = expansions
      var level = expansions + 1
      return { level: level, habitatTier: Math.floor(level / HABITAT_LEVELS), nextHabitatLevel: (Math.floor(level / HABITAT_LEVELS) + 1) * HABITAT_LEVELS,
        expansions: expansions, space: BASE_SPACE + expansions * 4,
        progress: state.tokensCounted % EXPANSION_TOKENS / EXPANSION_TOKENS,
        nextTokens: EXPANSION_TOKENS - state.tokensCounted % EXPANSION_TOKENS }
    }

    function summary() {
      var hunger = 0
      for (var index = 0; index < state.fish.length; index += 1) {
        hunger += state.fish[index].hunger
      }
      return {
        fish: state.fish.length,
        pellets: state.pellets.length,
        reserve: state.reserve,
        hunger: state.fish.length === 0 ? 0 : hunger / state.fish.length,
        tokens: state.tokensCounted,
        accountActive: !!state.accountMeter,
        autoFed: state.autoFed,
        manualFed: state.manualFed,
        tank: tankSpace(),
        game: gameSummary(),
        ready: ready,
        saved: !saveFailed,
      }
    }

    function createPellet(x, y) {
      return {
        id: createId('food', random),
        x: clamp(x, 0.05, 0.95),
        y: clamp(y, 0.05, 0.84),
        wobble: random() * Math.PI * 2,
      }
    }

    function releasePellet(x, y) {
      state.pellets.push(createPellet(x, y))
      if (state.pellets.length > MAX_PELLETS) {
        state.pellets.splice(0, state.pellets.length - MAX_PELLETS)
      }
      state.ripples.push({ x: clamp(x, 0.05, 0.95), y: clamp(y, 0.05, 0.9), age: 0 })
      for (var index = 0; index < 4; index += 1) {
        state.splashes.push({
          x: clamp(x, 0.05, 0.95),
          y: clamp(y, 0.05, 0.9),
          vx: (random() - 0.5) * 0.05,
          vy: -random() * 0.05,
          age: 0,
        })
      }
    }

    /**
     * Convert newly observed Session token usage into pellets.
     * The first value seen for a Session is a baseline and feeds nothing, so a
     * newly installed tank does not start with historical usage.
     * @param entries - current total usage per Session id.
     * @returns the pellets and tokens this call added.
     */
    function absorbTokens(entries) { return applyTokens(state, entries) }

    /** Account totals replace session estimates; first observation establishes the reward baseline. */
    function absorbAccountTotal(id, total) {
      if (typeof id !== 'string' || !isNumber(total) || total < 0 || Math.floor(total) !== total) return false
      if (state.accountMeter && state.accountMeter.id !== id) return false
      var prior = state.accountMeter
      var delta = prior ? Math.max(0, total - prior.total) : 0
      tankSpace()
      state.accountMeter = { id: id, total: prior ? Math.max(prior.total, total) : total }
      state.tokensCounted = state.accountMeter.total
      if (delta > 0) creditRewards(state, delta)
      return true
    }

    function record(type, stamp, species) {
      var entry = { type: type, at: stamp }
      if (species !== undefined) entry.species = species
      state.game.journal.push(entry)
      if (state.game.journal.length > 20) state.game.journal.shift()
    }

    function discover(fish) {
      if (state.game.discovered.indexOf(fish.species) < 0) state.game.discovered.push(fish.species)
      checkProgress(now())
    }

    function checkProgress(stamp) {
      if (state.game.chapter === 1 && Array.from({ length: 12 }, function (_, index) { return index }).every(function (index) { return state.game.discovered.indexOf(index) >= 0 })) {
        state.game.chapter = 2
        record('chapter', stamp)
        notices.chapter = (notices.chapter || 0) + 1
      }
      if (!state.game.turtle && state.game.births >= 3 && state.game.garden.patches >= 5 && state.tokensCounted >= 1000000) {
        state.game.turtle = { unlockedAt: stamp, x: 0.5, facing: 1 }
        record('turtle', stamp)
        notices.turtle = (notices.turtle || 0) + 1
      }
    }

    function setHunting(enabled) {
      if (state.game.chapter < 2) return false
      state.game.hunting = enabled === true
      return true
    }

    /** Predation is live-only and protects adults, rare fish and the original residents. */
    function prepareHunts(stamp) {
      var byId = new Map()
      state.fish.forEach(function (fish) { byId.set(fish.id, fish) })
      var fleeing = new Map()
      state.fish.forEach(function (predator) {
        var allowed = state.game.hunting && state.game.chapter >= 2 && state.fish.length >= 16
          && (predator.species === 12 || predator.species === 13) && predator.growth >= 0.85 && predator.hunger >= 0.55
          && stamp - predator.lastHuntAt >= 3600000 && state.pellets.length === 0
        var prey = predator.huntTarget ? byId.get(predator.huntTarget) : null
        function vulnerable(fish) { return fish && fish.id !== predator.id && fish.origin === 'bred' && fish.growth <= 0.3 && SPECIES_INFO[fish.species].rarity === 0 }
        if (!allowed) { predator.huntTarget = null; return }
        if (!vulnerable(prey) && stamp - (predator.huntCheckedAt || 0) >= 10000) {
          predator.huntCheckedAt = stamp
          var best = Infinity
          state.fish.forEach(function (fish) { if (!vulnerable(fish)) return; var d = (fish.x - predator.x) ** 2 + (fish.y - predator.y) ** 2; if (d < best) { best = d; prey = fish } })
        }
        predator.huntTarget = vulnerable(prey) ? prey.id : null
        if (predator.huntTarget) fleeing.set(prey.id, predator)
      })
      return { byId: byId, fleeing: fleeing }
    }

    function moveTurtle(dt, stamp) {
      var turtle = state.game.turtle
      if (!turtle) return
      var goal = 0.5 + Math.sin(stamp / 1000 * 0.045) * 0.32
      var nearest = -1, best = Infinity
      for (var i = 0; i < state.pellets.length; i += 1) {
        if (state.pellets[i].y < 0.78) continue
        var distance = Math.abs(state.pellets[i].x - turtle.x)
        if (distance < best) { best = distance; nearest = i; goal = state.pellets[i].x }
      }
      var delta = clamp(goal - turtle.x, -0.014 * dt, 0.014 * dt)
      if (Math.abs(delta) > 0.000001) turtle.facing = delta < 0 ? -1 : 1
      turtle.x = clamp(turtle.x + delta, 0.08, 0.92)
      if (nearest >= 0 && best < 0.025) { state.pellets.splice(nearest, 1); state.game.garden.growth = clamp(state.game.garden.growth + 0.004, 0, 1) }
    }

    function eligiblePair() {
      var adults = state.fish.filter(function (fish) { return fish.growth >= 0.85 && fish.hunger <= 0.78 })
      var previous = state.game.pairIds.map(function (id) { return adults.find(function (fish) { return fish.id === id }) })
      if (previous.length === 2 && previous[0] && previous[1] && previous[0] !== previous[1]) return previous
      if (adults.length < 2) return []
      for (var a = 0; a < adults.length; a += 1) {
        for (var b = a + 1; b < adults.length; b += 1) {
          if (adults[a].species === adults[b].species) return [adults[a], adults[b]]
        }
      }
      return adults.slice(0, 2)
    }

    /** Fixed odds plus a visible guarantee; the draw is saved with the egg. */
    function offspringSpecies(pair) {
      var rareParents = pair.filter(function (fish) { return SPECIES_INFO[fish.species].rarity > 0 })
      var result
      if (rareParents.length && random() < 0.5) result = rareParents[Math.floor(random() * rareParents.length)].species
      else {
        var roll = random()
        if (roll < 0.02) result = 9 + Math.floor(random() * 3)
        else if (roll < 0.18 || state.game.breedPity >= 7) result = 6 + Math.floor(random() * 3)
        else {
          var commonParents = pair.filter(function (fish) { return SPECIES_INFO[fish.species].rarity === 0 })
          result = commonParents.length ? commonParents[Math.floor(random() * commonParents.length)].species : Math.floor(random() * 6)
        }
      }
      state.game.breedPity = SPECIES_INFO[result].rarity > 0 ? 0 : state.game.breedPity + 1
      return result
    }

    function nurture(fish, stamp) {
      var nursery = state.game.nursery
      if (nursery) {
        if (nursery.parentIds.indexOf(fish.id) >= 0 && nursery.readyAt > stamp) {
          nursery.readyAt = Math.max(nursery.createdAt + 60000, nursery.readyAt - 120000)
          nursery.care += 1
        }
        return
      }
      var pair = eligiblePair()
      if (pair.length < 2) return
      var ids = pair.map(function (item) { return item.id })
      if (ids.join('|') !== state.game.pairIds.join('|')) {
        state.game.pairIds = ids
        state.birthProgress = 0
      }
      if (ids.indexOf(fish.id) < 0) return
      state.birthProgress = Math.min(BIRTH_PELLETS, state.birthProgress + 1)
      if (state.birthProgress < BIRTH_PELLETS || (state.lastBirthAt > 0 && stamp - state.lastBirthAt < BIRTH_COOLDOWN_MS)) return
      var bonus = (state.game.garden.patches - 3) * 0.04
      state.game.nursery = {
        species: offspringSpecies(pair), createdAt: stamp, readyAt: stamp + HATCH_MS * (1 - bonus),
        generation: Math.max(pair[0].generation, pair[1].generation) + 1, parentIds: ids, care: 0,
      }
      state.birthProgress = 0
      state.lastBirthAt = stamp
      record('eggs', stamp)
    }

    function hatch(stamp) {
      var egg = state.game.nursery
      if (!egg || stamp < egg.readyAt) return false
      var baby = newFish(random, { growth: 0.08, hunger: 0.3, species: egg.species, generation: egg.generation, origin: 'bred' })
      state.fish.push(baby)
      state.game.nursery = null
      state.game.births += 1
      discover(baby)
      state.sparkles.push({ x: baby.x, y: baby.y, age: 0, hue: SPECIES_INFO[baby.species].rarity > 0 ? 45 : baby.hue })
      record('hatched', stamp, baby.species)
      notices.born += 1
      return true
    }

    function growGarden(seconds) {
      state.game.garden.growth = clamp(state.game.garden.growth + seconds / 86400 * 0.18, 0, 1)
    }

    function visitorSpecies() {
      var roll = random()
      var rarity = roll < 0.03 ? 2 : roll < 0.25 || state.game.visitPity >= 9 ? 1 : 0
      var firstCollection = state.game.chapter === 1
      var all = SPECIES_INFO.map(function (_, index) { return index })
      var candidates = all.filter(function (index) {
        return SPECIES_INFO[index].rarity === rarity && (firstCollection ? index < 12 : rarity === 2 ? index >= 9 && index < 12 : index >= 12)
      })
      var missing = candidates.filter(function (index) { return state.game.discovered.indexOf(index) < 0 })
      if (firstCollection && missing.length === 0 && state.game.collectionMisses >= COLLECTION_GUARANTEE - 1) {
        missing = all.filter(function (index) { return index < 12 && state.game.discovered.indexOf(index) < 0 })
      }
      var pool = missing.length ? missing : candidates
      return pool[Math.floor(random() * pool.length)]
    }

    /** An earned ticket invites a fish; the tank does not impose a population cap. */
    function welcomeVisitor() {
      if (!ready || state.game.tickets < 1) return false
      var species = visitorSpecies()
      if (state.game.chapter === 1) {
        state.game.collectionMisses = state.game.discovered.indexOf(species) < 0 ? 0 : state.game.collectionMisses + 1
      }
      var visitor = newFish(random, { species: species, growth: 0.35 + random() * 0.3, hunger: 0.3, origin: 'visitor', generation: 0 })
      state.game.tickets -= 1
      state.game.visits += 1
      state.game.visitPity = SPECIES_INFO[species].rarity > 0 ? 0 : state.game.visitPity + 1
      state.fish.push(visitor)
      state.sparkles.push({ x: visitor.x, y: visitor.y, age: 0, hue: SPECIES_INFO[species].rarity > 0 ? 45 : 180 })
      discover(visitor)
      record('visitor', now(), species)
      return true
    }

    function archiveFish(id) {
      var index = state.fish.findIndex(function (fish) { return fish.id === id })
      if (index < 0) return false
      state.game.archive.push(state.fish.splice(index, 1)[0])
      if (state.game.pairIds.indexOf(id) >= 0) { state.game.pairIds = []; state.birthProgress = 0 }
      hatch(now())
      return true
    }

    function restoreFish(id) {
      var index = state.game.archive.findIndex(function (fish) { return fish.id === id })
      if (index < 0) return false
      var fish = state.game.archive.splice(index, 1)[0]
      fish.hunger = Math.min(fish.hunger, 0.5)
      fish.starvingSince = null
      fish.x = 0.4 + random() * 0.2
      fish.y = 0.4 + random() * 0.2
      state.fish.push(fish)
      discover(fish)
      return true
    }

    function prunePlants() {
      var garden = state.game.garden
      if (!ready || garden.growth < 0.75) return false
      garden.growth -= 0.4
      garden.cuttings += 1
      garden.pruned += 1
      record('pruned', now())
      return true
    }

    function plantCutting() {
      var garden = state.game.garden
      if (!ready || garden.cuttings < 1 || garden.patches >= 8) return false
      garden.cuttings -= 1
      garden.patches += 1
      record('planted', now())
      checkProgress(now())
      return true
    }

    function gameSummary() {
      var pair = eligiblePair()
      var egg = state.game.nursery
      var stamp = now()
      return {
        chapter: state.game.chapter, hunting: state.game.hunting, hunted: state.game.hunted, turtle: state.game.turtle ? Object.assign({}, state.game.turtle) : null,
        pair: pair.map(publicFish), bond: state.birthProgress,
        cooldown: state.lastBirthAt > 0 ? Math.max(0, BIRTH_COOLDOWN_MS - (stamp - state.lastBirthAt)) : 0,
        nursery: egg ? { remaining: Math.max(0, egg.readyAt - stamp), progress: clamp((stamp - egg.createdAt) / Math.max(1, egg.readyAt - egg.createdAt), 0, 1), waiting: false, care: egg.care } : null,
        journeyProgress: state.game.journeyProgress, tickets: state.game.tickets,
        visitPity: state.game.visitPity, collectionMisses: state.game.collectionMisses, breedPity: state.game.breedPity,
        discovered: state.game.discovered.slice(), archive: state.game.archive.map(publicFish), residents: state.fish.map(publicFish),
        garden: Object.assign({}, state.game.garden), journal: state.game.journal.slice(-4).reverse(),
        births: state.game.births, visits: state.game.visits,
      }
    }

    function eatFish(fish, nowMs, legacyMeal) {
      fish.hunger = clamp(fish.hunger - (legacyMeal ? 0.04 : EAT_HUNGER), 0, 1)
      fish.growth = clamp(fish.growth + (legacyMeal ? 0.04 : GROWTH_PER_PELLET), 0, 1)
      fish.starvingSince = null
      fish.biteAt = nowMs
      state.game.garden.growth = clamp(state.game.garden.growth + 0.002, 0, 1)
      nurture(fish, nowMs)
    }

    function hungerStep(fish, seconds, nowMs) {
      fish.hunger = clamp(fish.hunger + seconds * HUNGER_RATE, 0, 1)
      if (fish.hunger >= 1) {
        if (fish.starvingSince === null) fish.starvingSince = nowMs
      } else if (fish.hunger < 0.95) {
        fish.starvingSince = null
      }
    }

    function checkDeaths(nowMs, live) {
      for (var index = state.fish.length - 1; index >= 0; index -= 1) {
        var fish = state.fish[index]
        if (fish.starvingSince !== null && nowMs - fish.starvingSince >= STARVE_MS) {
          state.fish.splice(index, 1)
          notices.died += 1
          if (live) state.ghosts.push({ fish: fish, x: fish.x, y: fish.y, age: 0 })
        }
      }
    }

    /**
     * Resolve a span without animation: hunger, reserve feeding, growth, births,
     * and starvation. Used for the time the page was closed or suspended.
     */
    function simulateSpan(seconds, nowMs, legacyMeal) {
      var remaining = seconds
      var simNow = nowMs - seconds * 1000
      while (remaining > 0) {
        var slice = Math.min(AWAY_STEP_SECONDS, remaining)
        simNow += slice * 1000
        for (var hungry = 0; hungry < state.fish.length; hungry += 1) {
          hungerStep(state.fish[hungry], slice, simNow)
        }
        for (var fed = 0; fed < state.fish.length; fed += 1) {
          if (state.reserve >= 1 && state.fish[fed].hunger >= HUNGRY) {
            state.reserve -= 1
            state.autoFed += 1
            eatFish(state.fish[fed], simNow, legacyMeal)
          }
        }
        checkDeaths(simNow)
        growGarden(slice)
        hatch(simNow)
        remaining -= slice
      }
    }

    /**
     * Advance from the last save to now, converting stored and newly arrived
     * tokens into food first. Idempotent: later calls do nothing.
     * @param nowMs - current time in milliseconds.
     */
    function catchUp(nowMs) {
      if (ready) return
      ready = true
      var stamp = isNumber(nowMs) ? nowMs : now()
      var elapsed = state._fresh ? 0 : clamp((stamp - state.updatedAt) / 1000, 0, AWAY_CAP_SECONDS)
      state._fresh = false
      state.lastStepAt = stamp
      // Time before the upgrade is settled at the saved version's feeding pace.
      simulateSpan(elapsed, stamp, !state.game.feedingBalance)
      state.game.feedingBalance = true
      hatch(stamp)
      checkProgress(stamp)
    }

    /**
     * Advance the live tank: hunger over elapsed time, auto-feeding from the
     * reserve, fish movement, eating, births, and starvation.
     * @param nowMs - current time in milliseconds.
     * @returns settled events for this frame.
     */
    function step(nowMs) {
      var events = { ate: 0 }
      if (!ready) return events
      var stamp = isNumber(nowMs) ? nowMs : now()
      var elapsed = state.lastStepAt === 0 ? 0 : (stamp - state.lastStepAt) / 1000
      if (!(elapsed > 0)) elapsed = 0
      var dt = elapsed > 0.12 ? 0.12 : elapsed
      state.lastStepAt = stamp

      if (elapsed > 300) {
        // The page was hidden or suspended: settle the gap the same way as time away.
        simulateSpan(Math.min(elapsed, AWAY_CAP_SECONDS), stamp)
        dt = 0.12
      } else {
        for (var hungry = 0; hungry < state.fish.length; hungry += 1) {
          hungerStep(state.fish[hungry], elapsed, stamp)
        }
      }

      if (state.reserve >= 1 && state.pellets.length < MAX_PELLETS && stamp - lastAutoFeedAt >= AUTO_FEED_GAP_MS) {
        var hungryCount = 0
        for (var index = 0; index < state.fish.length; index += 1) {
          if (state.fish[index].hunger >= HUNGRY) hungryCount += 1
        }
        // Small tanks get one pellet at a time. Larger schools can share a
        // handful without waiting for every pellet to sink before the next.
        var targetPellets = Math.min(4, Math.ceil(hungryCount / 8))
        var count = Math.min(state.reserve, Math.max(0, targetPellets - state.pellets.length))
        if (count > 0) {
          state.reserve -= count
          state.autoFed += count
          for (var pellet = 0; pellet < count; pellet += 1) releasePellet(0.18 + random() * 0.64, 0.05)
          lastAutoFeedAt = stamp
        }
      }

      events.ate = stepMotion(state, stamp, dt, { prepareHunts, eatFish, record, notices })

      checkDeaths(stamp, true)
      growGarden(elapsed > 300 ? 0 : elapsed)
      hatch(stamp)
      checkProgress(stamp)
      moveTurtle(dt, stamp)

      stepEffects(state, stamp, dt, random)

      return events
    }

    /**
     * Hand-feed a pinch of pellets. Hand feeding is always available and never
     * spends the automatic reserve; the reserve only feeds the fish on its own.
     * @returns how many pellets were released.
     */
    function feed() {
      if (state.fish.length === 0) return 0
      for (var index = 0; index < MANUAL_FEED; index += 1) {
        releasePellet(0.15 + random() * 0.7, 0.045 + random() * 0.03)
      }
      state.manualFed += MANUAL_FEED
      return MANUAL_FEED
    }

    /**
     * Hand-drop one pellet at a point in the tank.
     * @param x - normalized horizontal position.
     * @param y - normalized vertical position.
     * @returns whether a pellet was released.
     */
    function dropFood(x, y) {
      if (state.fish.length === 0) return false
      if (!isNumber(x) || !isNumber(y)) return false
      releasePellet(x, y)
      state.manualFed += 1
      return true
    }

    /**
     * Put one starter fish into an empty tank.
     * @returns whether a fish was placed.
     */
    function placeFish() {
      if (state.fish.length > 0) return false
      var fish = newFish(random, {
        x: 0.4 + random() * 0.2,
        y: 0.35 + random() * 0.2,
        angle: (random() - 0.5) * 0.8,
        growth: 0.12,
        hunger: 0.35,
        hue: FISH_HUES[0],
        species: 0,
      })
      state.fish.push(fish)
      discover(fish)
      return true
    }

    /**
     * Take the death and birth counts since the previous call.
     * @returns counts to surface in the page.
     */
    function takeNotices() {
      var today = { died: notices.died, born: notices.born, hunted: notices.hunted || 0, turtle: notices.turtle || 0, chapter: notices.chapter || 0 }
      notices = { died: 0, born: 0 }
      return today
    }

    /** The portable tank snapshot: the file format the Host persists. */
    function snapshot() {
      return {
        version: STATE_VERSION,
        featureVersion: 2,
        updatedAt: now(),
        fish: state.fish.map(publicFish),
        pellets: state.pellets.map(function (pellet) { return Object.assign({}, pellet) }),
        game: JSON.parse(JSON.stringify(state.game)),
        ownerId: state.ownerId,
        accountMeter: state.accountMeter ? Object.assign({}, state.accountMeter) : null,
        reserve: state.reserve,
        tokenSeen: state.tokenSeen,
        tokensCounted: state.tokensCounted,
        tokenRemainder: state.tokenRemainder,
        autoFed: state.autoFed,
        manualFed: state.manualFed,
        birthProgress: state.birthProgress,
        lastBirthAt: state.lastBirthAt,
      }
    }

    function save() {
      if (storage === null || localReadOnly) {
        saveFailed = true
        return false
      }
      if (ready) step(now())
      var next = snapshot()
      try {
        if (storage.getItem(STORAGE_KEY) !== localSourceRaw) {
          saveFailed = true
          return false
        }
        if (state.legacyRaw) {
          if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, state.legacyRaw)
          state.legacyRaw = null
        }
        var nextRaw = JSON.stringify(next)
        storage.setItem(STORAGE_KEY, nextRaw)
        localSourceRaw = nextRaw
        state.updatedAt = next.updatedAt
        found = true
        saveFailed = false
        return true
      } catch (error) {
        saveFailed = true
        console.error('[fish-tank] 无法保存鱼缸', error)
        return false
      }
    }

    /**
     * Adopt a tank snapshot that is newer than the one held here, such as the
     * Host's file when this browser has no history.
     * @param candidate - parsed tank snapshot from the Host.
     * @returns whether the snapshot replaced the current tank.
     */
    function adopt(candidate, force) {
      var restored = storedState(candidate, now(), random)
      if (restored === null) return false
      if (!force && found && isNumber(candidate.updatedAt) && candidate.updatedAt <= state.updatedAt) return false
      state = restored
      found = true
      return true
    }

    function adoptScoped(id, candidate) {
      if (typeof id !== 'string' || (candidate && candidate.ownerId && candidate.ownerId !== id)) return false
      var changedOwner = state.ownerId !== id
      if (state.ownerId && changedOwner) { state = freshState(now(), random); found = false }
      var adopted = candidate ? adopt(candidate, changedOwner) : false
      state.ownerId = id
      return adopted || changedOwner
    }

    return {
      storageKey: STORAGE_KEY,
      isReady: function () { return ready },
      summary: summary,
      gameSummary: gameSummary,
      welcomeVisitor: welcomeVisitor,
      archiveFish: archiveFish,
      restoreFish: restoreFish,
      prunePlants: prunePlants,
      plantCutting: plantCutting,
      setHunting: setHunting,
      absorbTokens: absorbTokens,
      absorbAccountTotal: absorbAccountTotal,
      catchUp: catchUp,
      step: step,
      feed: feed,
      dropFood: dropFood,
      placeFish: placeFish,
      takeNotices: takeNotices,
      save: save,
      snapshot: snapshot,
      adopt: adopt,
      adoptScoped: adoptScoped,
      getScene: function () {
        return {
          fish: state.fish,
          tank: tankSpace(),
          garden: state.game.garden,
          nursery: state.game.nursery,
          turtle: state.game.turtle,
          pellets: state.pellets,
          ripples: state.ripples,
          bubbles: state.bubbles,
          ghosts: state.ghosts,
          splashes: state.splashes,
          sparkles: state.sparkles,
        }
      },
      getFish: function () {
        return state.fish.map(publicFish)
      },
    }
  }
