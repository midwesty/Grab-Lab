window.GrabLabFishing = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const UI = window.GrabLabUI;
  const INV = window.GrabLabInventory;

  const state = {
    initialized: false,
    activeCast: null,
    passiveLines: [],
    selectedWaterType: null,
    lastCatchLog: []
  };

  function getCurrentWaterType() {
    const tile = S.getCurrentMapTile();
    const biome = tile?.biomeId || S.getWorld()?.currentBiomeId || CFG.FISHING.defaultWaterNodeType;

    if (tile?.type === "water") return "river";
    if (biome === "river_channel") return "river";
    if (biome === "wetland") return "wetland";
    if (biome === "mudflats") return "mudflat";
    return CFG.FISHING.defaultWaterNodeType;
  }

  function getFishingState() {
    return {
      activeCast: state.activeCast ? U.deepClone(state.activeCast) : null,
      passiveLines: U.deepClone(state.passiveLines),
      selectedWaterType: state.selectedWaterType || getCurrentWaterType(),
      lastCatchLog: U.deepClone(state.lastCatchLog)
    };
  }

  function hasFishingTool() {
    return (
      S.hasItem("player", "fishing_pole_basic", 1) ||
      S.hasItem("player", "fishing_net_basic", 1) ||
      S.hasItem("boat", "fishing_pole_basic", 1)
    );
  }

  function getAvailableBaitCount() {
    return (
      S.getItemQuantity("player", "bait_worm") +
      S.getItemQuantity("base", "bait_worm") +
      S.getItemQuantity("boat", "bait_worm")
    );
  }

  function getBestBaitSource() {
    if (S.hasItem("player", "bait_worm", 1)) return "player";
    if (S.hasItem("boat", "bait_worm", 1)) return "boat";
    if (S.hasItem("base", "bait_worm", 1)) return "base";
    return null;
  }

  function consumeBait(quantity = 1) {
    let remaining = Math.max(1, Number(quantity || 1));
    const order = ["player", "boat", "base"];

    for (const source of order) {
      if (remaining <= 0) break;
      const available = S.getItemQuantity(source, "bait_worm");
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      S.removeItem(source, "bait_worm", take);
      remaining -= take;
    }

    return remaining <= 0;
  }

  function getCatchTables() {
    return {
      river: [
        { itemId: "mud_minnow_catch", weight: 26, label: "Mud Minnow" },
        { itemId: "reed_carp_catch", weight: 18, label: "Reed Carp" },
        { itemId: "drift_crab_catch", weight: 10, label: "Drift Crab" },
        { itemId: "old_boot", weight: 8, label: "Old Boot" },
        { itemId: "dock_turtle_egg", weight: 4, label: "Dock Turtle Egg" }
      ],
      wetland: [
        { itemId: "bog_perch_catch", weight: 20, label: "Bog Perch" },
        { itemId: "reed_carp_catch", weight: 16, label: "Reed Carp" },
        { itemId: "mire_eel_catch", weight: 8, label: "Mire Eel" },
        { itemId: "algae_bundle", weight: 12, label: "Algae Bundle" },
        { itemId: "frog_lure", weight: 6, label: "Frog Lure" }
      ],
      mudflat: [
        { itemId: "mud_shrimp", weight: 22, label: "Mud Shrimp" },
        { itemId: "drift_crab_catch", weight: 18, label: "Drift Crab" },
        { itemId: "silt_flounder", weight: 10, label: "Silt Flounder" },
        { itemId: "broken_lure", weight: 8, label: "Broken Lure" }
      ]
    };
  }

  function getCurrentCatchTable() {
    const waterType = state.selectedWaterType || getCurrentWaterType();
    const tables = getCatchTables();
    return tables[waterType] || tables.river;
  }

  function getTimeBonus() {
    const hour = Number(S.getWorld()?.hour || 0);
    let bonus = 0;

    if (hour >= 5 && hour <= 8) {
      bonus += CFG.FISHING.fishActivityBonusAtDawn;
    }

    if (hour >= 17 && hour <= 20) {
      bonus += CFG.FISHING.fishActivityBonusAtDusk;
    }

    return bonus;
  }

  function getWeatherModifier() {
    const weather = S.getWorld()?.weather || "clear";

    if (weather === "storm") return CFG.FISHING.stormPenalty;
    if (weather === "rain") return 0.08;
    if (weather === "mist") return 0.04;
    if (weather === "spore_drift") return -0.06;

    return 0;
  }

  function rollCatchSuccess(baseChance = 0.7) {
    const fishingSkill = P.getSkillLevel("fishing");
    const skillBonus = fishingSkill * 0.03;
    const timeBonus = getTimeBonus();
    const weatherBonus = getWeatherModifier();

    const totalChance = U.clamp(baseChance + skillBonus + timeBonus + weatherBonus, 0.15, 0.97);
    return Math.random() < totalChance;
  }

  function chooseCatchItem() {
    const table = getCurrentCatchTable();
    return U.pickWeighted(table, "weight");
  }

  function ensureCaughtItemExists(itemId, label = "Catch") {
    const existing = S.getItemDef(itemId);
    if (existing) return existing;

    const items = U.toArray(S.getData()?.items);
    items.push({
      id: itemId,
      name: label,
      description: `Freshly caught: ${label}.`,
      tags: ["food", "fishing"],
      usable: true,
      weight: 1,
      value: 5,
      effects: [{ stat: "hunger", value: 10 }]
    });

    S.replaceDataBucket("items", items);
    return S.getItemDef(itemId);
  }

  function logCatch(label, quantity = 1, source = "active") {
    const entry = {
      id: U.uid("catch"),
      label,
      quantity,
      source,
      at: U.isoNow()
    };

    state.lastCatchLog.unshift(entry);
    if (state.lastCatchLog.length > 20) {
      state.lastCatchLog.length = 20;
    }

    return entry;
  }

  function awardCatch(itemId, quantity = 1, label = null, target = "player", source = "active") {
    const def = ensureCaughtItemExists(itemId, label || U.titleCase(itemId));
    INV.addItem(target, itemId, quantity);

    logCatch(def.name || label || itemId, quantity, source);
    S.logActivity(`Caught ${def.name || label || itemId} x${quantity}.`, "success");
    S.addToast(`Caught ${def.name || label || itemId}!`, "success");

    return def;
  }

  function beginCast(options = {}) {
    if (state.activeCast) {
      throw new Error("A fishing cast is already in progress.");
    }

    if (!hasFishingTool()) {
      throw new Error("You need a fishing tool.");
    }

    const useBait = options.useBait !== false;
    if (useBait && getAvailableBaitCount() > 0) {
      consumeBait(1);
    }

    state.activeCast = {
      id: U.uid("cast"),
      startedAt: U.now(),
      durationMs: (Number(options.durationSeconds || CFG.FISHING.castLineBaseSeconds) * 1000),
      useBait,
      targetWaterType: state.selectedWaterType || getCurrentWaterType()
    };

    P.registerFishingAction();
    S.logActivity("Cast line into the water.", "info");
    renderFishingPanel();

    return state.activeCast;
  }

  function resolveActiveCast() {
    if (!state.activeCast) return null;

    const active = state.activeCast;
    state.activeCast = null;

    if (!rollCatchSuccess()) {
      S.logActivity("Nothing bit this time.", "info");
      S.addToast("No bite.", "warning");
      renderFishingPanel();
      return null;
    }

    const catchDef = chooseCatchItem();
    if (!catchDef) {
      S.logActivity("The line came back empty.", "info");
      renderFishingPanel();
      return null;
    }

    awardCatch(catchDef.itemId, 1, catchDef.label, "player", "active");
    P.awardSkillXp("fishing", 4, "active fishing");
    renderFishingPanel();

    return {
      active,
      catch: catchDef
    };
  }

  function updateActiveCast() {
    if (!state.activeCast) return false;

    const elapsed = U.now() - Number(state.activeCast.startedAt || 0);
    if (elapsed >= Number(state.activeCast.durationMs || 0)) {
      resolveActiveCast();
      return true;
    }

    return false;
  }

  function getPassiveLineLimit() {
    return Number(CFG.FISHING.passiveLineSlotsBase || 2);
  }

  function canPlacePassiveLine() {
    return state.passiveLines.length < getPassiveLineLimit();
  }

  function placePassiveLine(options = {}) {
    if (!canPlacePassiveLine()) {
      throw new Error("No passive line slots available.");
    }

    const line = {
      id: U.uid("pline"),
      placedAt: U.isoNow(),
      lastTickAt: U.now(),
      waterType: options.waterType || state.selectedWaterType || getCurrentWaterType(),
      baited: options.baited !== false && getAvailableBaitCount() > 0,
      label: options.label || `Passive Line ${state.passiveLines.length + 1}`,
      catchesStored: []
    };

    if (line.baited) {
      consumeBait(1);
    }

    state.passiveLines.push(line);
    S.logActivity(`Placed ${line.label}.`, "success");
    renderFishingPanel();

    return line;
  }

  function removePassiveLine(lineId) {
    const before = state.passiveLines.length;
    state.passiveLines = state.passiveLines.filter((line) => line.id !== lineId);

    if (state.passiveLines.length !== before) {
      S.logActivity("Removed a passive line.", "warning");
      renderFishingPanel();
      return true;
    }

    return false;
  }

  function placeFishingNet(options = {}) {
    const target = options.target || "base";
    const waterType = options.waterType || state.selectedWaterType || getCurrentWaterType();
    const count = U.randInt(1, 3);

    for (let i = 0; i < count; i += 1) {
      const catchDef = chooseCatchItem();
      if (catchDef) {
        awardCatch(catchDef.itemId, 1, catchDef.label, target, "net");
      }
    }

    P.registerFishingAction();
    S.logActivity(`Pulled a small net from the ${waterType}.`, "success");
    renderFishingPanel();

    return count;
  }

  function tickPassiveLines() {
    if (!state.passiveLines.length) return false;

    let changed = false;
    const now = U.now();

    state.passiveLines.forEach((line) => {
      const elapsed = now - Number(line.lastTickAt || 0);
      if (elapsed < Number(CFG.FISHING.fishingPassiveTickMs || 12000)) return;

      line.lastTickAt = now;
      changed = true;

      const lineBaseChance = line.baited ? 0.78 : 0.55;
      if (!rollCatchSuccess(lineBaseChance)) return;

      const catchDef = chooseCatchItem();
      if (!catchDef) return;

      line.catchesStored.push({
        itemId: catchDef.itemId,
        label: catchDef.label,
        quantity: 1
      });

      if (line.catchesStored.length > 4) {
        line.catchesStored.shift();
      }
    });

    if (changed) {
      renderFishingPanel();
    }

    return changed;
  }

  function collectPassiveLine(lineId, target = "player") {
    const line = state.passiveLines.find((entry) => entry.id === lineId);
    if (!line) return false;

    const stored = U.toArray(line.catchesStored);
    if (!stored.length) {
      S.addToast(`${line.label} is empty.`, "warning");
      return false;
    }

    stored.forEach((entry) => {
      awardCatch(entry.itemId, entry.quantity || 1, entry.label, target, "passive");
    });

    line.catchesStored = [];
    P.awardSkillXp("fishing", 2 + stored.length, "collecting passive line");
    renderFishingPanel();
    return true;
  }

  function setSelectedWaterType(waterType = null) {
    state.selectedWaterType = waterType || getCurrentWaterType();
    renderFishingPanel();
    return state.selectedWaterType;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderFishingPanel() {
    const panel = U.byId("fishingPanel");
    const catchPanel = U.byId("fishingCatchPanel");
    if (!panel || !catchPanel) return;

    const waterType = state.selectedWaterType || getCurrentWaterType();
    const active = state.activeCast;
    const passive = state.passiveLines;
    const baitCount = getAvailableBaitCount();
    const table = getCurrentCatchTable();

    panel.innerHTML = `
      <h3>Fishing Operations</h3>
      <p><strong>Water Type:</strong> ${htmlEscape(U.titleCase(waterType))}</p>
      <p><strong>Weather:</strong> ${htmlEscape(U.titleCase(S.getWorld()?.weather || "clear"))}</p>
      <p><strong>Bait Available:</strong> ${htmlEscape(String(baitCount))}</p>
      <p><strong>Fishing Skill:</strong> ${htmlEscape(String(P.getSkillLevel("fishing")))}</p>
      <p><strong>Passive Lines:</strong> ${htmlEscape(String(passive.length))}/${htmlEscape(String(getPassiveLineLimit()))}</p>

      <div class="admin-console-actions">
        <button id="btnFishCastNow" class="primary-btn">${active ? "Casting..." : "Cast Line"}</button>
        <button id="btnFishPlaceLine" class="secondary-btn">Place Passive Line</button>
        <button id="btnFishNetNow" class="ghost-btn">Use Net</button>
      </div>

      <div class="admin-console-actions" style="margin-top:.8rem;" id="fishWaterButtons"></div>

      ${
        active
          ? `<div class="card" style="margin-top:.8rem;">
              <div class="meta-title">Active Cast</div>
              <div class="meta-sub">Line is in the water...</div>
            </div>`
          : ""
      }

      <div class="card-list" style="margin-top:1rem;">
        ${passive.length
          ? passive.map((line) => `
            <div class="card">
              <div class="meta-title">${htmlEscape(line.label)}</div>
              <div class="meta-sub">Water: ${htmlEscape(U.titleCase(line.waterType))}</div>
              <div class="meta-sub">Stored Catches: ${htmlEscape(String(U.toArray(line.catchesStored).length))}</div>
              <div class="admin-console-actions">
                <button class="secondary-btn fish-collect-line-btn" data-line-id="${htmlEscape(line.id)}">Collect</button>
                <button class="ghost-btn fish-remove-line-btn" data-line-id="${htmlEscape(line.id)}">Remove</button>
              </div>
            </div>
          `).join("")
          : `<div class="card">No passive lines placed.</div>`}
      </div>
    `;

    catchPanel.innerHTML = `
      <h3>Catch Table</h3>
      <div class="card-list">
        ${table.map((entry) => `
          <div class="card">
            <div class="meta-title">${htmlEscape(entry.label || entry.itemId)}</div>
            <div class="meta-sub">Weight: ${htmlEscape(String(entry.weight || 0))}</div>
          </div>
        `).join("")}
      </div>

      <h3 style="margin-top:1rem;">Recent Catches</h3>
      <div class="card-list">
        ${state.lastCatchLog.length
          ? state.lastCatchLog.map((entry) => `
            <div class="card">
              <div class="meta-title">${htmlEscape(entry.label)}</div>
              <div class="meta-sub">${htmlEscape(entry.source)} • x${htmlEscape(String(entry.quantity || 1))}</div>
            </div>
          `).join("")
          : `<div class="card">No recent catches.</div>`}
      </div>
    `;

    const waterButtons = U.byId("fishWaterButtons");
    ["river", "wetland", "mudflat"].forEach((type) => {
      const btn = U.createEl("button", {
        className: type === waterType ? "primary-btn" : "ghost-btn",
        text: U.titleCase(type)
      });

      U.on(btn, "click", () => {
        setSelectedWaterType(type);
      });

      waterButtons?.appendChild(btn);
    });

    const btnCast = U.byId("btnFishCastNow");
    const btnLine = U.byId("btnFishPlaceLine");
    const btnNet = U.byId("btnFishNetNow");

    if (btnCast) {
      U.on(btnCast, "click", () => {
        if (state.activeCast) {
          S.addToast("Already casting.", "warning");
          return;
        }

        try {
          beginCast({ useBait: true });
        } catch (err) {
          S.addToast(err.message || "Could not cast line.", "error");
        }
      });
    }

    if (btnLine) {
      U.on(btnLine, "click", () => {
        try {
          placePassiveLine({ waterType });
          S.addToast("Passive line placed.", "success");
        } catch (err) {
          S.addToast(err.message || "Could not place line.", "error");
        }
      });
    }

    if (btnNet) {
      U.on(btnNet, "click", () => {
        try {
          placeFishingNet({ target: "player", waterType });
        } catch (err) {
          S.addToast(err.message || "Could not use net.", "error");
        }
      });
    }

    U.qsa(".fish-collect-line-btn", panel).forEach((btn) => {
      U.on(btn, "click", () => {
        collectPassiveLine(btn.dataset.lineId, "player");
      });
    });

    U.qsa(".fish-remove-line-btn", panel).forEach((btn) => {
      U.on(btn, "click", () => {
        removePassiveLine(btn.dataset.lineId);
      });
    });
  }

  function seedFallbackFishingItemsIfNeeded() {
    const needed = [
      { id: "fishing_net_basic", name: "Basic Fishing Net", tags: ["tool", "fishing"], weight: 2, value: 14 },
      { id: "passive_line_basic", name: "Passive Fishing Line", tags: ["tool", "fishing"], weight: 1, value: 10 },
      { id: "mud_minnow_catch", name: "Mud Minnow", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 10 }], weight: 1, value: 4 },
      { id: "reed_carp_catch", name: "Reed Carp", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 14 }], weight: 1, value: 6 },
      { id: "drift_crab_catch", name: "Drift Crab", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 12 }], weight: 1, value: 6 },
      { id: "old_boot", name: "Old Boot", tags: ["junk", "fishing"], weight: 1, value: 1 },
      { id: "dock_turtle_egg", name: "Dock Turtle Egg", tags: ["food", "quest"], usable: true, effects: [{ stat: "hunger", value: 8 }], weight: 1, value: 10 },
      { id: "bog_perch_catch", name: "Bog Perch", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 11 }], weight: 1, value: 5 },
      { id: "mire_eel_catch", name: "Mire Eel", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 16 }], weight: 1, value: 8 },
      { id: "algae_bundle", name: "Algae Bundle", tags: ["resource"], weight: 1, value: 2 },
      { id: "frog_lure", name: "Frog Lure", tags: ["bait"], weight: 1, value: 3 },
      { id: "mud_shrimp", name: "Mud Shrimp", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 9 }], weight: 1, value: 4 },
      { id: "silt_flounder", name: "Silt Flounder", tags: ["food", "fishing"], usable: true, effects: [{ stat: "hunger", value: 13 }], weight: 1, value: 6 },
      { id: "broken_lure", name: "Broken Lure", tags: ["junk"], weight: 1, value: 1 }
    ];

    const items = U.toArray(S.getData()?.items);
    const byId = new Set(items.map((item) => item.id));

    let changed = false;

    needed.forEach((entry) => {
      if (byId.has(entry.id)) return;
      items.push({
        description: `${entry.name}.`,
        ...entry
      });
      changed = true;
    });

    if (changed) {
      S.replaceDataBucket("items", items);
    }

    return changed;
  }

  function bindTickEvents() {
    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 1 === 0) {
        updateActiveCast();
      }

      if (minute % 3 === 0) {
        tickPassiveLines();
      }
    });

    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "fishingModal") {
        renderFishingPanel();
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen("fishingModal")) {
        renderFishingPanel();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackFishingItemsIfNeeded();
    state.selectedWaterType = getCurrentWaterType();
    bindTickEvents();
    renderFishingPanel();

    state.initialized = true;
    U.eventBus.emit("fishing:initialized");
    return true;
  }

  const API = {
    init,
    getFishingState,
    getCurrentWaterType,
    hasFishingTool,
    getAvailableBaitCount,
    getBestBaitSource,
    consumeBait,
    getCatchTables,
    getCurrentCatchTable,
    getTimeBonus,
    getWeatherModifier,
    rollCatchSuccess,
    chooseCatchItem,
    ensureCaughtItemExists,
    logCatch,
    awardCatch,
    beginCast,
    resolveActiveCast,
    updateActiveCast,
    getPassiveLineLimit,
    canPlacePassiveLine,
    placePassiveLine,
    removePassiveLine,
    placeFishingNet,
    tickPassiveLines,
    collectPassiveLine,
    setSelectedWaterType,
    renderFishingPanel,
    seedFallbackFishingItemsIfNeeded
  };

  window.GL_FISHING = API;

  return Object.freeze(API);
})();