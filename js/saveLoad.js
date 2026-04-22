window.GrabLabSaveLoad = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;

  function getSlotKey(slotIndex) {
    return CFG.getSaveSlotKey(slotIndex);
  }

  function getAutosaveKey() {
    return CFG.APP.autosaveKey;
  }

  function getMetaKey() {
    return CFG.APP.metaKey;
  }

  function getSettingsKey() {
    return CFG.APP.settingsKey;
  }

  function sanitizeSlotIndex(slotIndex) {
    const num = Number(slotIndex);
    if (!Number.isInteger(num)) return null;
    if (num < 1 || num > CFG.APP.maxSaveSlots) return null;
    return num;
  }

  function buildSaveSummary(gameState = {}, slotId = null, saveType = "manual") {
    const player = gameState?.player || {};
    const world = gameState?.world || {};
    const base = gameState?.base || {};
    const boat = gameState?.boat || {};
    const party = gameState?.party || {};
    const stats = player?.stats || {};

    const activeCount = Array.isArray(party?.active) ? party.active.length : 0;
    const reserveCount = Array.isArray(party?.reserve) ? party.reserve.length : 0;

    return {
      slotId,
      saveType,
      appVersion: gameState?.appVersion || CFG.APP.version,
      playerName: player?.name || CFG.PLAYER.startingName,
      level: Number(stats?.level || 1),
      day: Number(world?.day || 1),
      time: U.formatClock(world?.hour || 0, world?.minute || 0),
      biomeId: world?.currentBiomeId || CFG.WORLD.startingBiomeId,
      tileX: Number(world?.currentTileX || 0),
      tileY: Number(world?.currentTileY || 0),
      currentMapNodeId: world?.currentMapNodeId || null,
      health: Number(stats?.health || 0),
      maxHealth: Number(stats?.maxHealth || 0),
      infection: Number(stats?.infection || 0),
      morale: Number(stats?.morale || 0),
      boatName: boat?.name || "Unknown Boat",
      baseName: base?.name || "Unknown Base",
      activePartyCount: activeCount,
      reservePartyCount: reserveCount,
      updatedAt: gameState?.updatedAt || U.isoNow(),
      createdAt: gameState?.createdAt || U.isoNow()
    };
  }

  function buildSavePayload(gameState = {}, options = {}) {
    const slotId = options.slotId ?? null;
    const saveType = options.saveType || "manual";

    return {
      saveMeta: {
        slotId,
        saveType,
        exportedAt: U.isoNow(),
        appId: CFG.APP.id,
        appTitle: CFG.APP.title,
        appVersion: CFG.APP.version,
        buildName: CFG.APP.buildName
      },
      summary: buildSaveSummary(gameState, slotId, saveType),
      settings: U.deepClone(S.getSettings()),
      meta: U.deepClone(S.getMeta()),
      game: U.deepClone(gameState)
    };
  }

  function validateImportedPayload(payload) {
    if (!U.isObject(payload)) {
      return { ok: false, reason: "Import file is not a valid object." };
    }

    if (!U.isObject(payload.game)) {
      return { ok: false, reason: "Import file is missing a valid game block." };
    }

    if (CFG.SAVELOAD.importValidationRequired) {
      const appId = payload?.saveMeta?.appId;
      if (appId && appId !== CFG.APP.id) {
        return { ok: false, reason: `Import file is for another app (${appId}).` };
      }
    }

    if (CFG.SAVELOAD.versionCheckRequired) {
      const version = payload?.saveMeta?.appVersion;
      if (version && version !== CFG.APP.version) {
        return {
          ok: false,
          reason: `Save version mismatch. Expected ${CFG.APP.version}, got ${version}.`
        };
      }
    }

    return { ok: true };
  }

  function saveSettings() {
    const ok = U.saveLocal(getSettingsKey(), S.getSettings());
    if (ok) {
      U.eventBus.emit("saveLoad:settingsSaved", U.deepClone(S.getSettings()));
    }
    return ok;
  }

  function loadSettings() {
    const stored = U.loadLocal(getSettingsKey(), null);
    if (!stored) {
      S.setSettings(CFG.getDefaultSettings());
      return S.getSettings();
    }

    S.setSettings(stored);
    U.eventBus.emit("saveLoad:settingsLoaded", U.deepClone(S.getSettings()));
    return S.getSettings();
  }

  function saveMeta() {
    const ok = U.saveLocal(getMetaKey(), S.getMeta());
    if (ok) {
      U.eventBus.emit("saveLoad:metaSaved", U.deepClone(S.getMeta()));
    }
    return ok;
  }

  function loadMeta() {
    const stored = U.loadLocal(getMetaKey(), null);
    if (!stored) {
      S.setMeta(CFG.getDefaultMeta());
      return S.getMeta();
    }

    S.setMeta(stored);
    U.eventBus.emit("saveLoad:metaLoaded", U.deepClone(S.getMeta()));
    return S.getMeta();
  }

  function saveToSlot(slotIndex) {
    const slot = sanitizeSlotIndex(slotIndex);
    if (!slot) {
      throw new Error(`Invalid save slot: ${slotIndex}`);
    }

    const gameState = U.deepClone(S.getGame());
    const payload = buildSavePayload(gameState, {
      slotId: slot,
      saveType: "manual"
    });

    const ok = U.saveLocal(getSlotKey(slot), payload);
    if (!ok) {
      throw new Error(`Failed to save slot ${slot}.`);
    }

    S.setActiveSaveSlot(slot);
    S.updateMeta({
      lastOpenedSlot: slot,
      lastVersion: CFG.APP.version,
      firstRunComplete: true
    });

    saveMeta();

    const summary = payload.summary;
    S.logActivity(`Saved game to slot ${slot}: ${summary.playerName} - Day ${summary.day}, ${summary.time}.`, "success");
    U.eventBus.emit("saveLoad:slotSaved", U.deepClone(summary));

    return summary;
  }

  function loadFromSlot(slotIndex) {
    const slot = sanitizeSlotIndex(slotIndex);
    if (!slot) {
      throw new Error(`Invalid load slot: ${slotIndex}`);
    }

    const payload = U.loadLocal(getSlotKey(slot), null);
    if (!payload) {
      throw new Error(`No save found in slot ${slot}.`);
    }

    const validation = validateImportedPayload(payload);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    S.setGame(payload.game);
    S.setSettings(payload.settings || CFG.getDefaultSettings());
    S.setMeta(payload.meta || CFG.getDefaultMeta());
    S.setActiveSaveSlot(slot);

    saveSettings();
    saveMeta();

    const summary = payload.summary || buildSaveSummary(payload.game, slot, "manual");
    S.logActivity(`Loaded slot ${slot}: ${summary.playerName} - Day ${summary.day}, ${summary.time}.`, "info");
    U.eventBus.emit("saveLoad:slotLoaded", U.deepClone(summary));

    return summary;
  }

  function saveAutosave() {
    const gameState = U.deepClone(S.getGame());
    const payload = buildSavePayload(gameState, {
      slotId: CFG.SAVELOAD.autoSaveSlotId,
      saveType: "autosave"
    });

    const ok = U.saveLocal(getAutosaveKey(), payload);
    if (!ok) {
      throw new Error("Failed to write autosave.");
    }

    S.setRuntimeTimer("lastAutosaveAt", U.now());

    const summary = payload.summary;
    U.eventBus.emit("saveLoad:autosaved", U.deepClone(summary));
    return summary;
  }

  function loadAutosave() {
    const payload = U.loadLocal(getAutosaveKey(), null);
    if (!payload) {
      throw new Error("No autosave found.");
    }

    const validation = validateImportedPayload(payload);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    S.setGame(payload.game);
    if (payload.settings) S.setSettings(payload.settings);
    if (payload.meta) S.setMeta(payload.meta);

    saveSettings();
    saveMeta();

    const summary = payload.summary || buildSaveSummary(payload.game, CFG.SAVELOAD.autoSaveSlotId, "autosave");
    S.logActivity(`Loaded autosave: ${summary.playerName} - Day ${summary.day}, ${summary.time}.`, "info");
    U.eventBus.emit("saveLoad:autosaveLoaded", U.deepClone(summary));

    return summary;
  }

  function deleteSlot(slotIndex) {
    const slot = sanitizeSlotIndex(slotIndex);
    if (!slot) {
      throw new Error(`Invalid delete slot: ${slotIndex}`);
    }

    const existed = U.hasLocal(getSlotKey(slot));
    U.removeLocal(getSlotKey(slot));

    if (S.getActiveSaveSlot() === slot) {
      S.setActiveSaveSlot(null);
    }

    if (existed) {
      S.logActivity(`Deleted save slot ${slot}.`, "warning");
      U.eventBus.emit("saveLoad:slotDeleted", slot);
    }

    return existed;
  }

  function deleteAutosave() {
    const existed = U.hasLocal(getAutosaveKey());
    U.removeLocal(getAutosaveKey());

    if (existed) {
      S.logActivity("Deleted autosave.", "warning");
      U.eventBus.emit("saveLoad:autosaveDeleted");
    }

    return existed;
  }

  function getSlotPayload(slotIndex) {
    const slot = sanitizeSlotIndex(slotIndex);
    if (!slot) return null;
    return U.loadLocal(getSlotKey(slot), null);
  }

  function getAutosavePayload() {
    return U.loadLocal(getAutosaveKey(), null);
  }

  function getSlotSummary(slotIndex) {
    const payload = getSlotPayload(slotIndex);
    if (!payload) return null;
    return payload.summary || buildSaveSummary(payload.game, slotIndex, "manual");
  }

  function getAutosaveSummary() {
    const payload = getAutosavePayload();
    if (!payload) return null;
    return payload.summary || buildSaveSummary(payload.game, CFG.SAVELOAD.autoSaveSlotId, "autosave");
  }

  function listManualSlots() {
    const slots = [];

    for (let i = 1; i <= CFG.APP.maxSaveSlots; i += 1) {
      const payload = getSlotPayload(i);
      if (!payload) {
        slots.push({
          slotId: i,
          empty: true,
          saveType: "manual",
          label: `Slot ${i}`
        });
        continue;
      }

      const summary = payload.summary || buildSaveSummary(payload.game, i, "manual");
      slots.push({
        ...summary,
        empty: false,
        label: `Slot ${i}`
      });
    }

    return slots;
  }

  function listAllSaves() {
    const manual = listManualSlots();
    const autosave = getAutosaveSummary();

    return {
      autosave: autosave
        ? { ...autosave, empty: false, label: "Autosave" }
        : { slotId: CFG.SAVELOAD.autoSaveSlotId, empty: true, saveType: "autosave", label: "Autosave" },
      manual
    };
  }

  function exportCurrentSave(filename = null) {
    const payload = buildSavePayload(S.getGame(), {
      slotId: S.getActiveSaveSlot(),
      saveType: "export"
    });

    const safeName =
      filename ||
      `${CFG.SAVELOAD.exportFilePrefix}-${U.slugify(payload.summary.playerName || "save")}-day-${payload.summary.day}.json`;

    U.downloadTextFile(safeName, U.safeStringify(payload, "{}"));
    S.logActivity(`Exported save file: ${safeName}`, "success");
    U.eventBus.emit("saveLoad:exported", safeName);

    return safeName;
  }

  async function importFromFile(file) {
    const text = await U.readFileAsText(file);
    const payload = U.safeJsonParse(text, null);

    const validation = validateImportedPayload(payload);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    return payload;
  }

  async function importAndLoadFile(file) {
    const payload = await importFromFile(file);

    S.setGame(payload.game);
    if (payload.settings) S.setSettings(payload.settings);
    if (payload.meta) S.setMeta(payload.meta);

    saveSettings();
    saveMeta();

    const summary = payload.summary || buildSaveSummary(payload.game, null, "import");
    S.logActivity(`Imported save: ${summary.playerName} - Day ${summary.day}, ${summary.time}.`, "success");
    U.eventBus.emit("saveLoad:importLoaded", U.deepClone(summary));

    return summary;
  }

  async function importToSlot(file, slotIndex) {
    const slot = sanitizeSlotIndex(slotIndex);
    if (!slot) {
      throw new Error(`Invalid import slot: ${slotIndex}`);
    }

    const payload = await importFromFile(file);
    payload.saveMeta = U.deepMerge(payload.saveMeta || {}, {
      slotId: slot,
      saveType: "manual",
      importedAt: U.isoNow()
    });
    payload.summary = buildSaveSummary(payload.game, slot, "manual");

    const ok = U.saveLocal(getSlotKey(slot), payload);
    if (!ok) {
      throw new Error(`Failed to import save into slot ${slot}.`);
    }

    S.logActivity(`Imported save into slot ${slot}.`, "success");
    U.eventBus.emit("saveLoad:importedToSlot", U.deepClone(payload.summary));

    return payload.summary;
  }

  function quickSave() {
    const activeSlot = S.getActiveSaveSlot();
    if (activeSlot) {
      return saveToSlot(activeSlot);
    }

    for (let i = 1; i <= CFG.APP.maxSaveSlots; i += 1) {
      if (!getSlotPayload(i)) {
        return saveToSlot(i);
      }
    }

    return saveToSlot(1);
  }

  function quickLoad() {
    const activeSlot = S.getActiveSaveSlot();
    if (activeSlot && getSlotPayload(activeSlot)) {
      return loadFromSlot(activeSlot);
    }

    const meta = S.getMeta();
    if (meta?.lastOpenedSlot && getSlotPayload(meta.lastOpenedSlot)) {
      return loadFromSlot(meta.lastOpenedSlot);
    }

    if (getAutosavePayload()) {
      return loadAutosave();
    }

    throw new Error("No save available to quick load.");
  }

  function canAutosave() {
    const runtime = S.getRuntime();
    const game = S.getGame();

    if (!runtime || !game) return false;
    if (runtime?.combat?.active) return false;
    if (game?.world?.isPaused) return false;

    return true;
  }

  function maybeAutosave(force = false) {
    const runtime = S.getRuntime();
    const lastAutosaveAt = Number(runtime?.timers?.lastAutosaveAt || 0);
    const elapsed = U.now() - lastAutosaveAt;

    if (!force) {
      if (!canAutosave()) return null;
      if (elapsed < CFG.TIMING.autosaveIntervalMs) return null;
    }

    return saveAutosave();
  }

  function getHumanSummaryText(summary) {
    if (!summary || summary.empty) return "Empty Slot";
    return `${summary.playerName} • Lv ${summary.level} • Day ${summary.day} • ${summary.time}`;
  }

  function getDetailedSummaryText(summary) {
    if (!summary || summary.empty) return "No save data.";
    return [
      `${summary.playerName} (Lv ${summary.level})`,
      `Day ${summary.day}, ${summary.time}`,
      `Biome: ${U.titleCase(summary.biomeId || "unknown")}`,
      `Tile: ${summary.tileX}, ${summary.tileY}`,
      `HP: ${summary.health}/${summary.maxHealth}`,
      `Infection: ${summary.infection}%`,
      `Boat: ${summary.boatName}`,
      `Base: ${summary.baseName}`
    ].join("\n");
  }

  function bootPersistence() {
    loadSettings();
    loadMeta();

    if (!S.getMeta()?.firstRunComplete) {
      S.updateMeta({
        firstRunComplete: false,
        lastVersion: CFG.APP.version
      });
      saveMeta();
    }

    U.eventBus.emit("saveLoad:booted");
    return {
      settings: S.getSettings(),
      meta: S.getMeta()
    };
  }

  function wipeAllLocalData() {
    for (let i = 1; i <= CFG.APP.maxSaveSlots; i += 1) {
      U.removeLocal(getSlotKey(i));
    }

    U.removeLocal(getAutosaveKey());
    U.removeLocal(getMetaKey());
    U.removeLocal(getSettingsKey());

    S.hardResetAll();

    U.eventBus.emit("saveLoad:wipedAll");
    return true;
  }

  const API = {
    getSlotKey,
    getAutosaveKey,
    getMetaKey,
    getSettingsKey,
    sanitizeSlotIndex,

    buildSaveSummary,
    buildSavePayload,
    validateImportedPayload,

    saveSettings,
    loadSettings,
    saveMeta,
    loadMeta,

    saveToSlot,
    loadFromSlot,
    saveAutosave,
    loadAutosave,
    deleteSlot,
    deleteAutosave,

    getSlotPayload,
    getAutosavePayload,
    getSlotSummary,
    getAutosaveSummary,
    listManualSlots,
    listAllSaves,

    exportCurrentSave,
    importFromFile,
    importAndLoadFile,
    importToSlot,

    quickSave,
    quickLoad,
    canAutosave,
    maybeAutosave,

    getHumanSummaryText,
    getDetailedSummaryText,
    bootPersistence,
    wipeAllLocalData
  };

  window.GL_SAVE = API;

  return Object.freeze(API);
})();