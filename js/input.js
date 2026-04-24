window.GrabLabInput = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const M = window.GrabLabModal;
  const A = window.GrabLabAudio;

  function getWorldApi() {
    return window.GL_WORLD || window.GrabLabWorld || null;
  }

  function getAnimalsApi() {
    return window.GL_ANIMALS || window.GrabLabAnimals || null;
  }

  function getPlayerApi() {
    return window.GL_PLAYER || window.GrabLabPlayer || null;
  }

  const state = {
    initialized: false,
    pointerDown: false,
    holdTimer: null,
    holdTriggered: false,
    activePointerId: null,
    pointerType: "mouse",
    downAt: 0,
    downScreenX: 0,
    downScreenY: 0,
    lastCanvasX: 0,
    lastCanvasY: 0,
    selectedWorldTarget: null,
    interactionRadiusPx: 36,
    harvestMenuOpen: false,
    harvestMenuId: "harvestActionMenu"
  };

  function getWorldCanvas() {
    return U.byId("worldCanvas");
  }

  function getFxCanvas() {
    return U.byId("fxCanvas");
  }

  function getMiniMapCanvas() {
    return U.byId("miniMapCanvas");
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setPointerType(type = "mouse") {
    state.pointerType = type;
    S.updateRuntime({
      ui: {
        lastPointerType: type
      }
    });
  }

  function clearHoldTimer() {
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
  }

  function isGameScreenActive() {
    return S.getCurrentScreen() === "game";
  }

  function screenToCanvas(evt, canvas) {
    if (!canvas) return { x: 0, y: 0 };
    const pos = U.getPointerPos(evt, canvas);

    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;

    return {
      x: pos.x * scaleX,
      y: pos.y * scaleY
    };
  }

  function canvasToTile(x, y) {
    const tileSize = CFG.WORLD.tileSize;
    const worldApi = getWorldApi();
    const camera = worldApi?.getCameraOrigin ? worldApi.getCameraOrigin() : { startX: 0, startY: 0 };
    return {
      x: camera.startX + Math.floor(x / tileSize),
      y: camera.startY + Math.floor(y / tileSize)
    };
  }

  function worldTileToCanvasCenter(tileX, tileY) {
    const tileSize = CFG.WORLD.tileSize;
    return {
      x: tileX * tileSize + tileSize / 2,
      y: tileY * tileSize + tileSize / 2
    };
  }

  function getCurrentTilePoiList() {
    const tile = S.getCurrentMapTile();
    return U.toArray(tile?.pointsOfInterest);
  }

  function findPoiAtCanvasPoint(x, y) {
    const pois = getCurrentTilePoiList();

    for (const poi of pois) {
      const px = Number(poi.canvasX ?? poi.x ?? poi.localX ?? 0);
      const py = Number(poi.canvasY ?? poi.y ?? poi.localY ?? 0);

      if (U.distance({ x, y }, { x: px, y: py }) <= state.interactionRadiusPx) {
        return poi;
      }
    }

    return null;
  }

  function showInteractionPromptFor(target) {
    const box = U.byId("interactionPrompt");
    const title = U.byId("interactionTitle");
    const body = U.byId("interactionBody");

    if (!box || !title || !body) return;

    if (!target) {
      U.hide(box);
      return;
    }

    let promptBody = target.description || `Tap to inspect ${target.name || "this spot"}.`;

    if (target.type === "npc" && target.recruitable) {
      promptBody = `${promptBody} Tap again to recruit.`;
    } else if ((target.type === "capturable_animal" || target.type === "wild_animal") && target.capturable) {
      promptBody = `${promptBody} Tap again to capture.`;
    }

    U.setText(title, target.name || "Point of Interest");
    U.setText(body, promptBody);
    U.show(box, "block");
  }

  function clearInteractionPrompt() {
    const box = U.byId("interactionPrompt");
    if (box) U.hide(box);
  }

  function setSelectedWorldTarget(target) {
    state.selectedWorldTarget = target || null;
    S.updateRuntime({
      selectedEntityId: target?.id || null
    });
    showInteractionPromptFor(target);
  }

  function moveToClickedTile(tileX, tileY) {
    const world = S.getWorld();

    const maxX = CFG.WORLD.worldWidthTiles - 1;
    const maxY = CFG.WORLD.worldHeightTiles - 1;

    const safeX = U.clamp(tileX, 0, maxX);
    const safeY = U.clamp(tileY, 0, maxY);

    const tileDef = S.getMapTile(safeX, safeY);
    const biomeId = tileDef?.biomeId || world.currentBiomeId;
    const worldApi = getWorldApi();

    if (worldApi?.enqueueTravelToTile) {
      worldApi.enqueueTravelToTile(safeX, safeY, biomeId);
    } else {
      S.movePlayerToTile(safeX, safeY, biomeId);
      const label = tileDef?.name || `${safeX}, ${safeY}`;
      S.logActivity(`Moved to tile ${label}.`, "info");
      UI.renderEverything();
    }
  }

  function isSameSelectedPoi(poi) {
    return Boolean(poi && state.selectedWorldTarget && state.selectedWorldTarget.id === poi.id);
  }

  function hasMarsyAlready() {
    const party = S.getParty();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);
    const baseSpecimens = U.toArray(S.getBase()?.specimens);

    return (
      active.some((entry) => entry?.speciesId === "marsy_marsupial" || entry?.sourceSpecimenId === "spec_marsy") ||
      reserve.some((entry) => entry?.speciesId === "marsy_marsupial" || entry?.sourceSpecimenId === "spec_marsy") ||
      baseSpecimens.some((entry) => entry?.speciesId === "marsy_marsupial" || entry?.id === "spec_marsy")
    );
  }

  function recruitPoiNpc(poi) {
    const AN = getAnimalsApi();
    if (!AN) {
      S.addToast("Companion system not available yet.", "error");
      return false;
    }

    if (poi.speciesId === "marsy_marsupial" || poi.role === "starter_companion") {
      const already = hasMarsyAlready();
      AN.seedStarterCompanionIfNeeded();

      if (already) {
        S.logActivity("Marsy chitters happily. They're already part of your operation.", "info");
        S.addToast("Marsy is already with you.", "info");
      } else {
        S.logActivity("Marsy joins your crew and explains the basics of capture, habitats, and breeding.", "success");
        S.logActivity("Tip: capturable animals can be taken back to base, assigned to habitats, fed, and later recruited or bred.", "info");
        S.logActivity("Tip: fish and other aquatic creatures need an aquarium before they can be kept comfortably.", "info");
        S.logActivity("Tip: land creatures need a pen or another suitable habitat before long-term care makes sense.", "info");
        S.addToast("Marsy joined the party!", "success");
      }

      A.playSfx("ui_confirm").catch?.(() => {});
      UI.renderEverything();
      return true;
    }

    S.logActivity(`${poi.name || "This character"} is not recruitable yet.`, "warning");
    S.addToast("Not recruitable yet.", "warning");
    return false;
  }

  function capturePoiAnimal(poi) {
    const AN = getAnimalsApi();
    if (!AN) {
      S.addToast("Wildlife system not available yet.", "error");
      return false;
    }

    if (!poi.speciesId) {
      S.addToast("That creature has no species data.", "error");
      return false;
    }

    const speciesDef = S.getAnimalDef(poi.speciesId);
    const baseName = speciesDef?.name || poi.name || U.titleCase(poi.speciesId);

    const specimen = AN.captureAnimal(poi.speciesId, {
      method: "field_capture",
      name: baseName,
      notes: `Captured from ${poi.name || baseName} near ${S.getCurrentMapTile()?.name || "the current tile"}.`
    });

    if (!specimen) {
      S.addToast("Capture failed.", "error");
      return false;
    }

    S.logActivity(`${specimen.name} was secured for transport back to base.`, "success");
    S.logActivity("You can review captured creatures in Party/Base systems and assign them to habitats when available.", "info");
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
    return true;
  }

  function inspectPointOfInterest(poi) {
    if (!poi) {
      S.logActivity("Nothing interesting there. Rude.", "info");
      return;
    }

    const sameTarget = isSameSelectedPoi(poi);

    if (sameTarget && poi.type === "npc" && poi.recruitable) {
      recruitPoiNpc(poi);
      setSelectedWorldTarget(poi);
      return;
    }

    if (sameTarget && (poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable) {
      capturePoiAnimal(poi);
      setSelectedWorldTarget(poi);
      return;
    }

    const detailText = poi.description || "It looks promising, suspicious, or both.";

    if (poi.type === "npc" && poi.recruitable) {
      S.logActivity(`Met ${poi.name || "a recruitable companion"}: ${detailText}`, "info");
      S.addToast(`Inspect ${poi.name || "companion"} again to recruit.`, "info");
    } else if ((poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable) {
      S.logActivity(`Observed ${poi.name || "a capturable animal"}: ${detailText}`, "info");
      S.addToast(`Inspect ${poi.name || "animal"} again to capture.`, "info");
    } else {
      S.logActivity(`Inspected ${poi.name || "point of interest"}: ${detailText}`, "info");
      S.addToast(`Inspected ${poi.name || "point of interest"}.`, "info");
    }

    setSelectedWorldTarget(poi);
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
  }

  function contextActionAtPoint(canvasX, canvasY) {
    const poi = findPoiAtCanvasPoint(canvasX, canvasY);
    if (poi) {
      if (poi.type === "npc" && poi.recruitable) {
        S.logActivity(`Context hint: ${poi.name || "NPC"} can be recruited with a second tap.`, "info");
        S.addToast(`Recruitable: ${poi.name || "NPC"}`, "info");
      } else if ((poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable) {
        S.logActivity(`Context hint: ${poi.name || "Animal"} can be captured with a second tap.`, "info");
        S.addToast(`Capturable: ${poi.name || "Animal"}`, "info");
      } else {
        S.logActivity(`Context action opened for ${poi.name || "POI"} (placeholder).`, "info");
        S.addToast(`Context action: ${poi.name || "POI"}`, "warning");
      }
      setSelectedWorldTarget(poi);
      return;
    }

    const tile = canvasToTile(canvasX, canvasY);
    S.logActivity(`Context action at tile ${tile.x}, ${tile.y} (placeholder).`, "info");
    S.addToast(`Context tile ${tile.x}, ${tile.y}`, "warning");
  }

  function handlePrimaryWorldAction(canvasX, canvasY) {
    const poi = findPoiAtCanvasPoint(canvasX, canvasY);

    if (poi) {
      inspectPointOfInterest(poi);
      return;
    }

    const tile = canvasToTile(canvasX, canvasY);
    setSelectedWorldTarget(null);
    moveToClickedTile(tile.x, tile.y);
  }

  function handleSecondaryWorldAction(canvasX, canvasY) {
    contextActionAtPoint(canvasX, canvasY);
    A.playSfx("ui_hover").catch?.(() => {});
  }

  function startHoldForContext(evt, canvasX, canvasY) {
    clearHoldTimer();
    state.holdTriggered = false;

    state.holdTimer = setTimeout(() => {
      state.holdTriggered = true;
      handleSecondaryWorldAction(canvasX, canvasY);
    }, CFG.UI.holdToRightClickMs);
  }

  function getLootTables() {
    return U.toArray(S.getData()?.lootTables);
  }

  function getLootTableById(tableId) {
    return getLootTables().find((entry) => entry?.id === tableId) || null;
  }

  function getFallbackLootTable(tableId) {
    const fallback = {
      starter_cache: {
        id: "starter_cache",
        entries: [
          { itemId: "berries_wild", weight: 20, quantityMin: 1, quantityMax: 4 },
          { itemId: "fresh_water", weight: 20, quantityMin: 1, quantityMax: 3 },
          { itemId: "fiber_bundle", weight: 18, quantityMin: 2, quantityMax: 5 },
          { itemId: "scrap_wood", weight: 18, quantityMin: 2, quantityMax: 5 },
          { itemId: "bait_worm", weight: 12, quantityMin: 2, quantityMax: 6 },
          { itemId: "bandage_basic", weight: 8, quantityMin: 1, quantityMax: 2 },
          { itemId: "rope_bundle", weight: 8, quantityMin: 1, quantityMax: 2 },
          { itemId: "mold_sample_jar", weight: 4, quantityMin: 1, quantityMax: 1 }
        ]
      },
      river_drift: {
        id: "river_drift",
        entries: [
          { itemId: "old_boot", weight: 24, quantityMin: 1, quantityMax: 1 },
          { itemId: "fresh_water", weight: 20, quantityMin: 1, quantityMax: 2 },
          { itemId: "scrap_wood", weight: 18, quantityMin: 1, quantityMax: 3 },
          { itemId: "fiber_bundle", weight: 18, quantityMin: 1, quantityMax: 3 },
          { itemId: "bait_worm", weight: 10, quantityMin: 1, quantityMax: 4 },
          { itemId: "broken_lure", weight: 10, quantityMin: 1, quantityMax: 1 }
        ]
      },
      fungal_grove_find: {
        id: "fungal_grove_find",
        entries: [
          { itemId: "mold_sample_jar", weight: 28, quantityMin: 1, quantityMax: 2 },
          { itemId: "luminous_spores", weight: 18, quantityMin: 1, quantityMax: 1 },
          { itemId: "chameleon_skin", weight: 10, quantityMin: 1, quantityMax: 2 },
          { itemId: "alcohol_basic", weight: 8, quantityMin: 1, quantityMax: 1 },
          { itemId: "berries_wild", weight: 14, quantityMin: 1, quantityMax: 3 },
          { itemId: "old_boot", weight: 22, quantityMin: 1, quantityMax: 1 }
        ]
      }
    };

    return fallback[tableId] || fallback.starter_cache;
  }

  function weightedEntryPick(entries = []) {
    const safe = U.toArray(entries).filter((entry) => entry?.itemId);
    if (!safe.length) return null;

    const total = safe.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight || 1)), 0);
    let roll = Math.random() * total;

    for (const entry of safe) {
      roll -= Math.max(1, Number(entry.weight || 1));
      if (roll <= 0) {
        return entry;
      }
    }

    return safe[safe.length - 1] || null;
  }

  function rollEntryQuantity(entry) {
    const min = Number(entry?.quantityMin ?? 1);
    const max = Number(entry?.quantityMax ?? min);
    return U.randInt(Math.min(min, max), Math.max(min, max));
  }

  function getLootTableForHarvestAction(actionId, tile = S.getCurrentMapTile()) {
    const biomeId = tile?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";

    if (actionId === "gather_loot") {
      if (biomeId === "fungal_grove") return "fungal_grove_find";
      if (["river_channel", "wetland", "mudflats"].includes(biomeId)) return "river_drift";
      return "starter_cache";
    }

    if (actionId === "harvest") {
      if (biomeId === "fungal_grove") return "fungal_grove_find";
      return "starter_cache";
    }

    return "starter_cache";
  }

  function summarizeGains(gains = []) {
    return gains
      .filter((entry) => entry && entry.quantity > 0)
      .map((entry) => `${entry.name} x${entry.quantity}`)
      .join(", ");
  }

  function addHarvestResultsToInventory(results = [], target = "player") {
    results.forEach((entry) => {
      if (!entry?.itemId || Number(entry.quantity || 0) <= 0) return;
      S.addItem(target, entry.itemId, Number(entry.quantity || 0));
    });
  }

  function getPoiHarvestBonusEntries(tile = S.getCurrentMapTile()) {
    const pois = U.toArray(tile?.pointsOfInterest);
    const entries = [];

    pois.forEach((poi) => {
      if (poi.type === "fish_spot") {
        entries.push({ itemId: "bait_worm", weight: 12, quantityMin: 1, quantityMax: 3 });
      }
      if (poi.type === "fungal_patch") {
        entries.push({ itemId: "mold_sample_jar", weight: 16, quantityMin: 1, quantityMax: 2 });
      }
      if (poi.type === "wild_animal" || poi.type === "capturable_animal") {
        entries.push({ itemId: "fiber_bundle", weight: 8, quantityMin: 1, quantityMax: 2 });
      }
    });

    return entries;
  }

  function performGatherLoot() {
    const P = getPlayerApi();
    const tile = S.getCurrentMapTile();
    const tableId = getLootTableForHarvestAction("gather_loot", tile);
    const table = getLootTableById(tableId) || getFallbackLootTable(tableId);

    const pool = [
      ...U.toArray(table?.entries),
      ...getPoiHarvestBonusEntries(tile)
    ];

    const rolls = tile?.biomeId === "fungal_grove" ? U.randInt(2, 4) : U.randInt(2, 3);
    const gains = [];

    for (let i = 0; i < rolls; i += 1) {
      const picked = weightedEntryPick(pool);
      if (!picked?.itemId) continue;

      const qty = rollEntryQuantity(picked);
      const def = S.getItemDef(picked.itemId);
      gains.push({
        itemId: picked.itemId,
        quantity: qty,
        name: def?.name || U.titleCase(picked.itemId)
      });
    }

    if (!gains.length) {
      S.addToast("You came up empty-handed.", "warning");
      return false;
    }

    addHarvestResultsToInventory(gains, "player");
    P?.registerHarvestAction?.();

    const summary = summarizeGains(gains);
    S.logActivity(`Gathered loot near ${tile?.name || "this tile"}: ${summary}.`, "success");
    S.addToast("Gathered loot.", "success");
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
    return true;
  }

  function performGatherWater() {
    const P = getPlayerApi();
    const world = S.getWorld();
    const tile = S.getCurrentMapTile();
    const biomeId = tile?.biomeId || world.currentBiomeId || "field_station_island";

    let amount = 1;

    if (["river_channel", "wetland", "mudflats"].includes(biomeId)) {
      amount = U.randInt(2, 4);
    } else {
      amount = U.randInt(1, 2);
    }

    if (world.weather === "rain" || world.weather === "storm") {
      amount += 1;
    }

    S.addItem("player", "fresh_water", amount);
    P?.registerHarvestAction?.();

    S.logActivity(`Collected fresh water x${amount} near ${tile?.name || "this tile"}.`, "success");
    S.addToast(`Fresh water x${amount}`, "success");
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
    return true;
  }

  function getDirectHarvestPool(tile = S.getCurrentMapTile()) {
    const biomeId = tile?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";

    if (biomeId === "fungal_grove") {
      return [
        { itemId: "mold_sample_jar", quantityMin: 1, quantityMax: 2, weight: 28 },
        { itemId: "luminous_spores", quantityMin: 1, quantityMax: 1, weight: 16 },
        { itemId: "chameleon_skin", quantityMin: 1, quantityMax: 2, weight: 12 },
        { itemId: "berries_wild", quantityMin: 1, quantityMax: 2, weight: 8 }
      ];
    }

    if (["river_channel", "wetland", "mudflats"].includes(biomeId)) {
      return [
        { itemId: "algae_bundle", quantityMin: 1, quantityMax: 3, weight: 24 },
        { itemId: "fiber_bundle", quantityMin: 1, quantityMax: 3, weight: 18 },
        { itemId: "bait_worm", quantityMin: 1, quantityMax: 3, weight: 14 },
        { itemId: "scrap_wood", quantityMin: 1, quantityMax: 2, weight: 12 },
        { itemId: "berries_wild", quantityMin: 1, quantityMax: 2, weight: 10 }
      ];
    }

    return [
      { itemId: "fiber_bundle", quantityMin: 1, quantityMax: 4, weight: 26 },
      { itemId: "berries_wild", quantityMin: 1, quantityMax: 3, weight: 18 },
      { itemId: "scrap_wood", quantityMin: 1, quantityMax: 3, weight: 16 },
      { itemId: "rope_bundle", quantityMin: 1, quantityMax: 2, weight: 8 }
    ];
  }

  function performHarvestResources() {
    const P = getPlayerApi();
    const tile = S.getCurrentMapTile();
    const pool = [
      ...getDirectHarvestPool(tile),
      ...getPoiHarvestBonusEntries(tile)
    ];

    const rolls = U.randInt(2, 4);
    const gains = [];

    for (let i = 0; i < rolls; i += 1) {
      const picked = weightedEntryPick(pool);
      if (!picked?.itemId) continue;

      const qty = rollEntryQuantity(picked);
      const def = S.getItemDef(picked.itemId);
      gains.push({
        itemId: picked.itemId,
        quantity: qty,
        name: def?.name || U.titleCase(picked.itemId)
      });
    }

    if (!gains.length) {
      S.addToast("No harvestable materials found.", "warning");
      return false;
    }

    addHarvestResultsToInventory(gains, "player");
    P?.registerHarvestAction?.();

    const summary = summarizeGains(gains);
    S.logActivity(`Harvested local materials near ${tile?.name || "this tile"}: ${summary}.`, "success");
    S.addToast("Harvested materials.", "success");
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
    return true;
  }

  function performHarvestAction(actionId) {
    closeHarvestMenu();

    switch (String(actionId || "")) {
      case "gather_loot":
        return performGatherLoot();
      case "gather_water":
        return performGatherWater();
      case "harvest":
        return performHarvestResources();
      default:
        return false;
    }
  }

  function closeHarvestMenu() {
    const node = U.byId(state.harvestMenuId);
    if (node) node.remove();
    state.harvestMenuOpen = false;
  }

  function createHarvestMenuButton(actionId, label, desc) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-btn";
    btn.dataset.harvestAction = actionId;
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.margin = "0 0 .4rem 0";
    btn.innerHTML = `<strong>${htmlEscape(label)}</strong><br><span style="opacity:.8;font-size:.9em;">${htmlEscape(desc)}</span>`;
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      performHarvestAction(actionId);
    });
    return btn;
  }

  function openHarvestMenu(anchorEl) {
    closeHarvestMenu();

    const menu = document.createElement("div");
    menu.id = state.harvestMenuId;
    menu.setAttribute("role", "dialog");
    menu.style.position = "fixed";
    menu.style.zIndex = "120";
    menu.style.minWidth = "220px";
    menu.style.maxWidth = "280px";
    menu.style.padding = ".7rem";
    menu.style.borderRadius = "14px";
    menu.style.background = "rgba(14, 22, 16, 0.96)";
    menu.style.border = "1px solid rgba(170, 220, 170, 0.2)";
    menu.style.boxShadow = "0 12px 30px rgba(0,0,0,.35)";
    menu.style.backdropFilter = "blur(6px)";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = ".55rem";
    title.textContent = "Harvest Options";

    const sub = document.createElement("div");
    sub.style.fontSize = ".9em";
    sub.style.opacity = ".8";
    sub.style.marginBottom = ".6rem";
    sub.textContent = "Choose what to do at this tile.";

    menu.appendChild(title);
    menu.appendChild(sub);
    menu.appendChild(createHarvestMenuButton("gather_loot", "Gather Loot", "Search the area for drift, supplies, and odd finds."));
    menu.appendChild(createHarvestMenuButton("gather_water", "Gather Water", "Collect usable fresh water from the environment."));
    menu.appendChild(createHarvestMenuButton("harvest", "Harvest", "Gather raw local materials tied to this biome."));

    document.body.appendChild(menu);

    const rect = anchorEl?.getBoundingClientRect?.() || {
      left: window.innerWidth / 2 - 110,
      top: window.innerHeight / 2 - 60,
      bottom: window.innerHeight / 2,
      width: 220
    };

    let left = rect.left;
    let top = rect.top - menu.offsetHeight - 8;

    if (top < 10) {
      top = rect.bottom + 8;
    }

    if (left + menu.offsetWidth > window.innerWidth - 10) {
      left = window.innerWidth - menu.offsetWidth - 10;
    }

    if (left < 10) {
      left = 10;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    state.harvestMenuOpen = true;
  }

  function handleCanvasPointerDown(evt) {
    if (!isGameScreenActive()) return;
    if (M.hasOpenModals()) return;

    const canvas = getWorldCanvas();
    if (!canvas) return;

    setPointerType(evt.pointerType || "mouse");

    state.pointerDown = true;
    state.activePointerId = evt.pointerId ?? null;
    state.downAt = U.now();
    state.downScreenX = evt.clientX ?? 0;
    state.downScreenY = evt.clientY ?? 0;

    const point = screenToCanvas(evt, canvas);
    state.lastCanvasX = point.x;
    state.lastCanvasY = point.y;

    const poi = findPoiAtCanvasPoint(point.x, point.y);
    setSelectedWorldTarget(poi);

    if (evt.pointerType === "touch" || evt.pointerType === "pen") {
      startHoldForContext(evt, point.x, point.y);
    }
  }

  function handleCanvasPointerMove(evt) {
    const canvas = getWorldCanvas();
    if (!canvas) return;

    const point = screenToCanvas(evt, canvas);
    state.lastCanvasX = point.x;
    state.lastCanvasY = point.y;

    if (!state.pointerDown) {
      const poi = findPoiAtCanvasPoint(point.x, point.y);
      if (poi) {
        setSelectedWorldTarget(poi);
      } else if (state.selectedWorldTarget) {
        setSelectedWorldTarget(null);
      }
      return;
    }

    const movedDistance =
      Math.abs((evt.clientX ?? 0) - state.downScreenX) +
      Math.abs((evt.clientY ?? 0) - state.downScreenY);

    if (movedDistance > CFG.UI.dragThresholdPx * 2) {
      clearHoldTimer();
    }
  }

  function handleCanvasPointerUp(evt) {
    if (!isGameScreenActive()) return;

    const canvas = getWorldCanvas();
    if (!canvas) return;

    const point = screenToCanvas(evt, canvas);
    const elapsed = U.now() - state.downAt;
    const movedDistance =
      Math.abs((evt.clientX ?? 0) - state.downScreenX) +
      Math.abs((evt.clientY ?? 0) - state.downScreenY);

    clearHoldTimer();

    if (!state.holdTriggered && movedDistance <= CFG.UI.dragThresholdPx * 2) {
      if (evt.pointerType === "mouse" && evt.button === 2) {
        handleSecondaryWorldAction(point.x, point.y);
      } else {
        handlePrimaryWorldAction(point.x, point.y);
      }
    }

    state.pointerDown = false;
    state.activePointerId = null;
    state.holdTriggered = false;

    void elapsed;
  }

  function handleCanvasPointerCancel() {
    clearHoldTimer();
    state.pointerDown = false;
    state.activePointerId = null;
    state.holdTriggered = false;
  }

  function handleWorldContextMenu(evt) {
    evt.preventDefault();

    if (!isGameScreenActive()) return;
    if (M.hasOpenModals()) return;

    const canvas = getWorldCanvas();
    if (!canvas) return;

    const point = screenToCanvas(evt, canvas);
    handleSecondaryWorldAction(point.x, point.y);
  }

  function drawMiniMap() {
    const canvas = getMiniMapCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const world = S.getWorld();
    const revealed = new Set(U.toArray(world.revealedTiles));
    const cleared = new Set(U.toArray(world.clearedTiles));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#142018";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tilePx = CFG.WORLD.minimapTileSize;
    const maxCols = Math.floor(canvas.width / tilePx);
    const maxRows = Math.floor(canvas.height / tilePx);

    const startX = Math.max(0, world.currentTileX - Math.floor(maxCols / 2));
    const startY = Math.max(0, world.currentTileY - Math.floor(maxRows / 2));

    for (let row = 0; row < maxRows; row += 1) {
      for (let col = 0; col < maxCols; col += 1) {
        const tileX = startX + col;
        const tileY = startY + row;
        const key = `${tileX},${tileY}`;

        const tileDef = S.getMapTile(tileX, tileY);
        const isCurrent = tileX === world.currentTileX && tileY === world.currentTileY;
        const isRevealed = revealed.has(key);
        const isCleared = cleared.has(key);

        if (!isRevealed && CFG.WORLD.fogOfWarEnabled) {
          ctx.fillStyle = "#0a0d0b";
        } else if (tileDef?.type === "water" || tileDef?.biomeId === "river_channel") {
          ctx.fillStyle = "#274a5b";
        } else if (tileDef?.biomeId === "fungal_grove") {
          ctx.fillStyle = "#5d3d5d";
        } else if (isCleared) {
          ctx.fillStyle = "#496b45";
        } else {
          ctx.fillStyle = "#37523a";
        }

        ctx.fillRect(col * tilePx, row * tilePx, tilePx - 1, tilePx - 1);

        if (isCurrent) {
          ctx.fillStyle = "#e8f7ee";
          ctx.fillRect(col * tilePx + 1, row * tilePx + 1, tilePx - 2, tilePx - 2);
        }
      }
    }
  }

  function handleMiniMapPointerDown(evt) {
    const canvas = getMiniMapCanvas();
    if (!canvas) return;

    const pos = screenToCanvas(evt, canvas);
    const tilePx = CFG.WORLD.minimapTileSize;
    const world = S.getWorld();

    const maxCols = Math.floor(canvas.width / tilePx);
    const maxRows = Math.floor(canvas.height / tilePx);

    const startX = Math.max(0, world.currentTileX - Math.floor(maxCols / 2));
    const startY = Math.max(0, world.currentTileY - Math.floor(maxRows / 2));

    const clickedTileX = startX + Math.floor(pos.x / tilePx);
    const clickedTileY = startY + Math.floor(pos.y / tilePx);

    if (evt.shiftKey) {
      S.setSelectedTile({ x: clickedTileX, y: clickedTileY });
      S.addToast(`Selected minimap tile ${clickedTileX}, ${clickedTileY}`, "info");
      return;
    }

    moveToClickedTile(clickedTileX, clickedTileY);
    drawMiniMap();
  }

  function bindWorldCanvas() {
    const canvas = getWorldCanvas();
    if (!canvas) return;

    canvas.style.touchAction = "none";

    U.on(canvas, "pointerdown", handleCanvasPointerDown);
    U.on(canvas, "pointermove", handleCanvasPointerMove);
    U.on(canvas, "pointerup", handleCanvasPointerUp);
    U.on(canvas, "pointercancel", handleCanvasPointerCancel);
    U.on(canvas, "contextmenu", handleWorldContextMenu);
  }

  function bindMiniMapCanvas() {
    const canvas = getMiniMapCanvas();
    if (!canvas) return;

    U.on(canvas, "pointerdown", handleMiniMapPointerDown);
  }

  function bindKeyboardShortcuts() {
    U.on(document, "keydown", (evt) => {
      const tag = evt.target?.tagName?.toLowerCase?.() || "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (M.hasOpenModals() && evt.key !== "Escape") return;

      switch (evt.key.toLowerCase()) {
        case "i":
          evt.preventDefault();
          M.toggleModal("inventoryModal");
          break;
        case "m":
          evt.preventDefault();
          M.toggleModal("mapModal");
          break;
        case "p":
          evt.preventDefault();
          M.toggleModal("partyModal");
          break;
        case "b":
          evt.preventDefault();
          M.toggleModal("baseModal");
          break;
        case "c":
          evt.preventDefault();
          M.toggleModal("craftModal");
          break;
        case "j":
          evt.preventDefault();
          M.toggleModal("journalModal");
          break;
        case "f":
          evt.preventDefault();
          M.toggleModal("fishingModal");
          break;
        case "h":
          evt.preventDefault();
          S.modifyPlayerStat("health", 5);
          UI.renderHud();
          break;
        case " ":
          evt.preventDefault();
          const paused = !Boolean(S.getWorld()?.isPaused);
          S.updateWorld({ isPaused: paused });
          S.addToast(paused ? "Paused" : "Resumed", paused ? "warning" : "success");
          UI.renderHud();
          break;
        case "escape":
          closeHarvestMenu();
          break;
        default:
          break;
      }
    });
  }

  function bindActionBarExtras() {
    const btnInteract = U.byId("btnInteract");
    const btnHarvest = U.byId("btnHarvest");
    const btnAttack = U.byId("btnAttack");

    if (btnInteract) {
      U.on(btnInteract, "contextmenu", (evt) => {
        evt.preventDefault();
        if (state.selectedWorldTarget) {
          inspectPointOfInterest(state.selectedWorldTarget);
        } else {
          S.addToast("No target selected.", "warning");
        }
      });
    }

    if (btnHarvest) {
      U.on(btnHarvest, "click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (state.harvestMenuOpen) {
          closeHarvestMenu();
        } else {
          openHarvestMenu(btnHarvest);
        }
      });

      U.on(btnHarvest, "contextmenu", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (state.harvestMenuOpen) {
          closeHarvestMenu();
        } else {
          openHarvestMenu(btnHarvest);
        }
      });
    }

    if (btnAttack) {
      U.on(btnAttack, "contextmenu", (evt) => {
        evt.preventDefault();
        S.logActivity("Secondary attack action placeholder.", "info");
      });
    }

    U.on(document, "pointerdown", (evt) => {
      const menu = U.byId(state.harvestMenuId);
      const btn = U.byId("btnHarvest");
      if (!state.harvestMenuOpen || !menu) return;
      if (menu.contains(evt.target) || btn?.contains(evt.target)) return;
      closeHarvestMenu();
    });
  }

  function bindRuntimeRenders() {
    U.eventBus.on("world:playerMoved", () => {
      drawMiniMap();
      clearInteractionPrompt();
      closeHarvestMenu();
    });

    U.eventBus.on("world:tileRevealed", drawMiniMap);
    U.eventBus.on("world:tileCleared", drawMiniMap);
    U.eventBus.on("screen:changed", () => {
      if (S.getCurrentScreen() === "game") {
        drawMiniMap();
      }
      if (S.getCurrentScreen() !== "game") {
        closeHarvestMenu();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    bindWorldCanvas();
    bindMiniMapCanvas();
    bindKeyboardShortcuts();
    bindActionBarExtras();
    bindRuntimeRenders();

    drawMiniMap();
    clearInteractionPrompt();

    state.initialized = true;
    U.eventBus.emit("input:initialized");
    return true;
  }

  const API = {
    init,
    drawMiniMap,
    screenToCanvas,
    canvasToTile,
    worldTileToCanvasCenter,
    findPoiAtCanvasPoint,
    handlePrimaryWorldAction,
    handleSecondaryWorldAction,
    setSelectedWorldTarget,
    clearInteractionPrompt,
    performHarvestAction
  };

  window.GL_INPUT = API;

  return Object.freeze(API);
})();