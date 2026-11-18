/**
 * Fish tank: a global sidebar entry whose page holds one animated tank.
 *
 * The simulation lives in `DshFishTank`, a page global with no React or DOM
 * dependency. Fish food comes from the token usage the Client already holds as
 * `tokenUsage` Session projections: a baseline is recorded per Session, later
 * growth is converted into pellets, and a reserve feeds the fish while the tank
 * is open or catching up on the time it was closed. Hand feeding stays a direct
 * action: it never spends that reserve. The component draws the scene on a
 * canvas and persists the tank in this browser's `localStorage`, so the tests
 * exercise the same code the browser loads.
 */
var DshFishTank = (function () {
  'use strict'

  var STORAGE_KEY = 'dsh.fish-tank.v1'
  var STATE_VERSION = 2
  var INITIAL_FISH = 3
  var MAX_FISH = 8
  var MAX_PELLETS = 12
  var TOKENS_PER_PELLET = 10000
  /** Hunger reaches full in one day, so one feeding a day keeps a fish fed. */
  var HUNGER_RATE = 1 / (24 * 3600)
  /** A fish at full hunger for this long dies. */
  var STARVE_MS = 72 * 3600 * 1000
  var FOOD_SINK_RATE = 0.018
  var EAT_RADIUS = 0.034
  var EAT_HUNGER = 0.32
  var GROWTH_PER_PELLET = 0.04
  var BIRTH_PELLETS = 8
  var BIRTH_COOLDOWN_MS = 12 * 3600 * 1000
  var MANUAL_FEED = 3
  var AUTO_FEED_GAP_MS = 5000
  var HUNGRY = 0.7
  var AWAY_CAP_SECONDS = 14 * 86400
  var AWAY_STEP_SECONDS = 900
  var FISH_HUES = [18, 38, 350, 52, 200, 288]

  function clamp(value, min, max) {
    if (value < min) return min
    if (value > max) return max
    return value
  }

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value)
  }

  function defaultStorage() {
    return typeof localStorage === 'undefined' ? null : localStorage
  }

  function createId(prefix, random) {
    return prefix + '-' + Math.floor(random() * 1000000000).toString(36)
  }

  function createBubbles(random) {
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
      starvingSince: isNumber(value.starvingSince) ? value.starvingSince : null,
    }
  }

  function freshState(nowMs, random) {
    var fish = []
    for (var index = 0; index < INITIAL_FISH; index += 1) {
      fish.push({
        id: createId('fish', random),
        x: 0.28 + random() * 0.44,
        y: 0.3 + random() * 0.36,
        angle: (random() - 0.5) * 0.9,
        growth: 0.18 + random() * 0.3,
        hunger: 0.25 + random() * 0.4,
        hue: FISH_HUES[index % FISH_HUES.length],
        starvingSince: null,
      })
    }
    return {
      fish: fish,
      pellets: [],
      ripples: [],
      bubbles: createBubbles(random),
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
  function readState(storage, nowMs, random) {
    var raw = null
    if (storage !== null) {
      try {
        raw = storage.getItem(STORAGE_KEY)
      } catch (error) {
        console.error('[fish-tank] 无法读取本机鱼缸', error)
      }
    }
    if (raw !== null && raw !== '') {
      try {
        var parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.fish)) {
          var fish = []
          for (var index = 0; index < parsed.fish.length; index += 1) {
            if (isFish(parsed.fish[index])) fish.push(normalizeFish(parsed.fish[index], random))
          }
          if (fish.length > 0 || parsed.version === STATE_VERSION) {
            var tokenSeen = {}
            if (parsed.tokenSeen !== null && typeof parsed.tokenSeen === 'object') {
              var ids = Object.keys(parsed.tokenSeen)
              for (var seenIndex = 0; seenIndex < ids.length; seenIndex += 1) {
                var seen = parsed.tokenSeen[ids[seenIndex]]
                if (isNumber(seen) && seen >= 0) tokenSeen[ids[seenIndex]] = seen
              }
            }
            return {
              fish: fish.slice(0, MAX_FISH),
              pellets: [],
              ripples: [],
              bubbles: createBubbles(random),
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
        }
      } catch (error) {
        console.error('[fish-tank] 本机鱼缸数据无法解析，本次从新鱼缸开始', error)
      }
    }
    return freshState(nowMs, random)
  }

  function publicFish(fish) {
    return {
      id: fish.id,
      x: fish.x,
      y: fish.y,
      angle: fish.angle,
      growth: fish.growth,
      hunger: fish.hunger,
      hue: fish.hue,
      starvingSince: fish.starvingSince,
    }
  }

  function normalizeAngle(angle) {
    var next = angle
    while (next > Math.PI) next -= Math.PI * 2
    while (next < -Math.PI) next += Math.PI * 2
    return next
  }

  /**
   * Sum the durable token usage of one Session-list row.
   * @param value - the row's `tokenUsage` projection view, when present.
   * @returns total input, output, and cache tokens.
   */
  function usageTotal(value) {
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
  function createStore(options) {
    var settings = options || {}
    var storage = settings.storage === undefined ? defaultStorage() : settings.storage
    var now = settings.now === undefined ? function () { return Date.now() } : settings.now
    var random = settings.random === undefined ? Math.random : settings.random
    var state = readState(storage, now(), random)
    var ready = false
    var saveFailed = false
    var lastAutoFeedAt = 0
    var notices = { died: 0, born: 0 }

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
        autoFed: state.autoFed,
        manualFed: state.manualFed,
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
    }

    /**
     * Convert newly observed Session token usage into pellets.
     * The first value seen for a Session is a baseline and feeds nothing, so a
     * newly installed tank does not start with historical usage.
     * @param entries - current total usage per Session id.
     * @returns the pellets and tokens this call added.
     */
    function absorbTokens(entries) {
      var delta = 0
      for (var index = 0; index < entries.length; index += 1) {
        var entry = entries[index]
        if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
        if (!isNumber(entry.total) || entry.total < 0) continue
        var seen = state.tokenSeen[entry.id]
        if (!isNumber(seen)) {
          state.tokenSeen[entry.id] = entry.total
          continue
        }
        if (entry.total > seen) {
          delta += entry.total - seen
          state.tokenSeen[entry.id] = entry.total
        } else if (entry.total < seen) {
          state.tokenSeen[entry.id] = entry.total
        }
      }
      var pelletBudget = state.tokenRemainder + delta
      var pellets = Math.floor(pelletBudget / TOKENS_PER_PELLET)
      state.tokenRemainder = pelletBudget - pellets * TOKENS_PER_PELLET
      state.reserve += pellets
      state.tokensCounted += delta
      return { pellets: pellets, tokens: delta }
    }

    function spawnBaby(nowMs) {
      if (state.fish.length >= MAX_FISH) return
      var hue = FISH_HUES[state.fish.length % FISH_HUES.length]
      state.fish.push({
        id: createId('fish', random),
        x: clamp(0.28 + random() * 0.44, 0.05, 0.95),
        y: clamp(0.32 + random() * 0.3, 0.08, 0.84),
        angle: (random() - 0.5) * 0.8,
        growth: 0.08,
        hunger: 0.45,
        hue: hue,
        starvingSince: null,
      })
      state.birthProgress = 0
      state.lastBirthAt = nowMs
      notices.born += 1
    }

    function eatFish(fish, nowMs) {
      fish.hunger = clamp(fish.hunger - EAT_HUNGER, 0, 1)
      fish.growth = clamp(fish.growth + GROWTH_PER_PELLET, 0, 1)
      fish.starvingSince = null
      if (fish.growth >= 0.95 && state.fish.length < MAX_FISH) {
        state.birthProgress = Math.min(BIRTH_PELLETS, state.birthProgress + 1)
        if (state.birthProgress >= BIRTH_PELLETS && nowMs - state.lastBirthAt >= BIRTH_COOLDOWN_MS) {
          spawnBaby(nowMs)
        }
      }
    }

    function hungerStep(fish, seconds, nowMs) {
      fish.hunger = clamp(fish.hunger + seconds * HUNGER_RATE, 0, 1)
      if (fish.hunger >= 1) {
        if (fish.starvingSince === null) fish.starvingSince = nowMs
      } else if (fish.hunger < 0.95) {
        fish.starvingSince = null
      }
    }

    function checkDeaths(nowMs) {
      for (var index = state.fish.length - 1; index >= 0; index -= 1) {
        var fish = state.fish[index]
        if (fish.starvingSince !== null && nowMs - fish.starvingSince >= STARVE_MS) {
          state.fish.splice(index, 1)
          notices.died += 1
        }
      }
    }

    /**
     * Resolve a span without animation: hunger, reserve feeding, growth, births,
     * and starvation. Used for the time the page was closed or suspended.
     */
    function simulateSpan(seconds, nowMs) {
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
            eatFish(state.fish[fed], simNow)
          }
        }
        checkDeaths(simNow)
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
      var elapsed = clamp((stamp - state.updatedAt) / 1000, 0, AWAY_CAP_SECONDS)
      state.lastStepAt = stamp
      simulateSpan(elapsed, stamp)
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

      if (state.reserve >= 1 && state.pellets.length === 0 && stamp - lastAutoFeedAt >= AUTO_FEED_GAP_MS) {
        var hungryFish = false
        for (var search = 0; search < state.fish.length; search += 1) {
          if (state.fish[search].hunger >= HUNGRY) { hungryFish = true; break }
        }
        if (hungryFish) {
          state.reserve -= 1
          state.autoFed += 1
          releasePellet(0.18 + random() * 0.64, 0.05)
          lastAutoFeedAt = stamp
        }
      }

      for (var pelletIndex = state.pellets.length - 1; pelletIndex >= 0; pelletIndex -= 1) {
        var pellet = state.pellets[pelletIndex]
        pellet.y += FOOD_SINK_RATE * dt
        pellet.wobble += dt * 2
        if (pellet.y > 0.9) state.pellets.splice(pelletIndex, 1)
      }

      var count = state.fish.length
      for (var index = 0; index < count; index += 1) {
        var fish = state.fish[index]
        var target = null
        var targetIndex = -1
        var best = Infinity
        if (fish.hunger > 0.1) {
          for (var food = 0; food < state.pellets.length; food += 1) {
            var dx = state.pellets[food].x - fish.x
            var dy = state.pellets[food].y - fish.y
            var distance = dx * dx + dy * dy
            if (distance < best) {
              best = distance
              target = state.pellets[food]
              targetIndex = food
            }
          }
        }
        if (target !== null) {
          var desired = Math.atan2(target.y - fish.y, target.x - fish.x)
          var difference = desired - fish.angle
          while (difference > Math.PI) difference -= Math.PI * 2
          while (difference < -Math.PI) difference += Math.PI * 2
          var limit = 3.2 * dt
          fish.angle += clamp(difference, -limit, limit)
        } else if (dt > 0) {
          fish.angle += (random() - 0.5) * 1.8 * dt
        }
        var speed = (0.035 + 0.028 * fish.growth) * (0.8 + fish.hunger * 0.7)
        fish.x += Math.cos(fish.angle) * speed * dt
        fish.y += Math.sin(fish.angle) * speed * dt * 0.6
        if (fish.x < 0.05) { fish.x = 0.05; fish.angle = Math.PI - fish.angle }
        if (fish.x > 0.95) { fish.x = 0.95; fish.angle = Math.PI - fish.angle }
        if (fish.y < 0.08) { fish.y = 0.08; fish.angle = -fish.angle }
        if (fish.y > 0.84) { fish.y = 0.84; fish.angle = -fish.angle }
        fish.angle = normalizeAngle(fish.angle)
        if (target !== null && best <= EAT_RADIUS * EAT_RADIUS) {
          state.pellets.splice(targetIndex, 1)
          eatFish(fish, stamp)
          state.ripples.push({ x: target.x, y: target.y, age: 0 })
          events.ate += 1
        }
      }

      checkDeaths(stamp)

      for (var rippleIndex = state.ripples.length - 1; rippleIndex >= 0; rippleIndex -= 1) {
        state.ripples[rippleIndex].age += dt
        if (state.ripples[rippleIndex].age > 0.9) state.ripples.splice(rippleIndex, 1)
      }

      for (var bubbleIndex = 0; bubbleIndex < state.bubbles.length; bubbleIndex += 1) {
        var bubble = state.bubbles[bubbleIndex]
        bubble.y -= bubble.speed * dt
        bubble.x += Math.sin(stamp / 1000 + bubble.phase) * 0.0006
        if (bubble.y < 0.08) {
          bubble.y = 0.9 + random() * 0.08
          bubble.x = 0.08 + random() * 0.84
        }
      }

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
      if (state.fish.length >= MAX_FISH || state.fish.length > 0) return false
      state.fish.push({
        id: createId('fish', random),
        x: 0.4 + random() * 0.2,
        y: 0.35 + random() * 0.2,
        angle: (random() - 0.5) * 0.8,
        growth: 0.12,
        hunger: 0.35,
        hue: FISH_HUES[0],
        starvingSince: null,
      })
      return true
    }

    /**
     * Take the death and birth counts since the previous call.
     * @returns counts to surface in the page.
     */
    function takeNotices() {
      var today = { died: notices.died, born: notices.born }
      notices = { died: 0, born: 0 }
      return today
    }

    function save() {
      if (storage === null) {
        saveFailed = true
        return false
      }
      var stamp = now()
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({
          version: STATE_VERSION,
          updatedAt: stamp,
          fish: state.fish.map(publicFish),
          reserve: state.reserve,
          tokenSeen: state.tokenSeen,
          tokensCounted: state.tokensCounted,
          tokenRemainder: state.tokenRemainder,
          autoFed: state.autoFed,
          manualFed: state.manualFed,
          birthProgress: state.birthProgress,
          lastBirthAt: state.lastBirthAt,
        }))
        state.updatedAt = stamp
        saveFailed = false
        return true
      } catch (error) {
        saveFailed = true
        console.error('[fish-tank] 无法保存鱼缸', error)
        return false
      }
    }

    return {
      storageKey: STORAGE_KEY,
      isReady: function () { return ready },
      summary: summary,
      absorbTokens: absorbTokens,
      catchUp: catchUp,
      step: step,
      feed: feed,
      dropFood: dropFood,
      placeFish: placeFish,
      takeNotices: takeNotices,
      save: save,
      getScene: function () {
        return { fish: state.fish, pellets: state.pellets, ripples: state.ripples, bubbles: state.bubbles }
      },
      getFish: function () {
        return state.fish.map(publicFish)
      },
    }
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    TOKENS_PER_PELLET: TOKENS_PER_PELLET,
    MAX_FISH: MAX_FISH,
    BIRTH_PELLETS: BIRTH_PELLETS,
    MANUAL_FEED: MANUAL_FEED,
    HUNGER_RATE: HUNGER_RATE,
    STARVE_MS: STARVE_MS,
    HUNGRY: HUNGRY,
    createStore: createStore,
    usageTotal: usageTotal,
  }
})()

