window.GrabLabAdmin = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const SAVE = window.GrabLabSaveLoad;
  const P = window.GrabLabPlayer;
  const AN = window.GrabLabAnimals;
  const BR = window.GrabLabBreeding;
  const CB = window.GrabLabCombat;
  const CR = window.GrabLabCrafting;
  const BD = window.GrabLabBuild;
  const INV = window.GrabLabInventory;
  const FI = window.GrabLabFishing;
  const TU = window.GrabLabTutorial;

  const state = {
    initialized: false
  };

  function logAdmin(message, type = "info") {
    S.logActivity(`[ADMIN] ${message}`, type);
    const text = `${type.toUpperCase()}: ${message}`;
    S.pushAdminCommand(text);
    renderAdminLog();
    return text;
  }

  function getAdminLogLines() {
    return U.toArray(S.getRuntime()?.admin?.commandHistory)
      .map((entry) => entry.text)
      .slice(0, 100);
  }

  function renderAdminLog() {
    const host = U.byId("adminLog");
    if (!host) return;

    const lines = getAdminLogLines();
    U.setText(host, lines.length ? lines.join("\n") : "No admin commands run yet.");
  }

  function setGodMode(enabled = true) {
    S.setAdminFlag("godMode", Boolean(enabled));
    S.updatePlayerStats({
      health: Number(S.getPlayerStats()?.maxHealth || 100),
      stamina: Number(S.getPlayerStats()?.maxStamina || 100),
      hunger: 100,
      thirst: 100,
      infection: 0,
      morale: 100,
      focus: 100,
      hygiene: 100
    });
    logAdmin(`God mode ${enabled ? "enabled" : "disabled"}.`, enabled ? "success" : "warning");
    UI.renderEverything();
    return enabled;
  }

  function fullHeal() {
    P.fullHeal();
    UI.renderEverything();
    return logAdmin("Fully healed player.", "success");
  }

  function fillNeeds() {
    P.fullyRestoreNeeds();
    UI.renderEverything();
    return logAdmin("Filled hunger, thirst, stamina, morale, focus, and hygiene.", "success");
  }

  function clearInfection() {
    S.updatePlayerStats({ infection: 0 });
    UI.renderEverything();
    return logAdmin("Cleared infection.", "success");
  }

  function addXp(amount = 100) {
    P.awardPlayerXp(Number(amount || 0), "admin");
    UI.renderEverything();
    return logAdmin(`Added ${amount} player XP.`, "success");
  }

  function addFunds(amount = 100) {
    const player = S.getPlayer();
    const nextFunds = Number(player?.funds || CFG.PLAYER.startingFunds || 0) + Number(amount || 0);
    S.updatePlayer({ funds: nextFunds });
    UI.renderEverything();
    return logAdmin(`Added ${amount} funds.`, "success");
  }

  function setTime(hour = 6, minute = 0, day = null) {
    const world = S.getWorld();
    S.setWorldTime(day ?? world.day, Number(hour || 0), Number(minute || 0));
    UI.renderEverything();
    return logAdmin(`Set time to Day ${S.getWorld().day}, ${U.formatClock(S.getWorld().hour, S.getWorld().minute)}.`, "info");
  }

  function timeMorning() {
    return setTime(7, 0);
  }

  function timeNight() {
    return setTime(21, 0);
  }

  function setWeather(weatherId = "clear") {
    const safe = CFG.WEATHER_TYPES.includes(weatherId) ? weatherId : "clear";
    S.updateWorld({ weather: safe });
    UI.renderEverything();
    return logAdmin(`Set weather to ${safe}.`, "info");
  }

  function revealMap() {
    for (let y = 0; y < CFG.WORLD.worldHeightTiles; y += 1) {
      for (let x = 0; x < CFG.WORLD.worldWidthTiles; x += 1) {
        S.revealTile(x, y);
      }
    }
    S.setAdminFlag("mapRevealed", true);
    UI.renderEverything();
    return logAdmin("Revealed the full map.", "success");
  }

  function clearCurrentTile() {
    const world = S.getWorld();
    S.clearTile(world.currentTileX, world.currentTileY);
    UI.renderEverything();
    return logAdmin(`Cleared tile ${world.currentTileX}, ${world.currentTileY}.`, "success");
  }

  function clearAllTiles() {
    for (let y = 0; y < CFG.WORLD.worldHeightTiles; y += 1) {
      for (let x = 0; x < CFG.WORLD.worldWidthTiles; x += 1) {
        S.clearTile(x, y);
      }
    }
    UI.renderEverything();
    return logAdmin("Marked all tiles as cleared.", "success");
  }

  function teleport(x = 0, y = 0) {
    const tx = U.clamp(Number(x || 0), 0, CFG.WORLD.worldWidthTiles - 1);
    const ty = U.clamp(Number(y || 0), 0, CFG.WORLD.worldHeightTiles - 1);
    const biomeId = S.getMapTile(tx, ty)?.biomeId || S.getWorld().currentBiomeId;

    S.movePlayerToTile(tx, ty, biomeId);
    UI.renderEverything();
    return logAdmin(`Teleported to ${tx}, ${ty}.`, "success");
  }

  function spawnItem(itemId, quantity = 1, target = "player") {
    const def = S.getItemDef(itemId);
    if (!def) {
      throw new Error(`Unknown item: ${itemId}`);
    }

    INV.addItem(target, itemId, Number(quantity || 1));
    UI.renderEverything();
    return logAdmin(`Spawned ${quantity} ${def.name || itemId} into ${target}.`, "success");
  }

  function spawnAnimal(speciesId, quantity = 1) {
    const def = S.getAnimalDef(speciesId);
    if (!def) {
      throw new Error(`Unknown animal species: ${speciesId}`);
    }

    const count = Math.max(1, Number(quantity || 1));
    for (let i = 0; i < count; i += 1) {
      AN.captureAnimal(speciesId, {
        method: "admin",
        name: count > 1 ? `${def.name} ${i + 1}` : def.name
      });
    }

    UI.renderEverything();
    return logAdmin(`Spawned ${count} specimen(s) of ${def.name || speciesId}.`, "success");
  }

  function unlockAll() {
    S.setFlag("tutorialCompleted", true);
    S.setFlag("splice_license_alpha", true);
    S.setFlag("boatUnlocked", true);
    S.setFlag("breedingUnlocked", true);
    S.setFlag("dnaDatabaseUnlocked", true);
    S.setFlag("fishingUnlocked", true);
    S.setFlag("trappingUnlocked", true);
    S.setFlag("baseBuildingUnlocked", true);
    S.setFlag("worldMapUnlocked", true);
    revealMap();
    clearAllTiles();
    UI.renderEverything();
    return logAdmin("Unlocked major flags, revealed map, and cleared all tiles.", "success");
  }

  function clearCombat() {
    S.endCombat("admin_clear");
    UI.showScreen("game");
    UI.renderEverything();
    return logAdmin("Cleared combat.", "warning");
  }

  function winCombat() {
    const enemies = CB.getEnemies();
    enemies.forEach((enemy) => {
      enemy.stats.health = 0;
      enemy.isDown = true;
    });
    S.setCombatState({ enemies, actors: CB.getAllActors() });
    CB.checkBattleEnd();
    UI.renderEverything();
    return logAdmin("Forced combat victory.", "success");
  }

  function loseCombat() {
    const allies = CB.getAllies();
    allies.forEach((ally) => {
      ally.stats.health = 0;
      ally.isDown = true;
    });
    S.setCombatState({ allies, actors: CB.getAllActors() });
    CB.checkBattleEnd();
    UI.renderEverything();
    return logAdmin("Forced combat defeat.", "warning");
  }

  function startRandomCombat() {
    CB.startRandomEncounter();
    UI.renderEverything();
    return logAdmin("Started a random encounter.", "warning");
  }

  function setSkill(skillId, value = 1) {
    const player = S.getPlayer();
    const skills = U.deepClone(player?.skills || {});
    skills[skillId] = Math.max(0, Number(value || 0));
    S.updatePlayer({ skills });
    P.initPlayerProgress();
    UI.renderEverything();
    return logAdmin(`Set skill ${skillId} to ${value}.`, "success");
  }

  function setLevel(level = 1) {
    const safe = U.clamp(Number(level || 1), 1, CFG.PLAYER.maxLevel);
    const xp = P.getXpForLevel(safe);

    S.updatePlayerStats({
      level: safe,
      xp,
      maxHealth: 100 + ((safe - 1) * 8),
      maxStamina: 100 + ((safe - 1) * 6),
      health: 100 + ((safe - 1) * 8),
      stamina: 100 + ((safe - 1) * 6)
    });

    UI.renderEverything();
    return logAdmin(`Set player level to ${safe}.`, "success");
  }

  function setStat(statKey, value = 0) {
    if (!statKey) throw new Error("Missing stat key.");

    S.updatePlayerStats({
      [statKey]: Number(value || 0)
    });

    P.clampCoreStats();
    UI.renderEverything();
    return logAdmin(`Set ${statKey} to ${value}.`, "success");
  }

  function addTrait(traitId) {
    if (!traitId) throw new Error("Missing trait ID.");

    const player = S.getPlayer();
    const traits = U.uniqueBy([...U.toArray(player?.traits), traitId], (x) => String(x));
    S.updatePlayer({ traits });

    UI.renderEverything();
    return logAdmin(`Added trait ${traitId}.`, "success");
  }

  function removeTrait(traitId) {
    if (!traitId) throw new Error("Missing trait ID.");

    const player = S.getPlayer();
    const traits = U.toArray(player?.traits).filter((entry) => entry !== traitId);
    S.updatePlayer({ traits });

    UI.renderEverything();
    return logAdmin(`Removed trait ${traitId}.`, "warning");
  }

  function startTutorial() {
    TU.startTutorial(true);
    UI.renderEverything();
    return logAdmin("Started tutorial.", "info");
  }

  function completeTutorial() {
    TU.getSteps().forEach((step) => {
      TU.markStepComplete(step.id);
    });
    S.setFlag("tutorialCompleted", true);
    UI.renderEverything();
    return logAdmin("Completed tutorial.", "success");
  }

  function runSave() {
    SAVE.quickSave();
    UI.renderEverything();
    return logAdmin("Quick save complete.", "success");
  }

  function runLoad() {
    SAVE.quickLoad();
    UI.renderEverything();
    return logAdmin("Quick load complete.", "success");
  }

  function resetUi() {
    S.closeAllModals();
    UI.showScreen("game");
    UI.renderEverything();
    return logAdmin("Reset UI state.", "info");
  }

  function buildNow(structureId, target = "base") {
    BD.buildStructure(structureId, { target });
    UI.renderEverything();
    return logAdmin(`Built ${structureId} on ${target}.`, "success");
  }

  function craftNow(recipeId, quantity = 1) {
    CR.craftInstant(recipeId, Number(quantity || 1));
    UI.renderEverything();
    return logAdmin(`Crafted ${recipeId} x${quantity}.`, "success");
  }

  function breedNow() {
    const eligible = AN.getEligibleBreedingSpecimens();
    if (eligible.length < 2) {
      throw new Error("Need at least 2 eligible specimens to breed.");
    }

    const a = eligible[0];
    const b = eligible[1];
    BR.createBreedingJob(a.id, b.id, { durationMinutes: 1 });
    BR.tickBreedingJobs(5);
    UI.renderEverything();
    return logAdmin(`Forced a breeding cycle using ${a.name} and ${b.name}.`, "success");
  }

  function fishNow() {
    if (!FI.hasFishingTool()) {
      INV.addItem("player", "fishing_pole_basic", 1);
    }
    FI.beginCast({ durationSeconds: 0.1, useBait: false });
    FI.resolveActiveCast();
    UI.renderEverything();
    return logAdmin("Forced an active fishing catch attempt.", "success");
  }

  function placeLine() {
    FI.placePassiveLine({ baited: false });
    UI.renderEverything();
    return logAdmin("Placed passive fishing line.", "success");
  }

  function collectLines() {
    const lines = FI.getFishingState().passiveLines;
    if (!lines.length) {
      throw new Error("No passive lines to collect.");
    }

    lines.forEach((line) => {
      line.catchesStored = line.catchesStored.length
        ? line.catchesStored
        : [{ itemId: "mud_minnow_catch", label: "Mud Minnow", quantity: 1 }];
    });

    lines.forEach((line) => {
      FI.collectPassiveLine(line.id, "player");
    });

    UI.renderEverything();
    return logAdmin("Collected all passive lines.", "success");
  }

  function parseValue(value) {
    if (value == null) return value;
    const raw = String(value).trim();

    if (raw === "") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (!Number.isNaN(Number(raw))) return Number(raw);

    return raw;
  }

  function runCommand(commandText = "") {
    const raw = String(commandText || "").trim();
    if (!raw) return "No command entered.";

    S.pushAdminCommand(raw);

    const [command, ...args] = raw.split(/\s+/);
    const cmd = command.toLowerCase();

    try {
      switch (cmd) {
        case "help":
          return [
            "Commands:",
            "help",
            "heal",
            "feed",
            "hydrate",
            "clearinfection",
            "godmode [true|false]",
            "addxp [amount]",
            "addmoney [amount]",
            "settime [hour] [minute] [day?]",
            "setweather [clear|overcast|mist|rain|storm|spore_drift]",
            "revealmap",
            "cleartile",
            "clearalltiles",
            "teleport [x] [y]",
            "spawnitem [itemId] [qty] [target?]",
            "spawnanimal [speciesId] [qty]",
            "unlockall",
            "clearcombat",
            "wincombat",
            "losecombat",
            "startcombat",
            "setskill [skillId] [value]",
            "setlevel [value]",
            "setstat [statKey] [value]",
            "addtrait [traitId]",
            "removetrait [traitId]",
            "starttutorial",
            "completetutorial",
            "save",
            "load",
            "resetui",
            "build [structureId] [base|boat]",
            "craft [recipeId] [qty]",
            "breednow",
            "fishnow",
            "placeline",
            "collectlines"
          ].join("\n");

        case "heal":
          return fullHeal();

        case "feed":
          S.updatePlayerStats({ hunger: 100 });
          UI.renderEverything();
          return logAdmin("Filled hunger.", "success");

        case "hydrate":
          S.updatePlayerStats({ thirst: 100 });
          UI.renderEverything();
          return logAdmin("Filled thirst.", "success");

        case "clearinfection":
          return clearInfection();

        case "godmode":
          return setGodMode(args.length ? Boolean(parseValue(args[0])) : true);

        case "addxp":
          return addXp(parseValue(args[0] ?? 100));

        case "addmoney":
          return addFunds(parseValue(args[0] ?? 100));

        case "settime":
          return setTime(
            parseValue(args[0] ?? 6),
            parseValue(args[1] ?? 0),
            args[2] != null ? parseValue(args[2]) : null
          );

        case "setweather":
          return setWeather(String(args[0] || "clear"));

        case "revealmap":
          return revealMap();

        case "cleartile":
          return clearCurrentTile();

        case "clearalltiles":
          return clearAllTiles();

        case "teleport":
          return teleport(parseValue(args[0] ?? 0), parseValue(args[1] ?? 0));

        case "spawnitem":
          return spawnItem(
            String(args[0] || ""),
            parseValue(args[1] ?? 1),
            String(args[2] || "player")
          );

        case "spawnanimal":
          return spawnAnimal(String(args[0] || ""), parseValue(args[1] ?? 1));

        case "unlockall":
          return unlockAll();

        case "clearcombat":
          return clearCombat();

        case "wincombat":
          return winCombat();

        case "losecombat":
          return loseCombat();

        case "startcombat":
          return startRandomCombat();

        case "setskill":
          return setSkill(String(args[0] || ""), parseValue(args[1] ?? 1));

        case "setlevel":
          return setLevel(parseValue(args[0] ?? 1));

        case "setstat":
          return setStat(String(args[0] || ""), parseValue(args[1] ?? 0));

        case "addtrait":
          return addTrait(String(args[0] || ""));

        case "removetrait":
          return removeTrait(String(args[0] || ""));

        case "starttutorial":
          return startTutorial();

        case "completetutorial":
          return completeTutorial();

        case "save":
          return runSave();

        case "load":
          return runLoad();

        case "resetui":
          return resetUi();

        case "build":
          return buildNow(String(args[0] || ""), String(args[1] || "base"));

        case "craft":
          return craftNow(String(args[0] || ""), parseValue(args[1] ?? 1));

        case "breednow":
          return breedNow();

        case "fishnow":
          return fishNow();

        case "placeline":
          return placeLine();

        case "collectlines":
          return collectLines();

        default:
          throw new Error(`Unknown command: ${cmd}`);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      logAdmin(msg, "error");
      S.addToast(msg, "error");
      throw err;
    }
  }

  function renderQuickButtons() {
    const bindings = [
      ["adminHeal", () => fullHeal()],
      ["adminFeed", () => {
        S.updatePlayerStats({ hunger: 100 });
        UI.renderEverything();
        logAdmin("Filled hunger.", "success");
      }],
      ["adminHydrate", () => {
        S.updatePlayerStats({ thirst: 100 });
        UI.renderEverything();
        logAdmin("Filled thirst.", "success");
      }],
      ["adminClearInfection", () => clearInfection()],
      ["adminAddXP", () => addXp(250)],
      ["adminAddMoney", () => addFunds(250)],
      ["adminTimeMorning", () => timeMorning()],
      ["adminTimeNight", () => timeNight()],
      ["adminClearWeather", () => setWeather("clear")],
      ["adminSpawnLoot", () => {
        spawnItem("berries_wild", 5, "player");
        spawnItem("fresh_water", 5, "player");
        spawnItem("fiber_bundle", 10, "base");
        spawnItem("scrap_wood", 10, "base");
        logAdmin("Spawned common loot package.", "success");
      }],
      ["adminUnlockMap", () => revealMap()],
      ["adminToggleGodMode", () => setGodMode(!Boolean(S.getRuntime()?.admin?.godMode))]
    ];

    bindings.forEach(([id, fn]) => {
      const btn = U.byId(id);
      if (!btn) return;

      U.on(btn, "click", () => {
        try {
          fn();
        } catch (err) {
          const msg = err?.message || String(err);
          S.addToast(msg, "error");
        }
      });
    });
  }

  function bindConsole() {
    const input = U.byId("adminConsoleInput");
    const runBtn = U.byId("btnRunAdminCommand");
    const clearBtn = U.byId("btnClearAdminLog");

    if (runBtn && input) {
      U.on(runBtn, "click", () => {
        const raw = input.value.trim();
        if (!raw) return;

        try {
          const result = runCommand(raw);
          if (typeof result === "string") {
            logAdmin(result, "info");
          }
        } catch {
          // already handled
        }

        renderAdminLog();
      });
    }

    if (input) {
      U.on(input, "keydown", (evt) => {
        if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
          evt.preventDefault();
          runBtn?.click();
        }
      });
    }

    if (clearBtn) {
      U.on(clearBtn, "click", () => {
        S.updateRuntime({
          admin: {
            commandHistory: [],
            lastCommand: null
          }
        });
        renderAdminLog();
        logAdmin("Cleared admin log.", "info");
      });
    }
  }

  function bindModalEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "adminModal") {
        renderAdminLog();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    renderQuickButtons();
    bindConsole();
    bindModalEvents();
    renderAdminLog();

    state.initialized = true;
    U.eventBus.emit("admin:initialized");
    return true;
  }

  const API = {
    init,
    renderAdminLog,
    logAdmin,
    runCommand,

    setGodMode,
    fullHeal,
    fillNeeds,
    clearInfection,
    addXp,
    addFunds,
    setTime,
    timeMorning,
    timeNight,
    setWeather,
    revealMap,
    clearCurrentTile,
    clearAllTiles,
    teleport,
    spawnItem,
    spawnAnimal,
    unlockAll,
    clearCombat,
    winCombat,
    loseCombat,
    startRandomCombat,
    setSkill,
    setLevel,
    setStat,
    addTrait,
    removeTrait,
    startTutorial,
    completeTutorial,
    runSave,
    runLoad,
    resetUi,
    buildNow,
    craftNow,
    breedNow,
    fishNow,
    placeLine,
    collectLines
  };

  window.GL_ADMIN = API;

  return Object.freeze(API);
})();