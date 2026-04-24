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

  function getViewportTileSpan(canvas) {
    const tileSize = CFG.WORLD.tileSize;
    return {
      cols: Math.ceil(canvas.width / tileSize),
      rows: Math.ceil(canvas.height / tileSize)
    };
  }

  function getCameraOrigin() {
    const world = S.getWorld();
    const canvas = getCanvas();
    if (!canvas) return { startX: 0, startY: 0 };

    const { cols, rows } = getViewportTileSpan(canvas);

    const halfCols = Math.floor(cols / 2);
    const halfRows = Math.floor(rows / 2);

    const startX = U.clamp(world.currentTileX - halfCols, 0, Math.max(0, CFG.WORLD.worldWidthTiles - cols));
    const startY = U.clamp(world.currentTileY - halfRows, 0, Math.max(0, CFG.WORLD.worldHeightTiles - rows));

    return { startX, startY };
  }

  function getTileRect(tileX, tileY) {
    const canvas = getCanvas();
    if (!canvas) return { x: 0, y: 0, size: CFG.WORLD.tileSize };

    const { startX, startY } = getCameraOrigin();
    const size = CFG.WORLD.tileSize;

    return {
      x: (tileX - startX) * size,
      y: (tileY - startY) * size,
      size
    };
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
    const path = buildTravelPath(world.currentTileX, world.currentTileY, tx, ty);

    if (!path.length) {
      stopTravel();
      return false;
    }

    state.travel.queuedSteps = path;
    state.travel.destination = { x: tx, y: ty };
    state.travel.destinationBiomeId = biomeId || S.getMapTile(tx, ty)?.biomeId || world.currentBiomeId;
    state.travel.active = false;
    state.travel.from = null;
    state.travel.to = null;
    state.travel.progressMs = 0;

    const tileDef = S.getMapTile(tx, ty);
    const label = tileDef?.name || `${tx}, ${ty}`;
    S.logActivity(`Traveling to ${label}.`, "info");
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

    const t = U.clamp(state.travel.progressMs / Math.max(1, state.travel.stepDurationMs), 0, 1);
    return {
      x: U.lerp(state.travel.from.x, state.travel.to.x, t),
      y: U.lerp(state.travel.from.y, state.travel.to.y, t)
    };
  }

  function getBiomeColor(tileDef, world) {
    const biomeId = tileDef?.biomeId || world.currentBiomeId;

    switch (biomeId) {
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

    if (tileType === "water") {
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

    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const tileX = startX + col;
        const tileY = startY + row;

        if (tileX >= CFG.WORLD.worldWidthTiles || tileY >= CFG.WORLD.worldHeightTiles) continue;
        drawTileBackground(ctx, tileX, tileY, world);
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;

    for (let row = 0; row <= rows; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, row * CFG.WORLD.tileSize);
      ctx.lineTo(canvas.width, row * CFG.WORLD.tileSize);
      ctx.stroke();
    }

    for (let col = 0; col <= cols; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * CFG.WORLD.tileSize, 0);
      ctx.lineTo(col * CFG.WORLD.tileSize, canvas.height);
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

  function drawPointOfInterest(ctx, poi) {
    if (!poi) return;

    const world = S.getWorld();
    const tileX = Number(poi.tileX ?? world.currentTileX);
    const tileY = Number(poi.tileY ?? world.currentTileY);
    const rect = getTileRect(tileX, tileY);

    const localX = Number(poi.localX ?? rect.size * 0.5);
    const localY = Number(poi.localY ?? rect.size * 0.5);

    const px = rect.x + localX;
    const py = rect.y + localY;

    const selected = state.selectedPoiId === poi.id || S.getRuntime()?.selectedEntityId === poi.id;
    const pulse = 1 + Math.sin(state.hoverPulse) * 0.06;

    ctx.save();

    ctx.fillStyle = poi.type === "fish_spot"
      ? "#7ec8ff"
      : poi.type === "fungal_patch"
        ? "#d996ff"
        : poi.type === "loot"
          ? "#ffd166"
          : "#95e07e";

    ctx.beginPath();
    ctx.arc(px, py, selected ? 11 * pulse : 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(8, 12, 10, 0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (selected) {
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 15 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(5, 8, 6, 0.8)";
    ctx.fillRect(px - 28, py - 28, 56, 16);
    ctx.fillStyle = "#edf6ef";
    ctx.font = "12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(poi.shortName || poi.name || "POI", px, py - 16);

    ctx.restore();
  }

  function drawPois(ctx) {
    const tile = S.getCurrentMapTile();
    const pois = U.toArray(tile?.pointsOfInterest);
    pois.forEach((poi) => drawPointOfInterest(ctx, poi));
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
    const target = S.getRuntime()?.selectedEntityId;
    if (!target) return;

    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 11, 0.76)";
    ctx.fillRect(18, 18, 260, 36);
    ctx.fillStyle = "#edf6ef";
    ctx.font = "14px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Selected: ${U.titleCase(target)}`, 30, 41);
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
    getCameraOrigin,
    maybeSeedCurrentTilePoi,
    enqueueTravelToTile,
    getRenderedPlayerTilePos,
    isTraveling: () => state.travel.active || state.travel.queuedSteps.length > 0
  };

  window.GL_WORLD = API;

  return Object.freeze(API);
})();