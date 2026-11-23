import { usageTotal } from '../core/state.js'
    /**
     * Read the durable token totals out of the Session list snapshot.
     * @param state - the `useSessions` list state, when available.
     * @returns one total per Session that carries a tokenUsage projection.
     */
    export function tokenEntries(state) {
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
        entries.push({ id: ids[index], total: usageTotal(usage) })
      }
      return entries
    }
