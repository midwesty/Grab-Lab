window.GrabLabWorld = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const INPUT = window.GrabLabInput;

  const state = {
    initialized: false,
    running: false,
    rafId: null,
    lastFrameAt: 0,
    accumulatedMs: 0,
    weatherSeed: 0.42,
    cloudsOffset: 0,
    sporesOffset: 0,
    playerBob: 0,
    hoverPulse: 0,
    visiblePoiRadiusTiles: 5,
    labelsVisible: true,
    generatedMapKey: null,
    camera: {
      centerX: null,
      centerY: null,
      zoom: 1,
      minZoom: 0.55,
      maxZoom: 1.45,
      followPlayer: true
    },
    travel: {
      active: false,
      queuedSteps: [],
      from: null,
      to: null,
      progressMs: 0,
      stepDurationMs: 180,
      destination: null,
      destinationBiomeId: null
    }
  };

  function getCanvas() {
    return U.byId("worldCanvas");
  }

  function getFxCanvas() {
    return U.byId("fxCanvas");
  }

  function getCtx() {
    const canvas = getCanvas();
    return canvas ? canvas.getContext("2d") : null;
  }

  function getFxCtx() {
    const canvas = getFxCanvas();
    return canvas ? canvas.getContext("2d") : null;
  }

  function getTileSize() {
    return Math.max(24, Math.round(CFG.WORLD.tileSize * Number(state.camera.zoom || 1)));
  }

  function getViewportTileSpan(canvas) {
    const tileSize = getTileSize();
    return {
      cols: Math.ceil(canvas.width / tileSize) + 1,
      rows: Math.ceil(canvas.height / tileSize) + 1
    };
  }

  function syncCameraToPlayerIfNeeded() {
    const world = S.getWorld();
    if (state.camera.centerX == null || state.camera.centerY == null || state.camera.followPlayer) {
      state.camera.centerX = Number(world.currentTileX || 0);
      state.camera.centerY = Number(world.currentTileY || 0);
    }
  }

  function clampCamera() {
    const canvas = getCanvas();
    if (!canvas) return;

    const tileSize = getTileSize();
    const halfCols = Math.max(0.5, (canvas.width / tileSize) / 2);
    const halfRows = Math.max(0.5, (canvas.height / tileSize) / 2);

    state.camera.centerX = U.clamp(
      Number(state.camera.centerX ?? S.getWorld().currentTileX),
      halfCols - 0.5,
      Math.max(halfCols - 0.5, CFG.WORLD.worldWidthTiles - halfCols + 0.5)
    );

    state.camera.centerY = U.clamp(
      Number(state.camera.centerY ?? S.getWorld().currentTileY),
      halfRows - 0.5,
      Math.max(halfRows - 0.5, CFG.WORLD.worldHeightTiles - halfRows + 0.5)
    );
  }

  function getCameraOrigin() {
    const canvas = getCanvas();
    if (!canvas) return { startX: 0, startY: 0 };

    syncCameraToPlayerIfNeeded();
    clampCamera();

    const tileSize = getTileSize();
    const halfCols = (canvas.width / tileSize) / 2;
    const halfRows = (canvas.height / tileSize) / 2;

    return {
      startX: Number(state.camera.centerX || 0) - halfCols,
      startY: Number(state.camera.centerY || 0) - halfRows
    };
  }

  function getTileRect(tileX, tileY) {
    const canvas = getCanvas();
    if (!canvas) return { x: 0, y: 0, size: getTileSize() };

    const { startX, startY } = getCameraOrigin();
    const size = getTileSize();

    return {
      x: (Number(tileX || 0) - startX) * size,
      y: (Number(tileY || 0) - startY) * size,
      size
    };
  }

  function canvasToTile(canvasX, canvasY) {
    const { startX, startY } = getCameraOrigin();
    const size = getTileSize();

    return {
      x: U.clamp(Math.floor(startX + (Number(canvasX || 0) / size)), 0, CFG.WORLD.worldWidthTiles - 1),
      y: U.clamp(Math.floor(startY + (Number(canvasY || 0) / size)), 0, CFG.WORLD.worldHeightTiles - 1)
    };
  }

  function panCameraBy(deltaX = 0, deltaY = 0, options = {}) {
    syncCameraToPlayerIfNeeded();
    state.camera.followPlayer = Boolean(options.followPlayer);
    state.camera.centerX = Number(state.camera.centerX || 0) + Number(deltaX || 0);
    state.camera.centerY = Number(state.camera.centerY || 0) + Number(deltaY || 0);
    clampCamera();
    drawWorld();
    return { x: state.camera.centerX, y: state.camera.centerY };
  }

  function panCameraPixels(pixelDx = 0, pixelDy = 0) {
    const size = getTileSize();
    return panCameraBy(-Number(pixelDx || 0) / size, -Number(pixelDy || 0) / size, { followPlayer: false });
  }

  function zoomCamera(delta = 0) {
    const next = U.clamp(
      Number(state.camera.zoom || 1) + Number(delta || 0),
      Number(state.camera.minZoom || 0.55),
      Number(state.camera.maxZoom || 1.45)
    );

    state.camera.zoom = Math.round(next * 100) / 100;
    state.camera.followPlayer = false;
    clampCamera();
    drawWorld();
    return state.camera.zoom;
  }

  function recenterCameraOnPlayer() {
    const world = S.getWorld();
    state.camera.centerX = Number(world.currentTileX || 0);
    state.camera.centerY = Number(world.currentTileY || 0);
    state.camera.followPlayer = true;
    clampCamera();
    drawWorld();
    return { x: state.camera.centerX, y: state.camera.centerY };
  }

  function setMapLabelsVisible(value = true) {
    state.labelsVisible = Boolean(value);
    drawWorld();
    return state.labelsVisible;
  }

  function toggleMapLabels() {
    return setMapLabelsVisible(!state.labelsVisible);
  }

  function getControlledAvatar() {
    const activeId = S.getRuntime()?.activeAvatarId || "player";
    if (activeId === "player") {
      return { id: "player", type: "player", name: S.getPlayer()?.name || "Ranger", traits: U.toArray(S.getPlayer()?.traits), mutations: U.toArray(S.getPlayer()?.mutations) };
    }

    const companion = U.toArray(S.getParty()?.active).find((entry) => entry?.id === activeId);
    if (companion) {
      return { ...companion, type: "companion", traits: U.toArray(companion.traits), mutations: U.toArray(companion.mutations) };
    }

    return { id: "player", type: "player", name: S.getPlayer()?.name || "Ranger", traits: U.toArray(S.getPlayer()?.traits), mutations: U.toArray(S.getPlayer()?.mutations) };
  }

  function getControlledTraits() {
    const avatar = getControlledAvatar();
    return new Set([...U.toArray(avatar.traits), ...U.toArray(avatar.mutations)].map((x) => String(x).toLowerCase()));
  }

  function hasAnyTrait(traits, names = []) {
    return U.toArray(names).some((name) => traits.has(String(name).toLowerCase()));
  }

  function isBoatDeployed() {
    return Boolean(S.getBoat()?.deployed || S.getBoat()?.isDeployed);
  }

  function toggleBoatDeployed() {
    const next = !isBoatDeployed();
    S.updateBoat({ deployed: next, isDeployed: next });
    S.addToast(next ? "Boat deployed for waterways." : "Boat packed up.", next ? "success" : "info");
    S.logActivity(next ? "Mudskipper deployed. Waterway travel is available from shore or dock-adjacent tiles." : "Mudskipper packed up and ready to carry overland.", next ? "success" : "info");
    drawWorld();
    return next;
  }

  function getTileAccessRequirement(tileDef = {}) {
    const biomeId = tileDef?.biomeId || "";
    const type = tileDef?.type || "land";
    const access = String(tileDef?.access || tileDef?.accessType || "").toLowerCase();

    if (access) return access;
    if (type === "deep_water" || biomeId === "deep_water") return "aquatic";
    if (type === "water" || biomeId === "river_channel") return "water";
    if (type === "canopy" || biomeId === "canopy") return "flight";
    if (type === "highland" || biomeId === "cliffside") return "climb_or_flight";
    if (type === "cave" || biomeId === "cavern_entry") return "claws_or_tool";
    return "open";
  }

  function canControlledAvatarAccessTile(tileDef = {}) {
    const requirement = getTileAccessRequirement(tileDef);
    const traits = getControlledTraits();

    if (requirement === "open") return { ok: true };
    if (requirement === "water") {
      if (isBoatDeployed() || hasAnyTrait(traits, ["swim", "gills", "fins", "wet_skin"])) return { ok: true };
      return { ok: false, reason: "Waterway travel needs the boat deployed or a controlled creature with Swim, Gills, Fins, or Wet Skin." };
    }
    if (requirement === "aquatic") {
      if (hasAnyTrait(traits, ["gills", "fins", "swim"])) return { ok: true };
      return { ok: false, reason: "Deep water needs a controlled creature with Gills, Fins, or Swim." };
    }
    if (requirement === "flight") {
      if (hasAnyTrait(traits, ["flight", "wings", "glide"])) return { ok: true };
      return { ok: false, reason: "This high/canopy tile needs Flight or Wings." };
    }
    if (requirement === "climb_or_flight") {
      if (hasAnyTrait(traits, ["flight", "wings", "claws", "jump"])) return { ok: true };
      return { ok: false, reason: "This rough highland needs Flight, Wings, Claws, or Jump." };
    }
    if (requirement === "claws_or_tool") {
      if (hasAnyTrait(traits, ["claws", "flight"]) || S.hasItem?.("player", "field_knife", 1)) return { ok: true };
      return { ok: false, reason: "This tile needs Claws, Flight, or a useful field tool." };
    }

    return { ok: true };
  }

  function buildTravelPath(fromX, fromY, toX, toY) {
    const path = [];
    let x = Number(fromX || 0);
    let y = Number(fromY || 0);
    const tx = Number(toX || 0);
    const ty = Number(toY || 0);

    while (x !== tx || y !== ty) {
      if (CFG.WORLD.allowDiagonalMovement) {
        if (x < tx) x += 1;
        else if (x > tx) x -= 1;

        if (y < ty) y += 1;
        else if (y > ty) y -= 1;
      } else if (x !== tx) {
        x += x < tx ? 1 : -1;
      } else if (y !== ty) {
        y += y < ty ? 1 : -1;
      }

      path.push({ x, y });
      if (path.length > (CFG.WORLD.worldWidthTiles + CFG.WORLD.worldHeightTiles + 8)) break;
    }

    return path;
  }

  function stopTravel() {
    state.travel.active = false;
    state.travel.queuedSteps = [];
    state.travel.from = null;
    state.travel.to = null;
    state.travel.progressMs = 0;
    state.travel.destination = null;
    state.travel.destinationBiomeId = null;
  }

  function beginNextTravelStep() {
    const world = S.getWorld();
    const next = state.travel.queuedSteps.shift();
    if (!next) {
      stopTravel();
      return false;
    }

    state.travel.active = true;
    state.travel.from = {
      x: Number(world.currentTileX || 0),
      y: Number(world.currentTileY || 0)
    };
    state.travel.to = {
      x: Number(next.x || 0),
      y: Number(next.y || 0)
    };
    state.travel.progressMs = 0;
    return true;
  }

  function enqueueTravelToTile(tileX, tileY, biomeId = null) {
    const world = S.getWorld();
    const tx = U.clamp(Number(tileX || 0), 0, CFG.WORLD.worldWidthTiles - 1);
    const ty = U.clamp(Number(tileY || 0), 0, CFG.WORLD.worldHeightTiles - 1);
    const targetTile = S.getMapTile(tx, ty) || {};
    const access = canControlledAvatarAccessTile(targetTile);

    if (!access.ok) {
      S.addToast(access.reason || "That tile is unreachable with the current controlled party member.", "warning");
      S.logActivity(access.reason || "Tile blocked by terrain traits.", "warning");
      stopTravel();
      return false;
    }

    const path = buildTravelPath(world.currentTileX, world.currentTileY, tx, ty);

    if (!path.length) {
      stopTravel();
      return false;
    }

    const blockedStep = path.find((step) => {
      const tile = S.getMapTile(step.x, step.y) || {};
      return !canControlledAvatarAccessTile(tile).ok;
    });

    if (blockedStep) {
      const tile = S.getMapTile(blockedStep.x, blockedStep.y) || {};
      const stepAccess = canControlledAvatarAccessTile(tile);
      S.addToast(stepAccess.reason || "The path crosses unreachable terrain.", "warning");
      S.logActivity(`Route blocked at ${tile.name || `${blockedStep.x}, ${blockedStep.y}`}. ${stepAccess.reason || "Unreachable."}`, "warning");
      stopTravel();
      return false;
    }

    state.travel.queuedSteps = path;
    state.travel.destination = { x: tx, y: ty };
    state.travel.destinationBiomeId = biomeId || targetTile?.biomeId || world.currentBiomeId;
    state.travel.active = false;
    state.travel.from = null;
    state.travel.to = null;
    state.travel.progressMs = 0;

    const avatar = getControlledAvatar();
    const label = targetTile?.name || `${tx}, ${ty}`;
    S.logActivity(`${avatar.name || "Controlled party member"} traveling to ${label}.`, "info");
    return beginNextTravelStep();
  }

  function getRenderedPlayerTilePos() {
    const world = S.getWorld();

    if (!state.travel.active || !state.travel.from || !state.travel.to) {
      return {
        x: Number(world.currentTileX || 0),
        y: Number(world.currentTileY || 0)
      };
    }

    const t = U.clamp(
      state.travel.progressMs / Math.max(1, state.travel.stepDurationMs),
      0,
      1
    );

    return {
      x: U.lerp(state.travel.from.x, state.travel.to.x, t),
      y: U.lerp(state.travel.from.y, state.travel.to.y, t)
    };
  }

  function getBiomeColor(tileDef, world) {
    const biomeId = tileDef?.biomeId || world.currentBiomeId;

    switch (biomeId) {
      case "deep_water":
        return "#1d415f";
      case "river_channel":
        return "#335e73";
      case "wetland":
        return "#466d4e";
      case "mudflats":
        return "#6a5b44";
      case "fungal_grove":
        return "#5a3f5e";
      case "reed_forest":
        return "#4f6f3f";
      case "canopy":
        return "#315b35";
      case "cliffside":
        return "#4b4d52";
      case "cavern_entry":
        return "#2d2d34";
      case "field_station_island":
      default:
        return "#56724e";
    }
  }

  function getBiomeAccent(tileDef, world) {
    const biomeId = tileDef?.biomeId || world.currentBiomeId;

    switch (biomeId) {
      case "deep_water":
        return "#4c9fd1";
      case "river_channel":
        return "#6aa7c8";
      case "wetland":
        return "#7bb07f";
      case "mudflats":
        return "#ab8f61";
      case "fungal_grove":
        return "#bb7fd1";
      case "reed_forest":
        return "#97be5a";
      case "canopy":
        return "#9ee283";
      case "cliffside":
        return "#8f949d";
      case "cavern_entry":
        return "#71617a";
      case "field_station_island":
      default:
        return "#91c57a";
    }
  }

  function getFogAlpha(tileX, tileY) {
    if (!CFG.WORLD.fogOfWarEnabled) return 0;
    if (S.isTileRevealed(tileX, tileY)) return 0;
    return 0.68;
  }

  function getTileType(tileDef) {
    if (tileDef?.type) return tileDef.type;
    if (tileDef?.biomeId === "deep_water") return "deep_water";
    if (tileDef?.biomeId === "river_channel") return "water";
    return "land";
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTileBackground(ctx, tileX, tileY, world) {
    const tileDef = S.getMapTile(tileX, tileY) || {};
    const rect = getTileRect(tileX, tileY);
    const { x, y, size } = rect;

    const baseColor = getBiomeColor(tileDef, world);
    const accentColor = getBiomeAccent(tileDef, world);

    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, size, size);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(x + size * 0.32, y + size * 0.28, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + size * 0.7, y + size * 0.67, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const tileType = getTileType(tileDef);

    if (tileType === "water" || tileType === "deep_water") {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(x + size * 0.3, y + size * 0.42, size * 0.16, 0, Math.PI * 1.3);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x + size * 0.68, y + size * 0.56, size * 0.12, 0, Math.PI * 1.25);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(20,35,20,0.14)";
      for (let i = 0; i < 5; i += 1) {
        const gx = x + 8 + ((i * 11) % (size - 16));
        const gy = y + 8 + ((i * 17) % (size - 16));
        ctx.fillRect(gx, gy, 2, 6);
      }
    }

    if (tileType === "deep_water") {
      ctx.fillStyle = "rgba(20, 50, 80, 0.28)";
      ctx.fillRect(x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
    }

    if (tileType === "canopy" || tileDef?.biomeId === "canopy") {
      ctx.strokeStyle = "rgba(205, 255, 180, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.32, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (tileDef?.cleared || S.isTileCleared(tileX, tileY)) {
      ctx.strokeStyle = "rgba(146, 235, 120, 0.45)";
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x + 2, y + 2, size - 4, size - 4, 8);
      ctx.stroke();
    }

    const fogAlpha = getFogAlpha(tileX, tileY);
    if (fogAlpha > 0) {
      ctx.fillStyle = `rgba(6, 8, 7, ${fogAlpha})`;
      ctx.fillRect(x, y, size, size);
    }
  }

  function drawTileGrid(ctx, world) {
    const canvas = getCanvas();
    if (!canvas) return;

    const { startX, startY } = getCameraOrigin();
    const { cols, rows } = getViewportTileSpan(canvas);
    const firstTileX = Math.max(0, Math.floor(startX));
    const firstTileY = Math.max(0, Math.floor(startY));

    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const tileX = firstTileX + col;
        const tileY = firstTileY + row;

        if (tileX >= CFG.WORLD.worldWidthTiles || tileY >= CFG.WORLD.worldHeightTiles) continue;
        drawTileBackground(ctx, tileX, tileY, world);
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;

    for (let row = 0; row <= rows; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, row * getTileSize());
      ctx.lineTo(canvas.width, row * getTileSize());
      ctx.stroke();
    }

    for (let col = 0; col <= cols; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * getTileSize(), 0);
      ctx.lineTo(col * getTileSize(), canvas.height);
      ctx.stroke();
    }
  }

  function drawFieldStationDetails(ctx, world) {
    const currentTile = S.getCurrentMapTile();
    const canvas = getCanvas();
    if (!canvas) return;

    if (world.currentBiomeId !== "field_station_island" && currentTile?.biomeId !== "field_station_island") {
      return;
    }

    const dockTile = S.getMapNode(world.currentMapNodeId || "field_station_dock");
    if (!dockTile) return;

    const tileX = Number(dockTile.x ?? world.currentTileX);
    const tileY = Number(dockTile.y ?? world.currentTileY);
    const { x, y, size } = getTileRect(tileX, tileY);

    ctx.fillStyle = "#7b6044";
    ctx.fillRect(x + size * 0.16, y + size * 0.6, size * 0.68, size * 0.16);

    ctx.fillStyle = "#b8d6c0";
    ctx.fillRect(x + size * 0.28, y + size * 0.18, size * 0.42, size * 0.24);
    ctx.fillStyle = "#617f64";
    ctx.fillRect(x + size * 0.22, y + size * 0.1, size * 0.54, size * 0.12);

    ctx.fillStyle = "#8aa286";
    ctx.fillRect(x + size * 0.12, y + size * 0.2, size * 0.08, size * 0.22);
    ctx.fillRect(x + size * 0.74, y + size * 0.2, size * 0.08, size * 0.22);
  }

  function getPoiRenderStyle(poi) {
    switch (poi?.type) {
      case "npc":
        return {
          fill: "#ffd166",
          stroke: "rgba(28, 20, 8, 0.85)",
          labelBg: "rgba(50, 38, 10, 0.86)",
          radius: 10,
          kind: "npc"
        };
      case "capturable_animal":
      case "wild_animal":
        return {
          fill: "#95e07e",
          stroke: "rgba(10, 25, 10, 0.85)",
          labelBg: "rgba(12, 30, 12, 0.86)",
          radius: 10,
          kind: "animal"
        };
      case "fish_spot":
        return {
          fill: "#7ec8ff",
          stroke: "rgba(8, 18, 26, 0.85)",
          labelBg: "rgba(10, 24, 35, 0.86)",
          radius: 9,
          kind: "fish"
        };
      case "fungal_patch":
        return {
          fill: "#d996ff",
          stroke: "rgba(27, 12, 34, 0.88)",
          labelBg: "rgba(33, 14, 42, 0.88)",
          radius: 10,
          kind: "fungus"
        };
      case "resource":
      case "tracks":
      case "loot":
        return {
          fill: "#c8e37b",
          stroke: "rgba(18, 26, 8, 0.85)",
          labelBg: "rgba(22, 28, 10, 0.86)",
          radius: 8,
          kind: "resource"
        };
      case "dock":
        return {
          fill: "#f0c4a1",
          stroke: "rgba(42, 25, 12, 0.88)",
          labelBg: "rgba(46, 28, 14, 0.88)",
          radius: 9,
          kind: "dock"
        };
      case "base_structure":
        return {
          fill: "#82d173",
          stroke: "rgba(8, 24, 12, 0.9)",
          labelBg: "rgba(10, 30, 14, 0.9)",
          radius: 11,
          kind: "structure"
        };
      default:
        return {
          fill: "#95e07e",
          stroke: "rgba(8, 12, 10, 0.75)",
          labelBg: "rgba(5, 8, 6, 0.8)",
          radius: 9,
          kind: "default"
        };
    }
  }

  function drawNpcGlyph(ctx, px, py) {
    ctx.fillStyle = "#fff7d4";
    ctx.beginPath();
    ctx.arc(px, py - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff7d4";
    ctx.beginPath();
    ctx.moveTo(px, py + 1);
    ctx.lineTo(px, py + 9);
    ctx.moveTo(px - 5, py + 4);
    ctx.lineTo(px + 5, py + 4);
    ctx.moveTo(px - 4, py + 13);
    ctx.lineTo(px, py + 9);
    ctx.lineTo(px + 4, py + 13);
    ctx.stroke();
  }

  function drawAnimalGlyph(ctx, px, py) {
    ctx.fillStyle = "#eff8ea";
    ctx.beginPath();
    ctx.ellipse(px, py + 2, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px + 5, py - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#eff8ea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 3, py + 7);
    ctx.lineTo(px - 5, py + 12);
    ctx.moveTo(px + 2, py + 7);
    ctx.lineTo(px + 1, py + 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(px - 7, py + 1);
    ctx.quadraticCurveTo(px - 12, py - 2, px - 14, py + 2);
    ctx.stroke();
  }

  function drawFishGlyph(ctx, px, py) {
    ctx.fillStyle = "#eef8ff";
    ctx.beginPath();
    ctx.ellipse(px, py, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(px - 8, py);
    ctx.lineTo(px - 14, py - 4);
    ctx.lineTo(px - 14, py + 4);
    ctx.closePath();
    ctx.fill();
  }

  function drawFungusGlyph(ctx, px, py) {
    ctx.fillStyle = "#f7e7ff";
    ctx.beginPath();
    ctx.arc(px, py - 2, 6, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px - 2, py - 2, 4, 10);
  }

  function drawResourceGlyph(ctx, px, py) {
    ctx.fillStyle = "#f5ffe4";
    ctx.fillRect(px - 1, py - 10, 2, 14);

    ctx.beginPath();
    ctx.ellipse(px - 4, py - 3, 4, 7, -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px + 4, py - 1, 4, 7, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDockGlyph(ctx, px, py) {
    ctx.fillStyle = "#fff0e5";
    ctx.fillRect(px - 8, py - 2, 16, 5);
    ctx.fillRect(px - 5, py + 3, 2, 8);
    ctx.fillRect(px + 3, py + 3, 2, 8);
  }

  function drawPoiGlyph(ctx, poi, px, py, style) {
    switch (style.kind) {
      case "npc":
        drawNpcGlyph(ctx, px, py);
        break;
      case "animal":
        drawAnimalGlyph(ctx, px, py);
        break;
      case "fish":
        drawFishGlyph(ctx, px, py);
        break;
      case "fungus":
        drawFungusGlyph(ctx, px, py);
        break;
      case "resource":
        drawResourceGlyph(ctx, px, py);
        break;
      case "dock":
        drawDockGlyph(ctx, px, py);
        break;
      case "structure":
        ctx.fillStyle = "#102014";
        drawRoundedRect(ctx, px - 8, py - 7, 16, 14, 4);
        ctx.fill();
        ctx.fillStyle = "#edf6ef";
        ctx.fillRect(px - 5, py - 2, 10, 2);
        ctx.fillRect(px - 2, py - 5, 4, 8);
        break;
      default:
        ctx.fillStyle = "#edf6ef";
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  function isPoiResolved(poi) {
    return Boolean(poi?.captured || poi?.recruited || poi?.resolved || poi?.hidden || poi?.defeated);
  }

  function normalizePoiTile(poi, tileX, tileY) {
    return {
      ...poi,
      tileX: Number(poi.tileX ?? tileX),
      tileY: Number(poi.tileY ?? tileY)
    };
  }

  function getVisiblePoiRenderList(radius = state.visiblePoiRadiusTiles) {
    const world = S.getWorld();
    const out = [];
    const seen = new Set();
    const r = Math.max(0, Number(radius || 0));

    for (let y = Number(world.currentTileY || 0) - r; y <= Number(world.currentTileY || 0) + r; y += 1) {
      for (let x = Number(world.currentTileX || 0) - r; x <= Number(world.currentTileX || 0) + r; x += 1) {
        if (x < 0 || y < 0 || x >= CFG.WORLD.worldWidthTiles || y >= CFG.WORLD.worldHeightTiles) continue;

        const dist = Math.max(Math.abs(x - Number(world.currentTileX || 0)), Math.abs(y - Number(world.currentTileY || 0)));
        if (dist > r) continue;

        const tile = S.getMapTile(x, y);
        U.toArray(tile?.pointsOfInterest).forEach((poi) => {
          if (!poi || isPoiResolved(poi)) return;
          const normalized = normalizePoiTile(poi, x, y);
          const id = normalized.id || `${normalized.type}_${x}_${y}_${out.length}`;
          if (seen.has(id)) return;
          seen.add(id);
          out.push({ ...normalized, distanceTiles: dist });
        });
      }
    }

    return out;
  }

  function drawPointOfInterest(ctx, poi) {
    if (!poi || isPoiResolved(poi)) return;

    const world = S.getWorld();
    const tileX = Number(poi.tileX ?? world.currentTileX);
    const tileY = Number(poi.tileY ?? world.currentTileY);
    const rect = getTileRect(tileX, tileY);

    const canvas = getCanvas();
    if (canvas && (rect.x + rect.size < -32 || rect.y + rect.size < -32 || rect.x > canvas.width + 32 || rect.y > canvas.height + 32)) {
      return;
    }

    const localX = Number(poi.localX ?? rect.size * 0.5);
    const localY = Number(poi.localY ?? rect.size * 0.5);

    const px = rect.x + localX;
    const py = rect.y + localY;

    const selected = S.getRuntime()?.selectedEntityId === poi.id;
    const pulse = 1 + Math.sin(state.hoverPulse) * 0.06;
    const style = getPoiRenderStyle(poi);
    const distance = Number(poi.distanceTiles || 0);

    ctx.save();

    if (distance > 0 && poi.type !== "dock") {
      ctx.globalAlpha = distance > 3 ? 0.56 : 0.76;
    }

    ctx.fillStyle = style.fill;
    ctx.beginPath();
    ctx.arc(px, py, selected ? style.radius * 1.18 * pulse : style.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawPoiGlyph(ctx, poi, px, py, style);

    if (selected) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, (style.radius + 6) * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.labelsVisible) {
      const label = poi.shortName || poi.name || "POI";
      const labelWidth = Math.max(42, Math.min(82, String(label).length * 7 + 10));
      ctx.globalAlpha = 1;
      ctx.fillStyle = style.labelBg;
      ctx.fillRect(px - labelWidth / 2, py - 30, labelWidth, 16);

      ctx.fillStyle = "#edf6ef";
      ctx.font = "12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, px, py - 18);

      if (distance > 0 && poi.type !== "dock") {
        ctx.fillStyle = "rgba(237,246,239,0.72)";
        ctx.font = "10px Trebuchet MS, sans-serif";
        ctx.fillText(`${distance}t`, px, py + 22);
      }
    }

    ctx.restore();
  }

  function drawPois(ctx) {
    getVisiblePoiRenderList(state.visiblePoiRadiusTiles).forEach((poi) => drawPointOfInterest(ctx, poi));
  }

  function drawPlayer(ctx) {
    const pos = getRenderedPlayerTilePos();
    const { x, y, size } = getTileRect(pos.x, pos.y);
    const bob = Math.sin(state.playerBob) * 3;

    const px = x + size * 0.5;
    const py = y + size * 0.5 + bob;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(px, py + 16, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0c4a1";
    ctx.beginPath();
    ctx.arc(px, py - 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6ba263";
    drawRoundedRect(ctx, px - 12, py - 2, 24, 30, 8);
    ctx.fill();

    ctx.fillStyle = "#314737";
    ctx.fillRect(px - 9, py + 28, 6, 16);
    ctx.fillRect(px + 3, py + 28, 6, 16);

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py + 8, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawHudHints(ctx) {
    const selectedId = S.getRuntime()?.selectedEntityId;
    const poi = getVisiblePoiRenderList(state.visiblePoiRadiusTiles).find((entry) => entry?.id === selectedId);
    if (!poi) return;

    const typeLabel = U.titleCase(String(poi.type || "poi").replaceAll("_", " "));
    const distance = Number(poi.distanceTiles || 0);
    let actionHint = distance > 0 ? `${distance} tile${distance === 1 ? "" : "s"} away. Move closer to interact.` : "Tap to inspect.";

    if (distance === 0 && poi.type === "npc" && poi.recruitable) {
      actionHint = "Tap again to recruit.";
    } else if (distance === 0 && (poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable) {
      actionHint = "Use Grab to capture.";
    } else if (distance === 0 && (poi.type === "resource" || poi.type === "fungal_patch")) {
      actionHint = "Use Grab to collect this resource.";
    } else if (distance === 0 && poi.type === "base_structure") {
      actionHint = "Built base structure.";
    } else if (distance === 0 && (poi.hostile || poi.type === "combat")) {
      actionHint = "Use Attack to engage.";
    }

    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 11, 0.78)";
    ctx.fillRect(18, 18, 380, 46);
    ctx.fillStyle = "#edf6ef";
    ctx.font = "14px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${poi.name || U.titleCase(selectedId)}`, 30, 37);
    ctx.fillStyle = "#b7cbbd";
    ctx.font = "12px Trebuchet MS, sans-serif";
    ctx.fillText(`${typeLabel} • ${actionHint}`, 30, 54);
    ctx.restore();
  }

  function drawWeatherOverlay(fxCtx) {
    const world = S.getWorld();
    const canvas = getFxCanvas();
    if (!fxCtx || !canvas) return;

    fxCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (world.weather === "mist") {
      fxCtx.fillStyle = "rgba(220, 230, 235, 0.08)";
      for (let i = 0; i < 7; i += 1) {
        const y = ((i * 110) + state.cloudsOffset * 10) % canvas.height;
        fxCtx.fillRect(0, y, canvas.width, 42);
      }
    }

    if (world.weather === "rain" || world.weather === "storm") {
      fxCtx.strokeStyle = world.weather === "storm"
        ? "rgba(175, 215, 255, 0.38)"
        : "rgba(180, 220, 255, 0.24)";
      fxCtx.lineWidth = world.weather === "storm" ? 2 : 1;

      for (let i = 0; i < 140; i += 1) {
        const x = (i * 23 + state.cloudsOffset * 60) % canvas.width;
        const y = (i * 31 + state.cloudsOffset * 90) % canvas.height;
        fxCtx.beginPath();
        fxCtx.moveTo(x, y);
        fxCtx.lineTo(x - 8, y + 18);
        fxCtx.stroke();
      }
    }

    if (world.weather === "spore_drift" || world.currentBiomeId === "fungal_grove") {
      for (let i = 0; i < 60; i += 1) {
        const x = (i * 49 + state.sporesOffset * 28) % canvas.width;
        const y = (i * 57 + state.sporesOffset * 20) % canvas.height;
        const r = 2 + ((i % 4) * 0.75);

        fxCtx.fillStyle = "rgba(230, 175, 255, 0.28)";
        fxCtx.beginPath();
        fxCtx.arc(x, y, r, 0, Math.PI * 2);
        fxCtx.fill();
      }
    }

    const hour = S.getWorld().hour;
    if (hour < 6 || hour >= 19) {
      fxCtx.fillStyle = "rgba(10, 14, 28, 0.28)";
      fxCtx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawWorld() {
    const canvas = getCanvas();
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    const world = S.getWorld();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawTileGrid(ctx, world);
    drawFieldStationDetails(ctx, world);
    drawPois(ctx);
    drawPlayer(ctx);
    drawHudHints(ctx);

    drawWeatherOverlay(getFxCtx());
    INPUT.drawMiniMap();
  }

  function maybeSeedCurrentTilePoi() {
    const tile = S.getCurrentMapTile();
    if (!tile) return;

    if (!Array.isArray(tile.pointsOfInterest) || tile.pointsOfInterest.length === 0) {
      tile.pointsOfInterest = [
        {
          id: "dock_marker",
          name: "Dock",
          shortName: "Dock",
          description: "Your river boat is tied up here, somehow still floating.",
          type: "dock",
          tileX: S.getWorld().currentTileX,
          tileY: S.getWorld().currentTileY,
          localX: CFG.WORLD.tileSize * 0.52,
          localY: CFG.WORLD.tileSize * 0.7
        },
        {
          id: "fish_spot_1",
          name: "Fishing Spot",
          shortName: "Fish",
          description: "The water looks lively, or judgmental. Hard to tell.",
          type: "fish_spot",
          tileX: S.getWorld().currentTileX,
          tileY: S.getWorld().currentTileY,
          localX: CFG.WORLD.tileSize * 0.78,
          localY: CFG.WORLD.tileSize * 0.38
        }
      ];
    }
  }

  function applyNeedDecay(gameMinutes = 1) {
    const stats = S.getPlayerStats();
    const decay = CFG.PLAYER.startingNeedsDecay;
    const hours = gameMinutes / 60;

    const hungerLoss = decay.hungerPerHour * hours;
    const thirstLoss = decay.thirstPerHour * hours;
    const staminaGain = S.getWorld().isPaused ? decay.staminaRecoveryPerHourResting * hours : 0;

    S.updatePlayerStats({
      hunger: U.clamp(Number(stats.hunger || 0) - hungerLoss, 0, 100),
      thirst: U.clamp(Number(stats.thirst || 0) - thirstLoss, 0, 100),
      stamina: U.clamp(Number(stats.stamina || 0) + staminaGain, 0, Number(stats.maxStamina || 100))
    });
  }

  function updateWeatherDrift(deltaSec) {
    state.cloudsOffset += deltaSec * 0.35;
    state.sporesOffset += deltaSec * 0.28;
    state.playerBob += deltaSec * 3.2;
    state.hoverPulse += deltaSec * 4.4;
  }

  function maybeRotateWeather() {
    const world = S.getWorld();
    const runtime = S.getRuntime();
    const lastWeather = Number(runtime?.timers?.lastWeatherTickAt || 0);
    const now = U.now();

    if (now - lastWeather < CFG.TIMING.weatherTickMs) return;

    S.setRuntimeTimer("lastWeatherTickAt", now);

    const roll = Math.random();
    let next = world.weather;

    if (roll < 0.18) next = "clear";
    else if (roll < 0.34) next = "overcast";
    else if (roll < 0.5) next = "mist";
    else if (roll < 0.68) next = "rain";
    else if (roll < 0.82) next = "storm";
    else next = "spore_drift";

    if (next !== world.weather) {
      S.updateWorld({ weather: next });
      S.logActivity(`Weather shifted to ${U.titleCase(next)}.`, "info");
    }
  }

  function maybePassiveSystems() {
    const runtime = S.getRuntime();
    const lastPassive = Number(runtime?.timers?.lastPassiveTickAt || 0);
    const now = U.now();

    if (now - lastPassive < CFG.TIMING.passiveSystemTickMs) return;

    S.setRuntimeTimer("lastPassiveTickAt", now);

    const world = S.getWorld();
    if (!world.isPaused) {
      applyNeedDecay(5);
    }

    const stats = S.getPlayerStats();

    if (stats.hunger <= 15) {
      S.logActivity("You are getting dangerously hungry.", "warning");
    }

    if (stats.thirst <= 15) {
      S.logActivity("You are getting dangerously thirsty.", "warning");
    }
  }

  function tickGameClock(deltaMs) {
    const world = S.getWorld();
    if (world.isPaused) return;

    state.accumulatedMs += deltaMs;
    const msPerMinute = CFG.TIMING.realMsPerGameMinute;

    while (state.accumulatedMs >= msPerMinute) {
      state.accumulatedMs -= msPerMinute;
      S.advanceWorldMinutes(1);
    }
  }

  function advanceTravel(deltaMs) {
    if (!state.travel.active || !state.travel.from || !state.travel.to) return;

    state.travel.progressMs += deltaMs;
    if (state.travel.progressMs < state.travel.stepDurationMs) return;

    const arrivingAtDestination =
      state.travel.destination &&
      state.travel.to.x === state.travel.destination.x &&
      state.travel.to.y === state.travel.destination.y;

    const biomeId = arrivingAtDestination
      ? state.travel.destinationBiomeId
      : (S.getMapTile(state.travel.to.x, state.travel.to.y)?.biomeId || S.getWorld().currentBiomeId);

    S.movePlayerToTile(state.travel.to.x, state.travel.to.y, biomeId);

    if (!beginNextTravelStep()) {
      const tileDef = S.getMapTile(state.travel.destination?.x, state.travel.destination?.y);
      const label = tileDef?.name || `${S.getWorld().currentTileX}, ${S.getWorld().currentTileY}`;
      S.logActivity(`Arrived at ${label}.`, "success");
      UI.renderEverything();
    }
  }

  function handleFrame(timestamp) {
    if (!state.running) return;

    if (!state.lastFrameAt) {
      state.lastFrameAt = timestamp;
    }

    const deltaMs = timestamp - state.lastFrameAt;
    state.lastFrameAt = timestamp;

    const deltaSec = deltaMs / 1000;

    tickGameClock(deltaMs);
    advanceTravel(deltaMs);
    updateWeatherDrift(deltaSec);
    maybeRotateWeather();
    maybePassiveSystems();
    maybeSeedCurrentTilePoi();
    drawWorld();
    UI.renderHud();

    state.rafId = requestAnimationFrame(handleFrame);
  }

  function start() {
    if (state.running) return true;
    state.running = true;
    state.lastFrameAt = 0;
    state.accumulatedMs = 0;
    state.rafId = requestAnimationFrame(handleFrame);
    return true;
  }

  function stop() {
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    return true;
  }

  function resizeCanvases() {
    const canvas = getCanvas();
    const fxCanvas = getFxCanvas();
    const viewport = U.byId("worldViewport");

    if (!canvas || !fxCanvas || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    fxCanvas.width = Math.round(rect.width * dpr);
    fxCanvas.height = Math.round(rect.height * dpr);
    fxCanvas.style.width = `${rect.width}px`;
    fxCanvas.style.height = `${rect.height}px`;

    const ctx = getCtx();
    const fxCtx = getFxCtx();

    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fxCtx) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawWorld();
  }


  function bindWorldCameraControls() {
    const bind = (id, fn) => {
      const btn = U.byId(id);
      if (!btn || btn.dataset.worldCameraBound === "true") return;
      btn.dataset.worldCameraBound = "true";
      U.on(btn, "click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        fn();
      });
    };

    bind("btnWorldPanUp", () => panCameraBy(0, -1.5, { followPlayer: false }));
    bind("btnWorldPanDown", () => panCameraBy(0, 1.5, { followPlayer: false }));
    bind("btnWorldPanLeft", () => panCameraBy(-1.5, 0, { followPlayer: false }));
    bind("btnWorldPanRight", () => panCameraBy(1.5, 0, { followPlayer: false }));
    bind("btnWorldZoomIn", () => zoomCamera(0.15));
    bind("btnWorldZoomOut", () => zoomCamera(-0.15));
    bind("btnWorldRecenter", () => recenterCameraOnPlayer());
    bind("btnWorldToggleLabels", () => {
      const visible = toggleMapLabels();
      const btn = U.byId("btnWorldToggleLabels");
      if (btn) btn.textContent = visible ? "Labels" : "No Text";
    });
    bind("btnWorldToggleBoat", () => {
      const deployed = toggleBoatDeployed();
      const btn = U.byId("btnWorldToggleBoat");
      if (btn) btn.textContent = deployed ? "Boat On" : "Boat";
    });
  }

  function bindResize() {
    U.on(window, "resize", U.throttle(resizeCanvases, 80));
  }

  function bindWorldEvents() {
    U.eventBus.on("world:playerMoved", () => {
      maybeSeedCurrentTilePoi();
      drawWorld();
      UI.renderEverything();
    });

    U.eventBus.on("world:changed", drawWorld);
    U.eventBus.on("world:timeChanged", drawWorld);
    U.eventBus.on("screen:changed", (screenId) => {
      if (screenId === "game") {
        drawWorld();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    resizeCanvases();
    maybeSeedCurrentTilePoi();
    bindResize();
    bindWorldCameraControls();
    bindWorldEvents();
    drawWorld();
    start();

    state.initialized = true;
    U.eventBus.emit("world:initialized");
    return true;
  }

  const API = {
    init,
    start,
    stop,
    drawWorld,
    resizeCanvases,
    getTileRect,
    getTileSize,
    getCameraOrigin,
    canvasToTile,
    panCameraBy,
    panCameraPixels,
    zoomCamera,
    recenterCameraOnPlayer,
    setMapLabelsVisible,
    toggleMapLabels,
    getControlledAvatar,
    getControlledTraits,
    canControlledAvatarAccessTile,
    getTileAccessRequirement,
    toggleBoatDeployed,
    maybeSeedCurrentTilePoi,
    enqueueTravelToTile,
    getRenderedPlayerTilePos,
    isTraveling: () => state.travel.active || state.travel.queuedSteps.length > 0
  };

  window.GL_WORLD = API;

  return Object.freeze(API);
})();