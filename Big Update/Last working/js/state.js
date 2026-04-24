window.GrabLabState = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;

  const store = {
    initialized: false,
    bootedAt: U.now(),
    dataLoaded: false,
    dataLoadErrors: [],
    activeSaveSlot: null,

    settings: CFG.getDefaultSettings(),
    meta: CFG.getDefaultMeta(),

    game: CFG.createNewGameState(),

    data: {
      config: {},
      items: [],
      animals: [],
      plants: [],
      traits: [],
      mutations: [],
      classes: [],
      skills: [],
      recipes: [],
      structures: [],
      encounters: [],
      dialogue: [],
      map: {},
      lootTables: [],
      audio: {},
      statusEffects: [],
      tutorials: [],
      cheats: []
    },

    indexes: {
      itemsById: {},
      animalsById: {},
      plantsById: {},
      traitsById: {},
      mutationsById: {},
      classesById: {},
      skillsById: {},
      recipesById: {},
      structuresById: {},
      encountersById: {},
      dialogueById: {},
      statusEffectsById: {},
      tutorialsById: {},
      cheatsById: {},
      mapNodesById: {},
      mapTilesByKey: {}
    },

    runtime: {
      currentScreen: CFG.UI.defaultScreen,
      openModals: [],
      hoveredEntityId: null,
      selectedEntityId: null,
      selectedTile: null,
      selectedInventoryEntry: null,
      selectedPartyMemberId: null,
      selectedRecipeId: null,
      selectedStructureId: null,
      selectedDnaEntryId: null,
      combat: {
        active: false,
        encounterId: null,
        turnIndex: 0,
        round: 1,
        actors: [],
        enemies: [],
        allies: [],
        log: []
      },
      ui: {
        draggingModalId: null,
        minimapExpanded: false,
        minimapVisible: CFG.UI.minimapVisibleByDefault,
        toasts: [],
        activityLog: [],
        lastPointerType: "mouse"
      },
      timers: {
        gameLoopStartedAt: null,
        lastTickAt: U.now(),
        lastWeatherTickAt: U.now(),
        lastPassiveTickAt: U.now(),
        lastAutosaveAt: 0
      },
      admin: {
        godMode: false,
        debugOverlayVisible: false,
        lastCommand: null,
        commandHistory: []
      }
    }
  };

  function buildIdIndex(list = [], idKey = "id") {
    const out = {};
    if (!Array.isArray(list)) return out;

    for (const item of list) {
      const id = item?.[idKey];
      if (!id) continue;
      out[id] = item;
    }

    return out;
  }

  function buildMapTileIndex(mapData = {}) {
    const out = {};
    const tiles = Array.isArray(mapData?.tiles) ? mapData.tiles : [];
    for (const tile of tiles) {
      if (tile?.x == null || tile?.y == null) continue;
      out[`${tile.x},${tile.y}`] = tile;
    }
    return out;
  }

  function buildMapNodeIndex(mapData = {}) {
    return buildIdIndex(Array.isArray(mapData?.nodes) ? mapData.nodes : [], "id");
  }

  function rebuildIndexes() {
    store.indexes.itemsById = buildIdIndex(store.data.items);
    store.indexes.animalsById = buildIdIndex(store.data.animals);
    store.indexes.plantsById = buildIdIndex(store.data.plants);
    store.indexes.traitsById = buildIdIndex(store.data.traits);
    store.indexes.mutationsById = buildIdIndex(store.data.mutations);
    store.indexes.classesById = buildIdIndex(store.data.classes);
    store.indexes.skillsById = buildIdIndex(store.data.skills);
    store.indexes.recipesById = buildIdIndex(store.data.recipes);
    store.indexes.structuresById = buildIdIndex(store.data.structures);
    store.indexes.encountersById = buildIdIndex(store.data.encounters);
    store.indexes.dialogueById = buildIdIndex(store.data.dialogue);
    store.indexes.statusEffectsById = buildIdIndex(store.data.statusEffects);
    store.indexes.tutorialsById = buildIdIndex(store.data.tutorials);
    store.indexes.cheatsById = buildIdIndex(store.data.cheats);
    store.indexes.mapNodesById = buildMapNodeIndex(store.data.map);
    store.indexes.mapTilesByKey = buildMapTileIndex(store.data.map);
  }

  function getStore() {
    return store;
  }

  function getSettings() {
    return store.settings;
  }

  function getMeta() {
    return store.meta;
  }

  function getGame() {
    return store.game;
  }

  function getData() {
    return store.data;
  }

  function getIndexes() {
    return store.indexes;
  }

  function getRuntime() {
    return store.runtime;
  }

  function markInitialized(value = true) {
    store.initialized = Boolean(value);
    return store.initialized;
  }

  function setDataLoaded(value = true) {
    store.dataLoaded = Boolean(value);
    return store.dataLoaded;
  }

  function addDataLoadError(message) {
    const text = String(message || "Unknown data load error.");
    store.dataLoadErrors.push(text);
    U.warn(text);
    return text;
  }

  function clearDataLoadErrors() {
    store.dataLoadErrors = [];
  }

  function setSettings(newSettings = {}) {
    store.settings = U.deepMerge(CFG.getDefaultSettings(), newSettings);
    U.eventBus.emit("settings:changed", U.deepClone(store.settings));
    return store.settings;
  }

  function updateSettings(partial = {}) {
    store.settings = U.deepMerge(store.settings, partial);
    U.eventBus.emit("settings:changed", U.deepClone(store.settings));
    return store.settings;
  }

  function setMeta(newMeta = {}) {
    store.meta = U.deepMerge(CFG.getDefaultMeta(), newMeta);
    U.eventBus.emit("meta:changed", U.deepClone(store.meta));
    return store.meta;
  }

  function updateMeta(partial = {}) {
    store.meta = U.deepMerge(store.meta, partial);
    U.eventBus.emit("meta:changed", U.deepClone(store.meta));
    return store.meta;
  }

  function setGame(newGameState = {}) {
    const clean = U.deepMerge(CFG.createNewGameState(), newGameState);
    store.game = clean;
    U.eventBus.emit("game:replaced", U.deepClone(store.game));
    return store.game;
  }

  function resetGame() {
    store.game = CFG.createNewGameState();
    U.eventBus.emit("game:reset", U.deepClone(store.game));
    return store.game;
  }

  function touchGameUpdatedAt() {
    if (!store.game) return;
    store.game.updatedAt = U.isoNow();
  }

  function updateGame(partial = {}) {
    store.game = U.deepMerge(store.game, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("game:changed", U.deepClone(store.game));
    return store.game;
  }

  function replaceDataBucket(key, value) {
    if (!(key in store.data)) {
      throw new Error(`Unknown data bucket: ${key}`);
    }
    store.data[key] = U.deepClone(value);
    rebuildIndexes();
    U.eventBus.emit("data:bucketChanged", { key, value: U.deepClone(store.data[key]) });
    return store.data[key];
  }

  function setAllData(payload = {}) {
    for (const key of Object.keys(store.data)) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        store.data[key] = U.deepClone(payload[key]);
      }
    }
    rebuildIndexes();
    setDataLoaded(true);
    U.eventBus.emit("data:loaded", U.deepClone(store.data));
    return store.data;
  }

  function setRuntime(partial = {}) {
    store.runtime = U.deepMerge(store.runtime, partial);
    U.eventBus.emit("runtime:changed", U.deepClone(store.runtime));
    return store.runtime;
  }

  function updateRuntime(partial = {}) {
    store.runtime = U.deepMerge(store.runtime, partial);
    U.eventBus.emit("runtime:changed", U.deepClone(store.runtime));
    return store.runtime;
  }

  function setCurrentScreen(screenId) {
    store.runtime.currentScreen = String(screenId || CFG.UI.defaultScreen);
    U.eventBus.emit("screen:changed", store.runtime.currentScreen);
    return store.runtime.currentScreen;
  }

  function getCurrentScreen() {
    return store.runtime.currentScreen;
  }

  function openModal(modalId) {
    const id = String(modalId || "").trim();
    if (!id) return store.runtime.openModals;
    if (!store.runtime.openModals.includes(id)) {
      store.runtime.openModals.push(id);
      U.eventBus.emit("modal:opened", id);
    }
    return [...store.runtime.openModals];
  }

  function closeModal(modalId) {
    const id = String(modalId || "").trim();
    if (!id) return [...store.runtime.openModals];
    store.runtime.openModals = store.runtime.openModals.filter((entry) => entry !== id);
    U.eventBus.emit("modal:closed", id);
    return [...store.runtime.openModals];
  }

  function closeAllModals() {
    const closed = [...store.runtime.openModals];
    store.runtime.openModals = [];
    closed.forEach((id) => U.eventBus.emit("modal:closed", id));
    return [];
  }

  function isModalOpen(modalId) {
    return store.runtime.openModals.includes(String(modalId || ""));
  }

  function setActiveSaveSlot(slotId) {
    store.activeSaveSlot = slotId;
    updateMeta({ lastOpenedSlot: slotId });
    U.eventBus.emit("saveSlot:changed", slotId);
    return store.activeSaveSlot;
  }

  function getActiveSaveSlot() {
    return store.activeSaveSlot;
  }

  function getPlayer() {
    return store.game.player;
  }

  function setPlayer(newPlayer = {}) {
    store.game.player = U.deepMerge(CFG.getDefaultPlayerState(), newPlayer);
    touchGameUpdatedAt();
    U.eventBus.emit("player:changed", U.deepClone(store.game.player));
    return store.game.player;
  }

  function updatePlayer(partial = {}) {
    store.game.player = U.deepMerge(store.game.player, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("player:changed", U.deepClone(store.game.player));
    return store.game.player;
  }

  function getPlayerStats() {
    return store.game.player?.stats || {};
  }

  function updatePlayerStats(partial = {}) {
    store.game.player.stats = U.deepMerge(store.game.player.stats || {}, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("playerStats:changed", U.deepClone(store.game.player.stats));
    return store.game.player.stats;
  }

  function modifyPlayerStat(statKey, amount = 0, options = {}) {
    const stats = store.game.player?.stats || {};
    const key = String(statKey || "");
    if (!key) return null;

    const current = Number(stats[key] || 0);
    const maxKey = options.maxKey || `max${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    const min = options.min ?? 0;
    const max = options.max ?? stats[maxKey] ?? Infinity;
    const next = U.clamp(current + Number(amount || 0), min, max);

    stats[key] = next;
    touchGameUpdatedAt();
    U.eventBus.emit("playerStats:changed", U.deepClone(stats));
    return next;
  }

  function getWorld() {
    return store.game.world;
  }

  function setWorld(newWorld = {}) {
    store.game.world = U.deepMerge(CFG.getDefaultWorldState(), newWorld);
    touchGameUpdatedAt();
    U.eventBus.emit("world:changed", U.deepClone(store.game.world));
    return store.game.world;
  }

  function updateWorld(partial = {}) {
    store.game.world = U.deepMerge(store.game.world, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("world:changed", U.deepClone(store.game.world));
    return store.game.world;
  }

  function setWorldTime(day, hour, minute) {
    store.game.world.day = Math.max(1, Number(day || 1));
    store.game.world.hour = U.clamp(Number(hour || 0), 0, 23);
    store.game.world.minute = U.clamp(Number(minute || 0), 0, 59);
    touchGameUpdatedAt();
    U.eventBus.emit("world:timeChanged", {
      day: store.game.world.day,
      hour: store.game.world.hour,
      minute: store.game.world.minute
    });
    return {
      day: store.game.world.day,
      hour: store.game.world.hour,
      minute: store.game.world.minute
    };
  }

  function advanceWorldMinutes(minutes = 1) {
    let total = Math.max(0, Math.floor(Number(minutes || 0)));
    while (total > 0) {
      store.game.world.minute += 1;
      if (store.game.world.minute >= 60) {
        store.game.world.minute = 0;
        store.game.world.hour += 1;
      }
      if (store.game.world.hour >= 24) {
        store.game.world.hour = 0;
        store.game.world.day += 1;
      }
      total -= 1;
    }
    touchGameUpdatedAt();
    U.eventBus.emit("world:timeChanged", {
      day: store.game.world.day,
      hour: store.game.world.hour,
      minute: store.game.world.minute
    });
    return getWorld();
  }

  function getWorldTileKey(x, y) {
    return `${Number(x || 0)},${Number(y || 0)}`;
  }

  function getCurrentTileKey() {
    return getWorldTileKey(store.game.world.currentTileX, store.game.world.currentTileY);
  }

  function movePlayerToTile(x, y, biomeId = null) {
    store.game.world.currentTileX = Number(x || 0);
    store.game.world.currentTileY = Number(y || 0);
    if (biomeId) {
      store.game.world.currentBiomeId = String(biomeId);
    }
    revealTile(x, y);
    touchGameUpdatedAt();
    U.eventBus.emit("world:playerMoved", {
      x: store.game.world.currentTileX,
      y: store.game.world.currentTileY,
      biomeId: store.game.world.currentBiomeId
    });
    return getWorld();
  }

  function revealTile(x, y) {
    const key = getWorldTileKey(x, y);
    if (!Array.isArray(store.game.world.revealedTiles)) {
      store.game.world.revealedTiles = [];
    }
    if (!store.game.world.revealedTiles.includes(key)) {
      store.game.world.revealedTiles.push(key);
      U.eventBus.emit("world:tileRevealed", key);
    }
    return key;
  }

  function clearTile(x, y) {
    const key = getWorldTileKey(x, y);
    if (!Array.isArray(store.game.world.clearedTiles)) {
      store.game.world.clearedTiles = [];
    }
    if (!store.game.world.clearedTiles.includes(key)) {
      store.game.world.clearedTiles.push(key);
      U.eventBus.emit("world:tileCleared", key);
    }
    return key;
  }

  function isTileRevealed(x, y) {
    const key = getWorldTileKey(x, y);
    return Array.isArray(store.game.world.revealedTiles) && store.game.world.revealedTiles.includes(key);
  }

  function isTileCleared(x, y) {
    const key = getWorldTileKey(x, y);
    return Array.isArray(store.game.world.clearedTiles) && store.game.world.clearedTiles.includes(key);
  }

  function getBoat() {
    return store.game.boat;
  }

  function setBoat(newBoat = {}) {
    store.game.boat = U.deepMerge(CFG.getDefaultBoatState(), newBoat);
    touchGameUpdatedAt();
    U.eventBus.emit("boat:changed", U.deepClone(store.game.boat));
    return store.game.boat;
  }

  function updateBoat(partial = {}) {
    store.game.boat = U.deepMerge(store.game.boat, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("boat:changed", U.deepClone(store.game.boat));
    return store.game.boat;
  }

  function getBase() {
    return store.game.base;
  }

  function setBase(newBase = {}) {
    store.game.base = U.deepMerge(CFG.getDefaultBaseState(), newBase);
    touchGameUpdatedAt();
    U.eventBus.emit("base:changed", U.deepClone(store.game.base));
    return store.game.base;
  }

  function updateBase(partial = {}) {
    store.game.base = U.deepMerge(store.game.base, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("base:changed", U.deepClone(store.game.base));
    return store.game.base;
  }

  function getParty() {
    return store.game.party;
  }

  function setParty(newParty = {}) {
    store.game.party = U.deepMerge(CFG.getDefaultPartyState(), newParty);
    touchGameUpdatedAt();
    U.eventBus.emit("party:changed", U.deepClone(store.game.party));
    return store.game.party;
  }

  function updateParty(partial = {}) {
    store.game.party = U.deepMerge(store.game.party, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("party:changed", U.deepClone(store.game.party));
    return store.game.party;
  }

  function addCompanion(companion = {}, toReserve = false) {
    const entry = U.deepMerge(
      {
        id: U.uid("comp"),
        name: "Unnamed Companion",
        speciesId: null,
        classId: null,
        level: 1,
        stats: {
          health: 50,
          maxHealth: 50,
          stamina: 50,
          maxStamina: 50
        },
        traits: [],
        skills: {},
        statusEffects: []
      },
      companion
    );

    if (toReserve || (store.game.party.active.length >= CFG.PARTY.maxPartySize - 1)) {
      U.ensureArrayProp(store.game.party, "reserve").push(entry);
    } else {
      U.ensureArrayProp(store.game.party, "active").push(entry);
    }

    touchGameUpdatedAt();
    U.eventBus.emit("party:changed", U.deepClone(store.game.party));
    return entry;
  }

  function removeCompanion(companionId) {
    const id = String(companionId || "");
    let removed = null;

    ["active", "reserve"].forEach((bucket) => {
      const arr = U.ensureArrayProp(store.game.party, bucket);
      const idx = arr.findIndex((entry) => entry?.id === id);
      if (idx >= 0) {
        removed = arr.splice(idx, 1)[0];
      }
    });

    if (removed) {
      touchGameUpdatedAt();
      U.eventBus.emit("party:changed", U.deepClone(store.game.party));
    }

    return removed;
  }

  function getQuests() {
    return store.game.quests;
  }

  function updateQuests(partial = {}) {
    store.game.quests = U.deepMerge(store.game.quests, partial);
    touchGameUpdatedAt();
    U.eventBus.emit("quests:changed", U.deepClone(store.game.quests));
    return store.game.quests;
  }

  function addActiveQuest(questId) {
    const id = String(questId || "").trim();
    if (!id) return getQuests();
    const active = U.ensureArrayProp(store.game.quests, "active");
    if (!active.includes(id)) active.push(id);
    touchGameUpdatedAt();
    U.eventBus.emit("quests:changed", U.deepClone(store.game.quests));
    return store.game.quests;
  }

  function completeQuest(questId) {
    const id = String(questId || "").trim();
    if (!id) return getQuests();
    store.game.quests.active = U.ensureArrayProp(store.game.quests, "active").filter((q) => q !== id);
    if (!U.ensureArrayProp(store.game.quests, "completed").includes(id)) {
      store.game.quests.completed.push(id);
    }
    touchGameUpdatedAt();
    U.eventBus.emit("quests:changed", U.deepClone(store.game.quests));
    return store.game.quests;
  }

  function getFlags() {
    return store.game.flags;
  }

  function setFlag(flagKey, value = true) {
    if (!flagKey) return null;
    store.game.flags[String(flagKey)] = value;
    touchGameUpdatedAt();
    U.eventBus.emit("flags:changed", U.deepClone(store.game.flags));
    return value;
  }

  function getFlag(flagKey, fallback = false) {
    return store.game.flags?.[flagKey] ?? fallback;
  }

  function getInventory(target = "player") {
    if (target === "player") return U.ensureArrayProp(store.game.player, "inventory");
    if (target === "boat") return U.ensureArrayProp(store.game.boat, "storage");
    if (target === "base") return U.ensureArrayProp(store.game.base, "storage");
    return [];
  }

  function addItem(target = "player", itemId, quantity = 1, extra = {}) {
    const inventory = getInventory(target);
    U.addToStackedInventory(inventory, itemId, quantity, extra);
    touchGameUpdatedAt();
    U.eventBus.emit("inventory:changed", { target, inventory: U.deepClone(inventory) });
    return inventory;
  }

  function removeItem(target = "player", itemId, quantity = 1) {
    const inventory = getInventory(target);
    const ok = U.removeFromStackedInventory(inventory, itemId, quantity);
    if (ok) {
      touchGameUpdatedAt();
      U.eventBus.emit("inventory:changed", { target, inventory: U.deepClone(inventory) });
    }
    return ok;
  }

  function getItemQuantity(target = "player", itemId) {
    return U.getItemQuantity(getInventory(target), itemId);
  }

  function hasItem(target = "player", itemId, quantity = 1) {
    return U.hasItemQuantity(getInventory(target), itemId, quantity);
  }

  function setSelectedTile(tile) {
    store.runtime.selectedTile = tile ? U.deepClone(tile) : null;
    U.eventBus.emit("runtime:selectedTileChanged", store.runtime.selectedTile);
    return store.runtime.selectedTile;
  }

  function setSelectedInventoryEntry(entry) {
    store.runtime.selectedInventoryEntry = entry ? U.deepClone(entry) : null;
    U.eventBus.emit("runtime:selectedInventoryEntryChanged", store.runtime.selectedInventoryEntry);
    return store.runtime.selectedInventoryEntry;
  }

  function addToast(message, type = "info") {
    const toast = {
      id: U.uid("toast"),
      message: String(message || ""),
      type,
      createdAt: U.now()
    };
    U.ensureArrayProp(store.runtime.ui, "toasts").push(toast);
    U.eventBus.emit("ui:toastAdded", U.deepClone(toast));
    return toast;
  }

  function removeToast(toastId) {
    const id = String(toastId || "");
    store.runtime.ui.toasts = U.ensureArrayProp(store.runtime.ui, "toasts").filter((t) => t.id !== id);
    U.eventBus.emit("ui:toastRemoved", id);
  }

  function logActivity(message, type = "info") {
    const entry = {
      id: U.uid("log"),
      message: String(message || ""),
      type,
      at: U.now()
    };
    const log = U.ensureArrayProp(store.runtime.ui, "activityLog");
    log.unshift(entry);
    if (log.length > CFG.UI.logMaxEntries) {
      log.length = CFG.UI.logMaxEntries;
    }
    U.eventBus.emit("ui:activityLogged", U.deepClone(entry));
    return entry;
  }

  function clearActivityLog() {
    store.runtime.ui.activityLog = [];
    U.eventBus.emit("ui:activityCleared");
  }

  function setCombatState(partial = {}) {
    store.runtime.combat = U.deepMerge(store.runtime.combat, partial);
    U.eventBus.emit("combat:changed", U.deepClone(store.runtime.combat));
    return store.runtime.combat;
  }

  function startCombat(encounterId, payload = {}) {
    store.runtime.combat = U.deepMerge(
      {
        active: true,
        encounterId: encounterId || null,
        turnIndex: 0,
        round: 1,
        actors: [],
        enemies: [],
        allies: [],
        log: []
      },
      payload,
      {
        active: true,
        encounterId: encounterId || null
      }
    );

    store.game.runtime.inCombat = true;
    store.game.runtime.currentEncounterId = encounterId || null;
    touchGameUpdatedAt();

    U.eventBus.emit("combat:started", U.deepClone(store.runtime.combat));
    return store.runtime.combat;
  }

  function endCombat(result = "ended") {
    store.runtime.combat.active = false;
    store.runtime.combat.result = result;
    store.game.runtime.inCombat = false;
    store.game.runtime.currentEncounterId = null;
    touchGameUpdatedAt();
    U.eventBus.emit("combat:ended", { result, combat: U.deepClone(store.runtime.combat) });
    return store.runtime.combat;
  }

  function pushCombatLog(message) {
    const line = String(message || "");
    U.ensureArrayProp(store.runtime.combat, "log").push(line);
    U.eventBus.emit("combat:log", line);
    return line;
  }

  function setRuntimeTimer(timerKey, value = U.now()) {
    if (!store.runtime.timers) store.runtime.timers = {};
    store.runtime.timers[timerKey] = value;
    return value;
  }

  function getRuntimeTimer(timerKey, fallback = null) {
    return store.runtime.timers?.[timerKey] ?? fallback;
  }

  function setAdminFlag(flagKey, value = true) {
    if (!store.runtime.admin) store.runtime.admin = {};
    store.runtime.admin[String(flagKey)] = value;
    U.eventBus.emit("admin:changed", U.deepClone(store.runtime.admin));
    return value;
  }

  function pushAdminCommand(commandText) {
    const text = String(commandText || "").trim();
    if (!text) return null;

    if (!Array.isArray(store.runtime.admin.commandHistory)) {
      store.runtime.admin.commandHistory = [];
    }

    store.runtime.admin.lastCommand = text;
    store.runtime.admin.commandHistory.unshift({
      id: U.uid("cmd"),
      text,
      at: U.now()
    });

    if (store.runtime.admin.commandHistory.length > 100) {
      store.runtime.admin.commandHistory.length = 100;
    }

    U.eventBus.emit("admin:command", text);
    return text;
  }

  function getDataEntry(bucket, id) {
    const indexName = `${bucket}ById`;
    if (store.indexes[indexName] && id in store.indexes[indexName]) {
      return store.indexes[indexName][id];
    }
    return null;
  }

  function getItemDef(itemId) {
    return store.indexes.itemsById[itemId] || null;
  }

  function getAnimalDef(animalId) {
    return store.indexes.animalsById[animalId] || null;
  }

  function getPlantDef(plantId) {
    return store.indexes.plantsById[plantId] || null;
  }

  function getTraitDef(traitId) {
    return store.indexes.traitsById[traitId] || null;
  }

  function getMutationDef(mutationId) {
    return store.indexes.mutationsById[mutationId] || null;
  }

  function getRecipeDef(recipeId) {
    return store.indexes.recipesById[recipeId] || null;
  }

  function getStructureDef(structureId) {
    return store.indexes.structuresById[structureId] || null;
  }

  function getClassDef(classId) {
    return store.indexes.classesById[classId] || null;
  }

  function getSkillDef(skillId) {
    return store.indexes.skillsById[skillId] || null;
  }

  function getEncounterDef(encounterId) {
    return store.indexes.encountersById[encounterId] || null;
  }

  function getTutorialDef(tutorialId) {
    return store.indexes.tutorialsById[tutorialId] || null;
  }

  function getMapTile(x, y) {
    return store.indexes.mapTilesByKey[getWorldTileKey(x, y)] || null;
  }

  function getCurrentMapTile() {
    return getMapTile(store.game.world.currentTileX, store.game.world.currentTileY);
  }

  function getMapNode(nodeId) {
    return store.indexes.mapNodesById[nodeId] || null;
  }

  function hydrateInventoryEntries(list = []) {
    return U.toArray(list).map((entry) => {
      const def = getItemDef(entry?.itemId);
      return {
        ...U.deepClone(entry),
        def: def ? U.deepClone(def) : null
      };
    });
  }

  function snapshot() {
    return U.deepClone({
      initialized: store.initialized,
      bootedAt: store.bootedAt,
      dataLoaded: store.dataLoaded,
      dataLoadErrors: store.dataLoadErrors,
      activeSaveSlot: store.activeSaveSlot,
      settings: store.settings,
      meta: store.meta,
      game: store.game,
      runtime: store.runtime
    });
  }

  function hardResetAll() {
    store.initialized = false;
    store.bootedAt = U.now();
    store.dataLoaded = false;
    store.dataLoadErrors = [];
    store.activeSaveSlot = null;
    store.settings = CFG.getDefaultSettings();
    store.meta = CFG.getDefaultMeta();
    store.game = CFG.createNewGameState();
    store.runtime = U.deepMerge(store.runtime, {
      currentScreen: CFG.UI.defaultScreen,
      openModals: [],
      hoveredEntityId: null,
      selectedEntityId: null,
      selectedTile: null,
      selectedInventoryEntry: null,
      selectedPartyMemberId: null,
      selectedRecipeId: null,
      selectedStructureId: null,
      selectedDnaEntryId: null,
      combat: {
        active: false,
        encounterId: null,
        turnIndex: 0,
        round: 1,
        actors: [],
        enemies: [],
        allies: [],
        log: []
      },
      ui: {
        draggingModalId: null,
        minimapExpanded: false,
        minimapVisible: CFG.UI.minimapVisibleByDefault,
        toasts: [],
        activityLog: [],
        lastPointerType: "mouse"
      },
      timers: {
        gameLoopStartedAt: null,
        lastTickAt: U.now(),
        lastWeatherTickAt: U.now(),
        lastPassiveTickAt: U.now(),
        lastAutosaveAt: 0
      },
      admin: {
        godMode: false,
        debugOverlayVisible: false,
        lastCommand: null,
        commandHistory: []
      }
    });

    U.eventBus.emit("state:hardReset");
    return snapshot();
  }

  const API = {
    getStore,
    getSettings,
    getMeta,
    getGame,
    getData,
    getIndexes,
    getRuntime,

    markInitialized,
    setDataLoaded,
    addDataLoadError,
    clearDataLoadErrors,

    setSettings,
    updateSettings,
    setMeta,
    updateMeta,

    setGame,
    resetGame,
    updateGame,

    replaceDataBucket,
    setAllData,
    rebuildIndexes,

    setRuntime,
    updateRuntime,
    setCurrentScreen,
    getCurrentScreen,

    openModal,
    closeModal,
    closeAllModals,
    isModalOpen,

    setActiveSaveSlot,
    getActiveSaveSlot,

    getPlayer,
    setPlayer,
    updatePlayer,
    getPlayerStats,
    updatePlayerStats,
    modifyPlayerStat,

    getWorld,
    setWorld,
    updateWorld,
    setWorldTime,
    advanceWorldMinutes,
    getWorldTileKey,
    getCurrentTileKey,
    movePlayerToTile,
    revealTile,
    clearTile,
    isTileRevealed,
    isTileCleared,

    getBoat,
    setBoat,
    updateBoat,

    getBase,
    setBase,
    updateBase,

    getParty,
    setParty,
    updateParty,
    addCompanion,
    removeCompanion,

    getQuests,
    updateQuests,
    addActiveQuest,
    completeQuest,

    getFlags,
    setFlag,
    getFlag,

    getInventory,
    addItem,
    removeItem,
    getItemQuantity,
    hasItem,

    setSelectedTile,
    setSelectedInventoryEntry,

    addToast,
    removeToast,
    logActivity,
    clearActivityLog,

    setCombatState,
    startCombat,
    endCombat,
    pushCombatLog,

    setRuntimeTimer,
    getRuntimeTimer,

    setAdminFlag,
    pushAdminCommand,

    getDataEntry,
    getItemDef,
    getAnimalDef,
    getPlantDef,
    getTraitDef,
    getMutationDef,
    getRecipeDef,
    getStructureDef,
    getClassDef,
    getSkillDef,
    getEncounterDef,
    getTutorialDef,
    getMapTile,
    getCurrentMapTile,
    getMapNode,
    hydrateInventoryEntries,

    snapshot,
    hardResetAll
  };

  window.GL_STATE = API;

  return Object.freeze(API);
})();