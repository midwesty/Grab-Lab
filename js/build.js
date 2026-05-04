window.GrabLabBuild = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;

  const state = {
    initialized: false,
    selectedBuildTarget: "base", // base | boat
    selectedCategory: "all",
    selectedTrapTileMode: "current",
    selectedTrapBlueprintId: null,
    selectedTrapPlacementKey: "current"
  };

  function getAnimalsApi() {
    return window.GL_ANIMALS || window.GrabLabAnimals || null;
  }

  function getUiApi() {
    return window.GL_UI || window.GrabLabUI || null;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function ensureBuildBuckets() {
    const base = S.getBase();
    const boat = S.getBoat();

    if (!Array.isArray(base.structures)) base.structures = [];
    if (!Array.isArray(base.habitats)) base.habitats = [];
    if (!Array.isArray(base.traps)) base.traps = [];
    if (!Array.isArray(base.trapCatchHistory)) base.trapCatchHistory = [];
    if (!Array.isArray(base.storage)) base.storage = [];
    if (!Array.isArray(base.craftingQueues)) base.craftingQueues = [];

    if (!Array.isArray(boat.modules)) boat.modules = [];
    if (!Array.isArray(boat.habitats)) boat.habitats = [];
    if (!Array.isArray(boat.storage)) boat.storage = [];

    return { base, boat };
  }

  function getStructureDefs() {
    return U.toArray(S.getData()?.structures);
  }

  function getStructureDef(structureId) {
    return S.getStructureDef?.(structureId) || getStructureDefs().find((entry) => entry.id === structureId) || null;
  }

  function getItemName(itemId) {
    return S.getItemDef?.(itemId)?.name || U.titleCase(itemId || "item");
  }

  function getRecipeDef(recipeId) {
    return S.getRecipeDef?.(recipeId) || U.toArray(S.getData()?.recipes).find((entry) => entry.id === recipeId) || null;
  }

  function getRecipeInputs(recipe = {}) {
    const raw = recipe.inputs || recipe.ingredients || recipe.materials || recipe.cost || recipe.costs || [];

    if (Array.isArray(raw)) {
      return raw
        .map((entry) => ({
          itemId: entry.itemId || entry.id || entry.item,
          quantity: Number(entry.quantity || entry.qty || entry.amount || 1)
        }))
        .filter((entry) => entry.itemId);
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([itemId, quantity]) => ({
        itemId,
        quantity: Number(quantity || 1)
      }));
    }

    return [];
  }

  function getRecipeOutputs(recipe = {}) {
    const raw = recipe.outputs || recipe.results || recipe.result || recipe.output || [];

    if (Array.isArray(raw)) {
      return raw
        .map((entry) => ({
          itemId: entry.itemId || entry.id || entry.item || entry.outputId,
          quantity: Number(entry.quantity || entry.qty || entry.amount || 1)
        }))
        .filter((entry) => entry.itemId);
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([itemId, quantity]) => ({
        itemId,
        quantity: Number(quantity || 1)
      }));
    }

    return [];
  }

  function getTrapBlueprints() {
    return [
      {
        itemId: "improvised_snare_trap",
        recipeId: "improvised_snare_trap",
        name: "Improvised Snare Trap",
        description: "A rough reusable land trap for small and medium marsh creatures.",
        trapType: "land",
        catchChance: 0.34,
        cycleMinutes: 60,
        inputs: [
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 1 },
          { itemId: "scrap_wood", quantity: 1 }
        ]
      },
      {
        itemId: "reed_fish_trap",
        recipeId: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A woven water trap for passive aquatic catches.",
        trapType: "water",
        catchChance: 0.38,
        cycleMinutes: 75,
        inputs: [
          { itemId: "fiber_bundle", quantity: 3 },
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        itemId: "cage_trap_basic",
        recipeId: "cage_trap_basic",
        name: "Basic Cage Trap",
        description: "A sturdier trap with better odds and room for larger land animals.",
        trapType: "land",
        catchChance: 0.42,
        cycleMinutes: 90,
        inputs: [
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      }
    ];
  }

  function ensureTrapBlueprintData() {
    const data = S.getData?.() || {};
    const items = U.toArray(data.items);
    const recipes = U.toArray(data.recipes);
    let changedItems = false;
    let changedRecipes = false;

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));

    getTrapBlueprints().forEach((blueprint) => {
      if (!itemMap.has(blueprint.itemId)) {
        items.push({
          id: blueprint.itemId,
          name: blueprint.name,
          description: blueprint.description,
          tags: ["trap"],
          trapType: blueprint.trapType,
          trapCatchChance: blueprint.catchChance,
          trapCycleMinutes: blueprint.cycleMinutes,
          weight: blueprint.trapType === "water" ? 2 : 3,
          value: blueprint.trapType === "water" ? 12 : 10
        });
        changedItems = true;
      }

      if (!recipeMap.has(blueprint.recipeId)) {
        recipes.push({
          id: blueprint.recipeId,
          name: blueprint.name,
          description: blueprint.description,
          station: "field",
          durationMinutes: 10,
          inputs: blueprint.inputs,
          outputs: [
            { itemId: blueprint.itemId, quantity: 1 }
          ]
        });
        changedRecipes = true;
      }
    });

    if (changedItems) S.replaceDataBucket("items", items);
    if (changedRecipes) S.replaceDataBucket("recipes", recipes);

    return changedItems || changedRecipes;
  }

  function getStructureName(structureId) {
    const def = getStructureDef(structureId);
    return def?.name || U.titleCase(structureId || "structure");
  }

  function getStructureCategory(def = {}) {
    if (def.category) return def.category;
    const tags = U.toArray(def.tags);

    if (tags.includes("habitat") || def.habitatType) return "habitats";
    if (tags.includes("boat") || def.target === "boat" || def.buildTarget === "boat") return "boat";
    if (tags.includes("station") || def.stationId || U.toArray(def.stations).length) return "stations";
    if (tags.includes("storage")) return "storage";
    if (tags.includes("trap")) return "traps";

    return "base";
  }

  function getBuildTargetForStructure(def = {}, fallback = state.selectedBuildTarget) {
    const explicit = def.target || def.buildTarget || def.hostTarget;

    if (explicit === "boat" || U.toArray(def.tags).includes("boat")) return "boat";
    if (explicit === "base") return "base";

    return fallback === "boat" ? "boat" : "base";
  }

  function isStructureBuildableForTarget(def = {}, target = state.selectedBuildTarget) {
    const allowedTargets = U.toArray(def.allowedTargets || def.targets);

    if (allowedTargets.length) {
      return allowedTargets.includes(target);
    }

    const explicit = def.target || def.buildTarget || def.hostTarget;
    if (explicit === "base" || explicit === "boat") return explicit === target;

    if (target === "boat") {
      return U.toArray(def.tags).includes("boat") || def.boatCompatible === true;
    }

    return !U.toArray(def.tags).includes("boat_only") && explicit !== "boat";
  }

  function getBuildCosts(def = {}) {
    const rawCosts = def.cost || def.costs || def.inputs || def.materials || [];

    if (Array.isArray(rawCosts)) {
      return rawCosts
        .map((entry) => ({
          itemId: entry.itemId || entry.id,
          quantity: Number(entry.quantity || entry.qty || entry.amount || 1)
        }))
        .filter((entry) => entry.itemId);
    }

    if (rawCosts && typeof rawCosts === "object") {
      return Object.entries(rawCosts).map(([itemId, quantity]) => ({
        itemId,
        quantity: Number(quantity || 1)
      }));
    }

    return [];
  }

  function getInventoryAmount(itemId, source = "all") {
    if (source === "player") return S.getItemQuantity?.("player", itemId) || 0;
    if (source === "base") return S.getItemQuantity?.("base", itemId) || 0;
    if (source === "boat") return S.getItemQuantity?.("boat", itemId) || 0;

    return (
      (S.getItemQuantity?.("player", itemId) || 0) +
      (S.getItemQuantity?.("base", itemId) || 0) +
      (S.getItemQuantity?.("boat", itemId) || 0)
    );
  }

  function hasBuildMaterials(def = {}, quantity = 1) {
    const costs = getBuildCosts(def);
    const qty = Math.max(1, Number(quantity || 1));

    const missing = costs
      .map((cost) => {
        const needed = Number(cost.quantity || 1) * qty;
        const have = getInventoryAmount(cost.itemId, "all");
        return {
          itemId: cost.itemId,
          needed,
          have,
          missing: Math.max(0, needed - have)
        };
      })
      .filter((entry) => entry.missing > 0);

    return {
      ok: missing.length === 0,
      missing
    };
  }

  function removeBuildMaterials(def = {}, quantity = 1) {
    const costs = getBuildCosts(def);
    const qty = Math.max(1, Number(quantity || 1));
    const sources = ["player", "base", "boat"];

    costs.forEach((cost) => {
      let remaining = Number(cost.quantity || 1) * qty;

      sources.forEach((source) => {
        if (remaining <= 0) return;

        const available = getInventoryAmount(cost.itemId, source);
        if (available <= 0) return;

        const take = Math.min(available, remaining);
        S.removeItem(source, cost.itemId, take);
        remaining -= take;
      });

      if (remaining > 0) {
        throw new Error(`Could not remove enough ${getItemName(cost.itemId)}.`);
      }
    });

    return true;
  }


  function getBaseExpansionAnchor() {
    const fallback = CFG?.WORLD?.startingTile || { x: 12, y: 14 };
    const mapData = S.getData?.()?.map || {};
    const nodes = U.toArray(mapData.nodes);
    const dock =
      S.getMapNode?.("field_station_dock") ||
      nodes.find((node) => node?.id === "field_station_dock") ||
      nodes.find((node) => String(node?.name || "").toLowerCase().includes("dock"));

    return {
      x: Number(dock?.x ?? fallback.x ?? 12),
      y: Number(dock?.y ?? fallback.y ?? 14)
    };
  }

  function isBaseExpansionWaterTile(tile = {}) {
    const type = String(tile?.type || "").toLowerCase();
    const biomeId = String(tile?.biomeId || "").toLowerCase();

    return (
      type === "water" ||
      type === "deep_water" ||
      biomeId === "river_channel" ||
      biomeId === "deep_water"
    );
  }

  function tileHasProtectedPoi(tile = {}) {
    return U.toArray(tile?.pointsOfInterest).some((poi) => {
      const type = String(poi?.type || "").toLowerCase();
      return type === "dock" || poi?.role === "starter_companion" || poi?.recruitable === true;
    });
  }

  function getExistingBaseStructureTileKeys(ignoreRecordId = null) {
    return new Set(
      U.toArray(S.getBase()?.structures)
        .filter((entry) => entry && entry.id !== ignoreRecordId && entry.tileX != null && entry.tileY != null)
        .map((entry) => `${Number(entry.tileX)},${Number(entry.tileY)}`)
    );
  }

  function normalizeBaseStructureRecordsForTiles() {
    const base = S.getBase();
    const next = [];
    let changed = false;

    U.toArray(base?.structures).forEach((entry) => {
      if (!entry?.structureId) return;
      const qty = Math.max(1, Number(entry.quantity || 1));

      for (let i = 0; i < qty; i += 1) {
        const copy = {
          ...entry,
          id: entry.id && i === 0 ? entry.id : U.uid("structure"),
          quantity: 1,
          target: "base",
          builtAt: entry.builtAt || U.isoNow(),
          updatedAt: U.isoNow()
        };

        if (qty > 1) {
          delete copy.tileX;
          delete copy.tileY;
          changed = true;
        }

        if (!copy.id) {
          copy.id = U.uid("structure");
          changed = true;
        }

        next.push(copy);
      }
    });

    if (next.length !== U.toArray(base?.structures).length) changed = true;

    if (changed) {
      S.updateBase({ structures: next });
    }

    return next;
  }

  function findBaseExpansionTile(record = {}, structureDef = {}) {
    const anchor = getBaseExpansionAnchor();
    const occupied = getExistingBaseStructureTileKeys(record.id);
    const preferredX = Number(record.tileX);
    const preferredY = Number(record.tileY);

    if (Number.isFinite(preferredX) && Number.isFinite(preferredY)) {
      const currentTile = S.getMapTile?.(preferredX, preferredY);
      const currentKey = `${preferredX},${preferredY}`;
      if (
        currentTile &&
        !isBaseExpansionWaterTile(currentTile) &&
        (!tileHasProtectedPoi(currentTile) || hasStructurePoiForRecord(currentTile, record)) &&
        (!occupied.has(currentKey) || hasStructurePoiForRecord(currentTile, record))
      ) {
        return { x: preferredX, y: preferredY, tile: currentTile };
      }
    }

    const maxRadius = Math.max(CFG.WORLD.worldWidthTiles || 64, CFG.WORLD.worldHeightTiles || 64);

    for (let radius = 0; radius <= maxRadius; radius += 1) {
      const candidates = [];

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          candidates.push({ x: anchor.x + dx, y: anchor.y + dy });
        }
      }

      candidates.sort((a, b) => {
        const da = Math.abs(a.x - anchor.x) + Math.abs(a.y - anchor.y);
        const db = Math.abs(b.x - anchor.x) + Math.abs(b.y - anchor.y);
        if (da !== db) return da - db;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

      for (const candidate of candidates) {
        if (candidate.x < 0 || candidate.y < 0 || candidate.x >= CFG.WORLD.worldWidthTiles || candidate.y >= CFG.WORLD.worldHeightTiles) continue;

        const key = `${candidate.x},${candidate.y}`;
        if (occupied.has(key)) continue;

        const tile = S.getMapTile?.(candidate.x, candidate.y);
        if (!tile) continue;
        if (isBaseExpansionWaterTile(tile)) continue;
        if (tileHasProtectedPoi(tile)) continue;

        return { x: candidate.x, y: candidate.y, tile };
      }
    }

    void structureDef;
    return null;
  }

  function hasStructurePoiForRecord(tile = {}, record = {}) {
    return U.toArray(tile?.pointsOfInterest).some((poi) => poi?.type === "base_structure" && poi?.structureRecordId === record?.id);
  }

  function makeStructurePoi(record = {}, def = {}) {
    const label = def?.name || record.name || U.titleCase(record.structureId || "Structure");

    return {
      id: `base_structure_${record.id || record.structureId}`,
      name: label,
      shortName: def?.shortName || String(label).slice(0, 10),
      description: def?.description || "A built field station structure.",
      type: "base_structure",
      structureId: record.structureId,
      structureRecordId: record.id,
      category: def?.category || "base",
      habitatType: def?.habitatType || null,
      structureHabitatType: def?.habitatType || null,
      stationId: def?.stationId || null,
      water: Boolean(def?.water),
      flying: Boolean(def?.flying),
      grabbable: false,
      tileX: Number(record.tileX),
      tileY: Number(record.tileY),
      localX: Math.round(CFG.WORLD.tileSize * 0.5),
      localY: Math.round(CFG.WORLD.tileSize * 0.5)
    };
  }

  function stampBaseStructureOnMap(record = {}) {
    if (!record?.structureId) return false;

    const def = getStructureDef(record.structureId) || {};
    const placement = findBaseExpansionTile(record, def);
    if (!placement) {
      S.logActivity(`Could not find a land tile for ${def.name || record.structureId}.`, "warning");
      return false;
    }

    const tile = placement.tile;
    record.tileX = placement.x;
    record.tileY = placement.y;
    record.updatedAt = U.isoNow();

    tile.baseStructureId = record.structureId;
    tile.baseStructureRecordId = record.id;
    tile.structureId = record.structureId;
    tile.type = tile.type && !isBaseExpansionWaterTile(tile) ? tile.type : "land";
    tile.name = def.name || record.name || tile.name || U.titleCase(record.structureId);
    tile.shortName = def.shortName || String(tile.name || "Base").slice(0, 10);
    tile.pointsOfInterest = [makeStructurePoi(record, def)];

    S.revealTile(placement.x, placement.y);
    S.clearTile(placement.x, placement.y);
    U.eventBus.emit("world:baseStructureTileChanged", {
      structureId: record.structureId,
      recordId: record.id,
      tileX: placement.x,
      tileY: placement.y
    });

    return true;
  }

  function syncBaseStructureTiles(options = {}) {
    const records = normalizeBaseStructureRecordsForTiles();
    let changed = false;

    S.updateBase({ structures: records });

    records.forEach((record) => {
      if (options.force || record.tileX == null || record.tileY == null) {
        const stamped = stampBaseStructureOnMap(record);
        if (stamped) {
          changed = true;
          S.updateBase({ structures: records });
        }
      } else {
        const tile = S.getMapTile?.(record.tileX, record.tileY);
        if (!tile || isBaseExpansionWaterTile(tile) || !hasStructurePoiForRecord(tile, record)) {
          const stamped = stampBaseStructureOnMap(record);
          if (stamped) {
            changed = true;
            S.updateBase({ structures: records });
          }
        }
      }
    });

    if (changed) {
      S.updateBase({ structures: records });
      window.GL_WORLD?.drawWorld?.();
      window.GL_INPUT?.drawMiniMap?.();
      window.GL_MAP?.drawMap?.();
    }

    return changed;
  }

  function addStructureRecord(structureId, target = "base", options = {}) {
    ensureBuildBuckets();

    const def = getStructureDef(structureId);
    const bucket = target === "boat" ? U.toArray(S.getBoat().modules) : U.toArray(S.getBase().structures);

    const stackable = target === "boat" && def?.stackable !== false && !def?.unique;
    const existing = stackable ? bucket.find((entry) => entry.structureId === structureId) : null;

    if (existing) {
      existing.quantity = Number(existing.quantity || 1) + Number(options.quantity || 1);
      existing.updatedAt = U.isoNow();
    } else {
      bucket.push({
        id: options.id || U.uid(target === "boat" ? "module" : "structure"),
        structureId,
        name: def?.name || U.titleCase(structureId),
        target,
        quantity: Number(options.quantity || 1),
        builtAt: U.isoNow(),
        updatedAt: U.isoNow()
      });

      const created = bucket[bucket.length - 1];
      if (options.tileX != null && options.tileY != null) {
        created.tileX = Number(options.tileX);
        created.tileY = Number(options.tileY);
      }
    }

    if (target === "boat") {
      S.updateBoat({ modules: bucket });
    } else {
      const record = existing || bucket[bucket.length - 1];
      stampBaseStructureOnMap(record);
      S.updateBase({ structures: bucket });
    }

    return existing || bucket[bucket.length - 1];
  }

  function applyStructureEffects(structureId, target = "base", options = {}) {
    const def = getStructureDef(structureId);
    if (!def) return false;

    const tags = U.toArray(def.tags);
    const animals = getAnimalsApi();

    if (tags.includes("habitat") || def.habitatType) {
      try {
        animals?.addHabitat?.(structureId, {
          hostTarget: target,
          target,
          name: def.name,
          capacity: Number(def.capacity || def.maxOccupants || 2),
          habitatType: def.habitatType || def.capacityType || "general",
          sizeLimit: def.sizeLimit || "medium",
          silent: true
        });
      } catch (err) {
        console.warn("Could not create habitat from structure:", structureId, err);
      }
    }

    const storageBonus = Number(def.storageSlotsBonus || def.storageBonus || 0);
    if (storageBonus > 0) {
      if (target === "boat") {
        S.updateBoat({
          storageSlotsBonus: Number(S.getBoat()?.storageSlotsBonus || 0) + storageBonus
        });
      } else {
        S.updateBase({
          storageSlotsBonus: Number(S.getBase()?.storageSlotsBonus || 0) + storageBonus
        });
      }
    }

    const fuelBonus = Number(def.fuelBonus || def.maxFuelBonus || 0);
    if (fuelBonus > 0 && target === "boat") {
      const boat = S.getBoat();
      S.updateBoat({
        maxFuel: Number(boat.maxFuel || 0) + fuelBonus,
        fuel: Math.min(Number(boat.fuel || 0) + fuelBonus, Number(boat.maxFuel || 0) + fuelBonus)
      });
    }

    if (def.stationId || U.toArray(def.stations).length) {
      const stationIds = U.uniqueBy([def.stationId, ...U.toArray(def.stations)].filter(Boolean), (x) => String(x));
      if (target === "boat") {
        const unlocked = U.uniqueBy([...U.toArray(S.getBoat()?.stationsUnlocked), ...stationIds], (x) => String(x));
        S.updateBoat({ stationsUnlocked: unlocked });
      } else {
        const unlocked = U.uniqueBy([...U.toArray(S.getBase()?.stationsUnlocked), ...stationIds], (x) => String(x));
        S.updateBase({ stationsUnlocked: unlocked });
      }
    }

    if (def.unlocks && typeof def.unlocks === "object") {
      if (target === "boat") {
        S.updateBoat({
          unlocks: U.deepMerge(S.getBoat()?.unlocks || {}, def.unlocks)
        });
      } else {
        S.updateBase({
          unlocks: U.deepMerge(S.getBase()?.unlocks || {}, def.unlocks)
        });
      }
    }

    void options;
    return true;
  }

  function canBuildStructure(structureId, target = state.selectedBuildTarget, quantity = 1) {
    const def = getStructureDef(structureId);
    if (!def) return { ok: false, reason: "Structure not found." };

    if (!isStructureBuildableForTarget(def, target)) {
      return {
        ok: false,
        reason: `${def.name || structureId} cannot be built on ${target === "boat" ? "the boat" : "the base"}.`
      };
    }

    const playerLevel = Number(S.getPlayer()?.stats?.level || 1);
    const minLevel = Number(def.requiredLevel || def.level || 1);

    if (playerLevel < minLevel) {
      return {
        ok: false,
        reason: `Requires player level ${minLevel}.`
      };
    }

    if (def.unique) {
      const existing = target === "boat"
        ? U.toArray(S.getBoat()?.modules).some((entry) => entry.structureId === structureId)
        : U.toArray(S.getBase()?.structures).some((entry) => entry.structureId === structureId);

      if (existing) {
        return { ok: false, reason: "Already built." };
      }
    }

    const materials = hasBuildMaterials(def, quantity);
    if (!materials.ok) {
      return {
        ok: false,
        reason: "Missing materials.",
        missing: materials.missing
      };
    }

    return { ok: true };
  }

  function buildStructure(structureId, target = state.selectedBuildTarget, options = {}) {
    ensureBuildBuckets();

    const def = getStructureDef(structureId);
    if (!def) {
      S.addToast("Structure not found.", "error");
      return null;
    }

    const finalTarget = getBuildTargetForStructure(def, target);
    const quantity = Math.max(1, Number(options.quantity || 1));
    const check = canBuildStructure(structureId, finalTarget, quantity);

    if (!check.ok) {
      S.addToast(check.reason || "Cannot build.", "error");
      if (check.missing?.length) {
        S.logActivity(
          `Missing for ${def.name || structureId}: ${check.missing.map((m) => `${getItemName(m.itemId)} x${m.missing}`).join(", ")}.`,
          "warning"
        );
      }
      return null;
    }

    try {
      removeBuildMaterials(def, quantity);
    } catch (err) {
      S.addToast(err.message || "Could not remove materials.", "error");
      return null;
    }

    let builtRecord = null;

    for (let i = 0; i < quantity; i += 1) {
      builtRecord = addStructureRecord(structureId, finalTarget, options);
      applyStructureEffects(structureId, finalTarget, options);
    }

    if (typeof P?.registerBuildAction === "function") {
      P.registerBuildAction(structureId);
    }

    if (typeof P?.awardSkillXp === "function") {
      P.awardSkillXp("building", 8 + quantity, `building ${def.name || structureId}`);
    }

    S.logActivity(`Built ${def.name || U.titleCase(structureId)} on ${finalTarget === "boat" ? "the boat" : "the base"}.`, "success");
    S.addToast(`Built ${def.name || U.titleCase(structureId)}.`, "success");

    renderBuildPanels();
    renderTrapPanel();
    getUiApi()?.renderEverything?.();

    return builtRecord;
  }

  function getTrapCraftRecipes() {
    ensureTrapBlueprintData();

    const blueprintIds = new Set(getTrapBlueprints().map((entry) => entry.recipeId));
    const outputTrapIds = new Set(getTrapBlueprints().map((entry) => entry.itemId));

    return U.toArray(S.getData()?.recipes)
      .filter((recipe) => {
        if (!recipe?.id) return false;
        if (blueprintIds.has(recipe.id)) return true;

        return getRecipeOutputs(recipe).some((output) => {
          const def = S.getItemDef?.(output.itemId) || {};
          return outputTrapIds.has(output.itemId) || U.toArray(def.tags).includes("trap") || def.trapType;
        });
      })
      .map((recipe) => {
        const output = getRecipeOutputs(recipe).find((entry) => {
          const def = S.getItemDef?.(entry.itemId) || {};
          return outputTrapIds.has(entry.itemId) || U.toArray(def.tags).includes("trap") || def.trapType;
        }) || getRecipeOutputs(recipe)[0];

        const blueprint = getTrapBlueprints().find((entry) => entry.recipeId === recipe.id || entry.itemId === output?.itemId);

        return {
          ...recipe,
          outputTrapItemId: output?.itemId || blueprint?.itemId || null,
          outputTrapQuantity: Number(output?.quantity || 1),
          displayName: recipe.name || blueprint?.name || U.titleCase(recipe.id),
          displayDescription: recipe.description || blueprint?.description || "Craft a trap for passive captures."
        };
      });
  }

  function canCraftTrapRecipe(recipeId) {
    const recipe = getRecipeDef(recipeId);
    if (!recipe) return { ok: false, reason: "Trap recipe not found." };

    const missing = getRecipeInputs(recipe)
      .map((input) => {
        const have = getInventoryAmount(input.itemId, "all");
        const needed = Number(input.quantity || 1);
        return {
          itemId: input.itemId,
          have,
          needed,
          missing: Math.max(0, needed - have)
        };
      })
      .filter((entry) => entry.missing > 0);

    if (missing.length) {
      return { ok: false, reason: "Missing materials.", missing };
    }

    if (!getRecipeOutputs(recipe).length) {
      return { ok: false, reason: "Trap recipe has no output." };
    }

    return { ok: true };
  }

  function removeRecipeMaterials(recipe) {
    const sources = ["player", "base", "boat"];

    getRecipeInputs(recipe).forEach((input) => {
      let remaining = Number(input.quantity || 1);

      sources.forEach((source) => {
        if (remaining <= 0) return;

        const available = getInventoryAmount(input.itemId, source);
        if (available <= 0) return;

        const take = Math.min(available, remaining);
        S.removeItem(source, input.itemId, take);
        remaining -= take;
      });

      if (remaining > 0) {
        throw new Error(`Could not remove enough ${getItemName(input.itemId)}.`);
      }
    });
  }

  function craftTrapRecipe(recipeId) {
    ensureTrapBlueprintData();

    const recipe = getRecipeDef(recipeId);
    const check = canCraftTrapRecipe(recipeId);

    if (!recipe || !check.ok) {
      S.addToast(check.reason || "Cannot craft trap.", "error");
      if (check.missing?.length) {
        S.logActivity(
          `Missing for ${recipe?.name || recipeId}: ${check.missing.map((m) => `${getItemName(m.itemId)} x${m.missing}`).join(", ")}.`,
          "warning"
        );
      }
      return false;
    }

    try {
      removeRecipeMaterials(recipe);
    } catch (err) {
      S.addToast(err.message || "Could not remove trap materials.", "error");
      return false;
    }

    getRecipeOutputs(recipe).forEach((output) => {
      S.addItem("player", output.itemId, Number(output.quantity || 1));
    });

    if (typeof P?.awardSkillXp === "function") {
      P.awardSkillXp("trapping", 5, "crafting trap");
      P.awardSkillXp("crafting", 3, "crafting trap");
    }

    S.logActivity(`Crafted ${recipe.name || U.titleCase(recipe.id)} from the Trap Yard.`, "success");
    S.addToast(`Crafted ${recipe.name || U.titleCase(recipe.id)}.`, "success");

    renderTrapPanel();
    getUiApi()?.renderEverything?.();
    return true;
  }

  function getKnownTrapItems() {
    return ["player", "base", "boat"].flatMap((source) => {
      return U.toArray(S.getInventory(source)).map((entry) => {
        const def = S.getItemDef(entry.itemId) || {};
        const tags = U.toArray(def.tags);
        const isTrap = tags.includes("trap") || def.trapType;

        if (!isTrap) return null;

        return {
          source,
          itemId: entry.itemId,
          quantity: Number(entry.quantity || 0),
          name: def.name || U.titleCase(entry.itemId),
          def,
          trapType: def.trapType || "land",
          catchChance: Number(def.trapCatchChance || 0.32),
          cycleMinutes: Number(def.trapCycleMinutes || 60)
        };
      }).filter(Boolean);
    }).filter((entry) => entry.quantity > 0);
  }

  function getBaitItems() {
    return ["player", "base", "boat"].flatMap((source) => {
      return U.toArray(S.getInventory(source)).map((entry) => {
        const def = S.getItemDef(entry.itemId) || {};
        const tags = U.toArray(def.tags);
        const isBait = tags.includes("bait") || tags.includes("food") || tags.includes("fishing");

        if (!isBait) return null;

        return {
          source,
          itemId: entry.itemId,
          quantity: Number(entry.quantity || 0),
          name: def.name || U.titleCase(entry.itemId),
          def,
          baitPower: Number(def.baitPower || def.animalFeedValue || 1)
        };
      }).filter(Boolean);
    }).filter((entry) => entry.quantity > 0);
  }

  function getTrapSpeciesPool(trap = {}) {
    const animals = U.toArray(S.getData()?.animals);
    const tile = S.getMapTile?.(trap.tileX, trap.tileY) || S.getCurrentMapTile();
    const biomeId = tile?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";
    const trapType = trap.trapType || "land";

    const matches = animals.filter((animal) => {
      const tags = U.toArray(animal.tags);
      const habitatType = animal.habitatType || "general";
      const habitat = animal.habitat || "";

      if (trapType === "water") {
        return habitatType === "aquarium" || tags.includes("fish") || tags.includes("aquatic") || habitat === biomeId;
      }

      if (trapType === "air") {
        return habitatType === "aviary" || tags.includes("bird") || tags.includes("flying") || habitat === biomeId;
      }

      return (habitatType !== "aquarium" && habitat === biomeId) || tags.includes("starter") || habitatType === "general";
    });

    if (matches.length) return matches.map((entry) => entry.id);

    if (trapType === "water") return ["mud_minnow"];
    return ["reed_hopper", "dock_turtle"];
  }

  function getTrapPlacementOptions() {
    const world = S.getWorld();

    const options = [
      {
        key: "current",
        label: `Current Tile (${world.currentTileX}, ${world.currentTileY})`,
        tileX: Number(world.currentTileX || 0),
        tileY: Number(world.currentTileY || 0),
        reason: "current"
      }
    ];

    const seen = new Set([`${world.currentTileX},${world.currentTileY}`]);

    U.toArray(S.getBase()?.trapCatchHistory).slice(0, 20).forEach((entry) => {
      const tileX = Number(entry.tileX ?? world.currentTileX);
      const tileY = Number(entry.tileY ?? world.currentTileY);
      const key = `history_${tileX}_${tileY}`;
      const coord = `${tileX},${tileY}`;

      if (seen.has(coord)) return;
      seen.add(coord);

      options.push({
        key,
        label: `Known Catch Tile (${tileX}, ${tileY})`,
        tileX,
        tileY,
        reason: "catch_history"
      });
    });

    U.toArray(S.getData()?.map?.tiles).forEach((tile) => {
      const pois = U.toArray(tile.pointsOfInterest);
      const hasAnimal = pois.some((poi) => (poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.speciesId);
      if (!hasAnimal) return;

      const tileX = Number(tile.x);
      const tileY = Number(tile.y);
      const coord = `${tileX},${tileY}`;

      if (seen.has(coord)) return;
      seen.add(coord);

      options.push({
        key: `known_${tileX}_${tileY}`,
        label: `${tile.name || "Known Wildlife Tile"} (${tileX}, ${tileY})`,
        tileX,
        tileY,
        reason: "known_wildlife"
      });
    });

    if (!options.some((entry) => entry.key === state.selectedTrapPlacementKey)) {
      state.selectedTrapPlacementKey = "current";
    }

    return options;
  }

  function getSelectedTrapPlacement() {
    return getTrapPlacementOptions().find((entry) => entry.key === state.selectedTrapPlacementKey) || getTrapPlacementOptions()[0];
  }

  function placeTrap(itemId, options = {}) {
    ensureBuildBuckets();

    const trapItem = getKnownTrapItems().find((entry) => entry.itemId === itemId);
    if (!trapItem) {
      S.addToast("No trap item available.", "error");
      return null;
    }

    const tileX = Number(options.tileX ?? S.getWorld().currentTileX);
    const tileY = Number(options.tileY ?? S.getWorld().currentTileY);

    const removed = S.removeItem(trapItem.source, trapItem.itemId, 1);
    if (!removed) {
      S.addToast("Could not place trap item.", "error");
      return null;
    }

    const trap = {
      id: U.uid("trap"),
      itemId: trapItem.itemId,
      name: trapItem.name,
      trapType: options.trapType || trapItem.trapType || "land",
      tileX,
      tileY,
      status: "set",
      baitItemId: null,
      baitName: null,
      baitPower: 0,
      placedAt: U.isoNow(),
      lastCheckedAt: U.isoNow(),
      progressMinutes: 0,
      cycleMinutes: Number(options.cycleMinutes || trapItem.cycleMinutes || 60),
      catchChance: Number(options.catchChance || trapItem.catchChance || 0.32),
      pendingCatches: [],
      totalCatches: 0
    };

    const traps = U.toArray(S.getBase()?.traps);
    traps.push(trap);
    S.updateBase({ traps });

    if (typeof P?.awardSkillXp === "function") {
      P.awardSkillXp("trapping", 4, "placing trap");
    }

    S.logActivity(`Placed ${trap.name} at tile ${tileX}, ${tileY}.`, "success");
    S.addToast("Trap placed.", "success");

    renderTrapPanel();
    getUiApi()?.renderEverything?.();

    return trap;
  }

  function baitTrap(trapId, baitItemId = null) {
    ensureBuildBuckets();

    const traps = U.toArray(S.getBase()?.traps);
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;

    const bait = baitItemId
      ? getBaitItems().find((entry) => entry.itemId === baitItemId)
      : getBaitItems()[0];

    if (!bait) {
      S.addToast("No bait available.", "warning");
      return false;
    }

    if (!S.removeItem(bait.source, bait.itemId, 1)) {
      S.addToast("Could not use bait.", "error");
      return false;
    }

    trap.baitItemId = bait.itemId;
    trap.baitName = bait.name;
    trap.baitPower = Number(bait.baitPower || 1);
    trap.status = "baited";
    trap.updatedAt = U.isoNow();

    S.updateBase({ traps });

    if (typeof P?.awardSkillXp === "function") {
      P.awardSkillXp("trapping", 2, "baiting trap");
    }

    S.logActivity(`Baited ${trap.name} with ${bait.name}.`, "success");
    S.addToast("Trap baited.", "success");

    renderTrapPanel();
    getUiApi()?.renderEverything?.();

    return true;
  }

  function rollTrapCatch(trap) {
    const baseChance = Number(trap.catchChance || 0.25);
    const baitBonus = trap.baitItemId ? 0.18 + (Number(trap.baitPower || 0) * 0.02) : 0;
    const skillLevel = typeof P?.getSkillLevel === "function" ? Number(P.getSkillLevel("trapping") || 0) : 0;
    const skillBonus = skillLevel * 0.015;
    const chance = U.clamp(baseChance + baitBonus + skillBonus, 0.05, 0.88);

    if (Math.random() > chance) return null;

    const pool = getTrapSpeciesPool(trap);
    const speciesId = U.pick(pool);
    if (!speciesId) return null;

    return {
      id: U.uid("trapcatch"),
      speciesId,
      name: getAnimalsApi()?.getAnimalName?.(speciesId) || U.titleCase(speciesId),
      caughtAt: U.isoNow(),
      tileX: trap.tileX,
      tileY: trap.tileY,
      trapId: trap.id
    };
  }

  function updateTrapSettings(trapId, patch = {}) {
    ensureBuildBuckets();

    const traps = U.toArray(S.getBase()?.traps);
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;

    if (patch.trapType) trap.trapType = patch.trapType;
    if (patch.cycleMinutes != null) trap.cycleMinutes = Math.max(15, Number(patch.cycleMinutes || trap.cycleMinutes || 60));
    if (patch.catchChance != null) trap.catchChance = U.clamp(Number(patch.catchChance || trap.catchChance || 0.32), 0.05, 0.9);

    trap.updatedAt = U.isoNow();
    S.updateBase({ traps });
    S.logActivity(`Updated ${trap.name || "trap"} settings.`, "info");
    renderTrapPanel();
    return true;
  }

  function tickTraps(gameMinutes = 5, options = {}) {
    ensureBuildBuckets();

    const traps = U.toArray(S.getBase()?.traps);
    if (!traps.length) return false;

    let changed = false;

    traps.forEach((trap) => {
      if (trap.status === "broken") return;
      if (U.toArray(trap.pendingCatches).length >= 2) return;

      trap.progressMinutes = Number(trap.progressMinutes || 0) + Number(gameMinutes || 0);

      while (trap.progressMinutes >= Number(trap.cycleMinutes || 60)) {
        trap.progressMinutes -= Number(trap.cycleMinutes || 60);

        const caught = rollTrapCatch(trap);
        if (caught) {
          trap.pendingCatches = U.toArray(trap.pendingCatches);
          trap.pendingCatches.push(caught);
          trap.totalCatches = Number(trap.totalCatches || 0) + 1;
          trap.status = "catch_ready";

          if (trap.baitItemId && Math.random() < 0.55) {
            trap.baitItemId = null;
            trap.baitName = null;
            trap.baitPower = 0;
          }

          changed = true;
          break;
        }

        changed = true;
      }

      trap.updatedAt = U.isoNow();
    });

    if (changed) {
      S.updateBase({ traps });
      if (options.forceRender || S.isModalOpen?.("trapsModal")) {
        renderTrapPanel();
      }
    }

    return changed;
  }

  function collectTrap(trapId) {
    ensureBuildBuckets();

    const animals = getAnimalsApi();
    const traps = U.toArray(S.getBase()?.traps);
    const trap = traps.find((entry) => entry.id === trapId);

    if (!trap) return [];

    const catches = U.toArray(trap.pendingCatches);
    if (!catches.length) {
      S.addToast("No catches waiting.", "info");
      return [];
    }

    const captured = [];

    catches.forEach((caught) => {
      const specimen = animals?.captureAnimal?.(caught.speciesId, {
        method: "trap_capture",
        name: caught.name,
        tileX: caught.tileX,
        tileY: caught.tileY,
        preferCryo: true,
        skipAutoParty: true,
        notes: `Caught by ${trap.name}.`
      });

      if (specimen) captured.push(specimen);
    });

    const history = U.toArray(S.getBase()?.trapCatchHistory);
    catches.forEach((caught) => history.unshift(caught));

    trap.pendingCatches = [];
    trap.status = trap.baitItemId ? "baited" : "set";
    trap.updatedAt = U.isoNow();

    S.updateBase({
      traps,
      trapCatchHistory: history
    });

    if (typeof P?.awardSkillXp === "function") {
      P.awardSkillXp("trapping", 5 + captured.length, "collecting trap");
    }

    S.logActivity(`Collected ${captured.length} trap catch${captured.length === 1 ? "" : "es"} into Cryo storage.`, "success");
    S.addToast(`Collected ${captured.length} catch${captured.length === 1 ? "" : "es"}.`, "success");

    renderTrapPanel();
    getUiApi()?.renderEverything?.();

    return captured;
  }

  function removeTrap(trapId) {
    ensureBuildBuckets();

    const traps = U.toArray(S.getBase()?.traps);
    const trap = traps.find((entry) => entry.id === trapId);
    if (!trap) return false;

    const next = traps.filter((entry) => entry.id !== trapId);
    S.updateBase({ traps: next });

    S.addItem("player", trap.itemId, 1);

    S.logActivity(`Packed up ${trap.name}.`, "info");
    S.addToast("Trap returned to inventory.", "info");

    renderTrapPanel();
    getUiApi()?.renderEverything?.();

    return true;
  }

  function getFilteredStructureDefs() {
    return getStructureDefs()
      .filter((def) => def?.id)
      .filter((def) => isStructureBuildableForTarget(def, state.selectedBuildTarget))
      .filter((def) => {
        if (state.selectedCategory === "all") return true;
        return getStructureCategory(def) === state.selectedCategory;
      });
  }

  function renderCostLine(def = {}) {
    const costs = getBuildCosts(def);

    if (!costs.length) return "Free";

    return costs.map((cost) => {
      const have = getInventoryAmount(cost.itemId, "all");
      const ok = have >= Number(cost.quantity || 1);
      return `<span class="${ok ? "success-text" : "danger-text"}">${htmlEscape(getItemName(cost.itemId))} ${htmlEscape(String(have))}/${htmlEscape(String(cost.quantity || 1))}</span>`;
    }).join(" • ");
  }

  function renderBuildTargetButtons(host) {
    const buttons = U.createEl("div", { className: "admin-console-actions" });

    ["base", "boat"].forEach((target) => {
      const btn = U.createEl("button", {
        className: state.selectedBuildTarget === target ? "primary-btn" : "ghost-btn",
        text: target === "boat" ? "Boat Modules" : "Base Structures"
      });

      U.on(btn, "click", () => {
        state.selectedBuildTarget = target;
        renderBuildPanels();
      });

      buttons.appendChild(btn);
    });

    host.appendChild(buttons);
  }

  function renderCategoryButtons(host) {
    const categories = ["all", "base", "habitats", "stations", "storage", "boat"];
    const buttons = U.createEl("div", { className: "admin-console-actions" });

    categories.forEach((category) => {
      const btn = U.createEl("button", {
        className: state.selectedCategory === category ? "secondary-btn" : "ghost-btn",
        text: U.titleCase(category)
      });

      U.on(btn, "click", () => {
        state.selectedCategory = category;
        renderBuildPanels();
      });

      buttons.appendChild(btn);
    });

    host.appendChild(buttons);
  }

  function renderBuildPanels(containerId = "buildPanelContent") {
    ensureBuildBuckets();

    const host = U.byId(containerId) || U.byId("buildPanelContent");
    if (!host) return;

    U.emptyEl(host);

    const title = U.createEl("div", { className: "build-panel-root" });
    title.innerHTML = `
      <h3>Build & Structures</h3>
      <p>Build base structures, habitats, workstations, storage, and boat modules. Built habitats are managed from Party > Habitats.</p>
    `;

    renderBuildTargetButtons(title);
    renderCategoryButtons(title);

    const defs = getFilteredStructureDefs();

    const list = U.createEl("div", { className: "card-list" });

    if (!defs.length) {
      list.appendChild(U.createEl("div", {
        className: "card",
        text: "No structures match this target/filter."
      }));
    } else {
      defs.forEach((def) => {
        const check = canBuildStructure(def.id, state.selectedBuildTarget);
        const category = getStructureCategory(def);
        const isHabitat = U.toArray(def.tags).includes("habitat") || def.habitatType;

        const card = U.createEl("div", { className: "card" });
        card.innerHTML = `
          <div class="meta-title">${htmlEscape(def.name || U.titleCase(def.id))}</div>
          <div class="meta-sub">${htmlEscape(U.titleCase(category))}${isHabitat ? ` • Habitat: ${htmlEscape(U.titleCase(def.habitatType || "general"))}` : ""}</div>
          <p>${htmlEscape(def.description || "No description yet.")}</p>
          <p><strong>Cost:</strong> ${renderCostLine(def)}</p>
          ${check.ok ? `<p class="success-text">Ready to build.</p>` : `<p class="warning-text">${htmlEscape(check.reason || "Cannot build.")}</p>`}
          <div class="admin-console-actions">
            <button class="primary-btn build-structure-btn" data-structure-id="${htmlEscape(def.id)}" ${check.ok ? "" : "disabled"}>Build</button>
          </div>
        `;

        list.appendChild(card);
      });
    }

    title.appendChild(list);
    host.appendChild(title);

    U.qsa(".build-structure-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        buildStructure(btn.dataset.structureId, state.selectedBuildTarget);
      });
    });
  }

  function renderTrapCraftSection() {
    const recipes = getTrapCraftRecipes();

    if (!recipes.length) {
      return `<div class="card">No trap blueprints are available yet.</div>`;
    }

    return `
      <div class="card-list">
        ${recipes.map((recipe) => {
          const check = canCraftTrapRecipe(recipe.id);
          const inputs = getRecipeInputs(recipe);
          const costs = inputs.length
            ? inputs.map((input) => {
              const have = getInventoryAmount(input.itemId, "all");
              const ok = have >= Number(input.quantity || 1);
              return `<span class="${ok ? "success-text" : "danger-text"}">${htmlEscape(getItemName(input.itemId))} ${htmlEscape(String(have))}/${htmlEscape(String(input.quantity || 1))}</span>`;
            }).join(" • ")
            : "Free";

          const output = recipe.outputTrapItemId || getRecipeOutputs(recipe)[0]?.itemId;
          const itemDef = S.getItemDef?.(output) || {};
          const trapType = itemDef.trapType || "land";

          return `
            <div class="card compact-card">
              <div class="meta-title">${htmlEscape(recipe.displayName || recipe.name || U.titleCase(recipe.id))}</div>
              <div class="meta-sub">${htmlEscape(U.titleCase(trapType))} trap • Output: ${htmlEscape(getItemName(output))}</div>
              <p>${htmlEscape(recipe.displayDescription || recipe.description || "Craft a trap for passive capture.")}</p>
              <p><strong>Cost:</strong> ${costs}</p>
              ${check.ok ? `<p class="success-text">Ready to craft.</p>` : `<p class="warning-text">${htmlEscape(check.reason || "Cannot craft.")}</p>`}
              <div class="admin-console-actions">
                <button class="primary-btn trap-craft-btn" data-recipe-id="${htmlEscape(recipe.id)}" ${check.ok ? "" : "disabled"}>Craft Trap</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderTrapPanel(containerId = "trapPanelContent") {
    ensureBuildBuckets();
    ensureTrapBlueprintData();

    const host = U.byId(containerId) || U.byId("trapPanelContent");
    if (!host) return;

    U.emptyEl(host);

    const traps = U.toArray(S.getBase()?.traps);
    const trapItems = getKnownTrapItems();
    const baitItems = getBaitItems();
    const placementOptions = getTrapPlacementOptions();
    const selectedPlacement = getSelectedTrapPlacement();

    host.innerHTML = `
      <h3>Trap Yard</h3>
      <p>Craft, place, bait, rebait, test, collect, and pack up traps from here. Collected animals go to Cryo by default.</p>

      <h4>Craft Traps</h4>
      ${renderTrapCraftSection()}

      <h4>Place Trap</h4>
      ${
        trapItems.length
          ? `
            <div class="card compact-card">
              <label class="form-field">
                <span>Trap Item</span>
                <select id="trapItemSelect">
                  ${trapItems.map((entry) => `
                    <option value="${htmlEscape(entry.itemId)}">${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity))} (${htmlEscape(entry.source)})</option>
                  `).join("")}
                </select>
              </label>

              <label class="form-field" style="margin-top:.65rem;">
                <span>Placement</span>
                <select id="trapPlacementSelect">
                  ${placementOptions.map((entry) => `
                    <option value="${htmlEscape(entry.key)}" ${entry.key === state.selectedTrapPlacementKey ? "selected" : ""}>${htmlEscape(entry.label)}</option>
                  `).join("")}
                </select>
              </label>

              <div class="admin-console-actions" style="margin-top:.7rem;">
                <button id="btnPlaceSelectedTrap" class="primary-btn">Place Trap at ${htmlEscape(String(selectedPlacement.tileX))}, ${htmlEscape(String(selectedPlacement.tileY))}</button>
              </div>
            </div>
          `
          : `<div class="card">No trap items available. Craft one above first.</div>`
      }

      <h4>Placed Traps</h4>
      <div id="placedTrapList" class="card-list">
        ${
          traps.length
            ? traps.map((trap) => {
              const pending = U.toArray(trap.pendingCatches).length;
              const pct = U.clamp((Number(trap.progressMinutes || 0) / Math.max(1, Number(trap.cycleMinutes || 60))) * 100, 0, 100);
              return `
                <div class="card compact-card">
                  <div class="meta-title">${htmlEscape(trap.name || "Trap")}</div>
                  <div class="meta-sub">Tile ${htmlEscape(String(trap.tileX))}, ${htmlEscape(String(trap.tileY))} • ${htmlEscape(U.titleCase(trap.trapType || "land"))}</div>
                  <div class="meta-sub">Status: ${htmlEscape(U.titleCase(trap.status || "set"))} • Pending catches: ${htmlEscape(String(pending))} • Lifetime catches: ${htmlEscape(String(trap.totalCatches || 0))}</div>
                  <div class="meta-sub">Bait: ${htmlEscape(trap.baitName || "None")}</div>
                  <div class="bar" style="margin:.45rem 0;"><div class="fill" style="width:${pct}%;"></div></div>

                  <label class="form-field" style="margin:.55rem 0;">
                    <span>Bait / Rebait With</span>
                    <select class="trap-bait-select" data-trap-id="${htmlEscape(trap.id)}" ${baitItems.length ? "" : "disabled"}>
                      ${baitItems.length ? baitItems.map((bait) => `
                        <option value="${htmlEscape(bait.itemId)}">${htmlEscape(bait.name)} x${htmlEscape(String(bait.quantity))} (${htmlEscape(bait.source)})</option>
                      `).join("") : `<option value="">No bait available</option>`}
                    </select>
                  </label>

                  <label class="form-field" style="margin:.55rem 0;">
                    <span>Trap Mode</span>
                    <select class="trap-type-select" data-trap-id="${htmlEscape(trap.id)}">
                      ${["land", "water", "air"].map((type) => `<option value="${type}" ${type === (trap.trapType || "land") ? "selected" : ""}>${htmlEscape(U.titleCase(type))}</option>`).join("")}
                    </select>
                  </label>

                  <div class="admin-console-actions">
                    <button class="secondary-btn trap-bait-btn" data-trap-id="${htmlEscape(trap.id)}" ${baitItems.length ? "" : "disabled"}>Bait / Rebait</button>
                    <button class="primary-btn trap-collect-btn" data-trap-id="${htmlEscape(trap.id)}" ${pending ? "" : "disabled"}>Collect</button>
                    <button class="ghost-btn trap-tick-btn" data-trap-id="${htmlEscape(trap.id)}">Test Tick</button>
                    <button class="ghost-btn trap-remove-btn" data-trap-id="${htmlEscape(trap.id)}">Pack Up</button>
                  </div>
                </div>
              `;
            }).join("")
            : `<div class="card">No traps placed yet.</div>`
        }
      </div>
    `;

    U.qsa(".trap-craft-btn", host).forEach((btn) => {
      U.on(btn, "click", () => craftTrapRecipe(btn.dataset.recipeId));
    });

    const placeBtn = U.byId("btnPlaceSelectedTrap");
    const trapSelect = U.byId("trapItemSelect");
    const placementSelect = U.byId("trapPlacementSelect");

    if (placementSelect) {
      U.on(placementSelect, "change", () => {
        state.selectedTrapPlacementKey = placementSelect.value || "current";
        renderTrapPanel();
      });
    }

    if (placeBtn && trapSelect) {
      U.on(placeBtn, "click", () => {
        const placement = getSelectedTrapPlacement();
        placeTrap(trapSelect.value, {
          tileX: placement.tileX,
          tileY: placement.tileY
        });
      });
    }

    U.qsa(".trap-bait-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        const select = host.querySelector(`.trap-bait-select[data-trap-id="${CSS.escape(btn.dataset.trapId)}"]`);
        baitTrap(btn.dataset.trapId, select?.value || null);
      });
    });

    U.qsa(".trap-type-select", host).forEach((select) => {
      U.on(select, "change", () => {
        updateTrapSettings(select.dataset.trapId, { trapType: select.value || "land" });
      });
    });

    U.qsa(".trap-collect-btn", host).forEach((btn) => {
      U.on(btn, "click", () => collectTrap(btn.dataset.trapId));
    });

    U.qsa(".trap-tick-btn", host).forEach((btn) => {
      const trapId = btn.dataset.trapId;
      U.on(btn, "click", () => {
        const trapsNow = U.toArray(S.getBase()?.traps);
        const trap = trapsNow.find((entry) => entry.id === trapId);
        if (trap) {
          trap.progressMinutes = Number(trap.cycleMinutes || 60);
          S.updateBase({ traps: trapsNow });
          tickTraps(1, { forceRender: true });
          S.addToast("Trap test tick resolved.", "info");
        }
      });
    });

    U.qsa(".trap-remove-btn", host).forEach((btn) => {
      U.on(btn, "click", () => removeTrap(btn.dataset.trapId));
    });
  }

  function renderBoatPanelEnhancements() {
    const statsEl = U.byId("boatStats");
    const upgradesEl = U.byId("boatUpgradeList");
    if (!statsEl || !upgradesEl) return;

    ensureBuildBuckets();

    const boat = S.getBoat();
    const modules = U.toArray(boat.modules);
    const habitats = U.toArray(boat.habitats);

    statsEl.innerHTML = `
      <p><strong>Name:</strong> ${htmlEscape(boat?.name || "Mudskipper")}</p>
      <p><strong>Tier:</strong> ${htmlEscape(String(boat?.tier || 1))}</p>
      <p><strong>HP:</strong> ${htmlEscape(String(boat?.hp || 0))}/${htmlEscape(String(boat?.maxHp || 0))}</p>
      <p><strong>Fuel:</strong> ${htmlEscape(String(boat?.fuel || 0))}/${htmlEscape(String(boat?.maxFuel || 0))}</p>
      <p><strong>Storage Stacks:</strong> ${htmlEscape(String(U.toArray(boat?.storage).length))}</p>
      <p><strong>Modules:</strong> ${htmlEscape(String(modules.length))}</p>
      <p><strong>Habitats:</strong> ${htmlEscape(String(habitats.length))}</p>
      <div class="admin-console-actions">
        <button id="btnBoatOpenBuildFromPanel" class="primary-btn">Build Boat Modules</button>
      </div>
    `;

    upgradesEl.innerHTML = modules.length
      ? modules.map((module) => {
        const def = getStructureDef(module.structureId);
        return `
          <div class="card compact-card">
            <div class="meta-title">${htmlEscape(def?.name || module.name || U.titleCase(module.structureId))}</div>
            <div class="meta-sub">Qty ${htmlEscape(String(module.quantity || 1))}</div>
            <p>${htmlEscape(def?.description || "")}</p>
          </div>
        `;
      }).join("")
      : `<div class="card">No boat modules built yet.</div>`;

    const btn = U.byId("btnBoatOpenBuildFromPanel");
    if (btn) {
      U.on(btn, "click", () => {
        state.selectedBuildTarget = "boat";
        window.GrabLabModal?.openModal?.("buildModal");
        renderBuildPanels();
      });
    }
  }

  function renderBaseEnhancements() {
    getUiApi()?.renderBaseModal?.();
  }

  function seedFallbackStructuresIfNeeded() {
    const existing = getStructureDefs();
    if (existing.length > 0) return false;

    const fallback = [
      {
        id: "workbench_t1",
        name: "Rough Workbench",
        description: "A sturdy-enough table for basic crafting, repairs, and ill-advised field tinkering.",
        category: "stations",
        tags: ["station", "crafting"],
        stationId: "workbench",
        allowedTargets: ["base", "boat"],
        cost: [
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "fiber_bundle", quantity: 2 }
        ]
      },
      {
        id: "field_stove_t1",
        name: "Field Stove",
        description: "A grimy little stove for boiling water and making survival food less depressing.",
        category: "stations",
        tags: ["station", "cooking"],
        stationId: "stove",
        allowedTargets: ["base"],
        cost: [
          { itemId: "scrap_wood", quantity: 3 },
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        id: "breeding_tank_t1",
        name: "Breeding Tank",
        description: "A warm, humming tank for controlled breeding projects. Weird, but professional.",
        category: "stations",
        tags: ["station", "breeding"],
        stationId: "breeding_tank",
        allowedTargets: ["base"],
        cost: [
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "fresh_water", quantity: 2 },
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        id: "animal_pen_t1",
        name: "Starter Animal Pen",
        description: "A simple fenced habitat for small and medium land animals. Holds two animals.",
        category: "habitats",
        tags: ["habitat"],
        habitatType: "general",
        capacity: 2,
        sizeLimit: "medium",
        allowedTargets: ["base"],
        cost: [
          { itemId: "scrap_wood", quantity: 6 },
          { itemId: "fiber_bundle", quantity: 4 },
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        id: "aquarium_t1",
        name: "Salvaged Aquarium",
        description: "A patched water tank for fish, minnows, and anything that judges you through glass.",
        category: "habitats",
        tags: ["habitat"],
        habitatType: "aquarium",
        capacity: 2,
        sizeLimit: "small",
        water: true,
        allowedTargets: ["base"],
        cost: [
          { itemId: "fresh_water", quantity: 3 },
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "fiber_bundle", quantity: 2 }
        ]
      },
      {
        id: "aviary_t1",
        name: "Reed Aviary",
        description: "A light enclosure for flying or climbing creatures that deeply resent ceilings.",
        category: "habitats",
        tags: ["habitat"],
        habitatType: "aviary",
        capacity: 2,
        sizeLimit: "small",
        flying: true,
        allowedTargets: ["base"],
        cost: [
          { itemId: "scrap_wood", quantity: 5 },
          { itemId: "fiber_bundle", quantity: 5 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      },
      {
        id: "storage_shed_t1",
        name: "Leaky Storage Shed",
        description: "Adds storage space. Smells like wet plywood and ambition.",
        category: "storage",
        tags: ["storage"],
        storageSlotsBonus: 12,
        allowedTargets: ["base"],
        cost: [
          { itemId: "scrap_wood", quantity: 6 },
          { itemId: "fiber_bundle", quantity: 3 }
        ]
      },
      {
        id: "boat_hold_t1",
        name: "Boat Storage Hold",
        description: "Adds storage to the boat so it can become a floating junk drawer.",
        category: "boat",
        tags: ["boat", "storage"],
        target: "boat",
        storageSlotsBonus: 10,
        allowedTargets: ["boat"],
        cost: [
          { itemId: "scrap_wood", quantity: 5 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      },
      {
        id: "boat_aquarium_t1",
        name: "Boat Aquarium Rack",
        description: "A strapped-down tank for aquatic specimens on the move. Mostly splash-proof.",
        category: "boat",
        tags: ["boat", "habitat"],
        target: "boat",
        habitatType: "aquarium",
        capacity: 2,
        sizeLimit: "small",
        water: true,
        allowedTargets: ["boat"],
        cost: [
          { itemId: "fresh_water", quantity: 3 },
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "rope_bundle", quantity: 2 }
        ]
      }
    ];

    S.replaceDataBucket("structures", fallback);
    return true;
  }

  function seedStarterBuildMaterialsIfNeeded() {
    const inv = S.getInventory("player");
    const base = S.getInventory("base");

    const combinedHasMaterials =
      getInventoryAmount("scrap_wood", "all") +
      getInventoryAmount("fiber_bundle", "all") +
      getInventoryAmount("rope_bundle", "all") >
      0;

    if (combinedHasMaterials) return false;

    S.addItem("player", "scrap_wood", 10);
    S.addItem("player", "fiber_bundle", 8);
    S.addItem("player", "rope_bundle", 3);
    S.addItem("player", "fresh_water", 4);
    S.addItem("player", "improvised_snare_trap", 1);

    void inv;
    void base;
    return true;
  }

  function bindEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "buildModal") renderBuildPanels();
      if (modalId === "trapsModal") renderTrapPanel();
      if (modalId === "boatModal") renderBoatPanelEnhancements();
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen?.("buildModal")) renderBuildPanels();
      if (S.isModalOpen?.("trapsModal")) renderTrapPanel();
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen?.("buildModal")) renderBuildPanels();
      if (S.isModalOpen?.("trapsModal")) renderTrapPanel();
    });

    U.eventBus.on("boat:changed", () => {
      if (S.isModalOpen?.("buildModal")) renderBuildPanels();
      if (S.isModalOpen?.("boatModal")) renderBoatPanelEnhancements();
    });

    U.eventBus.on("world:baseStructureTileChanged", () => {
      window.GL_WORLD?.drawWorld?.();
      window.GL_INPUT?.drawMiniMap?.();
      window.GL_MAP?.drawMap?.();
    });

    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) tickTraps(5);
    });
  }

  function init() {
    if (state.initialized) return true;

    ensureBuildBuckets();
    ensureTrapBlueprintData();
    seedFallbackStructuresIfNeeded();
    seedStarterBuildMaterialsIfNeeded();
    syncBaseStructureTiles();
    bindEvents();

    renderBuildPanels();
    renderTrapPanel();

    state.initialized = true;
    U.eventBus.emit("build:initialized");
    return true;
  }

  const API = {
    init,

    ensureBuildBuckets,

    getStructureDefs,
    getStructureDef,
    getStructureCategory,
    getBuildTargetForStructure,
    isStructureBuildableForTarget,
    getBuildCosts,
    getInventoryAmount,
    hasBuildMaterials,
    removeBuildMaterials,

    canBuildStructure,
    buildStructure,
    addStructureRecord,
    applyStructureEffects,
    syncBaseStructureTiles,
    stampBaseStructureOnMap,

    getKnownTrapItems,
    getBaitItems,
    getTrapSpeciesPool,
    placeTrap,
    baitTrap,
    rollTrapCatch,
    tickTraps,
    collectTrap,
    removeTrap,

    renderBuildPanels,
    renderTrapPanel,
    renderBoatPanelEnhancements,
    renderBaseEnhancements,

    ensureTrapBlueprintData,
    getTrapBlueprints,
    getTrapCraftRecipes,
    canCraftTrapRecipe,
    craftTrapRecipe,
    getTrapPlacementOptions,
    updateTrapSettings,

    seedFallbackStructuresIfNeeded,
    seedStarterBuildMaterialsIfNeeded
  };

  window.GL_BUILD = API;

  return Object.freeze(API);
})();