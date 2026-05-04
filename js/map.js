window.GrabLabMap = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const INPUT = window.GrabLabInput;

  const state = {
    initialized: false,
    fastTravelMode: false,
    selectedTile: null,
    hoverTile: null
  };

  function getCanvas() {
    return U.byId("worldMapCanvas");
  }

  function getCtx() {
    const canvas = getCanvas();
    return canvas ? canvas.getContext("2d") : null;
  }

  function getInfoEl() {
    return U.byId("mapLocationInfo");
  }

  function getTileSize() {
    const canvas = getCanvas();
    if (!canvas) return 16;

    const cols = CFG.WORLD.worldWidthTiles;
    const rows = CFG.WORLD.worldHeightTiles;

    return Math.min(
      Math.floor(canvas.width / cols),
      Math.floor(canvas.height / rows)
    );
  }

  function resizeCanvas() {
    const canvas = getCanvas();
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = getCtx();
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    drawMap();
  }

  function getBiomeColor(tileDef = {}) {
    const biomeId = tileDef?.biomeId || "field_station_island";

    switch (biomeId) {
      case "deep_water":
        return "#1f4564";
      case "river_channel":
        return "#355f79";
      case "wetland":
        return "#4d7451";
      case "mudflats":
        return "#726147";
      case "fungal_grove":
        return "#66486b";
      case "reed_forest":
        return "#597845";
      case "canopy":
        return "#345d39";
      case "cliffside":
        return "#56585d";
      case "cavern_entry":
        return "#31333a";
      case "field_station_island":
      default:
        return "#5d7b54";
    }
  }

  function getBiomeAccent(tileDef = {}) {
    const biomeId = tileDef?.biomeId || "field_station_island";

    switch (biomeId) {
      case "deep_water":
        return "#4d9ed1";
      case "river_channel":
        return "#78b8d7";
      case "wetland":
        return "#92bf90";
      case "mudflats":
        return "#be9f6c";
      case "fungal_grove":
        return "#c58cdd";
      case "reed_forest":
        return "#a7cf63";
      case "canopy":
        return "#9ee283";
      case "cliffside":
        return "#9aa0a8";
      case "cavern_entry":
        return "#8a7496";
      case "field_station_island":
      default:
        return "#a3d188";
    }
  }

  function getTileRect(tileX, tileY) {
    const size = getTileSize();
    return {
      x: tileX * size,
      y: tileY * size,
      size
    };
  }

  function drawTile(ctx, tileX, tileY) {
    const tileDef = S.getMapTile(tileX, tileY) || {};
    const world = S.getWorld();
    const rect = getTileRect(tileX, tileY);
    const { x, y, size } = rect;

    const revealed = S.isTileRevealed(tileX, tileY);
    const cleared = S.isTileCleared(tileX, tileY);
    const current = tileX === world.currentTileX && tileY === world.currentTileY;
    const selected = state.selectedTile && state.selectedTile.x === tileX && state.selectedTile.y === tileY;
    const hover = state.hoverTile && state.hoverTile.x === tileX && state.hoverTile.y === tileY;

    const fogged = CFG.WORLD.fogOfWarEnabled && !revealed;

    ctx.fillStyle = fogged ? "#090c0a" : getBiomeColor(tileDef);
    ctx.fillRect(x, y, size, size);

    if (!fogged) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = getBiomeAccent(tileDef);
      ctx.fillRect(x + 1, y + 1, Math.max(1, size - 2), Math.max(1, size * 0.22));
      ctx.globalAlpha = 1;
    }

    if (cleared) {
      ctx.strokeStyle = "rgba(149, 224, 126, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    }

    if (hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    }

    if (selected) {
      ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }

    if (current) {
      ctx.fillStyle = "#edf6ef";
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawNodes(ctx) {
    const mapData = S.getData()?.map || {};
    const nodes = U.toArray(mapData?.nodes);
    const world = S.getWorld();
    const fastNodes = new Set(U.toArray(world.fastTravelNodes));

    nodes.forEach((node) => {
      if (node?.x == null || node?.y == null) return;

      const rect = getTileRect(Number(node.x), Number(node.y));
      const cx = rect.x + rect.size / 2;
      const cy = rect.y + rect.size / 2;
      const revealed = S.isTileRevealed(node.x, node.y) || !CFG.WORLD.fogOfWarEnabled;

      if (!revealed) return;

      const unlocked = fastNodes.has(node.id);

      ctx.save();

      ctx.fillStyle = unlocked ? "#ffd166" : "#89d1ff";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, rect.size * 0.18), 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (rect.size >= 12) {
        ctx.fillStyle = "rgba(10, 14, 11, 0.78)";
        ctx.fillRect(cx - 26, cy - rect.size * 0.6, 52, 13);
        ctx.fillStyle = "#edf6ef";
        ctx.font = "10px Trebuchet MS, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.shortName || node.name || "Node", cx, cy - rect.size * 0.6 + 10);
      }

      ctx.restore();
    });
  }

  function drawGrid(ctx) {
    const canvas = getCanvas();
    if (!canvas) return;

    const size = getTileSize();
    const cols = CFG.WORLD.worldWidthTiles;
    const rows = CFG.WORLD.worldHeightTiles;

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * size, 0);
      ctx.lineTo(x * size, rows * size);
      ctx.stroke();
    }

    for (let y = 0; y <= rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * size);
      ctx.lineTo(cols * size, y * size);
      ctx.stroke();
    }
  }

  function drawWaterfallBoundary(ctx) {
    if (!CFG.WORLD.waterfallBoundaryLocked) return;

    const size = getTileSize();
    const boundaryY = 6;
    const y = boundaryY * size;

    ctx.save();
    ctx.strokeStyle = "rgba(180, 220, 255, 0.75)";
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CFG.WORLD.worldWidthTiles * size, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(10, 14, 11, 0.76)";
    ctx.fillRect(10, y + 8, 180, 20);
    ctx.fillStyle = "#edf6ef";
    ctx.font = "12px Trebuchet MS, sans-serif";
    ctx.fillText("Waterfall Boundary", 18, y + 22);
    ctx.restore();
  }

  function drawMap() {
    const canvas = getCanvas();
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    const drawWidth = canvas.width / Math.max(1, window.devicePixelRatio || 1);
    const drawHeight = canvas.height / Math.max(1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, drawWidth, drawHeight);

    ctx.fillStyle = "#122017";
    ctx.fillRect(0, 0, drawWidth, drawHeight);

    for (let y = 0; y < CFG.WORLD.worldHeightTiles; y += 1) {
      for (let x = 0; x < CFG.WORLD.worldWidthTiles; x += 1) {
        drawTile(ctx, x, y);
      }
    }

    drawGrid(ctx);
    drawNodes(ctx);
    drawWaterfallBoundary(ctx);
  }

  function canvasToTile(evt) {
    const canvas = getCanvas();
    if (!canvas) return null;

    const pos = U.getPointerPos(evt, canvas);
    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width / rect.width) / Math.max(1, window.devicePixelRatio || 1);
    const scaleY = (canvas.height / rect.height) / Math.max(1, window.devicePixelRatio || 1);

    const size = getTileSize();

    const tileX = Math.floor((pos.x * scaleX) / size);
    const tileY = Math.floor((pos.y * scaleY) / size);

    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= CFG.WORLD.worldWidthTiles ||
      tileY >= CFG.WORLD.worldHeightTiles
    ) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  function canFastTravelTo(tileX, tileY) {
    const world = S.getWorld();
    const mapData = S.getData()?.map || {};
    const nodes = U.toArray(mapData.nodes);

    return nodes.some((node) => {
      return (
        Number(node.x) === Number(tileX) &&
        Number(node.y) === Number(tileY) &&
        U.toArray(world.fastTravelNodes).includes(node.id)
      );
    });
  }

  function getTileSummary(tileX, tileY) {
    const world = S.getWorld();
    const tile = S.getMapTile(tileX, tileY) || {};
    const revealed = S.isTileRevealed(tileX, tileY);
    const cleared = S.isTileCleared(tileX, tileY);

    const mapData = S.getData()?.map || {};
    const node = U.toArray(mapData.nodes).find(
      (n) => Number(n.x) === Number(tileX) && Number(n.y) === Number(tileY)
    );

    return {
      x: tileX,
      y: tileY,
      name: tile.name || node?.name || `Tile ${tileX}, ${tileY}`,
      biomeId: tile.biomeId || "unknown",
      type: tile.type || "land",
      revealed,
      cleared,
      current: tileX === world.currentTileX && tileY === world.currentTileY,
      node: node || null,
      canFastTravel: canFastTravelTo(tileX, tileY),
      pointsOfInterest: U.toArray(tile.pointsOfInterest)
    };
  }

  function renderSelectedTileInfo(summary) {
    const info = getInfoEl();
    if (!info || !summary) return;

    const poiList = summary.pointsOfInterest.length
      ? summary.pointsOfInterest.map((poi) => `<li>${htmlEscape(poi.name || poi.id || "POI")}</li>`).join("")
      : "<li>None</li>";

    const travelButtons = [];

    if (summary.revealed) {
      travelButtons.push(`<button id="btnMapTravelHere" class="primary-btn">Travel Here</button>`);
    }

    if (summary.canFastTravel) {
      travelButtons.push(`<button id="btnMapFastTravelHere" class="secondary-btn">Fast Travel</button>`);
    }

    info.innerHTML = `
      <h3>${htmlEscape(summary.name)}</h3>
      <p><strong>Tile:</strong> ${summary.x}, ${summary.y}</p>
      <p><strong>Biome:</strong> ${htmlEscape(U.titleCase(summary.biomeId))}</p>
      <p><strong>Type:</strong> ${htmlEscape(U.titleCase(summary.type))}</p>
      <p><strong>Revealed:</strong> ${summary.revealed ? "Yes" : "No"}</p>
      <p><strong>Cleared:</strong> ${summary.cleared ? "Yes" : "No"}</p>
      <p><strong>Current Location:</strong> ${summary.current ? "Yes" : "No"}</p>
      <p><strong>Fast Travel Node:</strong> ${summary.node ? htmlEscape(summary.node.name || summary.node.id) : "No"}</p>
      <h4>Points of Interest</h4>
      <ul>${poiList}</ul>
      <div class="admin-console-actions">${travelButtons.join("")}</div>
    `;

    const btnTravel = U.byId("btnMapTravelHere");
    const btnFastTravel = U.byId("btnMapFastTravelHere");

    if (btnTravel) {
      U.on(btnTravel, "click", () => {
        travelToTile(summary.x, summary.y, false);
      });
    }

    if (btnFastTravel) {
      U.on(btnFastTravel, "click", () => {
        travelToTile(summary.x, summary.y, true);
      });
    }
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function selectTile(tileX, tileY) {
    state.selectedTile = { x: tileX, y: tileY };
    S.setSelectedTile(state.selectedTile);

    const summary = getTileSummary(tileX, tileY);
    renderSelectedTileInfo(summary);
    drawMap();

    return summary;
  }

  function hoverTile(tileX, tileY) {
    state.hoverTile = { x: tileX, y: tileY };
    drawMap();
  }

  function clearHoverTile() {
    state.hoverTile = null;
    drawMap();
  }

  function travelToTile(tileX, tileY, fast = false) {
    const summary = getTileSummary(tileX, tileY);

    if (!summary.revealed && !fast) {
      S.addToast("You cannot travel to an unrevealed tile.", "error");
      return false;
    }

    if (fast && !summary.canFastTravel) {
      S.addToast("Fast travel is not unlocked for this tile.", "error");
      return false;
    }

    const biomeId = S.getMapTile(tileX, tileY)?.biomeId || S.getWorld().currentBiomeId;

    S.movePlayerToTile(tileX, tileY, biomeId);

    if (summary.node?.id) {
      S.updateWorld({ currentMapNodeId: summary.node.id });
    }

    if (!summary.revealed) {
      S.revealTile(tileX, tileY);
    }

    S.logActivity(
      `${fast ? "Fast traveled" : "Traveled"} to ${summary.name}.`,
      fast ? "success" : "info"
    );

    UI.renderEverything();
    INPUT.drawMiniMap();
    drawMap();

    return true;
  }

  function handleCanvasClick(evt) {
    const tile = canvasToTile(evt);
    if (!tile) return;

    const summary = selectTile(tile.x, tile.y);

    if (state.fastTravelMode && summary.canFastTravel) {
      travelToTile(tile.x, tile.y, true);
    }
  }

  function handleCanvasMove(evt) {
    const tile = canvasToTile(evt);
    if (!tile) {
      clearHoverTile();
      return;
    }

    if (!state.hoverTile || state.hoverTile.x !== tile.x || state.hoverTile.y !== tile.y) {
      hoverTile(tile.x, tile.y);
    }
  }

  function handleCanvasLeave() {
    clearHoverTile();
  }

  function bindCanvas() {
    const canvas = getCanvas();
    if (!canvas) return;

    U.on(canvas, "click", handleCanvasClick);
    U.on(canvas, "pointermove", handleCanvasMove);
    U.on(canvas, "pointerleave", handleCanvasLeave);
  }

  function bindButtons() {
    const btnFastTravelMode = U.byId("btnFastTravelMode");
    if (btnFastTravelMode) {
      U.on(btnFastTravelMode, "click", () => {
        state.fastTravelMode = !state.fastTravelMode;
        btnFastTravelMode.textContent = state.fastTravelMode ? "Fast Travel: ON" : "Fast Travel";
        S.addToast(
          state.fastTravelMode ? "Fast travel mode enabled." : "Fast travel mode disabled.",
          state.fastTravelMode ? "success" : "info"
        );
      });
    }
  }

  function bindEvents() {
    U.eventBus.on("world:playerMoved", drawMap);
    U.eventBus.on("world:tileRevealed", drawMap);
    U.eventBus.on("world:tileCleared", drawMap);
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "mapModal") {
        resizeCanvas();
        drawMap();
      }
    });

    U.on(window, "resize", U.throttle(resizeCanvas, 80));
  }

  function seededNoise(x, y, salt = 0) {
    return stableRand(Math.floor(Number(x || 0) / 4), Math.floor(Number(y || 0) / 4), salt);
  }

  function getRiverYForX(x) {
    const dock = getPrimaryDockNode();
    const baseY = Number(dock?.y ?? CFG.WORLD.startingTile.y ?? 14);
    return baseY + Math.sin(Number(x || 0) * 0.24) * 3.4 + Math.sin(Number(x || 0) * 0.09 + 2) * 2.2;
  }

  function getClusteredBiomeId(x, y) {
    const dock = getPrimaryDockNode();
    const dx = Number(x || 0) - Number(dock?.x ?? CFG.WORLD.startingTile.x ?? 12);
    const dy = Number(y || 0) - Number(dock?.y ?? CFG.WORLD.startingTile.y ?? 14);
    const distFromDock = Math.sqrt(dx * dx + dy * dy);

    if (distFromDock <= 1.15) return "field_station_island";

    const riverY = getRiverYForX(x);
    const riverDist = Math.abs(Number(y || 0) - riverY);

    // One main waterway, with a deeper middle. It runs right by the dock,
    // while the dock tile and close shore stay safe/simple.
    if (riverDist < 0.65) return distFromDock <= 3.1 ? "river_channel" : "deep_water";
    if (riverDist < 1.85) return "river_channel";

    if (distFromDock <= 5.2) return "field_station_island";

    // Ponds and one larger lake-like patch.
    const ponds = [
      { x: 20, y: 8, r: 3.4 },
      { x: 42, y: 27, r: 4.8 },
      { x: 52, y: 45, r: 3.8 },
      { x: 31, y: 49, r: 6.0 }
    ];

    for (const pond of ponds) {
      const pd = Math.sqrt((Number(x || 0) - pond.x) ** 2 + (Number(y || 0) - pond.y) ** 2);
      if (pd < pond.r * 0.42) return "deep_water";
      if (pd < pond.r) return "river_channel";
      if (pd < pond.r + 1.4) return "wetland";
    }

    const n1 = seededNoise(x, y, 21);
    const n2 = seededNoise(x + 17, y - 11, 44);
    const n3 = seededNoise(x - 23, y + 9, 77);

    // Large clustered zones instead of checkerboard tiles.
    if (Number(x) > 34 && Number(y) > 18 && n1 > 0.42) return "fungal_grove";
    if (Number(x) > 46 && Number(y) < 22 && n2 > 0.35) return "cliffside";
    if (Number(x) < 18 && Number(y) > 34 && n3 > 0.45) return "reed_forest";
    if (Number(y) > 40 && n2 < 0.38) return "mudflats";
    if (Number(x) > 22 && Number(x) < 42 && Number(y) > 8 && Number(y) < 28 && n1 < 0.52) return "wetland";
    if (Number(x) > 50 && Number(y) > 10 && Number(y) < 32 && n3 > 0.72) return "canopy";
    if (Number(x) > 45 && Number(y) > 38 && n1 > 0.7) return "cavern_entry";

    return n1 < 0.42 ? "wetland" : n1 < 0.68 ? "reed_forest" : "mudflats";
  }

  function getClusteredTileType(biomeId) {
    if (biomeId === "deep_water") return "deep_water";
    if (biomeId === "river_channel") return "water";
    if (biomeId === "mudflats") return "mud";
    if (biomeId === "canopy") return "canopy";
    if (biomeId === "cliffside") return "highland";
    if (biomeId === "cavern_entry") return "cave";
    return "land";
  }

  function getClusteredTileName(biomeId, x, y) {
    const names = {
      field_station_island: ["Safe Station Ground", "Dock Fringe", "Field Station Meadow"],
      river_channel: ["River Channel", "Shallow Waterway", "Brownwater Bend"],
      deep_water: ["Deep Water", "Dark Channel", "Cold River Pocket"],
      wetland: ["Wetland Pocket", "Marsh Flat", "Sedge Pool"],
      reed_forest: ["Reed Forest", "Cane Maze", "Whisper Reeds"],
      mudflats: ["Mud Spit", "Silt Shelf", "Low Mudbank"],
      fungal_grove: ["Fungal Grove", "Glowcap Patch", "Spore Hollow"],
      cliffside: ["Broken Cliff", "Stone Rise", "Old Bluff"],
      canopy: ["Canopy Perch", "Tree Top", "High Branches"],
      cavern_entry: ["Cavern Mouth", "Sinkhole Edge", "Root Cave"]
    };
    return stablePick(names[biomeId] || ["Wild Tile"], x, y, 19) || "Wild Tile";
  }

  function generatePoisForTile(biomeId, x, y, priorPois = []) {
    const existing = U.toArray(priorPois).filter(Boolean);
    if (existing.length) return existing;

    const pois = [];
    const plants = U.toArray(S.getData()?.plants).filter((plant) => U.toArray(plant.biomes).includes(biomeId));
    const plant = stablePick(plants, x, y, 141);

    if (plant && stableRand(x, y, 142) < 0.62) {
      pois.push({
        id: `gen_resource_${plant.id}_${x}_${y}`,
        name: plant.name || U.titleCase(plant.id),
        shortName: plant.shortName || (plant.name ? String(plant.name).slice(0, 8) : "Plant"),
        description: plant.description || "A useful wild resource grows here.",
        type: plant.id?.includes("glow") || plant.id?.includes("spore") ? "fungal_patch" : (plant.id?.includes("algae") ? "algae" : "resource"),
        plantId: plant.id,
        harvestItemId: plant.harvestItemId,
        yieldMin: plant.yieldMin ?? 1,
        yieldMax: plant.yieldMax ?? 2,
        grabbable: true,
        tileX: x,
        tileY: y,
        localX: 16 + Math.floor(stableRand(x, y, 143) * 40),
        localY: 16 + Math.floor(stableRand(x, y, 144) * 40)
      });
    }

    const animals = U.toArray(S.getData()?.animals).filter((animal) => {
      const tags = U.toArray(animal.tags);
      if (animal.habitat === biomeId) return true;
      if ((biomeId === "river_channel" || biomeId === "deep_water") && (animal.habitatType === "aquarium" || tags.includes("fish") || tags.includes("aquatic"))) return true;
      if (biomeId === "wetland" && ["field_station_island", "reed_forest"].includes(animal.habitat)) return true;
      if (biomeId === "reed_forest" && ["wetland", "field_station_island"].includes(animal.habitat)) return true;
      if (biomeId === "mudflats" && tags.includes("shell")) return true;
      if (biomeId === "fungal_grove" && (tags.includes("fungal") || tags.includes("flying"))) return true;
      if (biomeId === "canopy" && tags.includes("flying")) return true;
      return false;
    });

    if (animals.length && stableRand(x, y, 151) < 0.42) {
      const animal = stablePick(animals, x, y, 152);
      pois.push({
        id: `gen_animal_${animal.id}_${x}_${y}`,
        name: animal.name || U.titleCase(animal.id),
        shortName: animal.shortName || String(animal.name || animal.id || "Animal").slice(0, 8),
        description: animal.description || "A wild creature moves through this tile.",
        type: "capturable_animal",
        speciesId: animal.id,
        capturable: true,
        tileX: x,
        tileY: y,
        localX: 16 + Math.floor(stableRand(x, y, 153) * 40),
        localY: 16 + Math.floor(stableRand(x, y, 154) * 40)
      });
    } else if (stableRand(x, y, 155) < 0.24 && !["river_channel", "deep_water"].includes(biomeId)) {
      pois.push({
        id: `gen_tracks_${x}_${y}`,
        name: "Animal Tracks",
        shortName: "Tracks",
        description: "Fresh tracks suggest wildlife has passed through recently. Traps work better here.",
        type: "tracks",
        tileX: x,
        tileY: y,
        localX: 18 + Math.floor(stableRand(x, y, 156) * 34),
        localY: 18 + Math.floor(stableRand(x, y, 157) * 34)
      });
    }

    const encounters = U.toArray(S.getData()?.encounters).filter((encounter) => U.toArray(encounter.biomes).includes(biomeId));
    if (encounters.length && stableRand(x, y, 161) < 0.2) {
      const encounter = stablePick(encounters, x, y, 162);
      if (encounter.type === "combat") {
        pois.push({
          id: `gen_encounter_${encounter.id}_${x}_${y}`,
          name: encounter.name || "Hostile Encounter",
          shortName: "Fight",
          description: encounter.description || "Something hostile is moving here.",
          type: "combat",
          hostile: true,
          encounterId: encounter.id,
          tileX: x,
          tileY: y,
          localX: 18 + Math.floor(stableRand(x, y, 163) * 34),
          localY: 18 + Math.floor(stableRand(x, y, 164) * 34)
        });
      } else if (encounter.type === "loot") {
        pois.push({
          id: `gen_loot_${encounter.id}_${x}_${y}`,
          name: encounter.name || "Lost Cache",
          shortName: "Cache",
          description: encounter.description || "A small stash may be hidden here.",
          type: "loot",
          lootTableId: encounter.lootTableId || "starter_cache",
          tileX: x,
          tileY: y,
          localX: 18 + Math.floor(stableRand(x, y, 165) * 34),
          localY: 18 + Math.floor(stableRand(x, y, 166) * 34)
        });
      }
    }

    return pois;
  }

  function seedFallbackMapData() {
    const mapData = S.getData()?.map || {};
    if (!Array.isArray(mapData.tiles)) mapData.tiles = [];
    if (!Array.isArray(mapData.nodes)) mapData.nodes = [];

    const width = Number(CFG.WORLD.worldWidthTiles || 64);
    const height = Number(CFG.WORLD.worldHeightTiles || 64);
    const existing = new Map(mapData.tiles.map((tile) => [`${Number(tile.x)},${Number(tile.y)}`, tile]));

    const nextTiles = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const key = `${x},${y}`;
        const prior = existing.get(key) || {};
        const biomeId = getClusteredBiomeId(x, y);
        const type = getClusteredTileType(biomeId);

        nextTiles.push({
          id: prior.id || `tile_${x}_${y}`,
          ...prior,
          x,
          y,
          biomeId,
          type,
          access: prior.access || null,
          name: getClusteredTileName(biomeId, x, y),
          pointsOfInterest: generatePoisForTile(biomeId, x, y, prior.pointsOfInterest)
        });
      }
    }

    mapData.tiles = nextTiles;
    mapData.proceduralLayoutVersion = "clustered-waterway-v1";

    if (!mapData.nodes.some((node) => node.id === "field_station_dock")) {
      mapData.nodes.unshift({
        id: "field_station_dock",
        name: "Field Station Dock",
        shortName: "Dock",
        x: CFG.WORLD.startingTile.x,
        y: CFG.WORLD.startingTile.y
      });
    }

    // Keep named landmarks, but add a few useful clustered-world anchors for later builder editing.
    const ensureNode = (node) => {
      if (!mapData.nodes.some((entry) => entry.id === node.id)) mapData.nodes.push(node);
    };

    ensureNode({ id: "upper_pond", name: "Upper Pond", shortName: "Pond", x: 20, y: 8 });
    ensureNode({ id: "fungal_front", name: "Fungal Front", shortName: "Fungus", x: 42, y: 25 });
    ensureNode({ id: "canopy_rise", name: "Canopy Rise", shortName: "Canopy", x: 53, y: 18 });
    ensureNode({ id: "mud_lake", name: "Mud Lake", shortName: "Lake", x: 31, y: 49 });

    S.replaceDataBucket("map", mapData);

    const world = S.getWorld();
    S.revealTile(world.currentTileX, world.currentTileY);
    S.revealTile(world.currentTileX + 1, world.currentTileY);
    S.revealTile(world.currentTileX - 1, world.currentTileY);
    S.revealTile(world.currentTileX, world.currentTileY + 1);
    S.revealTile(world.currentTileX, world.currentTileY - 1);
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackMapData();
    bindCanvas();
    bindButtons();
    bindEvents();

    resizeCanvas();

    const world = S.getWorld();
    selectTile(world.currentTileX, world.currentTileY);

    state.initialized = true;
    U.eventBus.emit("map:initialized");
    return true;
  }

  const API = {
    init,
    drawMap,
    resizeCanvas,
    selectTile,
    hoverTile,
    clearHoverTile,
    travelToTile,
    getTileSummary,
    seedFallbackMapData
  };

  window.GL_MAP = API;

  return Object.freeze(API);
})();