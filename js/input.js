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

  function getCombatApi() {
    return window.GL_COMBAT || window.GrabLabCombat || null;
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
    dragCameraActive: false,
    secondaryDragReady: false,
    dragLastScreenX: 0,
    dragLastScreenY: 0,
    lastCanvasX: 0,
    lastCanvasY: 0,
    selectedWorldTarget: null,
    interactionRadiusPx: 38,
    visiblePoiRadiusTiles: 5,
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
    const worldApi = getWorldApi();
    if (worldApi?.canvasToTile) return worldApi.canvasToTile(x, y);

    const tileSize = worldApi?.getTileSize?.() || CFG.WORLD.tileSize;
    const camera = worldApi?.getCameraOrigin ? worldApi.getCameraOrigin() : { startX: 0, startY: 0 };

    return {
      x: camera.startX + Math.floor(x / tileSize),
      y: camera.startY + Math.floor(y / tileSize)
    };
  }

  function worldTileToCanvasCenter(tileX, tileY) {
    const worldApi = getWorldApi();

    if (worldApi?.getTileRect) {
      const rect = worldApi.getTileRect(tileX, tileY);
      return {
        x: Number(rect.x || 0) + Number(rect.size || CFG.WORLD.tileSize) / 2,
        y: Number(rect.y || 0) + Number(rect.size || CFG.WORLD.tileSize) / 2
      };
    }

    const tileSize = CFG.WORLD.tileSize;
    return {
      x: tileX * tileSize + tileSize / 2,
      y: tileY * tileSize + tileSize / 2
    };
  }

  function isPoiResolved(poi) {
    return Boolean(poi?.captured || poi?.recruited || poi?.resolved || poi?.hidden);
  }

  function normalizePoiWithTile(poi, tileX, tileY, tileDef = null) {
    return {
      ...poi,
      tileX: Number(poi.tileX ?? tileX),
      tileY: Number(poi.tileY ?? tileY),
      sourceTileName: poi.sourceTileName || tileDef?.name || `${tileX},${tileY}`,
      sourceBiomeId: poi.sourceBiomeId || tileDef?.biomeId || S.getWorld()?.currentBiomeId
    };
  }

  function getPoiDistanceTiles(poi) {
    const world = S.getWorld();
    const tileX = Number(poi?.tileX ?? world.currentTileX);
    const tileY = Number(poi?.tileY ?? world.currentTileY);

    return Math.max(
      Math.abs(tileX - Number(world.currentTileX || 0)),
      Math.abs(tileY - Number(world.currentTileY || 0))
    );
  }

  function isPoiOnCurrentTile(poi) {
    return getPoiDistanceTiles(poi) === 0;
  }

  function getVisiblePoiList(radius = state.visiblePoiRadiusTiles) {
    const world = S.getWorld();
    const out = [];
    const r = Math.max(0, Number(radius || 0));

    for (let y = Number(world.currentTileY || 0) - r; y <= Number(world.currentTileY || 0) + r; y += 1) {
      for (let x = Number(world.currentTileX || 0) - r; x <= Number(world.currentTileX || 0) + r; x += 1) {
        if (x < 0 || y < 0 || x >= CFG.WORLD.worldWidthTiles || y >= CFG.WORLD.worldHeightTiles) continue;

        const dist = Math.max(
          Math.abs(x - Number(world.currentTileX || 0)),
          Math.abs(y - Number(world.currentTileY || 0))
        );

        if (dist > r) continue;

        const tile = S.getMapTile(x, y);
        const pois = U.toArray(tile?.pointsOfInterest)
          .filter((poi) => !isPoiResolved(poi))
          .map((poi) => ({
            ...normalizePoiWithTile(poi, x, y, tile),
            distanceTiles: dist
          }));

        out.push(...pois);
      }
    }

    return out.sort((a, b) => {
      const distDiff = Number(a.distanceTiles || 0) - Number(b.distanceTiles || 0);
      if (distDiff !== 0) return distDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function getCurrentTilePoiList() {
    const world = S.getWorld();
    const tile = S.getCurrentMapTile();

    return U.toArray(tile?.pointsOfInterest)
      .filter((poi) => !isPoiResolved(poi))
      .map((poi) => normalizePoiWithTile(poi, world.currentTileX, world.currentTileY, tile));
  }

  function getPoiCanvasPosition(poi) {
    if (!poi) return { x: 0, y: 0 };

    if (poi.canvasX != null && poi.canvasY != null && isPoiOnCurrentTile(poi)) {
      return {
        x: Number(poi.canvasX || 0),
        y: Number(poi.canvasY || 0)
      };
    }

    const world = S.getWorld();
    const tileX = Number(poi.tileX ?? world.currentTileX);
    const tileY = Number(poi.tileY ?? world.currentTileY);
    const worldApi = getWorldApi();

    const rect = worldApi?.getTileRect
      ? worldApi.getTileRect(tileX, tileY)
      : { x: 0, y: 0, size: CFG.WORLD.tileSize };

    return {
      x: Number(rect.x || 0) + Number(poi.localX ?? rect.size * 0.5),
      y: Number(rect.y || 0) + Number(poi.localY ?? rect.size * 0.5)
    };
  }

  function findPoiAtCanvasPoint(x, y) {
    const pois = getVisiblePoiList(state.visiblePoiRadiusTiles);

    for (const poi of pois) {
      const pos = getPoiCanvasPosition(poi);

      if (U.distance({ x, y }, pos) <= state.interactionRadiusPx) {
        return poi;
      }
    }

    return null;
  }

  function isCapturableAnimalPoi(poi) {
    return Boolean(
      poi &&
      (poi.type === "capturable_animal" || poi.type === "wild_animal") &&
      poi.capturable !== false &&
      poi.speciesId
    );
  }

  function isGrabbableResourcePoi(poi) {
    return Boolean(
      poi &&
      poi.grabbable !== false &&
      (
        poi.type === "resource" ||
        poi.type === "fungal_patch" ||
        poi.type === "plant" ||
        poi.type === "algae" ||
        poi.plantId ||
        poi.harvestItemId
      )
    );
  }

  function getPlantDef(plantId) {
    if (!plantId) return null;
    return S.getDataEntry?.("plants", plantId) || U.toArray(S.getData()?.plants).find((plant) => plant.id === plantId) || null;
  }

  function getItemName(itemId) {
    return S.getItemDef?.(itemId)?.name || U.titleCase(itemId || "item");
  }

  function isHostilePoi(poi) {
    return Boolean(
      poi &&
      (
        poi.hostile ||
        poi.encounterId ||
        poi.combatEncounterId ||
        poi.enemyId ||
        poi.type === "hostile" ||
        poi.type === "enemy" ||
        poi.type === "hostile_npc" ||
        poi.type === "combat" ||
        poi.type === "fungal_enemy"
      )
    );
  }

  function markPoiResolved(poi, field = "resolved") {
    if (!poi?.id) return false;

    const tileX = Number(poi.tileX ?? S.getWorld().currentTileX);
    const tileY = Number(poi.tileY ?? S.getWorld().currentTileY);

    const tile = S.getMapTile(tileX, tileY) || S.getCurrentMapTile();
    const pois = U.toArray(tile?.pointsOfInterest);
    const target = pois.find((entry) => entry.id === poi.id);

    if (!target) return false;

    target[field] = true;
    target.resolvedAt = U.isoNow();

    if (field === "captured" || field === "recruited" || field === "defeated") {
      target.resolved = true;
    }

    U.eventBus.emit("world:poiResolved", { poi: U.deepClone(target), field });
    return true;
  }

  function ensureGrabButton() {
    let btn = U.byId("btnGrabAnimal");
    if (btn) return btn;

    const bar = U.byId("bottomActionBar");
    if (!bar) return null;

    btn = U.createEl("button", {
      id: "btnGrabAnimal",
      className: "action-btn",
      text: "Grab"
    });

    const harvest = U.byId("btnHarvest");
    if (harvest?.nextSibling) {
      bar.insertBefore(btn, harvest.nextSibling);
    } else {
      bar.appendChild(btn);
    }

    return btn;
  }

  function updateActionButtonsForTarget(target = state.selectedWorldTarget) {
    const grab = ensureGrabButton();
    const interact = U.byId("btnInteract");
    const attack = U.byId("btnAttack");
    const dist = target ? getPoiDistanceTiles(target) : 999;
    const here = target ? dist === 0 : false;

    if (grab) {
      const grabTarget = isCapturableAnimalPoi(target) || isGrabbableResourcePoi(target);
      const canGrab = grabTarget && here;
      const visibleButFar = grabTarget && !here;

      grab.textContent = canGrab
        ? `Grab ${target.shortName || target.name || "Target"}`
        : visibleButFar
          ? `Too Far (${dist})`
          : "Grab";

      grab.disabled = !canGrab;
      grab.classList.toggle("primary", canGrab);
      grab.title = canGrab
        ? `Grab ${target.name || "this target"}`
        : visibleButFar
          ? `${target.name || "Target"} is visible but ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to grab it.`
          : "Select a capturable animal or grabbable resource on your current tile first.";
    }

    if (interact) {
      if (target?.type === "npc" && target.recruitable && here) {
        interact.textContent = "Recruit";
      } else if (target?.type === "npc" && target.recruitable && !here) {
        interact.textContent = `Too Far (${dist})`;
      } else if (isCapturableAnimalPoi(target) && here) {
        interact.textContent = "Inspect";
      } else if (isCapturableAnimalPoi(target) && !here) {
        interact.textContent = `Track (${dist})`;
      } else if (isHostilePoi(target) && here) {
        interact.textContent = "Inspect";
      } else if (target && !here) {
        interact.textContent = `Track (${dist})`;
      } else {
        interact.textContent = "Interact";
      }
    }

    if (attack) {
      const canAttack = Boolean(target && here && (isHostilePoi(target) || isCapturableAnimalPoi(target)));
      attack.disabled = false;
      attack.classList.toggle("primary", canAttack);
      attack.textContent = canAttack ? "Fight" : "Attack";
      attack.title = target && !here
        ? `${target.name || "Target"} is visible but too far away. Move closer to fight.`
        : "";
    }
  }

  function getFirstCapturablePoiOnTile() {
    return getCurrentTilePoiList().find(isCapturableAnimalPoi) || null;
  }

  function getFirstHostilePoiOnTile() {
    return getCurrentTilePoiList().find(isHostilePoi) || null;
  }

  function getFirstVisibleCapturablePoi() {
    return getVisiblePoiList(state.visiblePoiRadiusTiles).find(isCapturableAnimalPoi) || null;
  }

  function getFirstVisibleHostilePoi() {
    return getVisiblePoiList(state.visiblePoiRadiusTiles).find(isHostilePoi) || null;
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

    const dist = getPoiDistanceTiles(target);
    const distanceText = dist === 0
      ? "You are here."
      : `${dist} tile${dist === 1 ? "" : "s"} away.`;

    let promptBody = target.description || `Tap to inspect ${target.name || "this spot"}.`;

    if (target.type === "npc" && target.recruitable) {
      promptBody = dist === 0
        ? `${promptBody} Tap again to recruit, or use Interact.`
        : `${promptBody} ${distanceText} Move closer to recruit.`;
    } else if (isCapturableAnimalPoi(target)) {
      promptBody = dist === 0
        ? `${promptBody} Press Grab to capture safely, or Attack to start a wildlife encounter.`
        : `${promptBody} ${distanceText} It is visible from here, but you need to move closer to grab or fight.`;
    } else if (isGrabbableResourcePoi(target)) {
      promptBody = dist === 0
        ? `${promptBody} Press Grab to collect it into your inventory.`
        : `${promptBody} ${distanceText} Move closer to grab it.`;
    } else if (isHostilePoi(target)) {
      promptBody = dist === 0
        ? `${promptBody} Tap again or press Attack to start combat.`
        : `${promptBody} ${distanceText} Move closer to engage.`;
    } else if (dist > 0) {
      promptBody = `${promptBody} ${distanceText}`;
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
    updateActionButtonsForTarget(target || null);
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

  function moveTowardPoi(poi) {
    if (!poi) return false;

    const world = S.getWorld();
    const targetX = Number(poi.tileX ?? world.currentTileX);
    const targetY = Number(poi.tileY ?? world.currentTileY);

    if (targetX === world.currentTileX && targetY === world.currentTileY) {
      return false;
    }

    moveToClickedTile(targetX, targetY);
    S.logActivity(`Tracking ${poi.name || "point of interest"} at ${poi.sourceTileName || `${targetX},${targetY}`}.`, "info");
    return true;
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

    if (!isPoiOnCurrentTile(poi)) {
      S.addToast(`${poi.name || "NPC"} is visible, but too far away to recruit.`, "warning");
      moveTowardPoi(poi);
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
        S.logActivity("Tip: captured animals default to Cryo unless they are Marsy. Manage captures from Party.", "info");
        S.logActivity("Tip: fish and other aquatic creatures need an aquarium before they can be kept comfortably.", "info");
        S.logActivity("Tip: land creatures need a pen or another suitable habitat before long-term care makes sense.", "info");
        S.addToast("Marsy joined the party!", "success");
      }

      markPoiResolved(poi, "recruited");
      A.playSfx("ui_confirm").catch?.(() => {});
      setSelectedWorldTarget(null);
      UI.renderEverything();
      return true;
    }

    S.logActivity(`${poi.name || "This character"} is not recruitable yet.`, "warning");
    S.addToast("Not recruitable yet.", "warning");
    return false;
  }

  function grabPoiResource(poi) {
    if (!poi) return false;

    if (!isPoiOnCurrentTile(poi)) {
      const dist = getPoiDistanceTiles(poi);
      S.addToast(`${poi.name || "Resource"} is ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to grab it.`, "warning");
      moveTowardPoi(poi);
      return false;
    }

    const plant = getPlantDef(poi.plantId);
    const itemId = poi.harvestItemId || plant?.harvestItemId || poi.itemId || "fiber_bundle";
    const min = Number(poi.yieldMin ?? plant?.yieldMin ?? 1);
    const max = Number(poi.yieldMax ?? plant?.yieldMax ?? min);
    const qty = U.randInt(Math.min(min, max), Math.max(min, max));

    S.addItem("player", itemId, qty);
    markPoiResolved(poi, "harvested");

    const label = getItemName(itemId);
    S.logActivity(`Grabbed ${poi.name || "resource"}: ${label} x${qty}.`, "success");
    S.addToast(`${label} x${qty}`, "success");
    getPlayerApi()?.awardSkillXp?.("harvesting", 3 + qty, "grabbing resource");
    A.playSfx("ui_confirm").catch?.(() => {});
    setSelectedWorldTarget(null);
    UI.renderEverything();
    return true;
  }

  function capturePoiAnimal(poi) {
    if (isGrabbableResourcePoi(poi)) {
      return grabPoiResource(poi);
    }

    const AN = getAnimalsApi();
    if (!AN) {
      S.addToast("Wildlife system not available yet.", "error");
      return false;
    }

    if (!poi?.speciesId) {
      S.addToast("That creature has no species data.", "error");
      return false;
    }

    if (!isPoiOnCurrentTile(poi)) {
      const dist = getPoiDistanceTiles(poi);
      S.addToast(`${poi.name || "Animal"} is ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to grab it.`, "warning");
      moveTowardPoi(poi);
      return false;
    }

    const speciesDef = S.getAnimalDef(poi.speciesId);
    const baseName = speciesDef?.name || poi.name || U.titleCase(poi.speciesId);
    const isMarsy = poi.speciesId === "marsy_marsupial" || poi.role === "starter_companion";

    if (isMarsy) {
      const recruited = recruitPoiNpc(poi);
      return recruited;
    }

    const specimen = AN.captureAnimal(poi.speciesId, {
      method: "field_capture",
      name: baseName,
      tileX: poi.tileX ?? S.getWorld().currentTileX,
      tileY: poi.tileY ?? S.getWorld().currentTileY,
      preferCryo: true,
      skipAutoParty: true,
      notes: `Captured from ${poi.name || baseName} near ${S.getCurrentMapTile()?.name || "the current tile"}.`
    });

    if (!specimen) {
      S.addToast("Capture failed.", "error");
      return false;
    }

    if (AN.moveSpecimenToCryo) {
      AN.moveSpecimenToCryo(specimen.id, { silent: true });
    }

    markPoiResolved(poi, "captured");
    S.logActivity(`${specimen.name} was secured and sent to Cryo storage. Manage it from the Party screen.`, "success");
    S.logActivity("Party > All Captures is now the main place to assign habitats, add to party, feed, breed, or release captures.", "info");
    A.playSfx("ui_confirm").catch?.(() => {});
    setSelectedWorldTarget(null);
    UI.renderEverything();
    return true;
  }

  function startPoiCombat(poi = state.selectedWorldTarget) {
    const COMBAT = getCombatApi();

    if (!COMBAT) {
      S.addToast("Combat system not available yet.", "error");
      return false;
    }

    if (!poi) {
      S.addToast("No combat target selected.", "warning");
      return false;
    }

    if (!isPoiOnCurrentTile(poi)) {
      const dist = getPoiDistanceTiles(poi);
      S.addToast(`${poi.name || "Target"} is ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to fight.`, "warning");
      moveTowardPoi(poi);
      return false;
    }

    if (isCapturableAnimalPoi(poi) && COMBAT.startWildlifeEncounter) {
      COMBAT.startWildlifeEncounter(poi.speciesId, {
        sourcePoiId: poi.id,
        level: Number(poi.level || 1),
        name: poi.name || null,
        tileX: poi.tileX ?? S.getWorld().currentTileX,
        tileY: poi.tileY ?? S.getWorld().currentTileY
      });
      S.logActivity(`You engaged ${poi.name || "wildlife"} instead of grabbing it directly.`, "warning");
      A.playSfx("ui_confirm").catch?.(() => {});
      UI.showScreen?.("combat");
      return true;
    }

    const encounterId = poi.encounterId || poi.combatEncounterId || poi.enemyId || "fungal_blight";

    if (COMBAT.startEncounter) {
      COMBAT.startEncounter(encounterId, {
        encounterType: poi.encounterType || "fungal",
        encounterMeta: {
          sourcePoiId: poi.id,
          name: poi.name || encounterId,
          tileX: poi.tileX ?? S.getWorld().currentTileX,
          tileY: poi.tileY ?? S.getWorld().currentTileY
        }
      });
      S.logActivity(`You engaged ${poi.name || U.titleCase(encounterId)}.`, "warning");
      A.playSfx("ui_confirm").catch?.(() => {});
      UI.showScreen?.("combat");
      return true;
    }

    S.addToast("No combat start function found.", "error");
    return false;
  }

  function inspectPointOfInterest(poi) {
    if (!poi) {
      S.logActivity("Nothing interesting there. Rude.", "info");
      return;
    }

    const sameTarget = isSameSelectedPoi(poi);
    const here = isPoiOnCurrentTile(poi);
    const dist = getPoiDistanceTiles(poi);

    if (sameTarget && !here) {
      S.logActivity(`${poi.name || "That target"} is visible ${dist} tile${dist === 1 ? "" : "s"} away. Moving closer.`, "info");
      S.addToast(`Tracking ${poi.name || "target"}.`, "info");
      moveTowardPoi(poi);
      setSelectedWorldTarget(poi);
      return;
    }

    if (sameTarget && poi.type === "npc" && poi.recruitable) {
      recruitPoiNpc(poi);
      return;
    }

    if (sameTarget && isCapturableAnimalPoi(poi)) {
      S.logActivity(`${poi.name || "Animal"} is close enough to grab. Use the Grab button to capture safely, or Attack to start a wildlife encounter.`, "info");
      S.addToast(`Use Grab to capture ${poi.name || "animal"}.`, "info");
      setSelectedWorldTarget(poi);
      return;
    }

    if (sameTarget && isHostilePoi(poi)) {
      startPoiCombat(poi);
      setSelectedWorldTarget(poi);
      return;
    }

    const detailText = poi.description || "It looks promising, suspicious, or both.";

    if (poi.type === "npc" && poi.recruitable) {
      if (here) {
        S.logActivity(`Met ${poi.name || "a recruitable companion"}: ${detailText}`, "info");
        S.addToast(`Inspect ${poi.name || "companion"} again to recruit.`, "info");
      } else {
        S.logActivity(`Spotted recruitable ${poi.name || "companion"} ${dist} tile${dist === 1 ? "" : "s"} away: ${detailText}`, "info");
        S.addToast(`${poi.name || "Companion"} is ${dist} tile${dist === 1 ? "" : "s"} away.`, "info");
      }
    } else if (isCapturableAnimalPoi(poi)) {
      if (here) {
        S.logActivity(`Observed ${poi.name || "a capturable animal"}: ${detailText}`, "info");
        S.addToast(`Use Grab to capture ${poi.name || "animal"}.`, "info");
      } else {
        S.logActivity(`Spotted ${poi.name || "a capturable animal"} ${dist} tile${dist === 1 ? "" : "s"} away: ${detailText}`, "info");
        S.addToast(`${poi.name || "Animal"} visible ${dist} tile${dist === 1 ? "" : "s"} away.`, "info");
      }
    } else if (isGrabbableResourcePoi(poi)) {
      if (here) {
        S.logActivity(`Inspected ${poi.name || "a resource"}: ${detailText}`, "info");
        S.addToast(`Use Grab to collect ${poi.name || "resource"}.`, "info");
      } else {
        S.logActivity(`Spotted ${poi.name || "a resource"} ${dist} tile${dist === 1 ? "" : "s"} away: ${detailText}`, "info");
        S.addToast(`${poi.name || "Resource"} visible ${dist} tile${dist === 1 ? "" : "s"} away.`, "info");
      }
    } else if (isHostilePoi(poi)) {
      if (here) {
        S.logActivity(`Spotted threat ${poi.name || "hostile"}: ${detailText}`, "warning");
        S.addToast(`Press Attack to fight ${poi.name || "threat"}.`, "warning");
      } else {
        S.logActivity(`Spotted threat ${poi.name || "hostile"} ${dist} tile${dist === 1 ? "" : "s"} away: ${detailText}`, "warning");
        S.addToast(`${poi.name || "Threat"} visible ${dist} tile${dist === 1 ? "" : "s"} away.`, "warning");
      }
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
      const dist = getPoiDistanceTiles(poi);
      const suffix = dist === 0 ? "" : ` (${dist} tile${dist === 1 ? "" : "s"} away)`;

      if (poi.type === "npc" && poi.recruitable) {
        S.logActivity(`Context hint: ${poi.name || "NPC"} can be recruited when nearby.${suffix}`, "info");
        S.addToast(`Recruitable: ${poi.name || "NPC"}${suffix}`, "info");
      } else if (isCapturableAnimalPoi(poi)) {
        S.logActivity(`Context hint: ${poi.name || "Animal"} can be captured with Grab when nearby.${suffix}`, "info");
        S.addToast(`Capturable: ${poi.name || "Animal"}${suffix}`, "info");
      } else if (isHostilePoi(poi)) {
        S.logActivity(`Context hint: ${poi.name || "Threat"} can be engaged with Attack when nearby.${suffix}`, "warning");
        S.addToast(`Hostile: ${poi.name || "Threat"}${suffix}`, "warning");
      } else {
        S.logActivity(`Context action opened for ${poi.name || "POI"}.${suffix}`, "info");
        S.addToast(`Context action: ${poi.name || "POI"}`, "warning");
      }
      setSelectedWorldTarget(poi);
      return;
    }

    const tile = canvasToTile(canvasX, canvasY);
    S.logActivity(`Context action at tile ${tile.x}, ${tile.y}.`, "info");
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
      state.secondaryDragReady = true;
      state.dragCameraActive = true;
      U.byId("worldViewport")?.classList.add("dragging-map");
      S.addToast("Map drag enabled.", "info");
    }, CFG.UI.holdToRightClickMs);

    void evt;
    void canvasX;
    void canvasY;
  }


  function ensurePlayerCatalogue() {
    const player = S.getPlayer();
    if (!player.catalogue || typeof player.catalogue !== "object") {
      player.catalogue = { animals: [], plants: [], resources: [], loot: [], poi: [] };
    }
    ["animals", "plants", "resources", "loot", "poi"].forEach((key) => {
      if (!Array.isArray(player.catalogue[key])) player.catalogue[key] = [];
    });
    return player.catalogue;
  }

  function upsertCatalogueEntry(bucket, entry) {
    const catalogue = ensurePlayerCatalogue();
    const list = catalogue[bucket] || [];
    const id = String(entry.id || entry.speciesId || entry.plantId || entry.name || "unknown");
    const existing = list.find((row) => String(row.id) === id);
    if (existing) {
      Object.assign(existing, entry, {
        id,
        studyCount: Number(existing.studyCount || 1) + 1,
        studiedAt: U.isoNow()
      });
    } else {
      list.push({
        ...entry,
        id,
        studyCount: 1,
        studiedAt: U.isoNow()
      });
    }
    S.updatePlayer({ catalogue });
    return true;
  }

  function studyPoi(poi = state.selectedWorldTarget) {
    if (!poi) {
      S.addToast("Select something to study first.", "warning");
      return false;
    }

    if (!isPoiOnCurrentTile(poi)) {
      const dist = getPoiDistanceTiles(poi);
      S.addToast(`${poi.name || "Target"} is ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to study.`, "warning");
      moveTowardPoi(poi);
      return false;
    }

    let bucket = "poi";
    let entry = {
      id: poi.id,
      name: poi.name || poi.shortName || "Point of Interest",
      category: poi.type || "poi",
      description: poi.description || "No description recorded.",
      tileX: poi.tileX,
      tileY: poi.tileY,
      notes: `Studied at ${S.getCurrentMapTile()?.name || "current tile"}.`
    };

    if (isCapturableAnimalPoi(poi)) {
      const def = S.getAnimalDef?.(poi.speciesId) || {};
      bucket = "animals";
      entry = {
        ...entry,
        id: poi.speciesId,
        name: def.name || poi.name || U.titleCase(poi.speciesId),
        family: def.family || "unknown",
        traits: U.toArray(def.traits),
        description: def.description || poi.description || "No animal notes recorded.",
        speciesId: poi.speciesId
      };
      const player = S.getPlayer();
      const discoveredSpecies = U.uniqueBy([...U.toArray(player.discoveredSpecies), poi.speciesId], (x) => String(x));
      S.updatePlayer({ discoveredSpecies });
    } else if (isGrabbableResourcePoi(poi)) {
      const plant = getPlantDef(poi.plantId);
      if (plant || poi.plantId || poi.type === "plant") {
        bucket = "plants";
        entry = {
          ...entry,
          id: poi.plantId || poi.id,
          name: plant?.name || poi.name || U.titleCase(poi.plantId || "plant"),
          category: "plant",
          traits: U.toArray(plant?.traits),
          description: plant?.description || poi.description || "No plant notes recorded.",
          harvestItemId: poi.harvestItemId || plant?.harvestItemId
        };
      } else {
        bucket = "resources";
      }
    } else if (isLootablePoi(poi)) {
      bucket = "loot";
      entry = { ...entry, category: "loot", lootTableId: poi.lootTableId || "starter_cache" };
    }

    upsertCatalogueEntry(bucket, entry);
    getPlayerApi()?.awardSkillXp?.("observation", 3, "studying field subject");
    S.logActivity(`Studied ${entry.name || poi.name || "field subject"}. Added notes to DNA Lab catalogue.`, "success");
    S.addToast("Catalogue updated.", "success");
    UI.renderDnaModal?.();
    return true;
  }

  function isLootablePoi(poi) {
    if (!poi) return false;
    const type = String(poi.type || "").toLowerCase();
    const name = String(poi.name || poi.id || "").toLowerCase();
    return Boolean(type === "loot" || type === "cache" || type === "lost_cache" || poi.lootTableId || name.includes("cache"));
  }

  function lootPoi(poi = state.selectedWorldTarget) {
    if (!poi) {
      S.addToast("Select a cache first.", "warning");
      return false;
    }

    if (!isPoiOnCurrentTile(poi)) {
      const dist = getPoiDistanceTiles(poi);
      S.addToast(`${poi.name || "Cache"} is ${dist} tile${dist === 1 ? "" : "s"} away. Move closer to loot it.`, "warning");
      moveTowardPoi(poi);
      return false;
    }

    const tableId = poi.lootTableId || (String(poi.name || poi.id || "").toLowerCase().includes("cache") ? "starter_cache" : getLootTableForHarvestAction("gather_loot", S.getCurrentMapTile()));
    const table = getLootTableById(tableId) || getFallbackLootTable(tableId);
    const rolls = Number(poi.lootRolls || poi.rolls || 3);
    const gains = [];

    for (let i = 0; i < rolls; i += 1) {
      const picked = weightedEntryPick(table?.entries || []);
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
      S.addToast("The cache was empty.", "warning");
      markPoiResolved(poi, "collected");
      return false;
    }

    addHarvestResultsToInventory(gains, "player");
    markPoiResolved(poi, "collected");
    const summary = summarizeGains(gains);
    upsertCatalogueEntry("loot", {
      id: poi.id,
      name: poi.name || "Loot Cache",
      category: "loot",
      lootTableId: tableId,
      description: poi.description || "A field cache opened and catalogued.",
      notes: `Looted: ${summary}`
    });
    S.logActivity(`Looted ${poi.name || "cache"}: ${summary}.`, "success");
    S.addToast("Cache looted.", "success");
    A.playSfx("ui_confirm").catch?.(() => {});
    setSelectedWorldTarget(null);
    UI.renderEverything();
    return true;
  }

  function closeInteractMenu() {
    const node = U.byId(state.interactMenuId);
    if (node) node.remove();
    state.interactMenuOpen = false;
  }

  function createInteractMenuButton(actionId, label, desc, disabled = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-btn";
    btn.disabled = Boolean(disabled);
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.margin = "0 0 .4rem 0";
    btn.innerHTML = `<strong>${htmlEscape(label)}</strong><br><span style="opacity:.8;font-size:.9em;">${htmlEscape(desc)}</span>`;
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      performInteractAction(actionId);
    });
    return btn;
  }

  function playerHasShovel() {
    return S.hasItem?.("player", "field_shovel", 1);
  }

  function getCarriedSeedItems() {
    return U.toArray(S.getInventory?.("player")).filter((entry) => {
      const def = S.getItemDef?.(entry.itemId) || {};
      return U.toArray(def.tags).includes("seed") || String(entry.itemId || "").includes("_seeds");
    });
  }

  function digHere() {
    if (!playerHasShovel()) {
      S.addToast("Carry a field shovel to dig.", "warning");
      return false;
    }
    S.logActivity("You dig a small test patch. Future systems can reveal buried resources here.", "info");
    S.addToast("Dug test patch.", "success");
    getPlayerApi()?.awardSkillXp?.("foraging", 2, "digging");
    return true;
  }

  function plantSeedHere() {
    const seeds = getCarriedSeedItems();
    if (!seeds.length) {
      S.addToast("Carry seeds to plant.", "warning");
      return false;
    }

    const seed = seeds[0];
    const seedId = seed.itemId;
    const plantId = seedId.replace(/_seeds$/, "");
    const tile = S.getCurrentMapTile();
    const world = S.getWorld();
    if (!tile) return false;

    if (!S.removeItem("player", seedId, 1)) {
      S.addToast("Could not consume seed.", "error");
      return false;
    }

    const poi = {
      id: U.uid("planted"),
      name: `${getItemName(seedId).replace(/ Seeds?$/i, "")} Planting`,
      shortName: "Plant",
      description: "A planted patch. Growth is tracked but currently paused until regrowth/growth rules are tuned.",
      type: "plant",
      plantId,
      planted: true,
      growthCounter: 0,
      growthEnabled: false,
      regrowCounter: 0,
      regrowEnabled: false,
      tileX: world.currentTileX,
      tileY: world.currentTileY,
      localX: U.randInt(18, 46),
      localY: U.randInt(18, 46)
    };

    tile.pointsOfInterest = U.toArray(tile.pointsOfInterest);
    tile.pointsOfInterest.push(poi);
    S.logActivity(`Planted ${getItemName(seedId)} at ${tile.name || "this tile"}. Growth is paused for now.`, "success");
    S.addToast("Seed planted.", "success");
    UI.renderEverything();
    return true;
  }

  function performInteractAction(actionId) {
    const target = state.selectedWorldTarget;
    closeInteractMenu();

    switch (String(actionId || "")) {
      case "study": return studyPoi(target);
      case "grab": return capturePoiAnimal(target);
      case "recruit": return recruitPoiNpc(target);
      case "attack": return startPoiCombat(target);
      case "loot": return lootPoi(target);
      case "fish": return getFishingApi()?.beginCast ? getFishingApi().beginCast({ useBait: false }) : (UI.renderFishingModal?.(), M.openModal("fishingModal"));
      case "set_trap": return (M.openModal("trapsModal"), UI.renderTrapsModal?.(), true);
      case "dig": return digHere();
      case "plant": return plantSeedHere();
      default: return inspectPointOfInterest(target);
    }
  }

  function openInteractMenu(anchorEl) {
    closeInteractMenu();
    const target = state.selectedWorldTarget;
    const here = target ? isPoiOnCurrentTile(target) : false;
    const seeds = getCarriedSeedItems();

    const menu = document.createElement("div");
    menu.id = state.interactMenuId;
    menu.setAttribute("role", "dialog");
    menu.style.position = "fixed";
    menu.style.zIndex = "121";
    menu.style.minWidth = "250px";
    menu.style.maxWidth = "310px";
    menu.style.padding = ".7rem";
    menu.style.borderRadius = "14px";
    menu.style.background = "rgba(14, 22, 16, 0.96)";
    menu.style.border = "1px solid rgba(170, 220, 170, 0.2)";
    menu.style.boxShadow = "0 12px 30px rgba(0,0,0,.35)";
    menu.style.backdropFilter = "blur(6px)";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = ".55rem";
    title.textContent = target ? (target.name || "Interact") : "Interact Options";
    menu.appendChild(title);

    menu.appendChild(createInteractMenuButton("study", "Study", "Record this subject in the DNA Lab catalogue.", !target || !here));
    if (target && isLootablePoi(target)) menu.appendChild(createInteractMenuButton("loot", "Loot Cache", "Open this cache and take its resources.", !here));
    if (target && (isCapturableAnimalPoi(target) || isGrabbableResourcePoi(target))) menu.appendChild(createInteractMenuButton("grab", "Grab", "Capture or collect this target.", !here));
    if (target?.type === "npc" && target.recruitable) menu.appendChild(createInteractMenuButton("recruit", "Recruit", "Invite this NPC into your operation.", !here));
    if (target && (isHostilePoi(target) || isCapturableAnimalPoi(target))) menu.appendChild(createInteractMenuButton("attack", "Attack", "Start combat or a wildlife encounter.", !here));
    if (target?.type === "fish_spot" || S.getCurrentMapTile()?.type === "water" || S.getCurrentMapTile()?.biomeId === "river_channel") menu.appendChild(createInteractMenuButton("fish", "Fish", "Cast a line or open fishing options."));
    menu.appendChild(createInteractMenuButton("set_trap", "Set Trap", "Open trap placement options."));
    menu.appendChild(createInteractMenuButton("dig", "Dig", "Dig a test patch with a carried shovel.", !playerHasShovel()));
    menu.appendChild(createInteractMenuButton("plant", "Plant Seed", "Plant carried seeds at the current tile.", !seeds.length));

    document.body.appendChild(menu);
    const rect = anchorEl?.getBoundingClientRect?.() || { left: window.innerWidth / 2 - 125, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
    let left = rect.left;
    let top = rect.top - menu.offsetHeight - 8;
    if (top < 10) top = rect.bottom + 8;
    if (left + menu.offsetWidth > window.innerWidth - 10) left = window.innerWidth - menu.offsetWidth - 10;
    if (left < 10) left = 10;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    state.interactMenuOpen = true;
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
    const PAPI = getPlayerApi();
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
    PAPI?.registerHarvestAction?.();

    const summary = summarizeGains(gains);
    S.logActivity(`Gathered loot near ${tile?.name || "this tile"}: ${summary}.`, "success");
    S.addToast("Gathered loot.", "success");
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
    return true;
  }

  function performGatherWater() {
    const PAPI = getPlayerApi();
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
    PAPI?.registerHarvestAction?.();

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
    const PAPI = getPlayerApi();
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
    PAPI?.registerHarvestAction?.();

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
    state.dragLastScreenX = state.downScreenX;
    state.dragLastScreenY = state.downScreenY;
    state.dragCameraActive = false;

    const point = screenToCanvas(evt, canvas);
    state.lastCanvasX = point.x;
    state.lastCanvasY = point.y;

    const isSecondaryMouse = evt.pointerType === "mouse" && evt.button === 2;
    state.secondaryDragReady = Boolean(isSecondaryMouse);

    if (isSecondaryMouse) {
      evt.preventDefault();
      state.dragCameraActive = true;
      U.byId("worldViewport")?.classList.add("dragging-map");
    }

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
      return;
    }

    const movedDistance =
      Math.abs((evt.clientX ?? 0) - state.downScreenX) +
      Math.abs((evt.clientY ?? 0) - state.downScreenY);

    if (movedDistance > CFG.UI.dragThresholdPx * 2) {
      if (state.secondaryDragReady || state.holdTriggered || state.dragCameraActive) {
        clearHoldTimer();
        state.dragCameraActive = true;
        const dx = (evt.clientX ?? 0) - state.dragLastScreenX;
        const dy = (evt.clientY ?? 0) - state.dragLastScreenY;
        getWorldApi()?.panCameraPixels?.(dx, dy);
        state.dragLastScreenX = evt.clientX ?? state.dragLastScreenX;
        state.dragLastScreenY = evt.clientY ?? state.dragLastScreenY;
        U.byId("worldViewport")?.classList.add("dragging-map");
      } else {
        clearHoldTimer();
      }
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

    if (!state.holdTriggered && !state.dragCameraActive && movedDistance <= CFG.UI.dragThresholdPx * 2) {
      if (!(evt.pointerType === "mouse" && evt.button === 2)) {
        handlePrimaryWorldAction(point.x, point.y);
      }
    }

    state.pointerDown = false;
    state.activePointerId = null;
    state.holdTriggered = false;
    state.dragCameraActive = false;
    state.secondaryDragReady = false;
    U.byId("worldViewport")?.classList.remove("dragging-map");

    void elapsed;
  }

  function handleCanvasPointerCancel() {
    clearHoldTimer();
    state.pointerDown = false;
    state.activePointerId = null;
    state.holdTriggered = false;
    state.dragCameraActive = false;
    state.secondaryDragReady = false;
    U.byId("worldViewport")?.classList.remove("dragging-map");
  }

  function handleWorldContextMenu(evt) {
    evt.preventDefault();

    if (!isGameScreenActive()) return;
    if (M.hasOpenModals()) return;

    const canvas = getWorldCanvas();
    if (!canvas) return;

    void screenToCanvas;
    void canvas;
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
        case "g":
          evt.preventDefault();
          {
            const target = isCapturableAnimalPoi(state.selectedWorldTarget)
              ? state.selectedWorldTarget
              : getFirstCapturablePoiOnTile();

            if (target) {
              setSelectedWorldTarget(target);
              capturePoiAnimal(target);
            } else {
              const visible = getFirstVisibleCapturablePoi();
              if (visible) {
                setSelectedWorldTarget(visible);
                S.addToast(`${visible.name || "Animal"} is visible nearby. Move closer to grab.`, "info");
              } else {
                S.addToast("No capturable animal selected.", "warning");
              }
            }
          }
          break;
        case "h":
          evt.preventDefault();
          S.modifyPlayerStat("health", 5);
          UI.renderHud();
          break;
        case " ":
          evt.preventDefault();
          {
            const paused = !Boolean(S.getWorld()?.isPaused);
            S.updateWorld({ isPaused: paused });
            S.addToast(paused ? "Paused" : "Resumed", paused ? "warning" : "success");
            UI.renderHud();
          }
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
    const btnGrab = ensureGrabButton();

    if (btnInteract) {
      U.on(btnInteract, "click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        if (!state.selectedWorldTarget) {
          const firstTarget = getCurrentTilePoiList().find((poi) =>
            isLootablePoi(poi) ||
            isCapturableAnimalPoi(poi) ||
            isGrabbableResourcePoi(poi) ||
            isHostilePoi(poi) ||
            (poi.type === "npc" && poi.recruitable) ||
            poi.type === "fish_spot"
          ) || getFirstVisibleCapturablePoi() || getFirstVisibleHostilePoi();

          if (firstTarget) setSelectedWorldTarget(firstTarget);
        }

        openInteractMenu(btnInteract);
      });

      U.on(btnInteract, "contextmenu", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        openInteractMenu(btnInteract);
      });
    }

    if (btnGrab) {
      U.on(btnGrab, "click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        const target = (isCapturableAnimalPoi(state.selectedWorldTarget) || isGrabbableResourcePoi(state.selectedWorldTarget))
          ? state.selectedWorldTarget
          : getFirstCapturablePoiOnTile();

        if (!target) {
          const currentResource = getCurrentTilePoiList().find(isGrabbableResourcePoi);
          if (currentResource) {
            setSelectedWorldTarget(currentResource, { lock: true });
            grabPoiResource(currentResource);
            return;
          }
          const visible = getFirstVisibleCapturablePoi() || getVisiblePoiList(state.visiblePoiRadiusTiles).find(isGrabbableResourcePoi);
          if (visible) {
            setSelectedWorldTarget(visible);
            S.addToast(`${visible.name || "Animal"} is visible nearby, but not close enough to grab.`, "warning");
          } else {
            S.addToast("No capturable animal selected or visible nearby.", "warning");
          }
          return;
        }

        setSelectedWorldTarget(target);
        capturePoiAnimal(target);
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
      U.on(btnAttack, "click", (evt) => {
        evt.preventDefault();

        const target = state.selectedWorldTarget || getFirstHostilePoiOnTile();

        if (target) {
          setSelectedWorldTarget(target);
          startPoiCombat(target);
          return;
        }

        const COMBAT = getCombatApi();
        if (COMBAT?.startRandomEncounter) {
          COMBAT.startRandomEncounter();
          S.logActivity("You kicked the nearest mushroom and picked a fight with the consequences.", "warning");
          return;
        }

        S.addToast("No combat target available.", "warning");
      });

      U.on(btnAttack, "contextmenu", (evt) => {
        evt.preventDefault();
        const target = state.selectedWorldTarget || getFirstHostilePoiOnTile();
        if (target) {
          startPoiCombat(target);
        } else {
          S.logActivity("No selected combat target.", "info");
        }
      });
    }

    U.on(document, "pointerdown", (evt) => {
      const menu = U.byId(state.harvestMenuId);
      const btn = U.byId("btnHarvest");
      if (!state.harvestMenuOpen || !menu) return;
      if (menu.contains(evt.target) || btn?.contains(evt.target)) return;
      closeHarvestMenu();
    });

    U.on(document, "pointerdown", (evt) => {
      const menu = U.byId(state.interactMenuId);
      const btn = U.byId("btnInteract");
      if (!state.interactMenuOpen || !menu) return;
      if (menu.contains(evt.target) || btn?.contains(evt.target)) return;
      closeInteractMenu();
    });

    updateActionButtonsForTarget(null);
  }

  function bindRuntimeRenders() {
    U.eventBus.on("world:playerMoved", () => {
      drawMiniMap();
      closeHarvestMenu();
      closeInteractMenu();
      if (state.selectedWorldTarget) {
        setSelectedWorldTarget(state.selectedWorldTarget);
      } else {
        clearInteractionPrompt();
        updateActionButtonsForTarget(null);
      }
    });

    U.eventBus.on("world:tileRevealed", drawMiniMap);
    U.eventBus.on("world:tileCleared", drawMiniMap);

    U.eventBus.on("world:poiResolved", () => {
      drawMiniMap();
      updateActionButtonsForTarget(null);
    });

    U.eventBus.on("screen:changed", () => {
      if (S.getCurrentScreen() === "game") {
        drawMiniMap();
      }
      if (S.getCurrentScreen() !== "game") {
        closeHarvestMenu();
        closeInteractMenu();
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
    updateActionButtonsForTarget(null);

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
    getPoiCanvasPosition,
    getVisiblePoiList,
    getCurrentTilePoiList,
    getPoiDistanceTiles,
    isPoiOnCurrentTile,
    findPoiAtCanvasPoint,
    isGrabbableResourcePoi,
    handlePrimaryWorldAction,
    handleSecondaryWorldAction,
    setSelectedWorldTarget,
    clearInteractionPrompt,
    capturePoiAnimal,
    grabPoiResource,
    recruitPoiNpc,
    startPoiCombat,
    studyPoi,
    lootPoi,
    performInteractAction,
    performHarvestAction
  };

  window.GL_INPUT = API;

  return Object.freeze(API);
})();