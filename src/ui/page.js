import { STYLE } from './style.js'
import { tokenEntries } from '../host/usage.js'
import { useTankCanvas } from './use-tank-canvas.js'

export function createPage(React, DshFishTank) {
  var h = React.createElement
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
    function selectAllSessions(state) {
      return state
    }

    /** Native top-layer explanation: hover, keyboard focus, touch, outside click and Escape. */
    function JourneyInfo(props) {
      var anchor = React.useRef(null)
      var bubble = React.useRef(null)
      var timer = React.useRef(null)
      function hide() { if (bubble.current && typeof bubble.current.hidePopover === 'function' && bubble.current.matches(':popover-open')) bubble.current.hidePopover() }
      function show() {
        if (timer.current !== null) clearTimeout(timer.current)
        var node = bubble.current, button = anchor.current
        if (!node || !button || typeof node.showPopover !== 'function') return
        node.style.width = Math.min(300, window.innerWidth - 24) + 'px'
        node.style.maxHeight = Math.max(80, window.innerHeight - 24) + 'px'
        node.showPopover()
        var rect = button.getBoundingClientRect(), size = node.getBoundingClientRect()
        node.style.left = Math.max(12, Math.min(window.innerWidth - size.width - 12, rect.left - 8)) + 'px'
        var top = rect.top - size.height - 10
        if (top < 12) top = rect.bottom + 10
        node.style.top = Math.max(12, Math.min(window.innerHeight - size.height - 12, top)) + 'px'
      }
      function leave() {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = setTimeout(function () {
          if (document.activeElement === anchor.current || (bubble.current && bubble.current.matches(':hover'))) return
          hide()
        }, 160)
      }
      React.useEffect(function () {
        function keydown(event) { if (event.key === 'Escape') hide() }
        function outside(event) { if (anchor.current && !anchor.current.contains(event.target) && bubble.current && !bubble.current.contains(event.target)) hide() }
        document.addEventListener('keydown', keydown)
        document.addEventListener('pointerdown', outside, true)
        window.addEventListener('resize', hide)
        document.addEventListener('scroll', hide, true)
        return function () { if (timer.current !== null) clearTimeout(timer.current); window.removeEventListener('resize', hide); document.removeEventListener('scroll', hide, true); document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside, true) }
      }, [])
      var supported = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'
      return h('span', { className: 'dsw-fish-info', onMouseEnter: show, onMouseLeave: leave },
        h('button', { ref: anchor, type: 'button', className: 'dsw-fish-info-button', 'aria-label': props.label, 'aria-describedby': 'dsw-fish-journey-help', title: supported ? undefined : props.text, onFocus: show, onBlur: leave, onClick: show }, 'ⓘ'),
        h('span', { ref: bubble, id: 'dsw-fish-journey-help', className: 'dsw-fish-info-bubble', popover: 'auto', role: 'tooltip', onMouseEnter: show, onMouseLeave: leave }, props.text))
    }

    function createUi(store) {
      function FishTankIcon(props) {
        return fishGlyph(props && props.size)
      }

      /** Same-origin route the Host half serves for the durable tank file. */
      var TANK_ENDPOINT = '/fish-tank/state'

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
        var collectionRef = React.useRef(null)
        var collectionState = React.useState(false)
        var collectionOpen = collectionState[0]
        var setCollectionOpen = collectionState[1]
        var groupState = React.useState(function () { return {} })
        var groupOpen = groupState[0]
        var setGroupOpen = groupState[1]
        var remoteState = React.useState(function () { return { ready: false, synced: false, path: '', mode: 'host', account: 'unavailable' } })
        var remote = remoteState[0]
        var setRemote = remoteState[1]
        var remoteRef = React.useRef(remote)
        var pushTimer = React.useRef(null)
        var pushingRef = React.useRef(false)

        function applyRemote(next) {
          remoteRef.current = next
          setRemote(next)
        }

        /** Read the Host's tank file; `null` when the Host has no file yet. */
        function pullTank() {
          var controller = typeof AbortController === 'function' ? new AbortController() : null
          if (controller !== null) setTimeout(function () { controller.abort() }, 4000)
          return fetch(TANK_ENDPOINT, {
            headers: { accept: 'application/json' },
            signal: controller === null ? undefined : controller.signal,
          }).then(function (response) {
            if (response.status === 404) return null
            if (!response.ok) throw new Error('fish-tank state ' + response.status)
            return response.json()
          })
        }

        /** Write the current tank to the Host's file. */
        function pushTank(keepalive) {
          if (!store.isReady() || !store.summary().saved || pushingRef.current || typeof fetch !== 'function') return
          pushingRef.current = true
          fetch(TANK_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(Object.assign({}, store.snapshot(), remoteRef.current.mode === 'cloud' ? { cloudRevision: remoteRef.current.revision } : {})),
            keepalive: keepalive === true,
          }).then(function (response) {
            if (!response.ok) throw new Error('fish-tank state ' + response.status)
            return response.json()
          }).then(function (result) {
            pushingRef.current = false
            if (result && result.saved === false) { applyRemote(Object.assign({}, remoteRef.current, { ready: true, synced: false })); return }
            var path = result !== null && typeof result.path === 'string' ? result.path : remoteRef.current.path
            if (!remoteRef.current.synced || remoteRef.current.path !== path || remoteRef.current.revision !== result.revision) {
              applyRemote({ ready: true, synced: true, path: path, mode: remoteRef.current.mode || 'host', account: remoteRef.current.account || 'unavailable', revision: result.revision })
            }
          }, function () {
            pushingRef.current = false
            if (remoteRef.current.synced) applyRemote({ ready: true, synced: false, path: remoteRef.current.path })
          })
        }

        function schedulePush(immediate) {
          if (!remoteRef.current.synced) return
          if (pushTimer.current !== null) clearTimeout(pushTimer.current)
          pushTimer.current = setTimeout(function () {
            pushTimer.current = null
            pushTank(false)
          }, immediate === true ? 0 : 2000)
        }

        function publish(force) {
          var next = store.summary()
          var key = [next.fish, next.pellets, next.reserve, Math.round(next.hunger * 100), next.tokens, next.autoFed, next.manualFed, JSON.stringify(next.game)].join('|')
          var today = store.takeNotices()
          if (today.died > 0 || today.born > 0 || today.hunted > 0 || today.turtle > 0 || today.chapter > 0) {
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
          schedulePush(false)
        }

        function finishCatchUp() {
          if (store.isReady()) return
          store.catchUp(Date.now())
          syncedRef.current = true
          persist()
          publish(true)
        }

        React.useEffect(function () {
          var alive = true
          if (typeof fetch !== 'function') {
            applyRemote({ ready: true, synced: false, path: '' })
            return function () { alive = false }
          }
          pullTank().then(function (payload) {
            if (!alive) return
            if (payload === null) {
              applyRemote({ ready: true, synced: false, path: '' })
              return
            }
            var path = typeof payload.path === 'string' ? payload.path : ''
            if (payload.sync === 'cloud' && payload.account && payload.account.id) store.adoptScoped(payload.account.id, payload.tank)
            else if (payload.tank !== null && payload.tank !== undefined) store.adopt(payload.tank)
            if (payload.account && payload.account.status === 'ready') store.absorbAccountTotal(payload.account.id, payload.account.totalTokens)
            applyRemote({ ready: true, synced: true, path: path, mode: payload.sync === 'cloud' ? 'cloud' : 'host', account: payload.account ? payload.account.status : 'unavailable', revision: payload.revision })
          }, function () {
            if (alive) applyRemote({ ready: true, synced: false, path: '' })
          })
          return function () {
            alive = false
            if (pushTimer.current !== null) clearTimeout(pushTimer.current)
          }
        }, [])

        React.useEffect(function () {
          var alive = true
          var timer = setInterval(function () {
            if (!remoteRef.current.synced || pushingRef.current) return
            pullTank().then(function (payload) {
              if (!alive || !payload) return
              var changed = payload.sync === 'cloud' && payload.account && payload.account.id ? store.adoptScoped(payload.account.id, payload.tank) : payload.tank ? store.adopt(payload.tank) : false
              if (payload.sync === 'cloud') applyRemote(Object.assign({}, remoteRef.current, { mode: 'cloud', revision: payload.revision, account: payload.account ? payload.account.status : 'unavailable' }))
              if (payload.account && payload.account.status === 'ready') changed = store.absorbAccountTotal(payload.account.id, payload.account.totalTokens) || changed
              if (changed) { persist(); publish(true) }
            }, function () { /* Keep the last valid state and its usage source on temporary failures. */ })
          }, 60000)
          return function () { alive = false; clearInterval(timer) }
        }, [])

        React.useEffect(function () {
          var previousLevel = store.summary().tank.level
          var added = store.absorbTokens(tokenEntries(sessions))
          syncedRef.current = true
          if (!store.isReady()) {
            if (!remoteRef.current.ready) return
            if (sessions !== null && sessions.phase !== 'ready' && sessions.state !== 'error') return
            finishCatchUp()
            return
          }
          if (added.pellets > 0) {
            persist()
            publish(false)
            var expanded = store.summary().tank.level - previousLevel
            if (expanded > 0) setNotice(function (previous) { return Object.assign({}, previous, { expanded: expanded }) })
          }
        }, [sessions, remote.ready])

        React.useEffect(function () {
          if (!remote.ready || store.isReady()) return undefined
          var timer = setTimeout(function () {
            if (!store.isReady() && (sessions === null || sessions.phase === 'ready' || sessions.state === 'error')) finishCatchUp()
          }, 4000)
          return function () { clearTimeout(timer) }
        }, [remote.ready])

        React.useEffect(function () {
          if (notice === null) return undefined
          var timer = setTimeout(function () { setNotice(null) }, 12000)
          return function () { clearTimeout(timer) }
        }, [notice])

        useTankCanvas(React, { store, canvasRef, tankRef, syncedRef, publish, persist, pushTank, drawScene: DshFishTank.drawScene, disposeRenderer: DshFishTank.disposeWebGLFish })

        function handleFeed() {
          if (!store.isReady() || store.feed() === 0) return
          setShowHint(false)
          persist()
          publish(true)
        }

        function handleTankClick(event) {
          if (!store.isReady() || stats.fish === 0) return
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
          if (!store.isReady() || !store.placeFish()) return
          persist()
          publish(true)
          setShowHint(true)
        }

        var hungry = stats.hunger >= DshFishTank.HUNGRY
        var full = stats.fish > 0 && stats.hunger <= 0.08
        var hungerLabel = stats.fish === 0
          ? t('stats.empty')
          : hungry ? t('stats.hungry')
          : full ? t('stats.full') : t('stats.hunger', { percent: Math.round(stats.hunger * 100) })
        var canFeed = stats.ready && stats.fish > 0
        function gameAction(action, id) {
          if (!store.isReady() || !action(id)) return
          persist()
          publish(true)
          if (action === store.welcomeVisitor) {
            var entries = store.gameSummary().journal
            var latest = entries.find(function (entry) { return entry.type === 'visitor' })
            if (latest) setNotice(function (previous) { return Object.assign({}, previous, { visitor: latest.species }) })
          }
        }
        function restoreAll() {
          var archive = store.gameSummary().archive
          if (!store.isReady() || !archive.length) return
          archive.forEach(function (fish) { store.restoreFish(fish.id) })
          persist()
          publish(true)
        }

        function speciesName(index) { return t('species.' + DshFishTank.SPECIES_INFO[index].key) }
        /** Fold residents into one entry per species, largest group first. */
        function residentGroups(residents) {
          var groups = []
          var bySpecies = {}
          for (var index = 0; index < residents.length; index += 1) {
            var fish = residents[index]
            var group = bySpecies[fish.species]
            if (group === undefined) {
              group = { species: fish.species, fish: [], min: fish.generation, max: fish.generation }
              bySpecies[fish.species] = group
              groups.push(group)
            }
            group.fish.push(fish)
            if (fish.generation < group.min) group.min = fish.generation
            if (fish.generation > group.max) group.max = fish.generation
          }
          for (var g = 0; g < groups.length; g += 1) {
            groups[g].fish.sort(function (a, b) { return b.growth - a.growth || a.generation - b.generation || (a.id < b.id ? -1 : 1) })
          }
          groups.sort(function (a, b) { return b.fish.length - a.fish.length || a.species - b.species })
          return groups
        }
        /** Move every fish of one group into the sanctuary in one action. */
        function archiveGroup(group) {
          var changed = false
          for (var index = 0; index < group.fish.length; index += 1) {
            if (store.archiveFish(group.fish[index].id)) changed = true
          }
          if (!changed) return
          persist()
          publish(true)
        }
        function toggleGroup(key, open) {
          setGroupOpen(function (previous) {
            if (previous[key] === open) return previous
            var next = Object.assign({}, previous)
            next[key] = open
            return next
          })
        }
        function rarityName(index) { return t('rarity.' + DshFishTank.SPECIES_INFO[index].rarity) }
        function fishThumb(index, locked) {
          var frame = index >= 12 ? index - 12 : index % 6
          var columns = index >= 12 ? 4 : 3
          return h('span', { className: 'dsw-fish-thumb' + (locked ? ' is-locked' : ''), 'aria-hidden': true,
            style: { backgroundImage: 'url("' + (index >= 12 ? DshFishTank.getChapterArtwork() : index < 6 ? DshFishTank.getArtwork() : DshFishTank.getRareArtwork()) + '")', backgroundSize: (columns * 100) + '% 200%', backgroundPosition: ((frame % columns) * 100 / (columns - 1)) + '% ' + (frame < columns ? '0%' : '100%') } })
        }
        function gameCard(title, status, progress, detail, actions, info) {
          return h('section', { className: 'dsw-fish-game-card', title: info ? undefined : detail },
            h('h2', null, title, info && h(JourneyInfo, { label: t('game.journeyInfoLabel'), text: t('game.journeyInfo') })), h('p', { className: 'dsw-fish-game-value' }, status),
            h('progress', { value: progress, max: 1, 'aria-label': title }),
            h('p', { className: 'dsw-fish-game-description' }, detail), actions)
        }
        var game = stats.game
        var groups = residentGroups(game.residents)
        var nurseryStatus = game.nursery
          ? game.nursery.waiting ? t('game.nurseryWaiting') : t('game.hatching', { minutes: Math.ceil(game.nursery.remaining / 60000) })
          : game.pair.length < 2 ? t('game.needParents') : game.cooldown > 0 ? t('game.resting', { minutes: Math.ceil(game.cooldown / 60000) }) : t('game.bond', { count: game.bond })
        var garden = game.garden
        var gamePanels = h('div', { className: 'dsw-fish-game-grid' },
          gameCard(t('game.nursery'), nurseryStatus, game.nursery ? game.nursery.progress : game.bond / 8,
            game.nursery ? t('game.nurseryCare', { count: game.nursery.care }) : t('game.parentHint', { count: game.breedPity }),
            h('span', { className: 'dsw-fish-game-small' }, t('game.habitatBonus', { percent: (garden.patches - 3) * 4 }))),
          gameCard(t('game.journey'), t('game.tickets', { count: game.tickets }), game.journeyProgress / DshFishTank.JOURNEY_TOKENS,
            t('game.journeyHint', { tokens: formatCount(DshFishTank.JOURNEY_TOKENS - game.journeyProgress), count: game.visitPity }),
            h('button', { type: 'button', className: 'dsw-fish-small-button', disabled: game.tickets < 1, onClick: function () { gameAction(store.welcomeVisitor) } }, t('game.welcome')), true),
          gameCard(t('game.garden'), t('game.plants', { count: garden.patches, cuttings: garden.cuttings }), garden.growth,
            t('game.gardenHint', { percent: Math.round(garden.growth * 100) }),
            h('div', { className: 'dsw-fish-card-actions' },
              h('button', { type: 'button', className: 'dsw-fish-small-button', disabled: garden.growth < 0.75, onClick: function () { gameAction(store.prunePlants) } }, t('game.prune')),
              h('button', { type: 'button', className: 'dsw-fish-small-button', disabled: garden.cuttings < 1 || garden.patches >= 8, onClick: function () { gameAction(store.plantCutting) } }, t('game.plant')))))
        var collection = h('details', { className: 'dsw-fish-collection', ref: collectionRef, onToggle: function (event) { setCollectionOpen(event.currentTarget.open) } },
          h('summary', null, t('game.collection', { count: game.discovered.length, total: game.chapter >= 2 ? 18 : 12 }), game.archive.length > 0 && h('span', { className: 'dsw-fish-stored-count' }, t('game.storedCount', { count: game.archive.length }))),
          collectionOpen && h(React.Fragment, null,
          h('div', { className: 'dsw-fish-species-grid' }, DshFishTank.SPECIES_INFO.slice(0, game.chapter >= 2 ? 18 : 12).map(function (info, index) {
            var locked = game.discovered.indexOf(index) < 0
            return h('div', { key: info.key, className: 'dsw-fish-species rarity-' + info.rarity + (locked ? ' is-locked' : '') }, fishThumb(index, locked),
              h('span', null, speciesName(index)), h('small', null, locked ? t('game.undiscovered') : rarityName(index)))
          })),
          h('h3', null, t('game.residents', { count: game.residents.length }),
            groups.length > 1 && h('span', { className: 'dsw-fish-stored-count' }, t('game.residentSpecies', { count: groups.length }))),
          game.residents.length > 0 && h('p', { className: 'dsw-fish-game-description' }, t('game.residentGroupsHint')),
          h('div', { className: 'dsw-fish-resident-groups' }, groups.map(function (group) {
            var info = DshFishTank.SPECIES_INFO[group.species]
            var generations = group.min === group.max
              ? t('game.generation', { generation: group.min })
              : t('game.generationRange', { from: group.min, to: group.max })
            var expanded = groupOpen[info.key] === undefined ? game.residents.length <= 8 : groupOpen[info.key]
            return h('details', {
              key: info.key,
              className: 'dsw-fish-resident-group rarity-' + info.rarity,
              open: expanded,
              onToggle: function (event) { toggleGroup(info.key, event.currentTarget.open) },
            },
            h('summary', null,
              fishThumb(group.species),
              h('span', { className: 'dsw-fish-group-text' },
                h('span', null, speciesName(group.species)),
                h('small', null, rarityName(group.species) + ' · ' + t('game.groupCount', { count: group.fish.length }) + ' · ' + generations))),
            h('div', { className: 'dsw-fish-roster is-nested' }, group.fish.map(function (fish) {
              return h('div', { key: fish.id, className: 'dsw-fish-resident is-compact' },
                h('span', { className: 'dsw-fish-resident-detail' }, t('game.fishDetailCompact', { generation: fish.generation, growth: Math.round(fish.growth * 100) })),
                h('button', {
                  type: 'button',
                  className: 'dsw-fish-small-button',
                  'aria-label': t('game.archiveFish', { name: speciesName(fish.species) }),
                  onClick: function () { gameAction(store.archiveFish, fish.id) },
                }, t('game.archiveShort')))
            })),
            group.fish.length > 1 && h('div', { className: 'dsw-fish-group-actions' },
              h('button', { type: 'button', className: 'dsw-fish-small-button', onClick: function () { archiveGroup(group) } }, t('game.archiveGroup', { count: group.fish.length }))))
          })),
          h('h3', null, t('game.sanctuary', { count: game.archive.length })),
          game.archive.length > 0 && h('button', { type: 'button', className: 'dsw-fish-small-button', onClick: restoreAll }, t('game.restoreAll')),
          h('p', { className: 'dsw-fish-game-description' }, t('game.sanctuaryHint')),
          h('div', { className: 'dsw-fish-roster' }, game.archive.map(function (fish) {
            return h('div', { key: fish.id, className: 'dsw-fish-resident' }, fishThumb(fish.species), h('span', null, speciesName(fish.species)),
              h('button', { type: 'button', className: 'dsw-fish-small-button', 'aria-label': t('game.restoreFish', { name: speciesName(fish.species) }), onClick: function () { gameAction(store.restoreFish, fish.id) } }, t('game.restore')))
          }))))
        var gameRules = h('details', { className: 'dsw-fish-game-rules' }, h('summary', null, t('game.rules')),
          h('p', null, t('game.breedingRules')), h('p', null, t('game.visitRules')), h('p', null, t('game.plantRules')),
          h('p', null, t('game.chapterRule')),
          h('p', null, t('game.turtleRule', { births: game.births, patches: game.garden.patches })),
          h('label', { className: 'dsw-fish-hunt-toggle' }, h('input', { type: 'checkbox', checked: game.hunting, disabled: game.chapter < 2, onChange: function (event) { gameAction(function () { return store.setHunting(event.target.checked) }) } }), t('game.hunting')),
          h('p', null, t('game.huntRule')),
          h('div', { className: 'dsw-fish-meta' },
              h('p', { className: 'dsw-fish-rule' },
                t('stats.ratio', { per: formatCount(DshFishTank.TOKENS_PER_PELLET) }),
                ' · ',
                t('stats.tokens', { tokens: formatCount(stats.tokens) })),
              h('p', { className: 'dsw-fish-rule' },
                t('stats.fed', { auto: formatCount(stats.autoFed), manual: formatCount(stats.manualFed) })),
              h('p', { className: 'dsw-fish-sync' }, t(remote.synced ? remote.mode === 'cloud' ? 'sync.cloud' : 'sync.host' : 'sync.local')),
              h('p', { className: 'dsw-fish-sync' }, t(remote.account === 'ready' ? 'usage.account' : stats.accountActive ? 'usage.accountStale' : 'usage.local'))))
        var journal = game.journal.length > 0 && h('div', { className: 'dsw-fish-journal', role: 'log', 'aria-label': t('game.journal') }, game.journal.map(function (entry, index) {
          return h('span', { key: entry.at + '-' + index }, t('event.' + entry.type, { name: entry.species === undefined ? '' : speciesName(entry.species) }))
        }))


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
                  disabled: !stats.ready,
                  onClick: handlePlaceFish,
                }, t('empty.action')))),
            !stats.ready && h('p', { className: 'dsw-fish-rule', role: 'status' }, t('status.syncing')),
            notice !== null && h('p', { className: 'dsw-fish-notice', role: 'status' },
              notice.died > 0 && h('span', { className: 'dsw-fish-notice-died' }, t('notice.died', { count: notice.died })),
              notice.born > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.born', { count: notice.born })),
              notice.visitor !== undefined && h('span', { className: 'dsw-fish-notice-born' }, t('notice.visitor', { name: speciesName(notice.visitor), rarity: rarityName(notice.visitor) })),
              notice.turtle > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.turtle')),
              notice.chapter > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.chapter')),
              notice.hunted > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.hunted', { count: notice.hunted })),
              notice.expanded > 0 && h('span', { className: 'dsw-fish-notice-born' }, t('notice.expanded', { count: notice.expanded }))),
            saveFailed && h('p', { className: 'dsw-fish-error', role: 'alert' }, t('error.save')),
            h('div', { className: 'dsw-fish-stats' },
              h('span', null, t('stats.fish', { count: stats.fish })),
              h('span', { title: t('stats.expansionHint', { tokens: formatCount(stats.tank.nextTokens) }) }, t('stats.tankLevel', { level: stats.tank.level })),
              h('span', { className: 'dsw-fish-dot', 'aria-hidden': true }, '·'),
              h('span', null, t('stats.reserve', { count: stats.reserve })),
              h('span', { className: 'dsw-fish-dot', 'aria-hidden': true }, '·'),
              h('span', { className: hungry ? 'dsw-fish-hungry' : undefined }, hungerLabel)),
            game.turtle && h('span', { className: 'dsw-fish-game-small' }, t('game.turtleHome')),
            gamePanels, journal, collection, gameRules))
      }

      return { FishTankPage: FishTankPage, FishTankIcon: FishTankIcon }
    }

  return createUi
}