window.__ModuleLoader__.load({
  id: '@local/dsh-fish-tank',
  factory(require) {
    var React = require('react')
    var h = React.createElement

    var NS = 'fishTank'
    var PANEL_ID = 'fish-tank'

    var DICTS = {
      zh: {
        panel: '鱼缸',
        title: '鱼缸',
        subtitle: '消耗的 token 会攒成储备自动喂鱼；也可以随时手动撒食。长期不来，储备不够鱼会饿死。',
        'action.feed': '投喂',
        'action.feedTitle': '随手撒一把鱼食（不消耗储备）',
        'tank.caption': '点击水面也能撒食',
        'stats.fish': '{count} 条鱼',
        'stats.reserve': '{count} 粒自动储备',
        'stats.hunger': '平均饥饿 {percent}%',
        'stats.full': '都吃饱了',
        'stats.hungry': '鱼群饿了',
        'stats.ratio': '每 {per} token 攒 1 粒鱼食',
        'stats.tokens': '鱼缸启用后累计 {tokens} token',
        'stats.fed': '自动投喂 {auto} 粒 · 手动投喂 {manual} 粒',
        'notice.died': '{count} 条鱼饿死了',
        'notice.born': '{count} 条小鱼出生了',
        'empty.title': '鱼缸空了',
        'empty.body': '鱼没能熬过这段时间。用 token 攒一些鱼食，再放一条新鱼苗吧。',
        'empty.action': '放入一条新鱼苗',
        'aria.tank': '鱼缸：{count} 条鱼在游动',
        'error.save': '无法在这个浏览器里保存鱼缸',
      },
      en: {
        panel: 'Fish tank',
        title: 'Fish tank',
        subtitle: 'Spent tokens build a reserve that feeds the fish automatically; you can also drop food by hand anytime. Stay away too long and the reserve may run out.',
        'action.feed': 'Feed',
        'action.feedTitle': 'Drop a pinch of food by hand (free)',
        'tank.caption': 'Click the water to drop food too',
        'stats.fish': '{count} fish',
        'stats.reserve': '{count} auto reserve',
        'stats.hunger': '{percent}% hungry on average',
        'stats.full': 'Everyone is full',
        'stats.hungry': 'The fish are hungry',
        'stats.ratio': 'Every {per} tokens earns one pellet',
        'stats.tokens': '{tokens} tokens since the tank started',
        'stats.fed': 'Auto-fed {auto} · hand-fed {manual}',
        'notice.died': '{count} fish starved',
        'notice.born': '{count} baby fish arrived',
        'empty.title': 'The tank is empty',
        'empty.body': 'The fish did not make it. Earn some food with tokens, then add a new fry.',
        'empty.action': 'Add a fry',
        'aria.tank': 'Fish tank with {count} swimming fish',
        'error.save': 'Couldn’t save the tank in this browser.',
      },
    }

    var STYLE = [
      '.dsw-fish-page{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:1.6}',
      '.dsw-fish-inner{display:flex;flex:1;flex-direction:column;gap:18px;width:100%;max-width:1040px;min-height:0;margin:0 auto;padding:28px clamp(24px,4vw,48px) 24px;box-sizing:border-box}',
      '.dsw-fish-heading{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.dsw-fish-heading-text{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dsw-fish-heading h1{margin:0;font-size:20px;line-height:28px;font-weight:500}',
      '.dsw-fish-subtitle{margin:0;max-width:60ch;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
      '.dsw-fish-feed{display:inline-flex;flex:none;align-items:center;gap:6px;height:32px;padding:0 14px;border:none;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-family:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}',
      '@media (hover:hover){.dsw-fish-feed:hover{background:var(--dsw-alias-button-primary-hover)}}',
      '.dsw-fish-feed:active{opacity:.9}',
      '.dsw-fish-feed:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsw-fish-feed:disabled{opacity:.4;cursor:not-allowed}',
      '.dsw-fish-tank{position:relative;flex:1;min-height:260px;overflow:hidden;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:#0f3e5f;cursor:crosshair}',
      '.dsw-fish-canvas{display:block;width:100%;height:100%}',
      '.dsw-fish-caption{position:absolute;left:50%;bottom:10px;max-width:calc(100% - 24px);padding:3px 10px;overflow:hidden;border-radius:10px;background:rgba(8,31,47,.5);color:#eaf6fb;font-size:12px;line-height:18px;white-space:nowrap;text-overflow:ellipsis;pointer-events:none;transform:translateX(-50%)}',
      '.dsw-fish-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;box-sizing:border-box;text-align:center;background:rgba(8,31,47,.58);color:#eaf6fb}',
      '.dsw-fish-empty-title{margin:0;font-size:14px;line-height:20px;font-weight:500}',
      '.dsw-fish-empty-body{max-width:34ch;margin:0;color:rgba(234,246,251,.82);font-size:12px;line-height:18px}',
      '.dsw-fish-notice{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;font-size:12px;line-height:18px}',
      '.dsw-fish-notice-died{color:var(--dsw-alias-state-error-primary)}',
      '.dsw-fish-notice-born{color:var(--dsw-alias-state-success-primary)}',
      '.dsw-fish-stats{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsw-fish-dot{opacity:.6}',
      '.dsw-fish-hungry{color:var(--dsw-alias-state-warn-primary)}',
      '.dsw-fish-meta{display:flex;flex-direction:column;gap:4px;margin:0}',
      '.dsw-fish-rule{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsw-fish-error{margin:0;padding:6px 10px;border:0.5px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',
      '[data-platform=\'darwin\'] .dsw-fish-inner{padding-top:calc(28px + var(--dsh-frame-top-clearance, 0px))}',
      '@media (max-width:720px){.dsw-fish-inner{padding:20px 20px 16px;gap:14px}}',
    ].join('\n')

    function styleTag() {
      return h('style', { key: 'dsw-fish-style' }, STYLE)
    }

    function fishGlyph(size) {
      var dimension = size || 18
      return h('svg', {
        viewBox: '0 0 16 16', width: dimension, height: dimension, 'aria-hidden': true, focusable: false,
      },
      h('path', {
        d: 'M9.9 3.2c-2.5 0-4.5 1.5-5.4 3.6L2.1 5.2v5.6l2.4-1.6c.9 2.1 2.9 3.6 5.4 3.6 3.1 0 5.4-2.3 5.4-4.8S13 3.2 9.9 3.2Z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round',
      }),
      h('circle', { cx: 11.5, cy: 7.3, r: 0.8, fill: 'currentColor' }))
    }

    function flakeGlyph() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false,
      },
      h('circle', { cx: 5.2, cy: 6.6, r: 1.5, fill: 'currentColor' }),
      h('circle', { cx: 10.4, cy: 5.2, r: 1.2, fill: 'currentColor', opacity: 0.85 }),
      h('circle', { cx: 9.6, cy: 10.2, r: 1.7, fill: 'currentColor', opacity: 0.75 }))
    }

    function formatCount(value) {
      var rounded = Math.round(value)
      try {
        return new Intl.NumberFormat().format(rounded)
      } catch (error) {
        console.error('[fish-tank] 无法格式化数字', error)
        return String(rounded)
      }
    }

    function isFiniteNumber(value) {
      return typeof value === 'number' && isFinite(value)
    }

    /**
     * Read the durable token totals out of the Session list snapshot.
     * @param state - the `useSessions` list state, when available.
     * @returns one total per Session that carries a tokenUsage projection.
     */
    function tokenEntries(state) {
      var entries = []
      if (state === null || typeof state !== 'object' || state.byId === null || typeof state.byId !== 'object') {
        return entries
      }
      var ids = Array.isArray(state.ids) ? state.ids : Object.keys(state.byId)
      for (var index = 0; index < ids.length; index += 1) {
        var row = state.byId[ids[index]]
        var values = row && row.projectionValues
        var usage = values && values.tokenUsage
        if (usage === null || typeof usage !== 'object') continue
        entries.push({ id: ids[index], total: DshFishTank.usageTotal(usage) })
      }
      return entries
    }

    function selectAllSessions(state) {
      return state
    }

    function drawFish(context, fish, width, height, time, scale) {
      var rx = (10 + 15 * fish.growth) * scale
      var ry = rx * 0.55
      var x = fish.x * width
      var y = fish.y * height + Math.sin(time * 2.4 + fish.hue * 0.07) * 1.2 * scale
      var facing = Math.cos(fish.angle) < 0 ? -1 : 1
      var tailWag = Math.sin(time * 6 + fish.hue * 0.07) * ry * 0.35
      context.save()
      context.translate(x, y)
      context.scale(facing, 1)
      context.fillStyle = 'hsla(' + fish.hue + ', 72%, 58%, 0.95)'
      context.beginPath()
      context.moveTo(-rx * 0.72, 0)
      context.quadraticCurveTo(-rx * 1.25, -ry * 0.7 + tailWag, -rx * 1.7, -ry * 0.95 + tailWag)
      context.quadraticCurveTo(-rx * 1.35, 0, -rx * 1.7, ry * 0.95 + tailWag)
      context.quadraticCurveTo(-rx * 1.25, ry * 0.7 + tailWag, -rx * 0.72, 0)
      context.closePath()
      context.fill()
      context.fillStyle = 'hsla(' + fish.hue + ', 70%, 66%, 0.9)'
      context.beginPath()
      context.moveTo(-rx * 0.05, -ry * 0.72)
      context.quadraticCurveTo(rx * 0.05, -ry * 1.7, rx * 0.62, -ry * 0.55)
      context.closePath()
      context.fill()
      context.beginPath()
      context.moveTo(rx * 0.02, ry * 0.7)
      context.quadraticCurveTo(rx * 0.12, ry * 1.5, rx * 0.55, ry * 0.5)
      context.closePath()
      context.fill()
      var body = context.createLinearGradient(0, -ry, 0, ry)
      body.addColorStop(0, 'hsl(' + fish.hue + ', 82%, 74%)')
      body.addColorStop(1, 'hsl(' + fish.hue + ', 72%, 52%)')
      context.fillStyle = body
      context.beginPath()
      context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'hsla(' + fish.hue + ', 60%, 38%, 0.35)'
      context.lineWidth = Math.max(1, 1.2 * scale)
      context.beginPath()
      context.arc(rx * 0.25, 0, ry * 0.62, -0.8, 0.8)
      context.stroke()
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.arc(rx * 0.55, -ry * 0.18, ry * 0.3, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#1c2a33'
      context.beginPath()
      context.arc(rx * 0.6, -ry * 0.18, ry * 0.15, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = 'rgba(255,255,255,.9)'
      context.beginPath()
      context.arc(rx * 0.54, -ry * 0.24, ry * 0.06, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    function drawScene(context, view, scene, timeMs) {
      var width = view.width
      var height = view.height
      if (!(width > 0) || !(height > 0)) return
      var time = timeMs / 1000
      var scale = Math.min(width, height) / 420
      if (scale > 1.4) scale = 1.4
      if (scale < 0.4) scale = 0.4
      context.clearRect(0, 0, width, height)

      var water = context.createLinearGradient(0, 0, 0, height)
      water.addColorStop(0, '#6fc0d4')
      water.addColorStop(0.5, '#2b84ab')
      water.addColorStop(1, '#0c3454')
      context.fillStyle = water
      context.fillRect(0, 0, width, height)

      context.save()
      context.globalAlpha = 0.12
      context.fillStyle = '#f2fdff'
      for (var shaft = 0; shaft < 3; shaft += 1) {
        var baseX = width * (0.16 + shaft * 0.32) + Math.sin(time * 0.25 + shaft * 1.7) * width * 0.02
        context.beginPath()
        context.moveTo(baseX, 0)
        context.lineTo(baseX + width * 0.07, 0)
        context.lineTo(baseX + width * 0.19, height * 0.82)
        context.lineTo(baseX + width * 0.05, height * 0.82)
        context.closePath()
        context.fill()
      }
      context.restore()

      var sandTop = height * 0.85
      var sand = context.createLinearGradient(0, sandTop, 0, height)
      sand.addColorStop(0, '#d3b887')
      sand.addColorStop(1, '#8f7047')
      context.fillStyle = sand
      context.beginPath()
      context.moveTo(0, sandTop + 4)
      var step = Math.max(24, width / 24)
      for (var sx = 0; sx <= width + step; sx += step) {
        context.lineTo(sx, sandTop + Math.sin(sx * 0.018) * 3)
      }
      context.lineTo(width, height)
      context.lineTo(0, height)
      context.closePath()
      context.fill()

      var pebbles = [[0.07, 0.93, 4], [0.12, 0.97, 2.6], [0.18, 0.92, 3.4], [0.31, 0.96, 2.6], [0.44, 0.93, 4], [0.58, 0.97, 2.4], [0.71, 0.92, 3.2], [0.82, 0.96, 2.6], [0.93, 0.93, 4]]
      context.fillStyle = 'rgba(84, 62, 38, 0.22)'
      for (var pebble = 0; pebble < pebbles.length; pebble += 1) {
        context.beginPath()
        context.ellipse(pebbles[pebble][0] * width, pebbles[pebble][1] * height, pebbles[pebble][2] * scale * 1.6, pebbles[pebble][2] * scale, 0, 0, Math.PI * 2)
        context.fill()
      }

      var weeds = [[0.08, 0.2, 3.4], [0.115, 0.14, 2.6], [0.9, 0.22, 3.4], [0.945, 0.15, 2.4], [0.24, 0.1, 2.2]]
      context.save()
      context.lineCap = 'round'
      for (var weed = 0; weed < weeds.length; weed += 1) {
        var weedX = weeds[weed][0] * width
        var weedHeight = height * weeds[weed][1]
        var weedSway = Math.sin(time * 1.1 + weed * 1.4) * 6 * scale
        context.strokeStyle = 'rgba(46, 122, 92, 0.65)'
        context.lineWidth = weeds[weed][2] * scale
        context.beginPath()
        context.moveTo(weedX, height * 0.94)
        context.bezierCurveTo(weedX - 4 + weedSway, height * 0.94 - weedHeight * 0.5, weedX + 4 + weedSway, height * 0.94 - weedHeight * 0.8, weedX + weedSway, height * 0.94 - weedHeight)
        context.stroke()
      }
      context.restore()

      context.save()
      context.strokeStyle = 'rgba(228, 248, 255, 0.5)'
      context.lineWidth = Math.max(1, 1.1 * scale)
      for (var bubble = 0; bubble < scene.bubbles.length; bubble += 1) {
        context.beginPath()
        context.arc(scene.bubbles[bubble].x * width, scene.bubbles[bubble].y * height, (2 + scene.bubbles[bubble].r) * scale, 0, Math.PI * 2)
        context.stroke()
      }
      context.restore()

      for (var pellet = 0; pellet < scene.pellets.length; pellet += 1) {
        var pelletX = scene.pellets[pellet].x * width
        var pelletY = scene.pellets[pellet].y * height
        context.fillStyle = '#f3b45e'
        context.beginPath()
        context.arc(pelletX, pelletY, 2.6 * scale, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = 'rgba(122, 70, 21, 0.35)'
        context.beginPath()
        context.arc(pelletX + 1, pelletY + 1, 0.9 * scale, 0, Math.PI * 2)
        context.fill()
      }

      for (var fishIndex = 0; fishIndex < scene.fish.length; fishIndex += 1) {
        drawFish(context, scene.fish[fishIndex], width, height, time, scale)
      }

      for (var ripple = 0; ripple < scene.ripples.length; ripple += 1) {
        var age = scene.ripples[ripple].age / 0.9
        context.strokeStyle = 'rgba(255, 255, 255, ' + (0.55 * (1 - age)).toFixed(3) + ')'
        context.lineWidth = Math.max(1, 1.4 * scale)
        context.beginPath()
        context.arc(scene.ripples[ripple].x * width, scene.ripples[ripple].y * height, (4 + age * 26) * scale, 0, Math.PI * 2)
        context.stroke()
      }

      context.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      context.lineWidth = 1
      context.beginPath()
      for (var wave = 0; wave <= width; wave += 8) {
        context.lineTo(wave, 6 + Math.sin(wave * 0.05 + time) * 2)
      }
      context.stroke()
    }

    function createUi(store) {
      function FishTankIcon(props) {
        return fishGlyph(props && props.size)
      }

      function FishTankPage(props) {
        var t = props.t
        var sessions = typeof props.useSessions === 'function' ? props.useSessions(selectAllSessions) : null
        var statsState = React.useState(function () { return store.summary() })
        var stats = statsState[0]
        var setStats = statsState[1]
        var failedState = React.useState(false)
        var saveFailed = failedState[0]
        var setSaveFailed = failedState[1]
        var noticeState = React.useState(null)
        var notice = noticeState[0]
        var setNotice = noticeState[1]
        var hintState = React.useState(true)
        var showHint = hintState[0]
        var setShowHint = hintState[1]
        var publishedKeyRef = React.useRef('')
        var syncedRef = React.useRef(false)
        var canvasRef = React.useRef(null)
        var tankRef = React.useRef(null)

        function publish(force) {
          var next = store.summary()
          var key = [next.fish, next.pellets, next.reserve, Math.round(next.hunger * 100), next.tokens, next.autoFed, next.manualFed].join('|')
          var today = store.takeNotices()
          if (today.died > 0 || today.born > 0) {
            setNotice(today)
          }
          if (force || key !== publishedKeyRef.current) {
            publishedKeyRef.current = key
            setStats(next)
          }
        }

        function persist() {
          if (!store.isReady()) return
          if (store.save()) setSaveFailed(false)
          else setSaveFailed(true)
        }

        function finishCatchUp() {
          if (store.isReady()) return
          store.catchUp(Date.now())
          syncedRef.current = true
          persist()
          publish(true)
        }

        React.useEffect(function () {
          var added = store.absorbTokens(tokenEntries(sessions))
          syncedRef.current = true
          if (!store.isReady()) {
            if (sessions !== null && sessions.phase !== 'ready' && sessions.state !== 'error') return
            finishCatchUp()
            return
          }
          if (added.pellets > 0) {
            persist()
            publish(false)
          }
        }, [sessions])

        React.useEffect(function () {
          if (store.isReady()) return undefined
          var timer = setTimeout(function () {
            if (!store.isReady()) finishCatchUp()
          }, 4000)
          return function () { clearTimeout(timer) }
        }, [])

        React.useEffect(function () {
          if (notice === null) return undefined
          var timer = setTimeout(function () { setNotice(null) }, 12000)
          return function () { clearTimeout(timer) }
        }, [notice])

        React.useEffect(function () {
          var canvas = canvasRef.current
          var host = tankRef.current
          if (canvas === null || host === null) return undefined
          var context = canvas.getContext('2d')
          if (context === null) return undefined

          var view = { width: 1, height: 1, dpr: 1 }
          var frame = null
          var alive = true
          var lastPublish = 0
          var lastSave = 0
          var observer = null
          var raf = typeof window.requestAnimationFrame === 'function'
            ? function (callback) { return window.requestAnimationFrame(callback) }
            : function (callback) { return window.setTimeout(function () { callback(Date.now()) }, 16) }
          var stop = typeof window.cancelAnimationFrame === 'function'
            ? function (id) { window.cancelAnimationFrame(id) }
            : function (id) { window.clearTimeout(id) }

          function measure() {
            var rect = host.getBoundingClientRect()
            var width = rect.width || host.clientWidth || 1
            var height = rect.height || host.clientHeight || 1
            var dpr = window.devicePixelRatio || 1
            view = { width: Math.max(1, width), height: Math.max(1, height), dpr: dpr }
            canvas.width = Math.max(1, Math.round(view.width * dpr))
            canvas.height = Math.max(1, Math.round(view.height * dpr))
          }

          function tick() {
            if (!alive) return
            var nowMs = Date.now()
            if (store.isReady() && syncedRef.current) {
              store.step(nowMs)
              if (nowMs - lastPublish >= 400) {
                lastPublish = nowMs
                publish(false)
              }
              if (nowMs - lastSave >= 5000) {
                lastSave = nowMs
                persist()
              }
            }
            context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
            drawScene(context, view, store.getScene(), nowMs)
            frame = raf(tick)
          }

          measure()
          frame = raf(tick)
          if (typeof window.ResizeObserver === 'function') {
            observer = new window.ResizeObserver(measure)
            observer.observe(host)
          } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('resize', measure)
          }
          function onVisibility() {
            if (document.visibilityState === 'hidden' && store.isReady()) persist()
          }
          document.addEventListener('visibilitychange', onVisibility)

          return function () {
            alive = false
            if (frame !== null) stop(frame)
            if (observer !== null) observer.disconnect()
            else if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', measure)
            document.removeEventListener('visibilitychange', onVisibility)
            if (store.isReady()) persist()
          }
        }, [])

        function handleFeed() {
          if (store.feed() === 0) return
          setShowHint(false)
          persist()
          publish(true)
        }

        function handleTankClick(event) {
          if (stats.fish === 0) return
          var rect = event.currentTarget.getBoundingClientRect()
          if (!(rect.width > 0) || !(rect.height > 0)) return
          var x = (event.clientX - rect.left) / rect.width
          var y = (event.clientY - rect.top) / rect.height
          if (y >= 0.84) return
          if (!store.dropFood(x, y)) return
          setShowHint(false)
          persist()
          publish(true)
        }

        function handlePlaceFish() {
          if (!store.placeFish()) return
          persist()
          publish(true)
          setShowHint(true)
        }

        var hungry = stats.hunger >= DshFishTank.HUNGRY
        var full = stats.fish > 0 && stats.hunger <= 0.08
        var hungerLabel = hungry
          ? t('stats.hungry')
          : full ? t('stats.full') : t('stats.hunger', { percent: Math.round(stats.hunger * 100) })
        var canFeed = stats.fish > 0

        return h('div', { className: 'dsw-fish-page' },
          styleTag(),
          h('div', { className: 'dsw-fish-inner' },
            h('header', { className: 'dsw-fish-heading' },
              h('div', { className: 'dsw-fish-heading-text' },
                h('h1', null, t('title')),
                h('p', { className: 'dsw-fish-subtitle' }, t('subtitle', { per: formatCount(DshFishTank.TOKENS_PER_PELLET) }))),
              h('button', {
                type: 'button',
                className: 'dsw-fish-feed',
                title: t('action.feedTitle'),
                disabled: !canFeed,
                onClick: handleFeed,
              }, flakeGlyph(), h('span', null, t('action.feed')))),
            h('div', { className: 'dsw-fish-tank', ref: tankRef, onClick: handleTankClick },
              h('canvas', {
                ref: canvasRef,
                className: 'dsw-fish-canvas',
                role: 'img',
                'aria-label': t('aria.tank', { count: stats.fish }),
              }),
              showHint && stats.fish > 0
                && h('span', { className: 'dsw-fish-caption' }, t('tank.caption')),
              stats.fish === 0 && h('div', { className: 'dsw-fish-empty' },
                h('p', { className: 'dsw-fish-empty-title' }, t('empty.title')),
                h('p', { className: 'dsw-fish-empty-body' }, t('empty.body')),
                h('button', {
                  type: 'button',
                  className: 'dsw-fish-feed',
                  onClick: handlePlaceFish,
                }, t('empty.action')))),
            notice !== null && h('p', { className: 'dsw-fish-notice', role: 'status' },
              notice.died > 0 && h('span', { className: 'dsw-fish-notice-died' }, t('notice.died', { count: notice.died })),
              notice.born > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.born', { count: notice.born }))),
            saveFailed && h('p', { className: 'dsw-fish-error', role: 'alert' }, t('error.save')),
            h('div', { className: 'dsw-fish-stats' },
              h('span', null, t('stats.fish', { count: stats.fish })),
              h('span', { className: 'dsw-fish-dot', 'aria-hidden': true }, '·'),
              h('span', null, t('stats.reserve', { count: stats.reserve })),
              h('span', { className: 'dsw-fish-dot', 'aria-hidden': true }, '·'),
              h('span', { className: hungry ? 'dsw-fish-hungry' : undefined }, hungerLabel)),
            h('div', { className: 'dsw-fish-meta' },
              h('p', { className: 'dsw-fish-rule' },
                t('stats.ratio', { per: formatCount(DshFishTank.TOKENS_PER_PELLET) }),
                ' · ',
                t('stats.tokens', { tokens: formatCount(stats.tokens) })),
              h('p', { className: 'dsw-fish-rule' },
                t('stats.fed', { auto: formatCount(stats.autoFed), manual: formatCount(stats.manualFed) })))))
      }

      return { FishTankPage: FishTankPage, FishTankIcon: FishTankIcon }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        var store = DshFishTank.createStore()
        var ui = createUi(store)

        ctx.effect(function () {
          return ctx.locale.register(NS, DICTS)
        }, 'fish-tank: dictionaries')

        ctx.effect(function () {
          return ctx.slots.inject('main', function () {
            return ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, ui.FishTankPage)
          })
        }, 'fish-tank: page')

        ctx.effect(function () {
          return ctx.slots.inject('sidebar.panellist', function () {
            return ctx.slots.register({
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              locale: NS,
              label: function () { return ctx.locale.bind(NS)('panel') },
            }, ui.FishTankIcon)
          })
        }, 'fish-tank: sidebar entry')
      },
    }
  },
})
