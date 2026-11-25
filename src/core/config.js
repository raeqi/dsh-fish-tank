export var STORAGE_KEY = 'dsh.fish-tank.v1'
export var BACKUP_KEY = 'dsh.fish-tank.before-v3'
export var STATE_VERSION = 3
export var INITIAL_FISH = 3
export var BASE_SPACE = 8
export var EXPANSION_TOKENS = 1000000
export var MAX_PELLETS = 12
export var TOKENS_PER_PELLET = 20000
  /** Hunger reaches full in one day; a pellet is a small meal, so a fish eats often. */
export var HUNGER_RATE = 1 / (24 * 3600)
  /** A fish at full hunger for this long dies. */
export var STARVE_MS = 72 * 3600 * 1000
export var FOOD_SINK_RATE = 0.018
export var EAT_RADIUS = 0.034
export var EAT_HUNGER = 0.032
export var GROWTH_PER_PELLET = 0.065
export var BIRTH_PELLETS = 8
export var BIRTH_COOLDOWN_MS = 2 * 3600 * 1000
export var MANUAL_FEED = 3
export var AUTO_FEED_GAP_MS = 5000
export var HUNGRY = 0.7
export var AWAY_CAP_SECONDS = 14 * 86400
export var AWAY_STEP_SECONDS = 900

export var JOURNEY_TOKENS = 300000
export var HATCH_MS = 20 * 60000
export var COLLECTION_GUARANTEE = 4
export var HABITAT_LEVELS = 50
