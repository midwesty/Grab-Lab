window.GrabLabInput = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const M = window.GrabLabModal;
  const A = window.GrabLabAudio;

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
    interactionRadiusPx: 36
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
    return {
      x: Math.floor(x / tileSize),
      y: Math.floor(y / tileSize)
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
      const px = Number(poi.canvasX ?? poi.x ?? 0);
      const py = Number(poi.canvasY ?? poi.y ?? 0);

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

    U.setText(title, target.name || "Point of Interest");
    U.setText(body, target.description || `Tap to inspect ${target.name || "this spot"}.`);
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

    S.movePlayerToTile(safeX, safeY, biomeId);

    const label = tileDef?.name || `${safeX}, ${safeY}`;
    S.logActivity(`Moved to tile ${label}.`, "info");
    UI.renderEverything();
  }

  function inspectPointOfInterest(poi) {
    if (!poi) {
      S.logActivity("Nothing interesting there. Rude.", "info");
      return;
    }

    const detailText = poi.description || "It looks promising, suspicious, or both.";
    S.logActivity(`Inspected ${poi.name || "point of interest"}: ${detailText}`, "info");
    S.addToast(`Inspected ${poi.name || "point of interest"}.`, "info");
    setSelectedWorldTarget(poi);
    A.playSfx("ui_confirm").catch?.(() => {});
    UI.renderEverything();
  }

  function contextActionAtPoint(canvasX, canvasY) {
    const poi = findPoiAtCanvasPoint(canvasX, canvasY);
    if (poi) {
      S.logActivity(`Context action opened for ${poi.name || "POI"} (placeholder).`, "info");
      S.addToast(`Context action: ${poi.name || "POI"}`, "warning");
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
      U.on(btnHarvest, "contextmenu", (evt) => {
        evt.preventDefault();
        S.logActivity("Secondary harvest action placeholder.", "info");
      });
    }

    if (btnAttack) {
      U.on(btnAttack, "contextmenu", (evt) => {
        evt.preventDefault();
        S.logActivity("Secondary attack action placeholder.", "info");
      });
    }
  }

  function bindRuntimeRenders() {
    U.eventBus.on("world:playerMoved", () => {
      drawMiniMap();
      clearInteractionPrompt();
    });

    U.eventBus.on("world:tileRevealed", drawMiniMap);
    U.eventBus.on("world:tileCleared", drawMiniMap);
    U.eventBus.on("screen:changed", () => {
      if (S.getCurrentScreen() === "game") {
        drawMiniMap();
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
    clearInteractionPrompt
  };

  window.GL_INPUT = API;

  return Object.freeze(API);
})();