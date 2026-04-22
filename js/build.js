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

  function getAccessibleBuildList() {
    return getStructures().filter((def) => {
      if (!def?.id) return false;

      if (state.selectedCategory !== "all" && getStructureCategory(def) !== state.selectedCategory) {
        return false;
      }

      if (state.selectedBuildTarget === "boat") {
        return isBoatBuild(def);
      }

      return !isBoatBuild(def) || def?.buildTarget === "base";
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

  function meetsTileRequirement(def, tileX = null, tileY = null) {
    if (!CFG.BUILDING.allowBuildOnClearedTilesOnly) return true;
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

    if (!meetsLevelRequirement(def)) {
      return {
        ok: false,
        reason: `Requires level ${def.requiredLevel || 1}.`
      };
    }

    if (!meetsTileRequirement(def, options.tileX, options.tileY)) {
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

  function applyStructureEffects(def, options = {}) {
    if (!def) return false;

    const qty = Math.max(1, Number(options.quantity || 1));

    if (getStructureTags(def).includes("storage")) {
      const current = Number(S.getBase()?.storageSlotsBonus || 0);
      S.updateBase({
        storageSlotsBonus: current + ((Number(def.storageBonus || 10)) * qty)
      });
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
        AN.addHabitat(def.id, {
          name: def.name || U.titleCase(def.id)
        });
      }
    }

    if (getStructureTags(def).includes("utility") && def.unlockFlag) {
      S.setFlag(def.unlockFlag, true);
    }

    if (def.stationId) {
      S.logActivity(`Unlocked station: ${U.titleCase(def.stationId)}.`, "success");
    }

    return true;
  }

  function buildStructure(structureId, options = {}) {
    const def = getStructure(structureId);
    if (!def) throw new Error("Structure not found.");

    const qty = Math.max(1, Number(options.quantity || 1));
    const validation = canBuildStructure(structureId, options);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    removeBuildCosts(def, qty, options.preferredSources || ["base", "player", "boat"]);

    if (isBoatBuild(def) || options.target === "boat") {
      addBoatModule(structureId, qty);
    } else {
      addBaseStructure(structureId, qty);
    }

    applyStructureEffects(def, {
      quantity: qty,
      target: options.target || state.selectedBuildTarget
    });

    P.registerBuildAction();
    P.awardPlayerXp(6 + qty * 2, `building ${getStructureName(structureId)}`);

    S.logActivity(`Built ${getStructureName(structureId)} x${qty}.`, "success");
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
        S.addItem("base", cost.itemId, refund);
      }
    });

    if (getStructureTags(def).includes("habitat")) {
      const habitats = U.toArray(S.getBase()?.habitats).filter((entry) => entry.structureId !== structureId);
      S.updateBase({ habitats });
    }

    S.logActivity(`Demolished ${getStructureName(structureId)} x${qty}.`, "warning");
    renderBuildPanels();
    UI.renderEverything();
    return true;
  }

  function getBuildableDisplayData(def) {
    const afford = canAffordStructure(def);
    const levelOk = meetsLevelRequirement(def);
    const tileOk = meetsTileRequirement(def);
    const category = getStructureCategory(def);

    return {
      def,
      category,
      levelOk,
      tileOk,
      affordOk: afford.ok,
      missing: afford.missing,
      buildOk: levelOk && tileOk && afford.ok
    };
  }

  function selectStructure(structureId) {
    state.selectedStructureId = structureId || null;
    renderBuildPanels();
    return state.selectedStructureId;
  }

  function setBuildTarget(target = "base") {
    state.selectedBuildTarget = target === "boat" ? "boat" : "base";
    renderBuildPanels();
    return state.selectedBuildTarget;
  }

  function setBuildCategory(category = "all") {
    state.selectedCategory = category || "all";
    renderBuildPanels();
    return state.selectedCategory;
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
      <p><strong>Target:</strong> ${htmlEscape(isBoatBuild(def) ? "Boat" : "Base")}</p>

      <h4>Costs</h4>
      <ul>${costs || "<li>No cost</li>"}</ul>

      ${
        data.missing?.length
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

  function renderBoatPanelEnhancements() {
    const stats = U.byId("boatStats");
    const upgrades = U.byId("boatUpgradeList");
    if (!stats || !upgrades) return;

    const modules = getBoatModules();
    const boat = S.getBoat();

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
        <div class="meta-title">Unlocked Upgrades</div>
        <div class="meta-sub">${htmlEscape(U.toArray(boat?.upgradesUnlocked).join(", ") || "None")}</div>
      </div>
    `;
  }

  function renderBaseEnhancements() {
    const host = U.byId("basePanelContent");
    if (!host) return;

    const base = S.getBase();
    const structures = getBaseStructures();
    const habitats = U.toArray(base?.habitats);

    host.innerHTML = `
      <h3>${htmlEscape(base?.name || "Field Station Alpha")}</h3>
      <p><strong>Structures:</strong> ${htmlEscape(String(structures.length))}</p>
      <p><strong>Habitats:</strong> ${htmlEscape(String(habitats.length))}</p>
      <p><strong>Storage Bonus:</strong> ${htmlEscape(String(base?.storageSlotsBonus || 0))}</p>

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
    `;
  }

  function renderBuildPanels() {
    renderBuildList();
    renderBuildDetail();
    renderBoatPanelEnhancements();
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen("baseModal") || S.isModalOpen("boatModal")) {
        renderBuildPanels();
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
    getStructureName,
    getStructureCost,
    getStructureTags,
    getStructureCategory,
    isBoatBuild,
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
    applyStructureEffects,

    buildStructure,
    demolishStructure,

    getBuildableDisplayData,
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