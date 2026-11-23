import { clamp, isNumber } from '../shared/math.js'
import { FISH_SPECIES } from '../shared/species.js'
import { normalizeAngle } from './state.js'
import { FOOD_SINK_RATE, EAT_RADIUS } from './config.js'

export function stepMotion(state, stamp, dt, { prepareHunts, eatFish, record, notices }) {
  var events = { ate: 0 }
      for (var pelletIndex = state.pellets.length - 1; pelletIndex >= 0; pelletIndex -= 1) {
        var pellet = state.pellets[pelletIndex]
        pellet.y += FOOD_SINK_RATE * dt
        pellet.wobble += dt * 2
        if (pellet.y > 0.9) state.pellets.splice(pelletIndex, 1)
      }

      var huntScene = prepareHunts(stamp)
      var caught = new Set()
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
        if (target === null && fish.huntTarget) {
          var prey = huntScene.byId.get(fish.huntTarget)
          if (prey && !caught.has(prey.id)) { target = prey; targetIndex = -2; best = (prey.x - fish.x) ** 2 + (prey.y - fish.y) ** 2 }
        }
        // Continuous steering gives each fish a slow cruise, a turn, and a glide.
        var swimTime = stamp / 1000
        var swimSeed = fish.seed * 0.013
        var desired
        if (target !== null) {
          desired = Math.atan2((target.y - fish.y) / 0.6, target.x - fish.x)
        } else {
          var cruiseX = Math.cos(fish.angle) >= 0 ? 1 : -1
          var cruiseY = Math.sin(swimTime * 0.23 + swimSeed) * 0.24
          // Turn before the glass rather than bouncing off it.
          if (fish.x < 0.16) cruiseX += (0.16 - fish.x) * 24
          if (fish.x > 0.84) cruiseX -= (fish.x - 0.84) * 24
          if (fish.y < 0.2) cruiseY += (0.2 - fish.y) * 12
          if (fish.y > 0.72) cruiseY -= (fish.y - 0.72) * 12
          // Avoid overlapping bodies while leaving plenty of open water.
          for (var neighbor = 1; neighbor <= Math.min(count - 1, 16); neighbor += 1) {
            var other = state.fish[(index + neighbor + Math.floor(stamp / 2000)) % count]
            if (other === fish) continue
            var nearX = fish.x - other.x
            var nearY = fish.y - other.y
            var nearD = nearX * nearX + nearY * nearY
            if (nearD < 0.009) {
              if (nearD <= 0.00001) cruiseY += index < (index + neighbor) % count ? -0.12 : 0.12
              else cruiseY += nearY * (0.009 - nearD) * 350
            }
          }
          var threat = huntScene.fleeing.get(fish.id)
          if (threat) { cruiseX = (fish.x - threat.x) * 12; cruiseY = (fish.y - threat.y) * 12 }
          desired = Math.atan2(cruiseY, cruiseX)
        }
        var difference = normalizeAngle(desired - fish.angle)
        var limit = (target !== null ? 2.4 : 1.05) * dt
        fish.angle += clamp(difference, -limit, limit)
        var gait = 0.72 + 0.28 * Math.sin(swimTime * 0.8 + swimSeed)
        var speciesSpeed = (fish.species === 2 || fish.species === 4) ? 0.7 : fish.species === 3 ? 1.2 : 0.9
        var speed = (0.028 + 0.019 * fish.growth) * speciesSpeed * gait
        speed *= target !== null ? 1.5 + fish.hunger * 0.6 : 0.9 + fish.hunger * 0.2
        var visualMotion = FISH_SPECIES[fish.species] && FISH_SPECIES[fish.species].motion
        var frequency = visualMotion ? visualMotion.frequency : 3
        fish.swimPhase = (isNumber(fish.swimPhase) ? fish.swimPhase : (fish.seed || 0) * .37) + dt * frequency * (.8 + speed * 15)
        if (targetIndex === -2 || huntScene.fleeing.has(fish.id)) speed *= 1.8
        fish.x = clamp(fish.x + Math.cos(fish.angle) * speed * dt, 0.05, 0.95)
        fish.y = clamp(fish.y + Math.sin(fish.angle) * speed * dt * 0.6, 0.08, 0.84)
        fish.angle = normalizeAngle(fish.angle)
        var nextFacing = Math.cos(fish.angle) < -0.2 ? -1 : Math.cos(fish.angle) > 0.2 ? 1 : (fish.facing || 1)
        if (nextFacing !== fish.facing) { fish.facing = nextFacing; fish.turnAt = stamp }
        if (target !== null && best <= EAT_RADIUS * EAT_RADIUS) {
          if (targetIndex === -2) {
            caught.add(target.id)
            fish.hunger = Math.max(0, fish.hunger - 0.3)
            fish.lastHuntAt = stamp
            fish.huntTarget = null
            state.game.hunted += 1
            notices.hunted = (notices.hunted || 0) + 1
            record('hunted', stamp, fish.species)
          } else {
            state.pellets.splice(targetIndex, 1)
            eatFish(fish, stamp)
          }
          state.ripples.push({ x: target.x, y: target.y, age: 0 })
          events.ate += 1
        }
      }

      if (caught.size) state.fish = state.fish.filter(function (fish) { return !caught.has(fish.id) })
  return events.ate
}
