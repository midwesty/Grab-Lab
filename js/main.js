function htmlEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.GrabLabMain = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const SAVE = window.GrabLabSaveLoad;
  const AUDIO = window.GrabLabAudio;
  const MODAL = window.GrabLabModal;
  const UI = window.GrabLabUI;
  const UI_ICONS = window.GrabLabUIIcons;
  const INPUT = window.GrabLabInput;
  const WORLD = window.GrabLabWorld;
  const MAP = window.GrabLabMap;
  const PLAYER = window.GrabLabPlayer;
  const ANIMALS = window.GrabLabAnimals;
  const BREEDING = window.GrabLabBreeding;
  const COMBAT = window.GrabLabCombat;
  const CRAFTING = window.GrabLabCrafting;
  const BUILD = window.GrabLabBuild;
  const INVENTORY = window.GrabLabInventory;
  const FISHING = window.GrabLabFishing;
  const TUTORIAL = window.GrabLabTutorial;
  const ADMIN = window.GrabLabAdmin;

  const state = {
    initialized: false,
    autosaveIntervalId: null
  };

  async function loadExternalDataFiles() {
    const out = {};
    const errors = [];

    for (const [key, path] of Object.entries(CFG.DATA_FILES)) {
      try {
        const data = await U.fetchJson(path);
        out[key] = data;
        if (CFG.DEV.logDataLoads) {
          U.log(`Loaded data file: ${path}`);
        }
      } catch (err) {
        errors.push(`Could not load ${path}: ${err.message || err}`);
        if (CFG.DEV.logDataLoads) {
          U.warn(`Failed to load data file: ${path}`, err);
        }
      }
    }

    return { data: out, errors };
  }

  function normalizeLoadedData(raw = {}) {
    return {
      config: raw.config || {},
      items: U.toArray(raw.items),
      animals: U.toArray(raw.animals),
      plants: U.toArray(raw.plants),
      traits: U.toArray(raw.traits),
      mutations: U.toArray(raw.mutations),
      classes: U.toArray(raw.classes),
      skills: U.toArray(raw.skills),
      recipes: U.toArray(raw.recipes),
      structures: U.toArray(raw.structures),
      encounters: U.toArray(raw.encounters),
      dialogue: U.toArray(raw.dialogue),
      map: U.isObject(raw.map) ? raw.map : {},
      lootTables: U.toArray(raw.lootTables),
      audio: U.isObject(raw.audio) ? raw.audio : {},
      statusEffects: U.toArray(raw.statusEffects),
      tutorials: U.toArray(raw.tutorials),
      cheats: U.toArray(raw.cheats)
    };
  }

  async function bootData() {
    S.clearDataLoadErrors();

    const result = await loadExternalDataFiles();
    const normalized = normalizeLoadedData(result.data);

    S.setAllData(normalized);

    result.errors.forEach((message) => {
      S.addDataLoadError(message);
    });

    return normalized;
  }

  function safeCall(label, fn) {
    try {
      if (typeof fn === "function") {
        return fn();
      }

      U.warn(`Skipped missing startup helper: ${label}`);
      return false;
    } catch (err) {
      U.warn(`Startup helper failed: ${label}`, err);
      S.addDataLoadError?.(`Startup helper failed: ${label}: ${err?.message || err}`);
      return false;
    }
  }

  function seedFallbackBreedingDataDirectlyIfNeeded() {
    const mutations = U.toArray(S.getData()?.mutations);
    const traits = U.toArray(S.getData()?.traits);

    if (!mutations.length) {
      S.replaceDataBucket("mutations", [
        {
          id: "camouflage",
          name: "Camouflage",
          description: "Blends into surroundings and gains stealth bonuses."
        },
        {
          id: "gills",
          name: "Gills",
          description: "Allows better water movement and aquatic survival."
        },
        {
          id: "claws",
          name: "Claws",
          description: "Improves physical attack capability."
        },
        {
          id: "flight",
          name: "Flight",
          description: "Can access elevated or otherwise unreachable areas."
        },
        {
          id: "thick_shell",
          name: "Thick Shell",
          description: "Improves defense and resilience."
        },
        {
          id: "luminous",
          name: "Luminous",
          description: "Emits a gentle glow in dark areas."
        },
        {
          id: "bright_eyes",
          name: "Bright Eyes",
          description: "Improves awareness, scouting, and night activity."
        },
        {
          id: "odd_coloration",
          name: "Odd Coloration",
          description: "Unusual coloration. Maybe useful. Maybe just weird."
        },
        {
          id: "hardy",
          name: "Hardy",
          description: "Improves general resilience and survival."
        },
        {
          id: "quick_reflexes",
          name: "Quick Reflexes",
          description: "Improves speed and reaction time."
        },
        {
          id: "spore_touched",
          name: "Spore-Touched",
          description: "A suspicious fungal mutation with unpredictable uses."
        }
      ]);
    }

    if (!traits.length) {
      S.replaceDataBucket("traits", [
        { id: "gills", name: "Gills" },
        { id: "jump", name: "Jump" },
        { id: "shell", name: "Shell" },
        { id: "flight", name: "Flight" },
        { id: "camouflage", name: "Camouflage" },
        { id: "claws", name: "Claws" },
        { id: "wet_skin", name: "Wet Skin" },
        { id: "schooling", name: "Schooling" },
        { id: "swim", name: "Swim" },
        { id: "keen_nose", name: "Keen Nose" },
        { id: "field_notebook", name: "Field Notebook" },
        { id: "weird_luck", name: "Weird Luck" },
        { id: "scrappy", name: "Scrappy" }
      ]);
    }

    return true;
  }

  function ensureFallbackData() {
    safeCall("INVENTORY.seedFallbackItemsIfNeeded", () => INVENTORY?.seedFallbackItemsIfNeeded?.());
    safeCall("MAP.seedFallbackMapData", () => MAP?.seedFallbackMapData?.());
    safeCall("ANIMALS.seedFallbackAnimalsIfNeeded", () => ANIMALS?.seedFallbackAnimalsIfNeeded?.());

    const breedingMutationSeeded = safeCall(
      "BREEDING.seedFallbackMutationsIfNeeded",
      () => BREEDING?.seedFallbackMutationsIfNeeded?.()
    );

    const breedingTraitSeeded = safeCall(
      "BREEDING.seedFallbackTraitsIfNeeded",
      () => BREEDING?.seedFallbackTraitsIfNeeded?.()
    );

    if (!breedingMutationSeeded || !breedingTraitSeeded) {
      seedFallbackBreedingDataDirectlyIfNeeded();
    }

    safeCall("CRAFTING.seedFallbackRecipesIfNeeded", () => CRAFTING?.seedFallbackRecipesIfNeeded?.());
    safeCall("BUILD.seedFallbackStructuresIfNeeded", () => BUILD?.seedFallbackStructuresIfNeeded?.());
    safeCall("FISHING.seedFallbackFishingItemsIfNeeded", () => FISHING?.seedFallbackFishingItemsIfNeeded?.());
    safeCall("TUTORIAL.seedFallbackTutorialsIfNeeded", () => TUTORIAL?.seedFallbackTutorialsIfNeeded?.());
  }

  function seedStarterStateIfNeeded() {
    const world = S.getWorld();

    S.revealTile(world.currentTileX, world.currentTileY);
    S.revealTile(world.currentTileX + 1, world.currentTileY);
    S.revealTile(world.currentTileX - 1, world.currentTileY);
    S.revealTile(world.currentTileX, world.currentTileY + 1);
    S.revealTile(world.currentTileX, world.currentTileY - 1);

    const playerInv = S.getInventory("player");
    if (!playerInv.length) {
      S.addItem("player", "berries_wild", 4);
      S.addItem("player", "fresh_water", 3);
      S.addItem("player", "field_knife", 1);
      S.addItem("player", "fishing_pole_basic", 1);
      S.addItem("player", "bait_worm", 4);
    }

    const baseInv = S.getInventory("base");
    if (!baseInv.length) {
      S.addItem("base", "scrap_wood", 12);
      S.addItem("base", "fiber_bundle", 10);
      S.addItem("base", "rope_bundle", 3);
      S.addItem("base", "fresh_water", 4);
    }

    const boatInv = S.getInventory("boat");
    if (!boatInv.length) {
      S.addItem("boat", "bait_worm", 4);
      S.addItem("boat", "fresh_water", 2);
    }

    PLAYER.initPlayerProgress();
    ANIMALS.seedStarterHabitatsIfNeeded();
  }

  function setupGlobalUiHooks() {
    const continueBtn = U.byId("btnContinue");
    const pauseBtn = U.byId("btnPause");
    const tutorialBtn = U.byId("btnTutorial");

    if (continueBtn) {
      U.on(continueBtn, "click", () => {
        AUDIO.unlockAudio();
      });
    }

    if (pauseBtn) {
      U.on(pauseBtn, "click", () => {
        const paused = Boolean(S.getWorld()?.isPaused);
        if (paused) {
          AUDIO.playAmbient("field_station_ambient").catch?.(() => {});
        }
      });
    }

    if (tutorialBtn) {
      U.on(tutorialBtn, "click", () => {
        TUTORIAL.renderTutorialPanel();
      });
    }
  }

  function setupLifecycleHooks() {
    U.eventBus.on("screen:changed", (screenId) => {
      if (screenId === "boot") {
        AUDIO.playMusic("main_theme").catch?.(() => {});
      } else if (screenId === "game") {
        AUDIO.playMusic("exploration").catch?.(() => {});
        AUDIO.playAmbient("field_station_ambient").catch?.(() => {});
        TUTORIAL.maybeAutoStartTutorial();
      } else if (screenId === "combat") {
        AUDIO.playMusic("combat").catch?.(() => {});
      }
    });

    U.eventBus.on("state:hardReset", () => {
      UI.renderEverything();
      UI_ICONS?.decorateAll?.();
      WORLD.drawWorld();
      INPUT.drawMiniMap();
    });

    U.eventBus.on("saveLoad:slotLoaded", () => {
      PLAYER.initPlayerProgress();
      UI.renderEverything();
      UI_ICONS?.decorateAll?.();
      WORLD.drawWorld();
      INPUT.drawMiniMap();
    });

    U.eventBus.on("saveLoad:autosaveLoaded", () => {
      PLAYER.initPlayerProgress();
      UI.renderEverything();
      UI_ICONS?.decorateAll?.();
      WORLD.drawWorld();
      INPUT.drawMiniMap();
    });

    U.eventBus.on("saveLoad:importLoaded", () => {
      PLAYER.initPlayerProgress();
      UI.renderEverything();
      UI_ICONS?.decorateAll?.();
      WORLD.drawWorld();
      INPUT.drawMiniMap();
    });

    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "saveLoadModal") {
        UI.renderSaveSlots();
      }
      if (modalId === "tutorialModal") {
        TUTORIAL.renderTutorialPanel();
      }
      if (modalId === "inventoryModal") {
        INVENTORY.renderInventoryPanel();
      }
      if (modalId === "fishingModal") {
        FISHING.renderFishingPanel();
      }
      if (modalId === "breedingModal") {
        BREEDING?.renderBreedingPanel?.();
      }
      if (modalId === "craftModal") {
        CRAFTING.renderCraftingPanel();
      }
      if (modalId === "adminModal") {
        ADMIN.renderAdminLog();
      }

      UI_ICONS?.scheduleDecorate?.();
    });
  }

  function startAutosaveLoop() {
    if (state.autosaveIntervalId) {
      clearInterval(state.autosaveIntervalId);
    }

    state.autosaveIntervalId = window.setInterval(() => {
      try {
        SAVE.maybeAutosave(false);
      } catch (err) {
        U.warn("Autosave failed:", err);
      }
    }, 5000);
  }

  function stopAutosaveLoop() {
    if (state.autosaveIntervalId) {
      clearInterval(state.autosaveIntervalId);
      state.autosaveIntervalId = null;
    }
  }

  function setupUnloadHooks() {
    window.addEventListener("beforeunload", () => {
      try {
        SAVE.saveSettings();
        SAVE.saveMeta();
        SAVE.maybeAutosave(true);
      } catch (err) {
        U.warn("beforeunload save failed:", err);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        try {
          SAVE.saveSettings();
          SAVE.saveMeta();
          SAVE.maybeAutosave(true);
        } catch (err) {
          U.warn("visibilitychange autosave failed:", err);
        }
      }
    });
  }

  function determineStartupScreen() {
    const meta = S.getMeta();
    const hasLastSlot = meta?.lastOpenedSlot && SAVE.getSlotPayload(meta.lastOpenedSlot);
    const hasAutosave = SAVE.getAutosavePayload();

    if (hasLastSlot || hasAutosave) {
      UI.showScreen("boot");
      return "boot";
    }

    UI.showScreen("boot");
    return "boot";
  }

  async function initializeModules() {
    MODAL.init();
    await AUDIO.init();

    INVENTORY.init();
    MAP.init();
    PLAYER.init();
    ANIMALS.init();
    BREEDING?.init?.();
    COMBAT.init();
    CRAFTING.init();
    BUILD.init();
    FISHING.init();
    TUTORIAL.init();
    ADMIN.init();

    UI.init();
    UI_ICONS?.init?.();
    INPUT.init();
    WORLD.init();

    UI.renderEverything();
    UI_ICONS?.decorateAll?.();
    WORLD.drawWorld();
    INPUT.drawMiniMap();
  }

  async function init() {
    if (state.initialized) return true;

    try {
      SAVE.bootPersistence();
      S.setSettings(U.deepMerge(CFG.getDefaultSettings(), S.getSettings()));
      S.setMeta(U.deepMerge(CFG.getDefaultMeta(), S.getMeta()));

      await bootData();
      ensureFallbackData();
      seedStarterStateIfNeeded();

      await initializeModules();

      setupGlobalUiHooks();
      setupLifecycleHooks();
      setupUnloadHooks();
      startAutosaveLoop();

      determineStartupScreen();

      AUDIO.playMusic("main_theme").catch?.(() => {});
      AUDIO.playAmbient("field_station_ambient").catch?.(() => {});

      S.markInitialized(true);
      state.initialized = true;

      U.log(`${CFG.APP.title} ${CFG.APP.version} initialized.`);
      U.eventBus.emit("main:initialized");

      return true;
    } catch (err) {
      console.error("Grab Lab failed to initialize:", err);
      alert(`Grab Lab failed to initialize.\n\n${err?.message || err}`);
      return false;
    }
  }

  function resetPrototypeWorld() {
    stopAutosaveLoop();
    SAVE.wipeAllLocalData();

    S.hardResetAll();
    ensureFallbackData();
    seedStarterStateIfNeeded();

    PLAYER.initPlayerProgress();
    UI.renderEverything();
    UI_ICONS?.decorateAll?.();
    WORLD.drawWorld();
    INPUT.drawMiniMap();

    startAutosaveLoop();
    UI.showScreen("boot");

    return true;
  }

  function debugSummary() {
    return {
      app: CFG.APP,
      initialized: state.initialized,
      screen: S.getCurrentScreen(),
      activeSaveSlot: S.getActiveSaveSlot(),
      dataLoaded: S.getStore().dataLoaded,
      dataLoadErrors: S.getStore().dataLoadErrors,
      world: S.getWorld(),
      player: S.getPlayer(),
      boat: S.getBoat(),
      base: S.getBase(),
      runtime: S.getRuntime()
    };
  }

  window.addEventListener("DOMContentLoaded", () => {
    init();
  });

  const API = {
    init,
    resetPrototypeWorld,
    debugSummary,
    stopAutosaveLoop,
    startAutosaveLoop
  };

  window.GL_MAIN = API;

  return Object.freeze(API);
})();