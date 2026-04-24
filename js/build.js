window.GrabLabBuild = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const AN = window.GrabLabAnimals;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedStructureId: null,
    selectedBuildTarget: "base", // base | boat
    selectedCategory: "all"
  };

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getStructures() {
    return U.toArray(S.getData()?.structures);
  }

  function getStructure(structureId) {
    return S.getStructureDef(structureId) || null;
  }

  function getBaseStructures() {
    return U.toArray(S.getBase()?.structures);
  }

  function getBoatModules() {
    return U.toArray(S.getBoat()?.modules);
  }

  function ensureBoatBuckets() {
    const boat = S.getBoat();

    if (!Array.isArray(boat.modules)) {
      boat.modules = [];
    }

    if (!Array.isArray(boat.habitats)) {
      boat.habitats = [];
    }

    if (!Number.isFinite(Number(boat.storageSlotsBonus))) {
      boat.storageSlotsBonus = 0;
    }

    return boat;
  }

  function ensureBaseTrapBuckets() {
    const base = S.getBase();

    if (!Array.isArray(base.traps)) {
      base.traps = [];
    }

    if (!Array.isArray(base.trapCatchHistory)) {
      base.trapCatchHistory = [];
    }

    return base;
  }

  function getBoatHabitats() {
    ensureBoatBuckets();
    return U.toArray(S.getBoat()?.habitats);
  }

  function getBaseTraps() {
    ensureBaseTrapBuckets();
    return U.toArray(S.getBase()?.traps);
  }

  function getTrapCatchHistory() {
    ensureBaseTrapBuckets();
    return U.toArray(S.getBase()?.trapCatchHistory);
  }

  function getStructureName(structureId) {
    const def = getStructure(structureId);
    return def?.name || U.titleCase(structureId || "structure");
  }

  function getStructureCost(def) {
    return U.toArray(def?.cost || def?.inputs || []);
  }

  function getStructureTags(def) {
    return U.toArray(def?.tags);
  }

  function getStructureCategory(def) {
    if (def?.category) return def.category;
    const tags = getStructureTags(def);

    if (tags.includes("habitat")) return "habitat";
    if (tags.includes("crafting")) return "crafting";
    if (tags.includes("storage")) return "storage";
    if (tags.includes("defense")) return "defense";
    if (tags.includes("boat_upgrade")) return "boat_upgrade";
    if (tags.includes("utility")) return "utility";
    if (tags.includes("farming")) return "farming";

    return "general";
  }

  function isBoatBuild(def) {
    return getStructureTags(def).includes("boat_upgrade") || def?.buildTarget === "boat";
  }

  function canTargetBuild(def, target = "base") {
    if (!def) return false;

    const safeTarget = target === "boat" ? "boat" : "base";

    if (safeTarget === "boat") {
      if (def?.buildTarget === "base") return false;
      return true;
    }

    if (safeTarget === "base") {
      if (getStructureTags(def).includes("boat_upgrade")) return false;
      if (def?.buildTarget === "boat") return false;
      return true;
    }

    return false;
  }

  function getAccessibleBuildList() {
    return getStructures().filter((def) => {
      if (!def?.id) return false;

      if (state.selectedCategory !== "all" && getStructureCategory(def) !== state.selectedCategory) {
        return false;
      }

      return canTargetBuild(def, state.selectedBuildTarget);
    });
  }

  function getInventoryAmount(itemId, source = "all") {
    if (source === "base") return S.getItemQuantity("base", itemId);
    if (source === "boat") return S.getItemQuantity("boat", itemId);
    if (source === "player") return S.getItemQuantity("player", itemId);

    return (
      S.getItemQuantity("player", itemId) +
      S.getItemQuantity("base", itemId) +
      S.getItemQuantity("boat", itemId)
    );
  }

  function getMissingBuildItems(def, quantity = 1, source = "all") {
    return getStructureCost(def)
      .map((entry) => {
        const needed = Number(entry.quantity || 1) * Math.max(1, Number(quantity || 1));
        const have = getInventoryAmount(entry.itemId, source);
        return {
          itemId: entry.itemId,
          needed,
          have,
          missing: Math.max(0, needed - have)
        };
      })
      .filter((entry) => entry.missing > 0);
  }

  function meetsLevelRequirement(def) {
    const required = Number(def?.requiredLevel || 1);
    return P.getPlayerLevel() >= required;
  }

  function meetsTileRequirement(def, tileX = null, tileY = null, target = "base") {
    if (!CFG.BUILDING.allowBuildOnClearedTilesOnly) return true;
    if (target === "boat") return true;
    if (isBoatBuild(def)) return true;

    const world = S.getWorld();
    const x = tileX == null ? world.currentTileX : tileX;
    const y = tileY == null ? world.currentTileY : tileY;

    return S.isTileCleared(x, y) || (x === CFG.WORLD.startingTile.x && y === CFG.WORLD.startingTile.y);
  }

  function canAffordStructure(def, quantity = 1, source = "all") {
    const missing = getMissingBuildItems(def, quantity, source);
    return {
      ok: missing.length === 0,
      missing
    };
  }

  function canBuildStructure(structureId, options = {}) {
    const def = getStructure(structureId);
    if (!def) {
      return { ok: false, reason: "Structure not found." };
    }

    const target = options.target || state.selectedBuildTarget;

    if (!canTargetBuild(def, target)) {
      return {
        ok: false,
        reason: target === "boat"
          ? "That structure cannot be built on the boat."
          : "That structure cannot be built at the main base."
      };
    }

    if (!meetsLevelRequirement(def)) {
      return {
        ok: false,
        reason: `Requires level ${def.requiredLevel || 1}.`
      };
    }

    if (!meetsTileRequirement(def, options.tileX, options.tileY, target)) {
      return {
        ok: false,
        reason: "That tile has not been cleared yet."
      };
    }

    const afford = canAffordStructure(def, options.quantity || 1, options.source || "all");
    if (!afford.ok) {
      return {
        ok: false,
        reason: "Missing required materials.",
        missing: afford.missing
      };
    }

    return { ok: true };
  }

  function removeBuildCosts(def, quantity = 1, preferredSources = ["base", "player", "boat"]) {
    const costs = getStructureCost(def);

    for (const entry of costs) {
      let remaining = Number(entry.quantity || 1) * Math.max(1, Number(quantity || 1));

      for (const source of preferredSources) {
        if (remaining <= 0) break;

        const available = getInventoryAmount(entry.itemId, source);
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        S.removeItem(source, entry.itemId, take);
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(`Failed to remove enough ${entry.itemId}.`);
      }
    }

    return true;
  }

  function addBaseStructure(structureId, quantity = 1) {
    const structures = getBaseStructures();
    const existing = structures.find((entry) => entry.structureId === structureId);

    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Math.max(1, Number(quantity || 1));
    } else {
      structures.push({
        structureId,
        quantity: Math.max(1, Number(quantity || 1))
      });
    }

    S.updateBase({ structures });
    return structures;
  }

  function addBoatModule(structureId, quantity = 1) {
    const modules = getBoatModules();
    const existing = modules.find((entry) => entry.structureId === structureId);

    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Math.max(1, Number(quantity || 1));
    } else {
      modules.push({
        structureId,
        quantity: Math.max(1, Number(quantity || 1))
      });
    }

    S.updateBoat({ modules });
    return modules;
  }

  function createBoatHabitat(structureId, options = {}) {
    const def = getStructure(structureId);
    if (!def) return null;

    return {
      id: options.id || U.uid("boat_hab"),
      structureId,
      name: options.name || def.name || U.titleCase(def.id),
      habitatType: def.habitatType || def.capacityType || "general",
      capacity: Number(def.capacity || def.maxOccupants || 2),
      sizeLimit: def.sizeLimit || "medium",
      water: Boolean(def.water),
      flying: Boolean(def.flying),
      hostTarget: "boat",
      occupants: [],
      cleanliness: 75,
      comfort: 70,
      notes: options.notes || "Installed on the boat."
    };
  }

  function addBoatHabitat(structureId, options = {}) {
    const boat = ensureBoatBuckets();
    const habitats = U.toArray(boat.habitats);
    const habitat = createBoatHabitat(structureId, options);
    if (!habitat) return null;

    habitats.push(habitat);
    S.updateBoat({ habitats });
    return habitat;
  }

  function setStructureUnlockFlags(def, target = "base") {
    if (!def) return false;

    if (getStructureTags(def).includes("utility") && def.unlockFlag) {
      S.setFlag(def.unlockFlag, true);
    }

    switch (def.id) {
      case "animal_pen_t1":
        S.setFlag("animalPenBuilt", true);
        break;
      case "aquarium_t1":
        S.setFlag("aquariumBuilt", true);
        break;
      case "aviary_t1":
        S.setFlag("aviaryBuilt", true);
        break;
      case "breeding_tank_t1":
        S.setFlag("breedingUnlocked", true);
        S.setFlag("breedingTankBuilt", true);
        break;
      case "workbench_t1":
        S.setFlag("craftingUnlocked", true);
        S.setFlag("workbenchBuilt", true);
        break;
      case "field_stove_t1":
        S.setFlag("cookingUnlocked", true);
        S.setFlag("fieldStoveBuilt", true);
        break;
      case "storage_crate_t1":
        S.setFlag("storageBuilt", true);
        break;
      default:
        break;
    }

    if (target === "boat") {
      S.setFlag("boatUtilityBuilt", true);
    }

    return true;
  }

  function logStructureUseHints(def, target = "base", qty = 1) {
    if (!def) return;

    const where = target === "boat" ? "boat" : "base";

    if (def.id === "animal_pen_t1") {
      S.logActivity(`Animal Pen ready at the ${where}. Land animals can now be stored more safely.`, "info");
    }

    if (def.id === "aquarium_t1") {
      S.logActivity(`Aquarium ready at the ${where}. Fish and aquatic creatures can now be housed properly.`, "info");
    }

    if (def.id === "aviary_t1") {
      S.logActivity(`Aviary ready at the ${where}. Flying creatures can now be housed properly.`, "info");
    }

    if (def.id === "breeding_tank_t1") {
      S.logActivity(`Breeding Tank ready at the ${where}. Breeding projects are now supported.`, "info");
    }

    if (def.id === "workbench_t1") {
      S.logActivity(`Workbench ready at the ${where}. Basic crafting recipes are now available.`, "info");
    }

    if (def.id === "field_stove_t1") {
      S.logActivity(`Field Stove ready at the ${where}. Water processing and cooking recipes are now available.`, "info");
    }

    if (getStructureTags(def).includes("storage")) {
      S.logActivity(`${def.name || U.titleCase(def.id)} adds storage capacity at the ${where}.`, "info");
    }

    if (getStructureTags(def).includes("boat_upgrade")) {
      S.logActivity(`${def.name || U.titleCase(def.id)} improves your boat's durability or function.`, "info");
    }

    if (qty > 1) {
      S.logActivity(`Multiple copies installed to expand capacity faster.`, "info");
    }
  }

  function applyStructureEffects(def, options = {}) {
    if (!def) return false;

    const qty = Math.max(1, Number(options.quantity || 1));
    const target = options.target === "boat" ? "boat" : "base";

    if (getStructureTags(def).includes("storage")) {
      if (target === "boat") {
        const current = Number(S.getBoat()?.storageSlotsBonus || 0);
        S.updateBoat({
          storageSlotsBonus: current + (Number(def.storageBonus || 10) * qty)
        });
      } else {
        const current = Number(S.getBase()?.storageSlotsBonus || 0);
        S.updateBase({
          storageSlotsBonus: current + (Number(def.storageBonus || 10) * qty)
        });
      }
    }

    if (getStructureTags(def).includes("boat_upgrade")) {
      const boat = S.getBoat();
      const hpBonus = Number(def.boatHpBonus || 0) * qty;
      const fuelBonus = Number(def.boatFuelBonus || 0) * qty;

      S.updateBoat({
        maxHp: Number(boat.maxHp || 100) + hpBonus,
        hp: Number(boat.hp || 100) + hpBonus,
        maxFuel: Number(boat.maxFuel || 100) + fuelBonus,
        fuel: Number(boat.fuel || 100) + fuelBonus,
        upgradesUnlocked: U.uniqueBy([
          ...U.toArray(boat.upgradesUnlocked),
          def.id
        ], (x) => String(x))
      });
    }

    if (getStructureTags(def).includes("habitat")) {
      for (let i = 0; i < qty; i += 1) {
        if (target === "boat") {
          addBoatHabitat(def.id, {
            name: def.name || U.titleCase(def.id),
            notes: "Installed on the boat."
          });
        } else {
          AN.addHabitat(def.id, {
            name: def.name || U.titleCase(def.id)
          });
        }
      }
    }

    setStructureUnlockFlags(def, target);

    if (def.stationId) {
      S.logActivity(`Unlocked station: ${U.titleCase(def.stationId)}.`, "success");
    }

    logStructureUseHints(def, target, qty);
    return true;
  }

  function reverseStructureEffects(def, options = {}) {
    if (!def) return false;

    const qty = Math.max(1, Number(options.quantity || 1));
    const target = options.target === "boat" ? "boat" : "base";

    if (getStructureTags(def).includes("storage")) {
      if (target === "boat") {
        const current = Number(S.getBoat()?.storageSlotsBonus || 0);
        S.updateBoat({
          storageSlotsBonus: Math.max(0, current - (Number(def.storageBonus || 10) * qty))
        });
      } else {
        const current = Number(S.getBase()?.storageSlotsBonus || 0);
        S.updateBase({
          storageSlotsBonus: Math.max(0, current - (Number(def.storageBonus || 10) * qty))
        });
      }
    }

    if (getStructureTags(def).includes("boat_upgrade")) {
      const boat = S.getBoat();
      const hpBonus = Number(def.boatHpBonus || 0) * qty;
      const fuelBonus = Number(def.boatFuelBonus || 0) * qty;

      S.updateBoat({
        maxHp: Math.max(1, Number(boat.maxHp || 100) - hpBonus),
        hp: Math.min(Number(boat.hp || 100), Math.max(1, Number(boat.maxHp || 100) - hpBonus)),
        maxFuel: Math.max(1, Number(boat.maxFuel || 100) - fuelBonus),
        fuel: Math.min(Number(boat.fuel || 100), Math.max(1, Number(boat.maxFuel || 100) - fuelBonus))
      });
    }

    if (getStructureTags(def).includes("habitat")) {
      if (target === "boat") {
        const nextHabitats = getBoatHabitats();
        const idx = nextHabitats.findIndex((entry) => entry.structureId === def.id);
        if (idx >= 0) {
          nextHabitats.splice(idx, 1);
          S.updateBoat({ habitats: nextHabitats });
        }
      } else {
        const habitats = U.toArray(S.getBase()?.habitats);
        const idx = habitats.findIndex((entry) => entry.structureId === def.id);
        if (idx >= 0) {
          habitats.splice(idx, 1);
          S.updateBase({ habitats });
        }
      }
    }

    return true;
  }

  function getFallbackTrapDefs() {
    return [
      {
        id: "improvised_snare_trap",
        name: "Improvised Snare",
        description: "A simple ground snare for small land animals.",
        tags: ["trap"],
        trapType: "land",
        cycleMinutes: 60,
        catchChance: 0.34,
        cost: [
          { itemId: "rope_bundle", quantity: 1 },
          { itemId: "fiber_bundle", quantity: 2 }
        ]
      },
      {
        id: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A woven fish trap for shallow water catches.",
        tags: ["trap"],
        trapType: "water",
        cycleMinutes: 50,
        catchChance: 0.4,
        cost: [
          { itemId: "fiber_bundle", quantity: 3 },
          { itemId: "scrap_wood", quantity: 1 }
        ]
      }
    ];
  }

  function getTrapItemDefs() {
    const fromItems = U.toArray(S.getData()?.items)
      .filter((entry) => U.toArray(entry?.tags).includes("trap"))
      .map((entry) => ({
        id: entry.id,
        name: entry.name || U.titleCase(entry.id),
        description: entry.description || "A trap item.",
        tags: U.toArray(entry.tags),
        trapType: entry.trapType || (U.toArray(entry.tags).includes("fishing") ? "water" : "land"),
        cycleMinutes: Number(entry.trapCycleMinutes || 60),
        catchChance: Number(entry.trapCatchChance || 0.35),
        source: "item"
      }));

    if (fromItems.length) {
      return fromItems;
    }

    return getFallbackTrapDefs().map((entry) => ({
      ...entry,
      source: "fallback"
    }));
  }

  function getTrapDefById(trapItemId) {
    return getTrapItemDefs().find((entry) => entry.id === trapItemId) || null;
  }

  function getAvailableTrapPlacementOptions() {
    const defs = getTrapItemDefs();

    return defs
      .map((def) => {
        const fromInv = def.source === "item" ? getInventoryAmount(def.id, "all") : Infinity;
        const costs = U.toArray(def.cost || []);
        const craftableFallback = def.source === "fallback"
          ? costs.every((cost) => getInventoryAmount(cost.itemId, "all") >= Number(cost.quantity || 1))
          : true;

        return {
          ...def,
          availableCount: Number.isFinite(fromInv) ? fromInv : 999,
          canPlace: def.source === "item" ? fromInv > 0 : craftableFallback
        };
      })
      .filter((entry) => entry.canPlace);
  }

  function getTrapDisplayName(trapItemId) {
    const def = getTrapDefById(trapItemId);
    return def?.name || U.titleCase(trapItemId || "trap");
  }

  function removeTrapPlacementCost(trapDef, preferredSources = ["player", "base", "boat"]) {
    if (!trapDef) return false;

    if (trapDef.source === "item") {
      for (const source of preferredSources) {
        if (getInventoryAmount(trapDef.id, source) > 0) {
          S.removeItem(source, trapDef.id, 1);
          return true;
        }
      }
      throw new Error(`Missing ${trapDef.id}.`);
    }

    const costs = U.toArray(trapDef.cost || []);
    for (const cost of costs) {
      let remaining = Number(cost.quantity || 1);

      for (const source of preferredSources) {
        if (remaining <= 0) break;
        const available = getInventoryAmount(cost.itemId, source);
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        S.removeItem(source, cost.itemId, take);
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(`Missing ${cost.itemId}.`);
      }
    }

    return true;
  }

  function createTrapRecord(trapItemId, options = {}) {
    const def = getTrapDefById(trapItemId);
    const tile = S.getCurrentMapTile();
    const world = S.getWorld();

    return {
      id: options.id || U.uid("trap"),
      trapItemId,
      name: options.name || def?.name || U.titleCase(trapItemId),
      trapType: options.trapType || def?.trapType || "land",
      tileX: Number(options.tileX ?? world.currentTileX),
      tileY: Number(options.tileY ?? world.currentTileY),
      biomeId: options.biomeId || tile?.biomeId || world.currentBiomeId,
      locationLabel: options.locationLabel || tile?.name || `${world.currentTileX}, ${world.currentTileY}`,
      cycleMinutes: Number(options.cycleMinutes || def?.cycleMinutes || 60),
      catchChance: Number(options.catchChance || def?.catchChance || 0.35),
      baitItemId: options.baitItemId || null,
      active: true,
      elapsedMinutes: 0,
      catchesPending: [],
      lastTriggeredAt: null,
      notes: options.notes || ""
    };
  }

  function placeTrap(trapItemId, options = {}) {
    ensureBaseTrapBuckets();

    const trapDef = getTrapDefById(trapItemId);
    if (!trapDef) {
      throw new Error("Trap type not found.");
    }

    removeTrapPlacementCost(trapDef, options.preferredSources || ["player", "base", "boat"]);

    const traps = getBaseTraps();
    const trap = createTrapRecord(trapItemId, options);
    traps.push(trap);
    S.updateBase({ traps });

    P.awardSkillXp?.("trapping", 4, "placing trap");
    P.awardPlayerXp?.(4, `placing ${trap.name}`);
    S.logActivity(`Placed ${trap.name} at ${trap.locationLabel}.`, "success");
    S.addToast(`Placed ${trap.name}`, "success");

    renderBaseEnhancements();
    UI.renderEverything();
    return trap;
  }

  function removeTrap(trapId, options = {}) {
    ensureBaseTrapBuckets();

    const traps = getBaseTraps();
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;

    const next = traps.filter((entry) => entry.id !== trapId);
    S.updateBase({ traps: next });

    if (options.refundItem) {
      const def = getTrapDefById(trap.trapItemId);
      if (def?.source === "item") {
        S.addItem("base", trap.trapItemId, 1);
      }
    }

    S.logActivity(`Packed up ${trap.name}.`, "warning");
    renderBaseEnhancements();
    UI.renderEverything();
    return true;
  }

  function baitTrap(trapId, baitItemId = "bait_worm") {
    const traps = getBaseTraps();
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;

    const available = getInventoryAmount(baitItemId, "all");
    if (available <= 0) {
      S.addToast(`No ${baitItemId} available.`, "warning");
      return false;
    }

    if (getInventoryAmount(baitItemId, "player") > 0) {
      S.removeItem("player", baitItemId, 1);
    } else if (getInventoryAmount(baitItemId, "base") > 0) {
      S.removeItem("base", baitItemId, 1);
    } else {
      S.removeItem("boat", baitItemId, 1);
    }

    trap.baitItemId = baitItemId;
    S.updateBase({ traps });

    S.logActivity(`Baited ${trap.name} with ${U.titleCase(baitItemId)}.`, "info");
    renderBaseEnhancements();
    UI.renderEverything();
    return true;
  }

  function clearTrapPendingCatches(trapId) {
    const traps = getBaseTraps();
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;
    trap.catchesPending = [];
    S.updateBase({ traps });
    return true;
  }

  function getTrapSpeciesPool(trap) {
    const tile = S.getMapTile(trap.tileX, trap.tileY) || S.getCurrentMapTile();
    const tilePois = U.toArray(tile?.pointsOfInterest);

    const poiSpecies = tilePois
      .filter((poi) => poi?.speciesId)
      .map((poi) => poi.speciesId);

    const biomeId = trap.biomeId || tile?.biomeId || S.getWorld()?.currentBiomeId;
    const defs = U.toArray(S.getData()?.animals);

    const biomeMatches = defs
      .filter((entry) => entry?.id)
      .filter((entry) => {
        if (trap.trapType === "water") {
          return entry.habitatType === "aquarium" || entry.habitat === "river_channel" || entry.habitat === biomeId;
        }
        return entry.habitat === biomeId || entry.habitatType === "general";
      })
      .map((entry) => entry.id);

    const merged = U.uniqueBy([...poiSpecies, ...biomeMatches], (x) => String(x));

    if (merged.length) return merged;
    if (trap.trapType === "water") return ["mud_minnow"];
    return ["reed_hopper", "dock_turtle"];
  }

  function rollTrapCatch(trap) {
    const pool = getTrapSpeciesPool(trap);
    const trappingSkill = Number(P.getSkillLevel?.("trapping") || 0);
    const baitBonus = trap.baitItemId ? 0.14 : 0;
    const skillBonus = Math.min(0.22, trappingSkill * 0.012);
    const chance = U.clamp(Number(trap.catchChance || 0.35) + baitBonus + skillBonus, 0.05, 0.95);

    if (Math.random() > chance) {
      return null;
    }

    const speciesId = U.pick(pool);
    if (!speciesId) return null;

    return {
      id: U.uid("trapcatch"),
      speciesId,
      at: U.isoNow(),
      viaTrapId: trap.id,
      viaTrapItemId: trap.trapItemId
    };
  }

  function tickTraps(gameMinutes = 5) {
    const traps = getBaseTraps();
    if (!traps.length) return false;

    let changed = false;

    traps.forEach((trap) => {
      if (!trap.active) return;

      trap.elapsedMinutes = Number(trap.elapsedMinutes || 0) + gameMinutes;
      const cycle = Math.max(5, Number(trap.cycleMinutes || 60));

      while (trap.elapsedMinutes >= cycle) {
        trap.elapsedMinutes -= cycle;
        trap.lastTriggeredAt = U.isoNow();
        changed = true;

        const catchResult = rollTrapCatch(trap);
        if (catchResult) {
          trap.catchesPending = U.toArray(trap.catchesPending);
          trap.catchesPending.push(catchResult);

          const history = getTrapCatchHistory();
          history.unshift({
            ...catchResult,
            trapName: trap.name,
            locationLabel: trap.locationLabel
          });
          S.updateBase({ trapCatchHistory: history });

          P.awardSkillXp?.("trapping", 2, "trap cycle");
          S.logActivity(`${trap.name} caught something at ${trap.locationLabel}.`, "success");
        }

        if (trap.baitItemId) {
          trap.baitItemId = null;
        }
      }
    });

    if (changed) {
      S.updateBase({ traps });
    }

    return changed;
  }

  function collectTrapCatches(trapId) {
    const traps = getBaseTraps();
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return [];

    const pending = U.toArray(trap.catchesPending);
    if (!pending.length) {
      S.addToast("No catches waiting.", "warning");
      return [];
    }

    const created = [];

    pending.forEach((entry) => {
      try {
        const specimen = AN.captureAnimal(entry.speciesId, {
          method: "trap_capture",
          name: S.getAnimalDef(entry.speciesId)?.name || U.titleCase(entry.speciesId),
          notes: `Collected from ${trap.name} at ${trap.locationLabel}.`
        });

        if (specimen) {
          created.push(specimen);
        }
      } catch (err) {
        console.warn("Trap collect failed:", err);
      }
    });

    trap.catchesPending = [];
    S.updateBase({ traps });

    if (created.length) {
      P.awardSkillXp?.("trapping", 6 + created.length, "collecting trap catches");
      P.awardPlayerXp?.(4 + created.length, "collecting trap catches");
      S.logActivity(`Collected ${created.length} catch(es) from ${trap.name}.`, "success");
      S.addToast(`Collected ${created.length} catch${created.length === 1 ? "" : "es"}`, "success");
    }

    renderBaseEnhancements();
    UI.renderEverything();
    return created;
  }

  function getFirstCompatibleHabitatForSpecimen(specimenId) {
    const specimen = AN.getSpecimen(specimenId);
    if (!specimen) return null;

    const habitats = U.toArray(S.getBase()?.habitats);
    for (const habitat of habitats) {
      const compat = AN.getHabitatCompatibility(specimen, habitat);
      if (compat.ok) return habitat;
    }

    return null;
  }

  function bindSpecimenActionButtons(root) {
    U.qsa(".btn-feed-specimen", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const specimenId = btn.dataset.specimenId;
        AN.feedSpecimen(specimenId, 15);
        renderBaseEnhancements();
        UI.renderEverything();
      });
    });

    U.qsa(".btn-assign-specimen", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const specimenId = btn.dataset.specimenId;
        const habitat = getFirstCompatibleHabitatForSpecimen(specimenId);

        if (!habitat) {
          S.addToast("No compatible habitat available.", "warning");
          return;
        }

        const result = AN.assignSpecimenToHabitat(specimenId, habitat.id);
        if (!result?.ok) {
          S.addToast(result?.reason || "Could not assign habitat.", "error");
          return;
        }

        renderBaseEnhancements();
        UI.renderEverything();
      });
    });

    U.qsa(".btn-party-specimen", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const specimenId = btn.dataset.specimenId;
        const added = AN.addSpecimenToParty(specimenId);
        if (!added) {
          S.addToast("Could not add to active party.", "warning");
          return;
        }

        renderBaseEnhancements();
        UI.renderEverything();
      });
    });

    U.qsa(".btn-reserve-specimen", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const specimenId = btn.dataset.specimenId;
        const added = AN.sendSpecimenToReserve(specimenId);
        if (!added) {
          S.addToast("Could not send to reserve.", "warning");
          return;
        }

        renderBaseEnhancements();
        UI.renderEverything();
      });
    });

    U.qsa(".btn-release-specimen", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const specimenId = btn.dataset.specimenId;
        const ok = AN.releaseSpecimen(specimenId, { reason: "manual_release" });
        if (!ok) {
          S.addToast("Could not release specimen.", "error");
          return;
        }

        renderBaseEnhancements();
        UI.renderEverything();
      });
    });
  }

  function bindTrapActionButtons(root) {
    U.qsa(".btn-place-trap", root).forEach((btn) => {
      U.on(btn, "click", () => {
        try {
          placeTrap(btn.dataset.trapItemId);
        } catch (err) {
          S.addToast(err.message || "Could not place trap.", "error");
        }
      });
    });

    U.qsa(".btn-bait-trap", root).forEach((btn) => {
      U.on(btn, "click", () => {
        baitTrap(btn.dataset.trapId, "bait_worm");
      });
    });

    U.qsa(".btn-collect-trap", root).forEach((btn) => {
      U.on(btn, "click", () => {
        collectTrapCatches(btn.dataset.trapId);
      });
    });

    U.qsa(".btn-reset-trap", root).forEach((btn) => {
      U.on(btn, "click", () => {
        const traps = getBaseTraps();
        const trap = traps.find((entry) => entry.id === btn.dataset.trapId);
        if (!trap) return;
        trap.elapsedMinutes = 0;
        trap.active = true;
        S.updateBase({ traps });
        S.logActivity(`Reset ${trap.name}.`, "info");
        renderBaseEnhancements();
      });
    });

    U.qsa(".btn-pack-trap", root).forEach((btn) => {
      U.on(btn, "click", () => {
        removeTrap(btn.dataset.trapId, { refundItem: true });
      });
    });
  }

  function renderBoatPanelEnhancements() {
    const stats = U.byId("boatStats");
    const upgrades = U.byId("boatUpgradeList");
    if (!stats || !upgrades) return;

    const modules = getBoatModules();
    const boat = S.getBoat();
    const habitats = getBoatHabitats();

    upgrades.innerHTML = `
      <div class="card">
        <div class="meta-title">Installed Modules</div>
        ${
          !modules.length
            ? `<div class="meta-sub">No boat modules installed yet.</div>`
            : modules.map((entry) => {
              const def = getStructure(entry.structureId);
              return `<div class="meta-sub">${htmlEscape(def?.name || entry.structureId)} x${htmlEscape(String(entry.quantity || 1))}</div>`;
            }).join("")
        }
      </div>
      <div class="card">
        <div class="meta-title">Boat Habitats</div>
        ${
          !habitats.length
            ? `<div class="meta-sub">No habitats installed on the boat yet.</div>`
            : habitats.map((entry) => {
              const occupants = U.toArray(entry.occupants)
                .map((id) => AN.getSpecimen(id)?.name || id)
                .join(", ");
              return `
                <div class="meta-sub">
                  ${htmlEscape(entry.name || entry.structureId)} • ${htmlEscape(entry.habitatType || "general")} • Cap ${htmlEscape(String(entry.capacity || 0))}
                  <br />
                  Occupants: ${htmlEscape(occupants || "None")}
                </div>
              `;
            }).join("")
        }
      </div>
      <div class="card">
        <div class="meta-title">Unlocked Upgrades</div>
        <div class="meta-sub">${htmlEscape(U.toArray(boat?.upgradesUnlocked).join(", ") || "None")}</div>
      </div>
    `;
  }

  function renderBaseEnhancements() {
    const host = U.byId("basePanelContent");
    if (!host) return;

    ensureBaseTrapBuckets();

    const base = S.getBase();
    const structures = getBaseStructures();
    const habitats = U.toArray(base?.habitats);
    const specimens = AN.getBaseSpecimens();
    const traps = getBaseTraps();
    const trapOptions = getAvailableTrapPlacementOptions();

    host.innerHTML = `
      <h3>${htmlEscape(base?.name || "Field Station Alpha")}</h3>
      <p><strong>Structures:</strong> ${htmlEscape(String(structures.length))}</p>
      <p><strong>Habitats:</strong> ${htmlEscape(String(habitats.length))}</p>
      <p><strong>Captured Specimens:</strong> ${htmlEscape(String(specimens.length))}</p>
      <p><strong>Active Traps:</strong> ${htmlEscape(String(traps.length))}</p>
      <p><strong>Storage Bonus:</strong> ${htmlEscape(String(base?.storageSlotsBonus || 0))}</p>

      <h4 style="margin-top:1rem;">Structures</h4>
      <div class="card-list">
        ${structures.map((entry) => {
          const def = getStructure(entry.structureId);
          return `
            <div class="card">
              <div class="meta-title">${htmlEscape(def?.name || entry.structureId)}</div>
              <div class="meta-sub">Quantity: ${htmlEscape(String(entry.quantity || 1))}</div>
            </div>
          `;
        }).join("") || `<div class="card">No structures built yet.</div>`}
      </div>

      <h4 style="margin-top:1rem;">Habitats</h4>
      <div class="card-list">
        ${
          !habitats.length
            ? `<div class="card">No habitats built yet.</div>`
            : habitats.map((habitat) => {
              const occupantNames = U.toArray(habitat.occupants)
                .map((id) => AN.getSpecimen(id)?.name || id)
                .join(", ");

              return `
                <div class="card">
                  <div class="meta-title">${htmlEscape(habitat.name || habitat.structureId)}</div>
                  <div class="meta-sub">Type: ${htmlEscape(habitat.habitatType || "general")}</div>
                  <div class="meta-sub">Capacity: ${htmlEscape(String(habitat.capacity || 0))}</div>
                  <div class="meta-sub">Occupants: ${htmlEscape(occupantNames || "None")}</div>
                </div>
              `;
            }).join("")
        }
      </div>

      <h4 style="margin-top:1rem;">Trap Yard</h4>
      <div class="card-list" id="baseTrapCards">
        <div class="card">
          <div class="meta-title">Place Trap</div>
          ${
            trapOptions.length
              ? trapOptions.map((def) => `
                <button class="panel-btn btn-place-trap" data-trap-item-id="${htmlEscape(def.id)}">
                  ${htmlEscape(def.name)}${def.availableCount < 999 ? ` • ${htmlEscape(String(def.availableCount))} available` : ""}
                </button>
              `).join("")
              : `<div class="meta-sub">No trap items ready. Bring or craft a trap item, or keep rope/fiber on hand for fallback traps.</div>`
          }
        </div>
        ${
          !traps.length
            ? `<div class="card">No traps placed yet.</div>`
            : traps.map((trap) => `
              <div class="card">
                <div class="meta-title">${htmlEscape(trap.name)}</div>
                <div class="meta-sub">${htmlEscape(trap.locationLabel || "Unknown location")} • ${htmlEscape(trap.biomeId || "unknown biome")}</div>
                <div class="meta-sub">Type: ${htmlEscape(trap.trapType || "land")} • Cycle: ${htmlEscape(String(trap.cycleMinutes || 0))} min</div>
                <div class="meta-sub">Bait: ${htmlEscape(trap.baitItemId || "None")} • Pending: ${htmlEscape(String(U.toArray(trap.catchesPending).length))}</div>
                <div class="meta-sub">Elapsed: ${htmlEscape(String(Math.floor(trap.elapsedMinutes || 0)))} min</div>
                <div class="admin-console-actions" style="margin-top:.6rem;">
                  <button class="ghost-btn btn-bait-trap" data-trap-id="${htmlEscape(trap.id)}">Bait</button>
                  <button class="secondary-btn btn-collect-trap" data-trap-id="${htmlEscape(trap.id)}">Collect</button>
                  <button class="ghost-btn btn-reset-trap" data-trap-id="${htmlEscape(trap.id)}">Reset</button>
                  <button class="ghost-btn btn-pack-trap" data-trap-id="${htmlEscape(trap.id)}">Pack Up</button>
                </div>
              </div>
            `).join("")
        }
      </div>

      <h4 style="margin-top:1rem;">Specimens</h4>
      <div class="card-list" id="baseSpecimenCards">
        ${
          !specimens.length
            ? `<div class="card">No captured specimens yet.</div>`
            : specimens.map((specimen) => {
              const habitat = AN.getSpecimenHabitat(specimen.id);
              return `
                <div class="card">
                  <div class="meta-title">${htmlEscape(specimen.name || specimen.speciesId)}</div>
                  <div class="meta-sub">${htmlEscape(U.titleCase(specimen.speciesId || "creature"))} • Level ${htmlEscape(String(specimen.level || 1))}</div>
                  <div class="meta-sub">Habitat: ${htmlEscape(habitat?.name || "Unassigned")}</div>
                  <div class="meta-sub">Hunger: ${htmlEscape(String(Math.round(specimen?.needs?.hunger ?? 0)))}</div>
                  <div class="meta-sub">Comfort: ${htmlEscape(String(Math.round(specimen?.needs?.comfort ?? 0)))}</div>
                  <div class="meta-sub">Cleanliness: ${htmlEscape(String(Math.round(specimen?.needs?.cleanliness ?? 0)))}</div>
                  <div class="admin-console-actions" style="margin-top:.6rem;">
                    <button class="ghost-btn btn-feed-specimen" data-specimen-id="${htmlEscape(specimen.id)}">Feed</button>
                    <button class="ghost-btn btn-assign-specimen" data-specimen-id="${htmlEscape(specimen.id)}">Auto-Assign Habitat</button>
                    <button class="secondary-btn btn-party-specimen" data-specimen-id="${htmlEscape(specimen.id)}">Add to Party</button>
                    <button class="ghost-btn btn-reserve-specimen" data-specimen-id="${htmlEscape(specimen.id)}">Send to Reserve</button>
                    <button class="ghost-btn btn-release-specimen" data-specimen-id="${htmlEscape(specimen.id)}">Release</button>
                  </div>
                </div>
              `;
            }).join("")
        }
      </div>
    `;

    bindTrapActionButtons(host);
    bindSpecimenActionButtons(host);
  }

  function buildStructure(structureId, options = {}) {
    const def = getStructure(structureId);
    if (!def) throw new Error("Structure not found.");

    const qty = Math.max(1, Number(options.quantity || 1));
    const target = options.target || state.selectedBuildTarget;
    const validation = canBuildStructure(structureId, { ...options, target });
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    removeBuildCosts(def, qty, options.preferredSources || ["base", "player", "boat"]);

    if (target === "boat") {
      addBoatModule(structureId, qty);
    } else {
      addBaseStructure(structureId, qty);
    }

    applyStructureEffects(def, {
      quantity: qty,
      target
    });

    P.registerBuildAction();
    P.awardPlayerXp(6 + qty * 2, `building ${getStructureName(structureId)}`);

    S.logActivity(`Built ${getStructureName(structureId)} x${qty} for the ${target}.`, "success");
    S.addToast(`Built ${getStructureName(structureId)}`, "success");

    renderBuildPanels();
    UI.renderEverything();

    return true;
  }

  function demolishStructure(structureId, options = {}) {
    const def = getStructure(structureId);
    const qty = Math.max(1, Number(options.quantity || 1));
    const target = options.target || "base";

    if (target === "boat") {
      const modules = getBoatModules();
      const existing = modules.find((entry) => entry.structureId === structureId);
      if (!existing) return false;

      existing.quantity = Number(existing.quantity || 0) - qty;
      const next = modules.filter((entry) => Number(entry.quantity || 0) > 0);
      S.updateBoat({ modules: next });
    } else {
      const structures = getBaseStructures();
      const existing = structures.find((entry) => entry.structureId === structureId);
      if (!existing) return false;

      existing.quantity = Number(existing.quantity || 0) - qty;
      const next = structures.filter((entry) => Number(entry.quantity || 0) > 0);
      S.updateBase({ structures: next });
    }

    const refundRatio = Number(options.refundRatio ?? CFG.BUILDING.refundRatioOnDemolish ?? 0.5);
    getStructureCost(def).forEach((cost) => {
      const refund = Math.floor(Number(cost.quantity || 1) * qty * refundRatio);
      if (refund > 0) {
        S.addItem(target === "boat" ? "boat" : "base", cost.itemId, refund);
      }
    });

    reverseStructureEffects(def, { quantity: qty, target });

    S.logActivity(`Demolished ${getStructureName(structureId)} x${qty} from the ${target}.`, "warning");
    renderBuildPanels();
    UI.renderEverything();
    return true;
  }

  function getBuildableDisplayData(def) {
    const afford = canAffordStructure(def);
    const levelOk = meetsLevelRequirement(def);
    const tileOk = meetsTileRequirement(def, null, null, state.selectedBuildTarget);
    const targetOk = canTargetBuild(def, state.selectedBuildTarget);
    const category = getStructureCategory(def);

    return {
      def,
      category,
      levelOk,
      tileOk,
      targetOk,
      affordOk: afford.ok,
      missing: afford.missing,
      buildOk: levelOk && tileOk && targetOk && afford.ok
    };
  }

  function selectStructure(structureId) {
    state.selectedStructureId = structureId || null;
    renderBuildPanels();
    return state.selectedStructureId;
  }

  function setBuildTarget(target = "base") {
    state.selectedBuildTarget = target === "boat" ? "boat" : "base";

    if (state.selectedStructureId) {
      const def = getStructure(state.selectedStructureId);
      if (def && !canTargetBuild(def, state.selectedBuildTarget)) {
        state.selectedStructureId = null;
      }
    }

    renderBuildPanels();
    return state.selectedBuildTarget;
  }

  function setBuildCategory(category = "all") {
    state.selectedCategory = category || "all";
    renderBuildPanels();
    return state.selectedCategory;
  }

  function getStructureUseSummary(def, target = "base") {
    if (!def) return "No additional effects.";

    const lines = [];

    if (def.id === "animal_pen_t1") {
      lines.push(`Creates a land-animal habitat on the ${target}.`);
    }
    if (def.id === "aquarium_t1") {
      lines.push(`Creates an aquatic habitat on the ${target}.`);
    }
    if (def.id === "aviary_t1") {
      lines.push(`Creates a flying-creature habitat on the ${target}.`);
    }
    if (def.id === "breeding_tank_t1") {
      lines.push(`Supports breeding projects on the ${target}.`);
    }
    if (def.id === "workbench_t1") {
      lines.push(`Enables workbench recipes on the ${target}.`);
    }
    if (def.id === "field_stove_t1") {
      lines.push(`Enables water/cooking recipes on the ${target}.`);
    }
    if (getStructureTags(def).includes("storage")) {
      lines.push(`Adds ${Number(def.storageBonus || 10)} storage slots.`);
    }
    if (getStructureTags(def).includes("boat_upgrade")) {
      if (Number(def.boatHpBonus || 0) > 0) {
        lines.push(`Adds ${Number(def.boatHpBonus || 0)} boat HP.`);
      }
      if (Number(def.boatFuelBonus || 0) > 0) {
        lines.push(`Adds ${Number(def.boatFuelBonus || 0)} boat fuel capacity.`);
      }
    }
    if (def.stationId) {
      lines.push(`Unlocks station: ${U.titleCase(def.stationId)}.`);
    }

    return lines.length ? lines.join(" ") : "No additional effects.";
  }

  function renderBuildList() {
    const host = U.byId("basePanelContent");
    if (!host) return;

    const structures = getAccessibleBuildList();

    host.innerHTML = `
      <div class="admin-console-actions" id="buildTopFilters">
        <button id="btnBuildTargetBase" class="${state.selectedBuildTarget === "base" ? "primary-btn" : "ghost-btn"}">Base</button>
        <button id="btnBuildTargetBoat" class="${state.selectedBuildTarget === "boat" ? "primary-btn" : "ghost-btn"}">Boat</button>
      </div>

      <div class="admin-console-actions" id="buildCategoryFilters"></div>

      <div id="buildStructureCards" class="card-list"></div>
      <div id="buildDetailPanel" class="detail-panel" style="margin-top:1rem;"></div>
    `;

    const categories = [
      "all",
      ...U.uniqueBy(structures.map((def) => getStructureCategory(def)), (x) => String(x))
    ];

    const catHost = U.byId("buildCategoryFilters");
    categories.forEach((category) => {
      const btn = U.createEl("button", {
        className: category === state.selectedCategory ? "primary-btn" : "ghost-btn",
        text: category === "all" ? "All" : U.titleCase(category)
      });
      U.on(btn, "click", () => setBuildCategory(category));
      catHost.appendChild(btn);
    });

    const cardsHost = U.byId("buildStructureCards");
    const detailHost = U.byId("buildDetailPanel");

    if (!structures.length) {
      cardsHost.appendChild(U.createEl("div", {
        className: "card",
        text: "No structures available for this filter."
      }));
      detailHost.innerHTML = `<h3>Build Menu</h3><p>Select a structure.</p>`;
      return;
    }

    structures.forEach((def) => {
      const data = getBuildableDisplayData(def);
      const card = U.createEl("div", { className: "card" });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(def.name || U.titleCase(def.id))}</div>
        <div class="meta-sub">${htmlEscape(getStructureCategory(def))}</div>
        <div class="meta-sub">${htmlEscape(state.selectedBuildTarget === "boat" ? "Boat Install" : "Base Build")}</div>
        <div class="meta-sub">${data.buildOk ? "Ready to build" : "Requirements unmet"}</div>
      `;

      U.on(card, "click", () => {
        selectStructure(def.id);
      });

      cardsHost.appendChild(card);
    });

    detailHost.innerHTML = `<h3>Build Menu</h3><p>Select a structure.</p>`;

    const btnBase = U.byId("btnBuildTargetBase");
    const btnBoat = U.byId("btnBuildTargetBoat");

    if (btnBase) U.on(btnBase, "click", () => setBuildTarget("base"));
    if (btnBoat) U.on(btnBoat, "click", () => setBuildTarget("boat"));
  }

  function renderBuildDetail() {
    const detail = U.byId("buildDetailPanel");
    if (!detail) return;

    const def = state.selectedStructureId ? getStructure(state.selectedStructureId) : null;
    if (!def) {
      detail.innerHTML = `<h3>Build Menu</h3><p>Select a structure.</p>`;
      return;
    }

    const data = getBuildableDisplayData(def);
    const costs = getStructureCost(def)
      .map((entry) => {
        const itemDef = S.getItemDef(entry.itemId);
        const name = itemDef?.name || U.titleCase(entry.itemId);
        const have = getInventoryAmount(entry.itemId, "all");
        return `<li>${htmlEscape(name)} x${htmlEscape(String(entry.quantity || 1))} — Have ${htmlEscape(String(have))}</li>`;
      })
      .join("");

    detail.innerHTML = `
      <h3>${htmlEscape(def.name || U.titleCase(def.id))}</h3>
      <p>${htmlEscape(def.description || "No description yet.")}</p>
      <p><strong>Category:</strong> ${htmlEscape(getStructureCategory(def))}</p>
      <p><strong>Required Level:</strong> ${htmlEscape(String(def.requiredLevel || 1))}</p>
      <p><strong>Target:</strong> ${htmlEscape(state.selectedBuildTarget === "boat" ? "Boat" : "Base")}</p>

      <h4>Uses</h4>
      <p>${htmlEscape(getStructureUseSummary(def, state.selectedBuildTarget))}</p>

      <h4>Costs</h4>
      <ul>${costs || "<li>No cost</li>"}</ul>

      ${
        !data.targetOk
          ? `<p class="danger-text">This structure cannot be built on the ${htmlEscape(state.selectedBuildTarget)}.</p>`
          : data.missing?.length
            ? `<p class="danger-text">Missing: ${htmlEscape(data.missing.map((m) => `${m.itemId}(${m.missing})`).join(", "))}</p>`
            : `<p class="accent-text">All materials available.</p>`
      }

      <div class="admin-console-actions">
        <button id="btnBuildNow" class="primary-btn">Build</button>
        <button id="btnDemolishNow" class="ghost-btn">Demolish One</button>
      </div>
    `;

    const btnBuild = U.byId("btnBuildNow");
    const btnDemolish = U.byId("btnDemolishNow");

    if (btnBuild) {
      U.on(btnBuild, "click", () => {
        try {
          buildStructure(def.id, {
            target: state.selectedBuildTarget
          });
        } catch (err) {
          S.addToast(err.message || "Build failed.", "error");
        }
      });
    }

    if (btnDemolish) {
      U.on(btnDemolish, "click", () => {
        const ok = demolishStructure(def.id, {
          target: state.selectedBuildTarget
        });
        if (!ok) {
          S.addToast("Nothing to demolish.", "warning");
        }
      });
    }
  }

  function renderBuildPanels() {
    renderBuildList();
    renderBuildDetail();
    renderBoatPanelEnhancements();
  }

  function seedFallbackStructuresIfNeeded() {
    const existing = getStructures();
    if (existing.length > 0) return false;

    const fallback = [
      {
        id: "animal_pen_t1",
        name: "Animal Pen",
        description: "Basic pen for medium land creatures.",
        category: "habitat",
        tags: ["habitat"],
        habitatType: "general",
        sizeLimit: "medium",
        capacity: 2,
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 8 },
          { itemId: "fiber_bundle", quantity: 4 }
        ]
      },
      {
        id: "aquarium_t1",
        name: "Aquarium",
        description: "A water habitat for fish and amphibious specimens.",
        category: "habitat",
        tags: ["habitat"],
        habitatType: "aquarium",
        sizeLimit: "medium",
        capacity: 2,
        water: true,
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 6 },
          { itemId: "fresh_water", quantity: 2 }
        ]
      },
      {
        id: "aviary_t1",
        name: "Aviary",
        description: "A contained high-net habitat for flying creatures.",
        category: "habitat",
        tags: ["habitat"],
        habitatType: "aviary",
        sizeLimit: "medium",
        capacity: 2,
        flying: true,
        requiredLevel: 2,
        cost: [
          { itemId: "scrap_wood", quantity: 10 },
          { itemId: "fiber_bundle", quantity: 6 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      },
      {
        id: "workbench_t1",
        name: "Workbench",
        description: "Enables basic crafting.",
        category: "crafting",
        tags: ["crafting", "utility"],
        stationId: "workbench",
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 6 },
          { itemId: "fiber_bundle", quantity: 2 }
        ]
      },
      {
        id: "field_stove_t1",
        name: "Field Stove",
        description: "Allows boiling and cooking recipes.",
        category: "crafting",
        tags: ["crafting", "utility"],
        stationId: "stove",
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        id: "storage_crate_t1",
        name: "Storage Crate",
        description: "Adds extra base storage.",
        category: "storage",
        tags: ["storage"],
        storageBonus: 12,
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 5 },
          { itemId: "fiber_bundle", quantity: 3 }
        ]
      },
      {
        id: "breeding_tank_t1",
        name: "Breeding Tank",
        description: "Supports controlled breeding projects.",
        category: "utility",
        tags: ["utility", "crafting"],
        stationId: "breeding_tank",
        requiredLevel: 2,
        cost: [
          { itemId: "scrap_wood", quantity: 8 },
          { itemId: "fresh_water", quantity: 2 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      },
      {
        id: "boat_storage_rack_t1",
        name: "Boat Storage Rack",
        description: "Adds storage and organization to the river boat.",
        category: "boat_upgrade",
        tags: ["boat_upgrade", "storage"],
        buildTarget: "boat",
        boatFuelBonus: 0,
        boatHpBonus: 4,
        requiredLevel: 1,
        cost: [
          { itemId: "scrap_wood", quantity: 6 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      },
      {
        id: "boat_hull_patch_t1",
        name: "Hull Patch Kit",
        description: "Improves boat hull integrity.",
        category: "boat_upgrade",
        tags: ["boat_upgrade", "defense"],
        buildTarget: "boat",
        boatHpBonus: 12,
        requiredLevel: 2,
        cost: [
          { itemId: "scrap_wood", quantity: 8 },
          { itemId: "fiber_bundle", quantity: 4 }
        ]
      }
    ];

    S.replaceDataBucket("structures", fallback);
    return true;
  }

  function bindEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "baseModal" || modalId === "boatModal") {
        renderBuildPanels();
        renderBaseEnhancements();
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen("baseModal") || S.isModalOpen("boatModal")) {
        renderBuildPanels();
        renderBaseEnhancements();
      }
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen("baseModal")) {
        renderBaseEnhancements();
        renderBuildPanels();
      }
    });

    U.eventBus.on("boat:changed", () => {
      if (S.isModalOpen("boatModal")) {
        renderBoatPanelEnhancements();
      }
    });

    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) {
        tickTraps(5);
        if (S.isModalOpen("baseModal")) {
          renderBaseEnhancements();
        }
      }
    });

    const btnBuild = U.byId("btnBuild");
    if (btnBuild) {
      U.on(btnBuild, "click", () => {
        state.selectedBuildTarget = "base";
        renderBuildPanels();
        UI.renderEverything();
      });
    }
  }

  function init() {
    if (state.initialized) return true;

    ensureBaseTrapBuckets();
    seedFallbackStructuresIfNeeded();
    bindEvents();
    renderBuildPanels();

    state.initialized = true;
    U.eventBus.emit("build:initialized");
    return true;
  }

  const API = {
    init,

    getStructures,
    getStructure,
    getBaseStructures,
    getBoatModules,
    getBoatHabitats,
    getBaseTraps,
    getTrapCatchHistory,
    getStructureName,
    getStructureCost,
    getStructureTags,
    getStructureCategory,
    isBoatBuild,
    canTargetBuild,
    getAccessibleBuildList,

    getInventoryAmount,
    getMissingBuildItems,
    meetsLevelRequirement,
    meetsTileRequirement,
    canAffordStructure,
    canBuildStructure,

    removeBuildCosts,
    addBaseStructure,
    addBoatModule,
    addBoatHabitat,
    applyStructureEffects,
    reverseStructureEffects,

    getTrapItemDefs,
    getTrapDefById,
    getAvailableTrapPlacementOptions,
    createTrapRecord,
    placeTrap,
    removeTrap,
    baitTrap,
    clearTrapPendingCatches,
    getTrapSpeciesPool,
    rollTrapCatch,
    tickTraps,
    collectTrapCatches,

    buildStructure,
    demolishStructure,

    getBuildableDisplayData,
    getStructureUseSummary,
    selectStructure,
    setBuildTarget,
    setBuildCategory,

    renderBuildList,
    renderBuildDetail,
    renderBoatPanelEnhancements,
    renderBaseEnhancements,
    renderBuildPanels,

    seedFallbackStructuresIfNeeded
  };

  window.GL_BUILD = API;

  return Object.freeze(API);
})();