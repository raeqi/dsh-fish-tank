import { isNumber } from '../shared/math.js'
import { TOKENS_PER_PELLET, JOURNEY_TOKENS } from './config.js'

    export function absorbTokens(state, entries) {
      if (state.accountMeter) return { pellets: 0, tokens: 0 }
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
      state.tokensCounted += delta
      return { pellets: creditRewards(state, delta), tokens: delta }
    }

    /** The session and account ledgers follow the same rates, preserving saved remainders. */
    export function creditRewards(state, delta) {
      var pelletBudget = state.tokenRemainder + delta
      var pellets = Math.floor(pelletBudget / TOKENS_PER_PELLET)
      state.tokenRemainder = pelletBudget % TOKENS_PER_PELLET
      state.reserve += pellets
      var exploration = state.game.journeyProgress + delta
      state.game.tickets += Math.floor(exploration / JOURNEY_TOKENS)
      state.game.journeyProgress = exploration % JOURNEY_TOKENS
      return pellets
    }
