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

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getTileSize() {
    const canvas = getCanvas();
    if (!canvas) return 16;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const drawWidth = canvas.width / dpr;
    const drawHeight = canvas.height / dpr;

    const cols = CFG.WORLD.worldWidthTiles;
    const rows = CFG.WORLD.worldHeightTiles;

    return Math.max(4, Math.min(
      Math.floor(drawWidth / cols),
      Math.floor(drawHeight / rows)
    ));
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
      x: Number(tileX || 0) * size,
      y: Number(tileY || 0) * size,
      size
    };
  }

  function stableHash(x, y, salt = 0) {
    let n = Number(x || 0) * 374761393 + Number(y || 0) * 668265263 + Number(salt || 0) * 982451653;
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

  function getPrimaryDockNode() {
    const mapData = S.getData()?.map || {};
    return (
      U.toArray(mapData.nodes).find((node) => node.id === "field_station_dock") ||
      U.toArray(mapData.nodes).find((node) => String(node.id || "").includes("dock")) ||
      {
        id: "field_station_dock",
        name: "Field Station Dock",
        shortName: "Dock",
        x: CFG.WORLD.startingTile?.x ?? 12,
        y: CFG.WORLD.startingTile?.y ?? 14
      }
    );
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
        shortName: plant.shortName || "Plant",
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

    return {
      id: `gen_animal_${animal.id}_${x}_${y}_${index}`,
      name: animal.name || U.titleCase(animal.id),
      shortName: animal.shortName || String(animal.name || animal.id || "Animal").slice(0, 8),
      description: animal.description || "A wild creature moves through this tile.",
      type: "capturable_animal",
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

    return {
      id: `gen_event_${encounter.id}_${x}_${y}`,
      name: encounter.name || "Odd Sign",
      shortName: "Event",
      description: encounter.description || "Something unusual happened here.",
      type: encounter.type === "loot" ? "loot" : "tracks",
      encounterId: encounter.id,
      lootTableId: encounter.lootTableId || null,
      tileX: x,
      tileY: y,
      localX: 18 + Math.floor(stableRand(x, y, 83) * 34),
      localY: 18 + Math.floor(stableRand(x, y, 84) * 34)
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

  function ensureExpandedMapData() {
    const original = S.getData()?.map || {};
    const mapData = {
      ...original,
      nodes: U.toArray(original.nodes),
      tiles: U.toArray(original.tiles)
    };

    const byKey = new Map();
    mapData.tiles.forEach((tile) => {
      byKey.set(`${Number(tile.x)},${Number(tile.y)}`, {
        ...tile,
        pointsOfInterest: U.toArray(tile.pointsOfInterest)
      });
    });

    for (let y = 0; y < CFG.WORLD.worldHeightTiles; y += 1) {
      for (let x = 0; x < CFG.WORLD.worldWidthTiles; x += 1) {
        const key = `${x},${y}`;
        if (!byKey.has(key)) {
          byKey.set(key, createGeneratedTile(x, y));
        }
      }
    }

    const dock = getPrimaryDockNode();
    const dockX = Number(dock.x ?? CFG.WORLD.startingTile?.x ?? 12);
    const dockY = Number(dock.y ?? CFG.WORLD.startingTile?.y ?? 14);

    if (!mapData.nodes.some((node) => node.id === "field_station_dock")) {
      mapData.nodes.unshift({
        id: "field_station_dock",
        name: "Field Station Dock",
        shortName: "Dock",
        x: dockX,
        y: dockY
      });
    }

    const dockKey = `${dockX},${dockY}`;
    const dockTile = byKey.get(dockKey) || createGeneratedTile(dockX, dockY);

    dockTile.biomeId = "field_station_island";
    dockTile.type = "land";
    dockTile.name = dockTile.name || "Field Station Alpha";
    dockTile.pointsOfInterest = U.toArray(dockTile.pointsOfInterest);

    if (!dockTile.pointsOfInterest.some((poi) => poi.type === "dock")) {
      dockTile.pointsOfInterest.unshift({
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

    byKey.set(dockKey, dockTile);

    mapData.tiles = [...byKey.values()].sort((a, b) => {
      const yd = Number(a.y) - Number(b.y);
      if (yd !== 0) return yd;
      return Number(a.x) - Number(b.x);
    });

    S.replaceDataBucket("map", mapData);

    return mapData;
  }

  function getBaseExpansionTiles() {
    if (window.GL_WORLD?.getBaseExpansionTiles) {
      return U.toArray(window.GL_WORLD.getBaseExpansionTiles());
    }

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
        category: "dock"
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
    const hasDock = U.toArray(tileDef.pointsOfInterest).some((poi) => poi.type === "dock");
    const hasNode = U.toArray(S.getData()?.map?.nodes).some((node) => Number(node.x) === tileX && Number(node.y) === tileY);

    const fogged = CFG.WORLD.fogOfWarEnabled && !revealed && !hasDock && !hasNode;

    ctx.fillStyle = fogged ? "#090c0a" : getBiomeColor(tileDef);
    ctx.fillRect(x, y, size, size);

    if (!fogged) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = getBiomeAccent(tileDef);
      ctx.fillRect(x + 1, y + 1, Math.max(1, size - 2), Math.max(1, size * 0.22));
      ctx.globalAlpha = 1;
    }

    if (U.toArray(tileDef.pointsOfInterest).length && !fogged) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(x + size * 0.18, y + size * 0.18, Math.max(2, size * 0.08), 0, Math.PI * 2);
      ctx.fill();
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

  function drawMapGlyph(ctx, kind, cx, cy, r) {
    ctx.save();
    ctx.lineWidth = Math.max(1, r * 0.18);

    if (kind === "dock") {
      ctx.fillStyle = "#fff0e5";
      ctx.fillRect(cx - r * 0.7, cy - r * 0.2, r * 1.4, r * 0.4);
      ctx.fillRect(cx - r * 0.42, cy + r * 0.2, r * 0.18, r * 0.72);
      ctx.fillRect(cx + r * 0.24, cy + r * 0.2, r * 0.18, r * 0.72);
    } else if (kind === "animal") {
      ctx.fillStyle = "#eff8ea";
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.12, r * 0.65, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.5, cy - r * 0.25, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "fish") {
      ctx.fillStyle = "#eef8ff";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.72, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.72, cy);
      ctx.lineTo(cx - r * 1.18, cy - r * 0.4);
      ctx.lineTo(cx - r * 1.18, cy + r * 0.4);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "combat") {
      ctx.fillStyle = "#ffe1e1";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.75);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "base") {
      ctx.fillStyle = "#fff4bd";
      ctx.fillRect(cx - r * 0.7, cy - r * 0.45, r * 1.4, r * 0.9);
      ctx.fillStyle = "#8b623d";
      ctx.fillRect(cx - r * 0.22, cy, r * 0.44, r * 0.45);
    } else {
      ctx.fillStyle = "#f5ffe4";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function getPoiKind(poi) {
    if (!poi) return "resource";
    if (poi.type === "dock") return "dock";
    if (poi.type === "fish_spot") return "fish";
    if (poi.type === "capturable_animal" || poi.type === "wild_animal") return "animal";
    if (poi.type === "combat" || poi.hostile || poi.type === "hostile" || poi.type === "enemy") return "combat";
    return "resource";
  }

  function drawPoiMarkers(ctx) {
    const mapData = S.getData()?.map || {};
    const size = getTileSize();

    U.toArray(mapData.tiles).forEach((tile) => {
      const pois = U.toArray(tile.pointsOfInterest).filter((poi) => !poi.resolved && !poi.hidden);
      if (!pois.length) return;

      const tileX = Number(tile.x);
      const tileY = Number(tile.y);
      const revealed = S.isTileRevealed(tileX, tileY);
      const hasDock = pois.some((poi) => poi.type === "dock");

      if (CFG.WORLD.fogOfWarEnabled && !revealed && !hasDock) return;

      const rect = getTileRect(tileX, tileY);
      const cx = rect.x + rect.size * 0.5;
      const cy = rect.y + rect.size * 0.5;
      const dockPoi = pois.find((poi) => poi.type === "dock");
      const animalPoi = pois.find((poi) => poi.type === "capturable_animal" || poi.type === "wild_animal");
      const fishPoi = pois.find((poi) => poi.type === "fish_spot");
      const combatPoi = pois.find((poi) => poi.type === "combat" || poi.hostile);
      const chosen = dockPoi || combatPoi || animalPoi || fishPoi || pois[0];

      const kind = getPoiKind(chosen);
      const r = Math.max(3, size * (kind === "dock" ? 0.22 : 0.16));

      ctx.save();

      if (!revealed && hasDock) {
        ctx.globalAlpha = 0.95;
      }

      ctx.fillStyle =
        kind === "dock" ? "#f0c4a1" :
        kind === "combat" ? "#f76b6b" :
        kind === "animal" ? "#95e07e" :
        kind === "fish" ? "#7ec8ff" :
        "#c8e37b";

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      drawMapGlyph(ctx, kind, cx, cy, r * 0.75);

      ctx.restore();
    });
  }

  function drawBaseExpansionMarkers(ctx) {
    const size = getTileSize();
    const expansions = getBaseExpansionTiles();

    expansions.forEach((entry) => {
      const tileX = Number(entry.tileX);
      const tileY = Number(entry.tileY);

      if (tileX < 0 || tileY < 0 || tileX >= CFG.WORLD.worldWidthTiles || tileY >= CFG.WORLD.worldHeightTiles) return;

      const rect = getTileRect(tileX, tileY);
      const cx = rect.x + rect.size / 2;
      const cy = rect.y + rect.size / 2;
      const r = Math.max(4, size * 0.26);

      ctx.save();
      ctx.fillStyle = entry.offsetIndex === 0 ? "rgba(255, 209, 102, 0.95)" : "rgba(130, 209, 115, 0.92)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawMapGlyph(ctx, entry.offsetIndex === 0 ? "dock" : "base", cx, cy, r * 0.72);

      ctx.restore();
    });
  }

  function drawNodes(ctx) {
    const mapData = S.getData()?.map || {};
    const nodes = U.toArray(mapData?.nodes);
    const world = S.getWorld();
    const fastNodes = new Set(U.toArray(world.fastTravelNodes));
    const size = getTileSize();

    nodes.forEach((node) => {
      if (node?.x == null || node?.y == null) return;

      const rect = getTileRect(Number(node.x), Number(node.y));
      const cx = rect.x + rect.size / 2;
      const cy = rect.y + rect.size / 2;
      const isDock = String(node.id || "").includes("dock") || String(node.name || "").toLowerCase().includes("dock");
      const revealed = S.isTileRevealed(node.x, node.y) || !CFG.WORLD.fogOfWarEnabled || isDock;
      const unlocked = fastNodes.has(node.id);

      if (!revealed) return;

      ctx.save();

      ctx.fillStyle = isDock ? "#f0c4a1" : unlocked ? "#ffd166" : "#89d1ff";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, rect.size * 0.2), 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isDock) {
        drawMapGlyph(ctx, "dock", cx, cy, Math.max(4, rect.size * 0.16));
      }

      if (size >= 10 || isDock) {
        const label = node.shortName || node.name || "Node";
        const labelWidth = Math.max(34, Math.min(72, String(label).length * 6 + 10));
        ctx.fillStyle = "rgba(10, 14, 11, 0.82)";
        ctx.fillRect(cx - labelWidth / 2, cy - rect.size * 0.75, labelWidth, 13);
        ctx.fillStyle = "#edf6ef";
        ctx.font = "10px Trebuchet MS, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, cy - rect.size * 0.75 + 10);
      }

      ctx.restore();
    });
  }

  function drawGrid(ctx) {
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

    if (size >= 10) {
      ctx.fillStyle = "rgba(10, 14, 11, 0.76)";
      ctx.fillRect(10, y + 8, 180, 20);
      ctx.fillStyle = "#edf6ef";
      ctx.font = "12px Trebuchet MS, sans-serif";
      ctx.fillText("Waterfall Boundary", 18, y + 22);
    }

    ctx.restore();
  }

  function drawLegend(ctx, drawWidth, drawHeight) {
    const items = [
      ["Dock/Base", "#f0c4a1"],
      ["Animal", "#95e07e"],
      ["Fish", "#7ec8ff"],
      ["Threat", "#f76b6b"],
      ["Resource", "#c8e37b"]
    ];

    const boxW = 150;
    const boxH = items.length * 16 + 12;
    const x = Math.max(8, drawWidth - boxW - 8);
    const y = Math.max(8, drawHeight - boxH - 8);

    ctx.save();
    ctx.fillStyle = "rgba(10,14,11,0.76)";
    ctx.fillRect(x, y, boxW, boxH);

    ctx.font = "10px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";

    items.forEach((item, index) => {
      const rowY = y + 14 + index * 16;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(x + 12, rowY - 3, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#edf6ef";
      ctx.fillText(item[0], x + 22, rowY);
    });

    ctx.restore();
  }

  function drawMap() {
    const canvas = getCanvas();
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const drawWidth = canvas.width / dpr;
    const drawHeight = canvas.height / dpr;

    ctx.clearRect(0, 0, drawWidth, drawHeight);

    ctx.fillStyle = "#122017";
    ctx.fillRect(0, 0, drawWidth, drawHeight);

    for (let y = 0; y < CFG.WORLD.worldHeightTiles; y += 1) {
      for (let x = 0; x < CFG.WORLD.worldWidthTiles; x += 1) {
        drawTile(ctx, x, y);
      }
    }

    drawGrid(ctx);
    drawPoiMarkers(ctx);
    drawBaseExpansionMarkers(ctx);
    drawNodes(ctx);
    drawWaterfallBoundary(ctx);
    drawLegend(ctx, drawWidth, drawHeight);
  }

  function canvasToTile(evt) {
    const canvas = getCanvas();
    if (!canvas) return null;

    const pos = U.getPointerPos(evt, canvas);
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const scaleX = (canvas.width / rect.width) / dpr;
    const scaleY = (canvas.height / rect.height) / dpr;

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

    const baseExpansion = getBaseExpansionTiles().find((entry) => {
      return Number(entry.tileX) === Number(tileX) && Number(entry.tileY) === Number(tileY);
    });

    const hasDock = U.toArray(tile.pointsOfInterest).some((poi) => poi.type === "dock");
    const alwaysVisible = Boolean(hasDock || baseExpansion || node);

    return {
      x: tileX,
      y: tileY,
      name: tile.name || baseExpansion?.name || node?.name || `Tile ${tileX}, ${tileY}`,
      biomeId: tile.biomeId || "unknown",
      type: tile.type || "land",
      revealed,
      visible: revealed || alwaysVisible,
      cleared,
      current: tileX === world.currentTileX && tileY === world.currentTileY,
      node: node || null,
      baseExpansion: baseExpansion || null,
      canFastTravel: canFastTravelTo(tileX, tileY),
      pointsOfInterest: U.toArray(tile.pointsOfInterest)
    };
  }

  function renderSelectedTileInfo(summary) {
    const info = getInfoEl();
    if (!info || !summary) return;

    const poiList = summary.pointsOfInterest.length
      ? summary.pointsOfInterest.map((poi) => {
        const label = poi.type === "capturable_animal" || poi.type === "wild_animal"
          ? `🟢 ${poi.name || poi.id || "Animal"}`
          : poi.type === "dock"
            ? `⚓ ${poi.name || "Dock"}`
            : poi.type === "fish_spot"
              ? `🐟 ${poi.name || "Fishing Spot"}`
              : poi.type === "combat" || poi.hostile
                ? `⚠️ ${poi.name || "Threat"}`
                : `• ${poi.name || poi.id || "POI"}`;

        return `<li>${htmlEscape(label)}</li>`;
      }).join("")
      : "<li>None</li>";

    const travelButtons = [];

    if (summary.revealed || summary.visible) {
      travelButtons.push(`<button id="btnMapTravelHere" class="primary-btn">Travel Here</button>`);
    }

    if (summary.canFastTravel) {
      travelButtons.push(`<button id="btnMapFastTravelHere" class="secondary-btn">Fast Travel</button>`);
    }

    info.innerHTML = `
      <h3>${htmlEscape(summary.name)}</h3>
      <p><strong>Tile:</strong> ${summary.x}, ${summary.y}</p>
      <p><strong>Biome:</strong> ${htmlEscape(U.titleCase(String(summary.biomeId).replaceAll("_", " ")))}</p>
      <p><strong>Type:</strong> ${htmlEscape(U.titleCase(summary.type))}</p>
      <p><strong>Visible:</strong> ${summary.visible ? "Yes" : "No"}</p>
      <p><strong>Revealed:</strong> ${summary.revealed ? "Yes" : "No"}</p>
      <p><strong>Cleared:</strong> ${summary.cleared ? "Yes" : "No"}</p>
      <p><strong>Current Location:</strong> ${summary.current ? "Yes" : "No"}</p>
      <p><strong>Fast Travel Node:</strong> ${summary.node ? htmlEscape(summary.node.name || summary.node.id) : "No"}</p>
      ${summary.baseExpansion ? `<p><strong>Base Expansion:</strong> ${htmlEscape(summary.baseExpansion.name || summary.baseExpansion.structureId || "Built Area")}</p>` : ""}
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

    if (!summary.revealed && !summary.visible && !fast) {
      S.addToast("You cannot travel to an unrevealed tile.", "error");
      return false;
    }

    if (fast && !summary.canFastTravel) {
      S.addToast("Fast travel is not unlocked for this tile.", "error");
      return false;
    }

    const biomeId = S.getMapTile(tileX, tileY)?.biomeId || S.getWorld().currentBiomeId;

    if (window.GL_WORLD?.enqueueTravelToTile && !fast) {
      window.GL_WORLD.enqueueTravelToTile(tileX, tileY, biomeId);
    } else {
      S.movePlayerToTile(tileX, tileY, biomeId);
    }

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
    U.eventBus.on("base:changed", drawMap);

    U.eventBus.on("data:bucketChanged", ({ key }) => {
      if (key === "map" || key === "animals" || key === "plants" || key === "encounters") {
        drawMap();
      }
    });

    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "mapModal") {
        ensureExpandedMapData();
        resizeCanvas();
        drawMap();
      }
    });

    U.on(window, "resize", U.throttle(resizeCanvas, 80));
  }

  function seedFallbackMapData() {
    ensureExpandedMapData();

    const world = S.getWorld();
    S.revealTile(world.currentTileX, world.currentTileY);
    S.revealTile(world.currentTileX + 1, world.currentTileY);
    S.revealTile(world.currentTileX - 1, world.currentTileY);
    S.revealTile(world.currentTileX, world.currentTileY + 1);
    S.revealTile(world.currentTileX, world.currentTileY - 1);

    return true;
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
    seedFallbackMapData,
    ensureExpandedMapData
  };

  window.GL_MAP = API;

  return Object.freeze(API);
})();