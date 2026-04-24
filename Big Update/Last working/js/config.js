window.GrabLabConfig = (() => {
  const APP = {
    id: "grab-lab",
    title: "Grab Lab",
    version: "0.1.0-mvp-shell",
    buildName: "Field Station Prototype",
    savePrefix: "grab_lab_save_",
    settingsKey: "grab_lab_settings",
    metaKey: "grab_lab_meta",
    autosaveKey: "grab_lab_autosave",
    maxSaveSlots: 8,
    defaultLanguage: "en",
    debug: true
  };

  const PATHS = {
    data: "data/",
    assets: "assets/",
    img: "assets/img/",
    ui: "assets/img/ui/",
    icons: "assets/img/icons/",
    portraits: "assets/img/portraits/",
    animals: "assets/img/animals/",
    tiles: "assets/img/tiles/",
    structures: "assets/img/structures/",
    fx: "assets/img/fx/",
    audio: "assets/audio/",
    music: "assets/audio/music/",
    sfx: "assets/audio/sfx/",
    ambient: "assets/audio/ambient/"
  };

  const TIMING = {
    // 1 real second = 1 in-game minute
    realMsPerGameMinute: 1000,
    minutesPerGameHour: 60,
    hoursPerGameDay: 24,
    autosaveIntervalMs: 60000,
    weatherTickMs: 15000,
    passiveSystemTickMs: 5000,
    animationFrameCap: 60,
    fishingPassiveTickMs: 12000,
    breedingProgressTickMs: 3000,
    structureProductionTickMs: 5000
  };

  const WORLD = {
    tileSize: 64,
    worldWidthTiles: 64,
    worldHeightTiles: 64,
    minimapTileSize: 4,
    startingTile: { x: 12, y: 14 },
    startingBiomeId: "field_station_island",
    startingMapNodeId: "field_station_dock",
    fogOfWarEnabled: true,
    allowDiagonalMovement: true,
    playerMoveSpeed: 2.4,
    boatMoveSpeed: 3.1,
    interactDistance: 1.4,
    dayStartHour: 6,
    dayStartMinute: 0,
    initialWeather: "clear",
    initialSeason: "humid_spring",
    waterfallBoundaryLocked: true
  };

  const PLAYER = {
    startingName: "New Ranger",
    maxLevel: 20,
    startingFunds: 120,
    startingClass: "field_ranger",
    startingBackground: "wetland_observer",
    startingSpecialty: "fishing",
    startingTraits: ["steady_hands", "field_notebook"],
    moveMode: "walk",
    startingStats: {
      level: 1,
      xp: 0,
      unspentPerkPoints: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      hunger: 100,
      thirst: 100,
      infection: 0,
      morale: 70,
      focus: 70,
      hygiene: 75,
      encumbrance: 0
    },
    startingNeedsDecay: {
      hungerPerHour: 2.5,
      thirstPerHour: 3.5,
      staminaRecoveryPerHourResting: 12,
      staminaDrainPerAction: 4,
      infectionPerUnsafeExposure: 3
    },
    startingSkills: {
      fishing: 1,
      trapping: 0,
      harvesting: 1,
      cooking: 0,
      crafting: 0,
      carpentry: 0,
      boating: 1,
      medicine: 0,
      observation: 1,
      breeding: 0,
      combat_blunt: 0,
      combat_blade: 0,
      combat_ranged: 0,
      foraging: 1
    }
  };

  const PARTY = {
    maxPartySize: 5,
    maxReserveCompanions: 60,
    playerOccupiesSlot: true,
    sharedXpMode: false,
    companionAiDefault: "balanced"
  };

  const BASE = {
    starterBaseId: "field_station_alpha",
    starterBoatId: "mudskipper_01",
    starterStructures: [
      { structureId: "animal_pen_t1", quantity: 1 },
      { structureId: "storage_crate_t1", quantity: 1 },
      { structureId: "aquarium_t1", quantity: 1 },
      { structureId: "workbench_t1", quantity: 1 },
      { structureId: "field_stove_t1", quantity: 1 },
      { structureId: "breeding_tank_t1", quantity: 1 }
    ],
    starterStorage: [
      { itemId: "berries_wild", quantity: 6 },
      { itemId: "fresh_water", quantity: 8 },
      { itemId: "scrap_wood", quantity: 10 },
      { itemId: "fiber_bundle", quantity: 8 },
      { itemId: "field_knife", quantity: 1 },
      { itemId: "fishing_pole_basic", quantity: 1 },
      { itemId: "fishing_net_basic", quantity: 1 },
      { itemId: "passive_line_basic", quantity: 1 },
      { itemId: "mold_sample_jar", quantity: 2 },
      { itemId: "bandage_basic", quantity: 3 }
    ],
    starterBoatStorage: [
      { itemId: "bait_worm", quantity: 10 },
      { itemId: "rope_bundle", quantity: 3 },
      { itemId: "fuel_bio_basic", quantity: 2 }
    ]
  };

  const BREEDING = {
    enabled: true,
    baseDurationMinutes: 360,
    additiveSlots: 2,
    maxTraitInheritanceRolls: 4,
    maxMutationRolls: 2,
    mutationChanceBase: 0.18,
    rareMutationChance: 0.035,
    colorMutationChance: 0.22,
    crossSpeciesAllowed: true,
    crossSpeciesUnlockRequired: true,
    crossSpeciesUnlockId: "splice_license_alpha",
    cloneTankEnabled: true,
    cloneDurationMinutes: 240,
    preservedDnaCapacity: 400
  };

  const FISHING = {
    enabled: true,
    castLineBaseSeconds: 8,
    passiveLineSlotsBase: 2,
    netHarvestMinutes: 90,
    fishActivityBonusAtDawn: 0.25,
    fishActivityBonusAtDusk: 0.2,
    stormPenalty: -0.18,
    defaultWaterNodeType: "river"
  };

  const COMBAT = {
    enabled: true,
    style: "ff7-inspired-turn-based",
    initiativeFormula: "speed+1d20",
    defaultBattleBg: "fungal_marsh",
    maxEnemyCount: 6,
    maxAllyCount: 5,
    defendReduction: 0.4,
    fleeBaseChance: 0.35,
    critChanceBase: 0.05,
    critMultiplier: 1.5,
    weaknessMultiplier: 1.35,
    resistanceMultiplier: 0.75
  };

  const BUILDING = {
    allowBuildOnClearedTilesOnly: true,
    allowBoatExpansion: true,
    defaultWallHp: 100,
    defaultTrapCapacity: 1,
    placementGridSize: 32,
    refundRatioOnDemolish: 0.5
  };

  const INVENTORY = {
    playerSlots: 32,
    boatSlots: 24,
    baseStorageSlots: 60,
    stackLimitDefault: 99,
    weightSystemEnabled: true
  };

  const UI = {
    defaultScreen: "boot",
    defaultModalZIndex: 60,
    dragThresholdPx: 6,
    holdToRightClickMs: 450,
    doubleTapMs: 250,
    toastDurationMs: 2400,
    logMaxEntries: 250,
    minimapVisibleByDefault: true,
    showDamageNumbers: true,
    reduceMotion: false,
    allowScreenShake: true,
    uiScale: 1,
    mobileBreakpoint: 820
  };

  const AUDIO = {
    enabled: true,
    defaultMusicVolume: 0.7,
    defaultSfxVolume: 0.8,
    defaultAmbientVolume: 0.6,
    masterMuted: false,
    musicTrackMainMenu: "main_theme.ogg",
    musicTrackExploration: "wetlands_loop.ogg",
    musicTrackCombat: "fungal_battle.ogg",
    ambientTrackBase: "field_station_ambient.ogg",
    ambientTrackRiver: "river_ambient.ogg",
    sfxConfirm: "ui_confirm.ogg",
    sfxCancel: "ui_cancel.ogg",
    sfxHover: "ui_hover.ogg",
    sfxError: "ui_error.ogg"
  };

  const SAVELOAD = {
    exportFilePrefix: "grab-lab-save",
    autoSaveSlotId: "autosave",
    maxManualSlots: 8,
    includeMetaInExport: true,
    importValidationRequired: true,
    versionCheckRequired: false
  };

  const DATA_FILES = {
    config: "data/config.json",
    items: "data/items.json",
    animals: "data/animals.json",
    plants: "data/plants.json",
    traits: "data/traits.json",
    mutations: "data/mutations.json",
    classes: "data/classes.json",
    skills: "data/skills.json",
    recipes: "data/recipes.json",
    structures: "data/structures.json",
    encounters: "data/encounters.json",
    dialogue: "data/dialog.json",
    map: "data/map.json",
    lootTables: "data/lootTables.json",
    audio: "data/audio.json",
    statusEffects: "data/statusEffects.json",
    tutorials: "data/tutorials.json",
    cheats: "data/cheats.json"
  };

  const IMAGE_FALLBACKS = {
    portraitPlayer: `${PATHS.portraits}player_default.png`,
    portraitCompanion: `${PATHS.portraits}companion_default.png`,
    iconItem: `${PATHS.icons}item_default.png`,
    iconStructure: `${PATHS.icons}structure_default.png`,
    iconSkill: `${PATHS.icons}skill_default.png`,
    tileGrass: `${PATHS.tiles}grass_01.png`,
    tileWater: `${PATHS.tiles}water_01.png`,
    tileDock: `${PATHS.tiles}dock_01.png`,
    fxSpores: `${PATHS.fx}spores_01.png`
  };

  const DEFAULTS = {
    starterQuestId: "tutorial_arrival",
    starterCodexUnlocked: ["fungus_basic", "boat_manual", "field_station_rules"],
    starterMapRevealedRadius: 3,
    starterFastTravelNodes: ["field_station_dock"],
    starterFlags: {
      tutorialCompleted: false,
      introSeen: false,
      adminUnlocked: true,
      boatUnlocked: true,
      breedingUnlocked: true,
      dnaDatabaseUnlocked: true,
      fishingUnlocked: true,
      trappingUnlocked: true,
      baseBuildingUnlocked: true,
      worldMapUnlocked: true
    }
  };

  const WEATHER_TYPES = [
    "clear",
    "overcast",
    "mist",
    "rain",
    "storm",
    "spore_drift"
  ];

  const BIOME_TYPES = [
    "field_station_island",
    "wetland",
    "river_channel",
    "mudflats",
    "fungal_grove",
    "reed_forest",
    "cliffside",
    "cavern_entry"
  ];

  const ITEM_TAGS = [
    "food",
    "drink",
    "medicine",
    "bait",
    "tool",
    "weapon",
    "resource",
    "building",
    "additive",
    "dna",
    "trap",
    "fishing",
    "seed",
    "quest",
    "junk"
  ];

  const STRUCTURE_TAGS = [
    "habitat",
    "storage",
    "crafting",
    "defense",
    "boat_upgrade",
    "breeding",
    "power",
    "utility",
    "farming"
  ];

  const ADMIN = {
    enabled: true,
    commands: [
      "help",
      "heal",
      "feed",
      "hydrate",
      "clearinfection",
      "godmode",
      "addxp",
      "addmoney",
      "settime",
      "setweather",
      "revealmap",
      "teleport",
      "spawnitem",
      "spawnanimal",
      "unlockall",
      "clearcombat",
      "wincombat",
      "losecombat",
      "settilecleared",
      "setskill",
      "setlevel",
      "setstat",
      "addtrait",
      "removetrait",
      "starttutorial",
      "completetutorial",
      "save",
      "load",
      "resetui"
    ],
    quickActions: {
      fullHeal: true,
      refillNeeds: true,
      weatherControl: true,
      timeSkip: true,
      spawnLoot: true,
      revealMap: true,
      toggleGodMode: true
    }
  };

  const TUTORIAL = {
    enabled: true,
    autoStartOnNewGame: true,
    allowReplay: true,
    tutorialQuestId: "tutorial_arrival"
  };

  const LOCALIZATION = {
    defaultLocale: "en-US",
    supportedLocales: ["en-US"],
    currencyCode: "USD",
    measurementSystem: "imperial"
  };

  const DEV = {
    usePlaceholderVisuals: true,
    usePlaceholderAudio: true,
    logDataLoads: true,
    logStateChanges: false,
    exposeDebugToWindow: true
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getAllDataFilePaths() {
    return Object.values(DATA_FILES);
  }

  function getSaveSlotKey(slotIndex) {
    return `${APP.savePrefix}${slotIndex}`;
  }

  function getDefaultSettings() {
    return {
      musicVolume: AUDIO.defaultMusicVolume,
      sfxVolume: AUDIO.defaultSfxVolume,
      ambientVolume: AUDIO.defaultAmbientVolume,
      masterMuted: AUDIO.masterMuted,
      reduceMotion: UI.reduceMotion,
      showDamageNumbers: UI.showDamageNumbers,
      uiScale: UI.uiScale
    };
  }

  function getDefaultMeta() {
    return {
      lastOpenedSlot: null,
      lastVersion: APP.version,
      firstRunComplete: false
    };
  }

  function getDefaultWorldState() {
    return {
      currentTileX: WORLD.startingTile.x,
      currentTileY: WORLD.startingTile.y,
      currentBiomeId: WORLD.startingBiomeId,
      currentMapNodeId: WORLD.startingMapNodeId,
      revealedTiles: [],
      clearedTiles: [],
      fastTravelNodes: deepClone(DEFAULTS.starterFastTravelNodes),
      weather: WORLD.initialWeather,
      season: WORLD.initialSeason,
      day: 1,
      hour: WORLD.dayStartHour,
      minute: WORLD.dayStartMinute,
      isPaused: false
    };
  }

  function getDefaultPlayerState() {
    return {
      id: "player_1",
      name: PLAYER.startingName,
      classId: PLAYER.startingClass,
      backgroundId: PLAYER.startingBackground,
      specialtyId: PLAYER.startingSpecialty,
      traits: deepClone(PLAYER.startingTraits),
      stats: deepClone(PLAYER.startingStats),
      skills: deepClone(PLAYER.startingSkills),
      inventory: [],
      equipment: {
        mainHand: null,
        offHand: null,
        body: null,
        accessoryA: null,
        accessoryB: null
      },
      statusEffects: [],
      discoveredSpecies: [],
      clonedSpecimens: [],
      codexUnlocked: deepClone(DEFAULTS.starterCodexUnlocked)
    };
  }

  function getDefaultBoatState() {
    return {
      id: BASE.starterBoatId,
      name: "Mudskipper",
      tier: 1,
      hp: 100,
      maxHp: 100,
      fuel: 100,
      maxFuel: 100,
      storage: deepClone(BASE.starterBoatStorage),
      modules: [],
      passengers: [],
      upgradesUnlocked: []
    };
  }

  function getDefaultBaseState() {
    return {
      id: BASE.starterBaseId,
      name: "Field Station Alpha",
      structures: deepClone(BASE.starterStructures),
      storage: deepClone(BASE.starterStorage),
      habitats: [],
      breedingJobs: [],
      craftingQueues: [],
      trapAssignments: [],
      power: {
        current: 0,
        max: 0
      }
    };
  }

  function getDefaultPartyState() {
    return {
      active: [],
      reserve: []
    };
  }

  function getDefaultQuestState() {
    return {
      active: [DEFAULTS.starterQuestId],
      completed: [],
      failed: [],
      journalNotes: []
    };
  }

  function getDefaultFlags() {
    return deepClone(DEFAULTS.starterFlags);
  }

  function createNewGameState() {
    return {
      appVersion: APP.version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      player: getDefaultPlayerState(),
      party: getDefaultPartyState(),
      world: getDefaultWorldState(),
      boat: getDefaultBoatState(),
      base: getDefaultBaseState(),
      quests: getDefaultQuestState(),
      flags: getDefaultFlags(),
      admin: {
        godMode: false,
        mapRevealed: false,
        cheatsUsed: []
      },
      runtime: {
        sessionSeconds: 0,
        lastTickAt: Date.now(),
        currentScreen: UI.defaultScreen,
        currentModal: null,
        inCombat: false,
        currentEncounterId: null
      }
    };
  }

  const API = {
    APP,
    PATHS,
    TIMING,
    WORLD,
    PLAYER,
    PARTY,
    BASE,
    BREEDING,
    FISHING,
    COMBAT,
    BUILDING,
    INVENTORY,
    UI,
    AUDIO,
    SAVELOAD,
    DATA_FILES,
    IMAGE_FALLBACKS,
    DEFAULTS,
    WEATHER_TYPES,
    BIOME_TYPES,
    ITEM_TAGS,
    STRUCTURE_TAGS,
    ADMIN,
    TUTORIAL,
    LOCALIZATION,
    DEV,
    deepClone,
    getAllDataFilePaths,
    getSaveSlotKey,
    getDefaultSettings,
    getDefaultMeta,
    getDefaultWorldState,
    getDefaultPlayerState,
    getDefaultBoatState,
    getDefaultBaseState,
    getDefaultPartyState,
    getDefaultQuestState,
    getDefaultFlags,
    createNewGameState
  };

  if (DEV.exposeDebugToWindow) {
    window.GL_CONFIG = API;
  }

  return Object.freeze(API);
})();