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
    generatedMapKey: null,
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

    const startX = U.clamp(
      world.currentTileX - halfCols,
      0,
      Math.max(0, CFG.WORLD.worldWidthTiles - cols)
    );

    const startY = U.clamp(
      world.currentTileY - halfRows,
      0,
      Math.max(0, CFG.WORLD.worldHeightTiles - rows)
    );

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

  function stableHash(x, y, salt = 0) {
    let n = Number(x || 0) * 374761393 + Number(y || 0) * 668265263 + Number(salt || 0) * 2147483647;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return Math.abs(n);
  }

  function stableRand(x, y, salt = 0) {
    return (stableHash(x, y, salt) % 100000) / 100000;
  }

  function stablePick(list = [], x = 0, y = 0, salt = 0) {
    const safe = U.toArray(list);
    if (!safe.length) return null;
    return safe[stableHash(x, y, salt) % safe.length];
  }

  function isPoiResolved(poi) {
    return Boolean(poi?.captured || poi?.recruited || poi?.resolved || poi?.hidden || poi?.defeated);
  }

  function isSpecialStarterPoi(poi) {
    if (!poi) return false;

    if (poi.type === "dock") return true;
    if (poi.speciesId === "marsy_marsupial") return true;
    if (poi.speciesId === "dock_turtle") return true;
    if (poi.role === "starter_companion") return true;
    if (poi.id === "dock_marker") return true;

    return false;
  }

  function getGeneratedBiomeId(x, y) {
    const dock = getPrimaryDockNode();
    const dx = Number(x || 0) - Number(dock?.x ?? 12);
    const dy = Number(y || 0) - Number(dock?.y ?? 14);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const noise = stableRand(x, y, 11);

    if (distance <= 1.2) return "field_station_island";

    if ((x + y) % 7 === 0 || noise < 0.16) return "river_channel";
    if (noise < 0.32) return "wetland";
    if (noise < 0.48) return "reed_forest";
    if (noise < 0.62) return "mudflats";
    if (noise < 0.78) return "fungal_grove";
    if (noise < 0.89) return "cliffside";
    return "cavern_entry";
  }

  function getGeneratedTileType(biomeId) {
    if (biomeId === "river_channel") return "water";
    if (biomeId === "mudflats") return "mud";
    if (biomeId === "cavern_entry") return "cave";
    return "land";
  }

  function getGeneratedTileName(biomeId, x, y) {
    const options = {
      field_station_island: ["Station Fringe", "Dock Approach", "Field Station Ground"],
      river_channel: ["River Channel", "Deep Current", "Flooded Cut", "Brownwater Lane"],
      wetland: ["Wetland Pocket", "Marsh Flat", "Sedge Pool", "Mosquito Choir"],
      mudflats: ["Mud Spit", "Silt Shelf", "Boggy Flats", "Low Mudbank"],
      fungal_grove: ["Fungal Grove", "Glowcap Patch", "Spore Hollow", "Bloom Rot"],
      reed_forest: ["Reed Forest", "Cane Maze", "Whisper Reeds", "Reed Bank"],
      cliffside: ["Broken Cliff", "Stone Rise", "Old Bluff", "Cracked Ledge"],
      cavern_entry: ["Cavern Mouth", "Sinkhole Edge", "Dark Hollow", "Root Cave"]
    };

    return stablePick(options[biomeId] || ["Wild Tile"], x, y, 19);
  }

  function getAnimalsForBiome(biomeId) {
    return U.toArray(S.getData()?.animals).filter((animal) => {
      const habitat = animal?.habitat || "";
      const tags = U.toArray(animal?.tags);
      const habitatType = animal?.habitatType || "general";

      if (habitat === biomeId) return true;
      if (biomeId === "river_channel" && (habitatType === "aquarium" || tags.includes("fish") || tags.includes("aquatic"))) return true;
      if (biomeId === "wetland" && ["field_station_island", "reed_forest"].includes(habitat)) return true;
      if (biomeId === "reed_forest" && ["wetland", "field_station_island"].includes(habitat)) return true;
      if (biomeId === "mudflats" && tags.includes("shell")) return true;
      if (biomeId === "fungal_grove" && (tags.includes("fungal") || tags.includes("flying"))) return true;

      return false;
    });
  }

  function getResourcePoiForBiome(biomeId, x, y) {
    const plants = U.toArray(S.getData()?.plants).filter((plant) => U.toArray(plant.biomes).includes(biomeId));
    const plant = stablePick(plants, x, y, 41);

    if (plant) {
      return {
        id: `gen_resource_${plant.id}_${x}_${y}`,
        name: plant.name || U.titleCase(plant.id),
        shortName: plant.name ? String(plant.name).slice(0, 7) : "Plant",
        description: plant.description || "A useful wild resource grows here.",
        type: plant.id?.includes("glow") || plant.id?.includes("spore") ? "fungal_patch" : "resource",
        plantId: plant.id,
        tileX: x,
        tileY: y,
        localX: 18 + Math.floor(stableRand(x, y, 42) * 34),
        localY: 18 + Math.floor(stableRand(x, y, 43) * 34)
      };
    }

    if (biomeId === "river_channel") {
      return {
        id: `gen_fish_spot_${x}_${y}`,
        name: "Fishing Spot",
        shortName: "Fish",
        description: "A promising fishing spot ripples against the current.",
        type: "fish_spot",
        tileX: x,
        tileY: y,
        localX: 20 + Math.floor(stableRand(x, y, 44) * 36),
        localY: 18 + Math.floor(stableRand(x, y, 45) * 36)
      };
    }

    return {
      id: `gen_tracks_${x}_${y}`,
      name: "Animal Tracks",
      shortName: "Tracks",
      description: "Fresh tracks suggest wildlife has passed through recently.",
      type: "tracks",
      tileX: x,
      tileY: y,
      localX: 18 + Math.floor(stableRand(x, y, 46) * 34),
      localY: 18 + Math.floor(stableRand(x, y, 47) * 34)
    };
  }

  function getAnimalPoiForBiome(biomeId, x, y, index = 0) {
    const animals = getAnimalsForBiome(biomeId);
    const animal = stablePick(animals, x, y, 60 + index);

    if (!animal) return null;

    const isFish =
      animal.habitatType === "aquarium" ||
      U.toArray(animal.tags).includes("fish") ||
      U.toArray(animal.tags).includes("aquatic");

    const kind = isFish ? "capturable_animal" : (U.toArray(animal.tags).includes("predator") ? "wild_animal" : "capturable_animal");

    return {
      id: `gen_animal_${animal.id}_${x}_${y}_${index}`,
      name: animal.name || U.titleCase(animal.id),
      shortName: animal.shortName || String(animal.name || animal.id || "Animal").slice(0, 8),
      description: animal.description || "A wild creature moves through this tile.",
      type: kind,
      speciesId: animal.id,
      capturable: true,
      recruitable: false,
      tileX: x,
      tileY: y,
      localX: 16 + Math.floor(stableRand(x, y, 61 + index) * 40),
      localY: 16 + Math.floor(stableRand(x, y, 62 + index) * 40)
    };
  }

  function getEncounterPoiForBiome(biomeId, x, y) {
    const encounters = U.toArray(S.getData()?.encounters).filter((encounter) => {
      return U.toArray(encounter?.biomes).includes(biomeId);
    });

    const encounter = stablePick(encounters, x, y, 80);
    if (!encounter) return null;

    if (encounter.type === "combat") {
      return {
        id: `gen_encounter_${encounter.id}_${x}_${y}`,
        name: encounter.name || "Hostile Encounter",
        shortName: "Fight",
        description: encounter.description || "Something hostile is moving here.",
        type: "combat",
        hostile: true,
        encounterId: encounter.id,
        tileX: x,
        tileY: y,
        localX: 18 + Math.floor(stableRand(x, y, 81) * 34),
        localY: 18 + Math.floor(stableRand(x, y, 82) * 34)
      };
    }

    if (encounter.type === "loot") {
      return {
        id: `gen_loot_${encounter.id}_${x}_${y}`,
        name: encounter.name || "Lost Cache",
        shortName: "Cache",
        description: encounter.description || "A small stash may be hidden here.",
        type: "loot",
        lootTableId: encounter.lootTableId || "starter_cache",
        tileX: x,
        tileY: y,
        localX: 18 + Math.floor(stableRand(x, y, 83) * 34),
        localY: 18 + Math.floor(stableRand(x, y, 84) * 34)
      };
    }

    return {
      id: `gen_event_${encounter.id}_${x}_${y}`,
      name: encounter.name || "Odd Sign",
      shortName: "Event",
      description: encounter.description || "Something unusual happened here.",
      type: encounter.type === "hazard" ? "fungal_patch" : "tracks",
      encounterId: encounter.id,
      tileX: x,
      tileY: y,
      localX: 18 + Math.floor(stableRand(x, y, 85) * 34),
      localY: 18 + Math.floor(stableRand(x, y, 86) * 34)
    };
  }

  function createGeneratedTile(x, y) {
    const biomeId = getGeneratedBiomeId(x, y);
    const tile = {
      id: `tile_${x}_${y}`,
      x,
      y,
      biomeId,
      type: getGeneratedTileType(biomeId),
      name: getGeneratedTileName(biomeId, x, y),
      generated: true,
      pointsOfInterest: []
    };

    const poiRoll = stableRand(x, y, 100);
    const animalRoll = stableRand(x, y, 101);
    const eventRoll = stableRand(x, y, 102);

    if (poiRoll < 0.58) {
      tile.pointsOfInterest.push(getResourcePoiForBiome(biomeId, x, y));
    }

    if (animalRoll < 0.44) {
      const animalPoi = getAnimalPoiForBiome(biomeId, x, y, 0);
      if (animalPoi) tile.pointsOfInterest.push(animalPoi);
    }

    if (animalRoll > 0.82) {
      const animalPoi = getAnimalPoiForBiome(biomeId, x, y, 1);
      if (animalPoi) tile.pointsOfInterest.push(animalPoi);
    }

    if (eventRoll < 0.22) {
      const encounterPoi = getEncounterPoiForBiome(biomeId, x, y);
      if (encounterPoi) tile.pointsOfInterest.push(encounterPoi);
    }

    tile.pointsOfInterest = tile.pointsOfInterest.filter(Boolean);

    return tile;
  }

  function getPrimaryDockNode() {
    return (
      S.getMapNode("field_station_dock") ||
      U.toArray(S.getData()?.map?.nodes).find((node) => node.id?.includes("dock")) ||
      { id: "field_station_dock", name: "Field Station Dock", shortName: "Dock", x: 12, y: 14 }
    );
  }

  function getBaseExpansionTiles() {
    const dock = getPrimaryDockNode();
    const dockX = Number(dock.x ?? 12);
    const dockY = Number(dock.y ?? 14);
    const base = S.getBase();
    const structures = U.toArray(base?.structures);
    const habitats = U.toArray(base?.habitats);

    const offsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: -2, y: 0 },
      { x: 0, y: -2 }
    ];

    const entries = [
      {
        id: "dock_core",
        structureId: "dock_core",
        name: "Dock",
        category: "dock",
        tileX: dockX,
        tileY: dockY
      },
      ...structures.map((entry) => ({
        ...entry,
        category: S.getStructureDef(entry.structureId)?.category || "structure"
      })),
      ...habitats.map((entry) => ({
        ...entry,
        structureId: entry.structureId || entry.habitatType || "habitat",
        name: entry.name || U.titleCase(entry.habitatType || "Habitat"),
        category: "habitat"
      }))
    ];

    return entries.map((entry, index) => {
      const offset = offsets[index % offsets.length];
      return {
        ...entry,
        tileX: dockX + offset.x,
        tileY: dockY + offset.y,
        offsetIndex: index
      };
    });
  }

  function getBaseExpansionCoordMap() {
    const map = new Map();

    getBaseExpansionTiles().forEach((entry) => {
      map.set(`${Number(entry.tileX)},${Number(entry.tileY)}`, entry);
    });

    return map;
  }

  function ensureDockMarkerOnTile(tile, dockX, dockY) {
    tile.pointsOfInterest = U.toArray(tile.pointsOfInterest);

    if (!tile.pointsOfInterest.some((poi) => poi.type === "dock" || poi.id === "dock_marker")) {
      tile.pointsOfInterest.unshift({
        id: "dock_marker",
        name: "Dock",
        shortName: "Dock",
        description: "Your river boat is tied up here, somehow still floating.",
        type: "dock",
        tileX: dockX,
        tileY: dockY,
        localX: 33,
        localY: 45
      });
    }

    return tile;
  }

  function sanitizeBaseExpansionPoisInMap(map) {
    const expansionMap = getBaseExpansionCoordMap();

    map.tiles = U.toArray(map.tiles).map((tile) => {
      const key = `${Number(tile.x)},${Number(tile.y)}`;
      const expansion = expansionMap.get(key);

      if (!expansion) return tile;

      const nextTile = {
        ...tile,
        biomeId: "field_station_island",
        type: "land",
        name: expansion.offsetIndex === 0 ? (tile.name || "Field Station Dock") : (expansion.name || "Base Expansion"),
        pointsOfInterest: []
      };

      const pois = U.toArray(tile.pointsOfInterest);

      if (expansion.offsetIndex === 0) {
        nextTile.pointsOfInterest = pois.filter((poi) => {
          if (isPoiResolved(poi)) return false;
          return isSpecialStarterPoi(poi);
        });

        const dock = getPrimaryDockNode();
        ensureDockMarkerOnTile(nextTile, Number(dock.x ?? 12), Number(dock.y ?? 14));
      }

      return nextTile;
    });

    return map;
  }

  function clearBaseExpansionPois() {
    const map = U.deepClone(S.getData()?.map || { nodes: [], tiles: [] });
    if (!Array.isArray(map.tiles)) return false;

    const before = JSON.stringify(map.tiles.map((tile) => ({
      x: tile.x,
      y: tile.y,
      pointsOfInterest: U.toArray(tile.pointsOfInterest).map((poi) => poi.id || poi.name || poi.type)
    })));

    sanitizeBaseExpansionPoisInMap(map);

    const after = JSON.stringify(map.tiles.map((tile) => ({
      x: tile.x,
      y: tile.y,
      pointsOfInterest: U.toArray(tile.pointsOfInterest).map((poi) => poi.id || poi.name || poi.type)
    })));

    if (before !== after) {
      S.replaceDataBucket("map", map);
      return true;
    }

    return false;
  }

  function ensureExpandedMapData() {
    const map = U.deepClone(S.getData()?.map || { nodes: [], tiles: [] });
    const nodes = U.toArray(map.nodes);
    const tiles = U.toArray(map.tiles);
    const width = Number(CFG.WORLD.worldWidthTiles || 30);
    const height = Number(CFG.WORLD.worldHeightTiles || 30);
    const key = `${width}x${height}_${tiles.length}_${nodes.length}`;

    if (state.generatedMapKey === key && S.getMapTile(width - 1, height - 1)) {
      clearBaseExpansionPois();
      return false;
    }

    const byKey = new Map();
    tiles.forEach((tile) => {
      byKey.set(`${Number(tile.x)},${Number(tile.y)}`, {
        ...tile,
        pointsOfInterest: U.toArray(tile.pointsOfInterest)
      });
    });

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tileKey = `${x},${y}`;
        if (!byKey.has(tileKey)) {
          byKey.set(tileKey, createGeneratedTile(x, y));
        }
      }
    }

    const dock = getPrimaryDockNode();

    if (!nodes.some((node) => node.id === "field_station_dock")) {
      nodes.unshift({
        id: "field_station_dock",
        name: "Field Station Dock",
        shortName: "Dock",
        x: Number(dock.x ?? 12),
        y: Number(dock.y ?? 14)
      });
    }

    const dockKey = `${Number(dock.x ?? 12)},${Number(dock.y ?? 14)}`;
    const dockTile = byKey.get(dockKey) || createGeneratedTile(Number(dock.x ?? 12), Number(dock.y ?? 14));

    dockTile.biomeId = "field_station_island";
    dockTile.type = "land";
    dockTile.name = dockTile.name || "Field Station Alpha";
    dockTile.pointsOfInterest = U.toArray(dockTile.pointsOfInterest).filter((poi) => {
      if (isPoiResolved(poi)) return false;
      return isSpecialStarterPoi(poi);
    });

    ensureDockMarkerOnTile(dockTile, Number(dock.x ?? 12), Number(dock.y ?? 14));

    byKey.set(dockKey, dockTile);

    map.nodes = nodes;
    map.tiles = [...byKey.values()].sort((a, b) => {
      const yd = Number(a.y) - Number(b.y);
      if (yd !== 0) return yd;
      return Number(a.x) - Number(b.x);
    });

    sanitizeBaseExpansionPoisInMap(map);

    S.replaceDataBucket("map", map);
    state.generatedMapKey = `${width}x${height}_${map.tiles.length}_${map.nodes.length}`;

    return true;
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

    const world = S.getWorld();
    const distance = Math.max(
      Math.abs(Number(tileX) - Number(world.currentTileX || 0)),
      Math.abs(Number(tileY) - Number(world.currentTileY || 0))
    );

    if (distance <= state.visiblePoiRadiusTiles) return 0.22;
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
    ctx.arcTo(x, y, x + r, y, r);
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

    if (tileDef?.generated) {
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fillRect(x + 1, y + 1, size - 2, 3);
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

  function drawStructureGlyph(ctx, entry, cx, cy, size) {
    const id = String(entry.structureId || entry.id || "").toLowerCase();
    const category = String(entry.category || "").toLowerCase();

    ctx.save();
    ctx.lineWidth = 2;

    if (id.includes("aquarium") || id.includes("tank") || id.includes("water")) {
      ctx.fillStyle = "#77c8e8";
      ctx.strokeStyle = "#d9f6ff";
      ctx.fillRect(cx - size * 0.22, cy - size * 0.14, size * 0.44, size * 0.28);
      ctx.strokeRect(cx - size * 0.22, cy - size * 0.14, size * 0.44, size * 0.28);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = "#ecfbff";
      ctx.fill();
    } else if (id.includes("pen") || category.includes("habitat")) {
      ctx.strokeStyle = "#f6df9f";
      ctx.strokeRect(cx - size * 0.23, cy - size * 0.2, size * 0.46, size * 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.23, cy);
      ctx.lineTo(cx + size * 0.23, cy);
      ctx.moveTo(cx, cy - size * 0.2);
      ctx.lineTo(cx, cy + size * 0.2);
      ctx.stroke();
    } else if (id.includes("stove")) {
      ctx.fillStyle = "#8c8c86";
      ctx.fillRect(cx - size * 0.18, cy - size * 0.16, size * 0.36, size * 0.32);
      ctx.fillStyle = "#ff9f4d";
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.03, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else if (id.includes("workbench")) {
      ctx.fillStyle = "#9b6c43";
      ctx.fillRect(cx - size * 0.25, cy - size * 0.08, size * 0.5, size * 0.16);
      ctx.fillRect(cx - size * 0.2, cy + size * 0.08, size * 0.05, size * 0.2);
      ctx.fillRect(cx + size * 0.15, cy + size * 0.08, size * 0.05, size * 0.2);
    } else if (id.includes("storage") || id.includes("crate")) {
      ctx.fillStyle = "#bd8c59";
      ctx.fillRect(cx - size * 0.18, cy - size * 0.18, size * 0.36, size * 0.36);
      ctx.strokeStyle = "#ffedc2";
      ctx.strokeRect(cx - size * 0.18, cy - size * 0.18, size * 0.36, size * 0.36);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.18, cy);
      ctx.lineTo(cx + size * 0.18, cy);
      ctx.stroke();
    } else if (id.includes("dock")) {
      drawDockGlyph(ctx, cx, cy);
    } else {
      ctx.fillStyle = "#d7f0c6";
      ctx.fillRect(cx - size * 0.16, cy - size * 0.16, size * 0.32, size * 0.32);
      ctx.fillStyle = "#6f8d62";
      ctx.fillRect(cx - size * 0.12, cy - size * 0.26, size * 0.24, size * 0.12);
    }

    ctx.restore();
  }

  function drawFieldStationDetails(ctx, world) {
    const dock = getPrimaryDockNode();
    if (!dock) return;

    const expansions = getBaseExpansionTiles();

    expansions.forEach((entry) => {
      const tileX = Number(entry.tileX);
      const tileY = Number(entry.tileY);

      if (tileX < 0 || tileY < 0 || tileX >= CFG.WORLD.worldWidthTiles || tileY >= CFG.WORLD.worldHeightTiles) return;

      const { x, y, size } = getTileRect(tileX, tileY);

      if (x + size < 0 || y + size < 0 || x > getCanvas().width || y > getCanvas().height) return;

      ctx.save();

      ctx.fillStyle = entry.offsetIndex === 0 ? "rgba(240, 196, 161, 0.28)" : "rgba(130, 209, 115, 0.18)";
      ctx.fillRect(x + 4, y + 4, size - 8, size - 8);

      ctx.strokeStyle = entry.offsetIndex === 0 ? "rgba(255, 235, 205, 0.55)" : "rgba(185, 240, 160, 0.38)";
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x + 5, y + 5, size - 10, size - 10, 8);
      ctx.stroke();

      const cx = x + size * 0.5;
      const cy = y + size * 0.48;

      drawStructureGlyph(ctx, entry, cx, cy, size);

      const label = entry.name || getStructureLabel(entry.structureId);
      const short = String(label).length > 10 ? String(label).slice(0, 10) : String(label);
      const labelWidth = Math.max(46, Math.min(78, short.length * 7 + 10));

      ctx.fillStyle = "rgba(14, 20, 16, 0.82)";
      ctx.fillRect(cx - labelWidth / 2, y + size - 20, labelWidth, 15);

      ctx.fillStyle = "#edf6ef";
      ctx.font = "11px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(short, cx, y + size - 9);

      ctx.restore();
    });

    void world;
  }

  function getStructureLabel(structureId) {
    if (!structureId) return "Base";
    const def = S.getStructureDef?.(structureId);
    return def?.name || U.titleCase(String(structureId).replaceAll("_", " "));
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
      case "combat":
      case "hostile":
      case "enemy":
      case "fungal_enemy":
        return {
          fill: "#f76b6b",
          stroke: "rgba(42, 8, 8, 0.88)",
          labelBg: "rgba(46, 10, 10, 0.88)",
          radius: 10,
          kind: "fungus"
        };
      case "dock":
        return {
          fill: "#f0c4a1",
          stroke: "rgba(42, 25, 12, 0.88)",
          labelBg: "rgba(46, 28, 14, 0.88)",
          radius: 9,
          kind: "dock"
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
      default:
        ctx.fillStyle = "#edf6ef";
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
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
    const expansionMap = getBaseExpansionCoordMap();

    const pushPoi = (poi, tileX, tileY, force = false) => {
      if (!poi || isPoiResolved(poi)) return;

      const coordKey = `${Number(tileX)},${Number(tileY)}`;
      const expansion = expansionMap.get(coordKey);

      if (expansion && expansion.offsetIndex !== 0) return;
      if (expansion && expansion.offsetIndex === 0 && !isSpecialStarterPoi(poi)) return;

      const normalized = normalizePoiTile(poi, tileX, tileY);
      const id = normalized.id || `${normalized.type}_${tileX}_${tileY}_${out.length}`;
      if (seen.has(id)) return;

      const distance = Math.max(
        Math.abs(Number(normalized.tileX) - Number(world.currentTileX || 0)),
        Math.abs(Number(normalized.tileY) - Number(world.currentTileY || 0))
      );

      if (!force && distance > radius) return;

      seen.add(id);
      out.push({
        ...normalized,
        distanceTiles: distance
      });
    };

    for (let y = Number(world.currentTileY || 0) - radius; y <= Number(world.currentTileY || 0) + radius; y += 1) {
      for (let x = Number(world.currentTileX || 0) - radius; x <= Number(world.currentTileX || 0) + radius; x += 1) {
        if (x < 0 || y < 0 || x >= CFG.WORLD.worldWidthTiles || y >= CFG.WORLD.worldHeightTiles) continue;

        const tile = S.getMapTile(x, y);
        U.toArray(tile?.pointsOfInterest).forEach((poi) => pushPoi(poi, x, y, false));
      }
    }

    U.toArray(S.getData()?.map?.tiles).forEach((tile) => {
      U.toArray(tile.pointsOfInterest).forEach((poi) => {
        if (poi?.type === "dock") {
          pushPoi(poi, Number(tile.x), Number(tile.y), true);
        }
      });
    });

    return out;
  }

  function drawPointOfInterest(ctx, poi) {
    if (!poi || isPoiResolved(poi)) return;

    const world = S.getWorld();
    const tileX = Number(poi.tileX ?? world.currentTileX);
    const tileY = Number(poi.tileY ?? world.currentTileY);
    const rect = getTileRect(tileX, tileY);

    if (rect.x + rect.size < 0 || rect.y + rect.size < 0 || rect.x > getCanvas().width || rect.y > getCanvas().height) {
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
      ctx.globalAlpha = distance > 3 ? 0.58 : 0.76;
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

    ctx.restore();
  }

  function drawPois(ctx) {
    const pois = getVisiblePoiRenderList(state.visiblePoiRadiusTiles);
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
    const selectedId = S.getRuntime()?.selectedEntityId;
    const poi = getVisiblePoiRenderList(state.visiblePoiRadiusTiles)
      .find((entry) => entry?.id === selectedId);

    if (!poi) return;

    const typeLabel = U.titleCase(String(poi.type || "poi").replaceAll("_", " "));
    const distance = Number(poi.distanceTiles || 0);
    let actionHint = distance > 0 ? `${distance} tile${distance === 1 ? "" : "s"} away. Move closer to interact.` : "Tap to inspect.";

    if (distance === 0 && poi.type === "npc" && poi.recruitable) {
      actionHint = "Tap again to recruit.";
    } else if (distance === 0 && (poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable) {
      actionHint = "Use Grab to capture.";
    } else if (distance === 0 && (poi.hostile || poi.type === "combat")) {
      actionHint = "Use Attack to engage.";
    }

    ctx.save();
    ctx.fillStyle = "rgba(10, 15, 11, 0.78)";
    ctx.fillRect(18, 18, 360, 46);
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

    const expansion = getBaseExpansionCoordMap().get(`${Number(tile.x ?? S.getWorld().currentTileX)},${Number(tile.y ?? S.getWorld().currentTileY)}`);
    if (expansion) return;

    if (!Array.isArray(tile.pointsOfInterest) || tile.pointsOfInterest.length === 0) {
      tile.pointsOfInterest = [
        {
          id: `generated_tracks_${S.getWorld().currentTileX}_${S.getWorld().currentTileY}`,
          name: "Animal Tracks",
          shortName: "Tracks",
          description: "Fresh tracks suggest wildlife has passed through recently.",
          type: "tracks",
          tileX: S.getWorld().currentTileX,
          tileY: S.getWorld().currentTileY,
          localX: CFG.WORLD.tileSize * 0.35,
          localY: CFG.WORLD.tileSize * 0.42
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

    U.eventBus.on("base:changed", () => {
      clearBaseExpansionPois();
      drawWorld();
    });

    U.eventBus.on("world:poiResolved", () => {
      ensureExpandedMapData();
      drawWorld();
    });

    U.eventBus.on("data:bucketChanged", ({ key }) => {
      if (key === "map" || key === "animals" || key === "plants" || key === "encounters") {
        drawWorld();
      }
    });

    U.eventBus.on("screen:changed", (screenId) => {
      if (screenId === "game") {
        drawWorld();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    ensureExpandedMapData();
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
    ensureExpandedMapData,
    clearBaseExpansionPois,
    sanitizeBaseExpansionPoisInMap,
    getVisiblePoiRenderList,
    getBaseExpansionTiles,
    getBaseExpansionCoordMap,
    enqueueTravelToTile,
    getRenderedPlayerTilePos,
    isTraveling: () => state.travel.active || state.travel.queuedSteps.length > 0
  };

  window.GL_WORLD = API;

  return Object.freeze(API);
})();