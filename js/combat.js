window.GrabLabCombat = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const P = window.GrabLabPlayer;
  const A = window.GrabLabAudio;

  const state = {
    initialized: false,
    selectedCommand: null,
    selectedTargetId: null,
    randomEncounterCooldownMs: 18000,
    randomEncounterBaseChance: 0.11,
    resolvingBattle: false
  };

  function getAnimalsApi() {
    return window.GL_ANIMALS || window.GrabLabAnimals || null;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getCombat() {
    return S.getRuntime()?.combat || {};
  }

  function getEncounterType() {
    return getCombat()?.encounterType || "fungal";
  }

  function makeActorBase(data = {}, side = "ally", kind = "ally") {
    const stats = data?.stats || {};

    return {
      id: data.id || U.uid(kind),
      kind,
      side,
      name: data.name || U.titleCase(kind),
      sourceId: data.sourceId || data.id || null,
      speciesId: data.speciesId || null,
      classId: data.classId || null,
      portrait: data.portrait || null,
      level: Number(data.level || 1),
      temperament: data.temperament || "neutral",
      captureEligible: Boolean(data.captureEligible),
      tameable: Boolean(data.tameable),
      captureReady: Boolean(data.captureReady),
      tamedInBattle: Boolean(data.tamedInBattle),
      wildlifeRole: data.wildlifeRole || null,
      initiative: Number(data.initiative || 0),
      stats: {
        health: Number(stats.health ?? 40),
        maxHealth: Number(stats.maxHealth ?? 40),
        stamina: Number(stats.stamina ?? 25),
        maxStamina: Number(stats.maxStamina ?? 25),
        attack: Number(stats.attack ?? 6),
        defense: Number(stats.defense ?? 4),
        speed: Number(stats.speed ?? 5)
      },
      statusEffects: U.toArray(data.statusEffects),
      combatMoves: U.toArray(data.combatMoves),
      defending: false,
      hasActed: false,
      isDown: false
    };
  }

  function actorHp(actor) {
    return Number(actor?.stats?.health || 0);
  }

  function actorMaxHp(actor) {
    return Number(actor?.stats?.maxHealth || 1);
  }

  function isActorAlive(actor) {
    return Boolean(actor && !actor.isDown && actorHp(actor) > 0);
  }

  function markActorDown(actor, options = {}) {
    if (!actor) return;

    actor.stats.health = 0;
    actor.isDown = true;
    actor.hasActed = true;

    if (options.captureReady) {
      actor.captureReady = true;
    }

    if (options.tamedInBattle) {
      actor.tamedInBattle = true;
      actor.captureReady = true;
    }
  }

  function getAllActors() {
    return U.toArray(getCombat()?.actors);
  }

  function getAllies() {
    return U.toArray(getCombat()?.allies);
  }

  function getEnemies() {
    return U.toArray(getCombat()?.enemies);
  }

  function getActorById(actorId) {
    return getAllActors().find((actor) => actor.id === actorId) || null;
  }

  function getCurrentActor() {
    const actors = getAllActors();
    return actors[Number(getCombat()?.turnIndex || 0)] || null;
  }

  function rollInitiative(actor) {
    return Number(actor?.stats?.speed || 0) + U.randInt(1, 20);
  }

  function buildPlayerActor() {
    const player = S.getPlayer();
    const stats = S.getPlayerStats();

    return makeActorBase({
      id: "actor_player",
      sourceId: player?.id || "player",
      name: player?.name || "Ranger",
      classId: player?.classId || "field_ranger",
      level: Number(stats?.level || 1),
      portrait: CFG.IMAGE_FALLBACKS?.portraitPlayer,
      combatMoves: ["attack", "defend", "skill", "analyze", "item", "swap"],
      statusEffects: U.toArray(player?.statusEffects),
      stats: {
        health: Number(stats?.health || 100),
        maxHealth: Number(stats?.maxHealth || 100),
        stamina: Number(stats?.stamina || 100),
        maxStamina: Number(stats?.maxStamina || 100),
        attack: 8 + Math.floor((Number(stats?.level || 1) - 1) * 1.5),
        defense: 5 + Math.floor((Number(stats?.level || 1) - 1) * 1.1),
        speed: 7 + Math.floor((Number(stats?.level || 1) - 1) * 0.8)
      }
    }, "ally", "player");
  }

  function buildCompanionActors() {
    return U.toArray(S.getParty()?.active).map((companion, i) => {
      return makeActorBase({
        id: `actor_comp_${i}_${companion.id}`,
        sourceId: companion.id,
        name: companion.name || "Companion",
        speciesId: companion.speciesId || null,
        classId: companion.classId || "support",
        portrait: companion.portrait || CFG.IMAGE_FALLBACKS?.portraitCompanion,
        level: Number(companion.level || 1),
        combatMoves: U.toArray(companion.combatMoves).length ? companion.combatMoves : ["attack", "defend"],
        statusEffects: U.toArray(companion.statusEffects),
        stats: {
          health: Number(companion?.stats?.health || 40),
          maxHealth: Number(companion?.stats?.maxHealth || 40),
          stamina: Number(companion?.stats?.stamina || 30),
          maxStamina: Number(companion?.stats?.maxStamina || 30),
          attack: Number(companion?.stats?.attack || 6),
          defense: Number(companion?.stats?.defense || 4),
          speed: Number(companion?.stats?.speed || 5)
        }
      }, "ally", "companion");
    });
  }

  function generateEnemyName(type = "fungal_blight") {
    const map = {
      fungal_blight: ["Spore Lump", "Mold Creeper", "Blight Puff"],
      fungal_stalker: ["Stalkcap", "Myco Lurker", "Veil Rot"],
      fungal_boss: ["Bloom Tyrant", "The Rot Crown", "Spore Bishop"],
      fungal_spitter: ["Spore Spitter", "Mold Archer", "Puffback"]
    };

    return U.pick(map[type] || map.fungal_blight) || "Fungal Thing";
  }

  function makeEnemyActor(options = {}) {
    const level = Math.max(1, Number(options.level || 1));
    const kind = options.kind || "fungal_blight";

    let base = {
      health: 22 + (level * 7),
      maxHealth: 22 + (level * 7),
      stamina: 18 + (level * 3),
      maxStamina: 18 + (level * 3),
      attack: 5 + level,
      defense: 3 + Math.floor(level * 0.7),
      speed: 4 + Math.floor(level * 0.5)
    };

    if (kind === "fungal_stalker") {
      base = {
        health: 20 + (level * 6),
        maxHealth: 20 + (level * 6),
        stamina: 22 + (level * 4),
        maxStamina: 22 + (level * 4),
        attack: 6 + level,
        defense: 3 + Math.floor(level * 0.5),
        speed: 7 + Math.floor(level * 0.8)
      };
    }

    if (kind === "fungal_spitter") {
      base = {
        health: 18 + (level * 5),
        maxHealth: 18 + (level * 5),
        stamina: 24 + (level * 4),
        maxStamina: 24 + (level * 4),
        attack: 7 + level,
        defense: 2 + Math.floor(level * 0.4),
        speed: 6 + Math.floor(level * 0.6)
      };
    }

    if (kind === "fungal_boss") {
      base = {
        health: 60 + (level * 12),
        maxHealth: 60 + (level * 12),
        stamina: 28 + (level * 5),
        maxStamina: 28 + (level * 5),
        attack: 8 + Math.floor(level * 1.3),
        defense: 5 + Math.floor(level),
        speed: 5 + Math.floor(level * 0.5)
      };
    }

    return makeActorBase({
      id: options.id || U.uid("enemy"),
      sourceId: options.sourceId || kind,
      name: options.name || generateEnemyName(kind),
      classId: kind,
      level,
      portrait: options.portrait || CFG.IMAGE_FALLBACKS?.portraitCompanion,
      combatMoves: U.toArray(options.combatMoves).length
        ? options.combatMoves
        : kind === "fungal_boss"
          ? ["attack", "attack", "spore_burst", "defend"]
          : kind === "fungal_spitter"
            ? ["attack", "spore_burst", "spore_burst", "defend"]
            : ["attack", "spore_burst", "defend"],
      stats: base
    }, "enemy", "enemy");
  }

  function makeWildlifeActor(speciesId, options = {}) {
    const def = S.getAnimalDef(speciesId) || {};
    const level = Math.max(1, Number(options.level || 1));

    return makeActorBase({
      id: options.id || U.uid("wild"),
      sourceId: options.sourceId || speciesId,
      speciesId,
      classId: "wildlife",
      name: options.name || def.name || U.titleCase(speciesId),
      portrait: options.portrait || CFG.IMAGE_FALLBACKS?.portraitCompanion,
      level,
      temperament: def.temperament || "wary",
      captureEligible: true,
      tameable: true,
      wildlifeRole: options.wildlifeRole || "wildlife",
      combatMoves: U.toArray(def.combatMoves).length ? def.combatMoves : ["attack", "defend"],
      stats: {
        health: Number(def.baseHealth || 24) + (level * 2),
        maxHealth: Number(def.baseHealth || 24) + (level * 2),
        stamina: Number(def.baseStamina || 20) + level,
        maxStamina: Number(def.baseStamina || 20) + level,
        attack: Number(def.baseAttack || 5) + Math.floor(level / 2),
        defense: Number(def.baseDefense || 3) + Math.floor(level / 3),
        speed: Number(def.baseSpeed || 5) + Math.floor(level / 3)
      }
    }, "enemy", "wildlife");
  }

  function getBiomeWildlifeSpecies(biome = null) {
    const biomeId = biome || S.getCurrentMapTile()?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";
    const defs = U.toArray(S.getData()?.animals);

    const matches = defs
      .filter((entry) => entry?.id)
      .filter((entry) => {
        return entry.habitat === biomeId ||
          entry.habitatType === "general" ||
          (biomeId === "river_channel" && entry.habitatType === "aquarium") ||
          (["wetland", "mudflats"].includes(biomeId) && ["general", "aquarium"].includes(entry.habitatType));
      });

    if (matches.length) {
      return matches.map((entry) => entry.id);
    }

    return ["reed_hopper", "dock_turtle", "mud_minnow"];
  }

  function buildEncounterEnemies(encounterId = "fungal_blight", options = {}) {
    const playerLevel = P.getPlayerLevel();
    const currentTile = S.getCurrentMapTile();
    const biome = currentTile?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";

    if (Array.isArray(options.enemies) && options.enemies.length) {
      return options.enemies;
    }

    if (encounterId === "fungal_boss") {
      return [
        makeEnemyActor({ kind: "fungal_boss", level: playerLevel + 1 }),
        makeEnemyActor({ kind: "fungal_blight", level: playerLevel }),
        makeEnemyActor({ kind: "fungal_stalker", level: playerLevel })
      ];
    }

    if (encounterId === "fungal_stalker") {
      return [
        makeEnemyActor({ kind: "fungal_stalker", level: playerLevel }),
        makeEnemyActor({ kind: "fungal_blight", level: Math.max(1, playerLevel - 1) })
      ];
    }

    if (encounterId === "fungal_spitter") {
      return [
        makeEnemyActor({ kind: "fungal_spitter", level: playerLevel }),
        makeEnemyActor({ kind: "fungal_blight", level: playerLevel })
      ];
    }

    const count =
      biome === "fungal_grove" ? U.randInt(3, 5) :
      biome === "wetland" ? U.randInt(2, 4) :
      U.randInt(1, 3);

    const enemies = [];
    for (let i = 0; i < count; i += 1) {
      const roll = Math.random();
      const kind = roll < 0.18 ? "fungal_spitter" : roll < 0.38 ? "fungal_stalker" : "fungal_blight";

      enemies.push(
        makeEnemyActor({
          kind,
          level: Math.max(1, playerLevel + U.randInt(-1, 1))
        })
      );
    }

    return enemies;
  }

  function buildWildlifeEncounterEnemies(speciesId = null, options = {}) {
    const playerLevel = P.getPlayerLevel();
    const currentTile = S.getCurrentMapTile();
    const poiSpecies = U.toArray(currentTile?.pointsOfInterest)
      .filter((poi) => poi?.speciesId && (poi?.capturable || poi?.type === "wild_animal" || poi?.type === "capturable_animal"))
      .map((poi) => poi.speciesId);

    const speciesPool = U.uniqueBy(
      [
        ...(speciesId ? [speciesId] : []),
        ...poiSpecies,
        ...getBiomeWildlifeSpecies(currentTile?.biomeId)
      ],
      (x) => String(x)
    );

    const chosenSpecies = speciesId || U.pick(speciesPool) || "reed_hopper";
    const packCount = Math.max(1, chosenSpecies === "mud_minnow" ? U.randInt(2, 3) : Number(options.count || 1));

    const out = [];
    for (let i = 0; i < packCount; i += 1) {
      out.push(
        makeWildlifeActor(chosenSpecies, {
          id: i === 0 && options.sourcePoiId ? `wild_${options.sourcePoiId}` : undefined,
          sourceId: i === 0 && options.sourcePoiId ? options.sourcePoiId : chosenSpecies,
          name: i === 0 ? (options.name || null) : null,
          level: Math.max(1, Number(options.level || playerLevel + U.randInt(-1, 1)))
        })
      );
    }

    return out;
  }

  function sortActorsByInitiative(actors = []) {
    return [...actors]
      .map((actor) => ({
        ...actor,
        initiative: rollInitiative(actor)
      }))
      .sort((a, b) => b.initiative - a.initiative);
  }

  function rebuildSideArraysFromActors(actors = getAllActors()) {
    return {
      allies: actors.filter((actor) => actor.side === "ally"),
      enemies: actors.filter((actor) => actor.side === "enemy")
    };
  }

  function syncCombatState(allies, enemies, encounterId = "fungal_blight", extra = {}) {
    const actors = sortActorsByInitiative([...allies, ...enemies]);

    S.startCombat(encounterId, {
      active: true,
      encounterId,
      actors,
      allies: actors.filter((actor) => actor.side === "ally"),
      enemies: actors.filter((actor) => actor.side === "enemy"),
      turnIndex: 0,
      round: 1,
      log: [],
      encounterType: extra.encounterType || "fungal",
      captureAllowed: Boolean(extra.captureAllowed),
      encounterMeta: extra.encounterMeta || {},
      result: null
    });

    state.resolvingBattle = false;
    state.selectedCommand = null;
    state.selectedTargetId = null;

    UI.showScreen?.("combat");
    UI.renderCombatShell?.();

    window.setTimeout(() => {
      maybeRunEnemyTurn();
    }, 80);

    return getCombat();
  }

  function startEncounter(encounterId = "fungal_blight", options = {}) {
    const allies = [buildPlayerActor(), ...buildCompanionActors()];
    const enemies = options.enemies || buildEncounterEnemies(encounterId, options);

    const combat = syncCombatState(allies, enemies, encounterId, {
      encounterType: options.encounterType || "fungal",
      captureAllowed: Boolean(options.captureAllowed),
      encounterMeta: options.encounterMeta || {}
    });

    S.pushCombatLog(`Encounter started: ${U.titleCase(encounterId)}.`);
    S.logActivity(`Combat started: ${U.titleCase(encounterId)}.`, "warning");

    A.playMusic?.("combat").catch?.(() => {});
    return combat;
  }

  function startWildlifeEncounter(speciesId = null, options = {}) {
    const actualSpecies = speciesId || U.pick(getBiomeWildlifeSpecies()) || "reed_hopper";
    const def = S.getAnimalDef(actualSpecies);
    const encounterId = `wildlife_${actualSpecies}`;
    const enemies = buildWildlifeEncounterEnemies(actualSpecies, options);

    const combat = startEncounter(encounterId, {
      enemies,
      encounterType: "wildlife",
      captureAllowed: true,
      encounterMeta: {
        speciesId: actualSpecies,
        sourcePoiId: options.sourcePoiId || null,
        tileX: options.tileX ?? S.getWorld()?.currentTileX,
        tileY: options.tileY ?? S.getWorld()?.currentTileY,
        name: options.name || def?.name || U.titleCase(actualSpecies)
      }
    });

    S.pushCombatLog(`A wild ${def?.name || U.titleCase(actualSpecies)} encounter begins.`);
    S.logActivity(`Wildlife encounter: ${def?.name || U.titleCase(actualSpecies)}.`, "warning");
    return combat;
  }

  function syncActorStateBackToArrays(actor) {
    if (!actor) return getCombat();

    const actors = getAllActors();
    const idx = actors.findIndex((entry) => entry.id === actor.id);

    if (idx >= 0) {
      actors[idx] = actor;
    }

    const sides = rebuildSideArraysFromActors(actors);

    S.setCombatState({
      actors,
      allies: sides.allies,
      enemies: sides.enemies
    });

    return getCombat();
  }

  function chooseAutoTarget(side = "enemy") {
    const pool = side === "enemy"
      ? getEnemies().filter(isActorAlive)
      : getAllies().filter(isActorAlive);

    if (!pool.length) return null;

    return pool.sort((a, b) => actorHp(a) - actorHp(b))[0];
  }

  function calculateDamage(attacker, defender, move = "attack") {
    const atk = Number(attacker?.stats?.attack || 1);
    const def = Number(defender?.stats?.defense || 0);

    const variance = U.randInt(-2, 3);
    let power = atk + variance - Math.floor(def / 2);

    if (move === "spore_burst") power += 3;
    if (move === "heavy_strike" || move === "knockout") power += 4;
    if (move === "tackle" || move === "scratch" || move === "snap") power += 1;
    if (move === "shell_bash") power += 2;
    if (move === "mud_spit") power += 1;

    if (defender?.defending) {
      power *= (1 - Number(CFG.COMBAT?.defendReduction ?? 0.5));
    }

    const crit = Math.random() < Number(CFG.COMBAT?.critChanceBase ?? 0.08);
    if (crit) {
      power = Math.floor(power * Number(CFG.COMBAT?.critMultiplier ?? 1.75));
    }

    return {
      damage: Math.max(1, Math.floor(power)),
      crit
    };
  }

  function applyDamage(target, amount, sourceText = "an attack", options = {}) {
    const dmg = Math.max(0, Number(amount || 0));
    const hp = Number(target?.stats?.health || 0);

    target.stats.health = Math.max(0, hp - dmg);

    if (target.stats.health <= 0) {
      markActorDown(target, {
        captureReady: Boolean(options.captureReady),
        tamedInBattle: Boolean(options.tamedInBattle)
      });
      S.pushCombatLog(`${target.name} was downed by ${sourceText}.`);
    }

    syncActorStateBackToArrays(target);
    return dmg;
  }

  function applyHealing(target, amount, sourceText = "healing") {
    const heal = Math.max(0, Number(amount || 0));
    const hp = Number(target?.stats?.health || 0);
    const max = Number(target?.stats?.maxHealth || hp);

    target.stats.health = Math.min(max, hp + heal);
    target.isDown = false;

    S.pushCombatLog(`${target.name} recovered ${heal} HP from ${sourceText}.`);
    syncActorStateBackToArrays(target);
    return heal;
  }

  function markActed(actor) {
    actor.hasActed = true;
    actor.defending = false;
    syncActorStateBackToArrays(actor);
  }

  function performAttack(attackerId, targetId, move = "attack", options = {}) {
    const attacker = getActorById(attackerId);
    const target = getActorById(targetId);

    if (!attacker || !target || !isActorAlive(attacker) || !isActorAlive(target)) {
      return false;
    }

    const result = calculateDamage(attacker, target, move);
    const wildlifeEncounter = getEncounterType() === "wildlife";
    const captureReady = wildlifeEncounter && Boolean(target.captureEligible) && (move === "knockout" || options.captureReady);

    const dmg = applyDamage(target, result.damage, move, {
      captureReady
    });

    const critText = result.crit ? " Critical hit!" : "";
    S.pushCombatLog(`${attacker.name} used ${U.titleCase(move)} on ${target.name} for ${dmg} damage.${critText}`);

    if (attacker.kind === "player") {
      P.registerCombatAction?.("combat_blunt");
    }

    markActed(attacker);
    checkBattleEnd();
    return true;
  }

  function performKnockout(attackerId, targetId) {
    const attacker = getActorById(attackerId);
    const target = getActorById(targetId);

    if (!attacker || !target || !isActorAlive(attacker) || !isActorAlive(target)) {
      return false;
    }

    const wildlifeEncounter = getEncounterType() === "wildlife";
    const captureReady = wildlifeEncounter && Boolean(target.captureEligible);

    const result = calculateDamage(attacker, target, "knockout");
    const dmg = applyDamage(target, result.damage, "knockout", {
      captureReady
    });

    S.pushCombatLog(`${attacker.name} attempts a careful knockout on ${target.name} for ${dmg} damage.`);

    if (attacker.kind === "player") {
      P.registerCombatAction?.("combat_blunt");
      P.awardSkillXp?.("observation", 2, "careful wildlife handling");
    }

    markActed(attacker);
    checkBattleEnd();
    return true;
  }

  function performDefend(actorId) {
    const actor = getActorById(actorId);
    if (!actor || !isActorAlive(actor)) return false;

    actor.defending = true;
    actor.hasActed = true;
    syncActorStateBackToArrays(actor);

    S.pushCombatLog(`${actor.name} braces for impact.`);
    nextTurn();
    return true;
  }

  function performAnalyze(actorId, targetId) {
    const actor = getActorById(actorId);
    const target = getActorById(targetId);

    if (!actor || !target || !isActorAlive(actor)) return false;

    S.pushCombatLog(
      `${actor.name} analyzes ${target.name}: HP ${target.stats.health}/${target.stats.maxHealth}, ATK ${target.stats.attack}, DEF ${target.stats.defense}, SPD ${target.stats.speed}.`
    );

    if (target.captureEligible) {
      S.pushCombatLog(`${target.name} can be captured if downed, knocked out, or successfully tamed.`);
    }

    if (actor.kind === "player") {
      P.awardSkillXp?.("observation", 2, "combat analysis");
    }

    actor.hasActed = true;
    syncActorStateBackToArrays(actor);
    nextTurn();
    return true;
  }

  function performTame(actorId, targetId) {
    const actor = getActorById(actorId);
    const target = getActorById(targetId);

    if (!actor || !target || !isActorAlive(actor) || !isActorAlive(target)) return false;

    if (getEncounterType() !== "wildlife" || !target.tameable) {
      S.pushCombatLog(`${actor.name} can't tame that target.`);
      actor.hasActed = true;
      syncActorStateBackToArrays(actor);
      nextTurn();
      return false;
    }

    const observation = P.getSkillLevel?.("observation") || 0;
    const breeding = P.getSkillLevel?.("breeding") || 0;
    const trapping = P.getSkillLevel?.("trapping") || 0;
    const healthFactor = 1 - (actorHp(target) / Math.max(1, actorMaxHp(target)));
    const chance = U.clamp(0.18 + (healthFactor * 0.45) + (observation * 0.015) + (breeding * 0.01) + (trapping * 0.008), 0.08, 0.9);

    if (Math.random() < chance) {
      markActorDown(target, {
        captureReady: true,
        tamedInBattle: true
      });
      S.pushCombatLog(`${actor.name} successfully tamed ${target.name}!`);

      if (actor.kind === "player") {
        P.awardSkillXp?.("breeding", 3, "field taming");
        P.awardSkillXp?.("observation", 3, "field taming");
      }
    } else {
      S.pushCombatLog(`${actor.name} fails to tame ${target.name}. It remains wary.`);
    }

    actor.hasActed = true;
    syncActorStateBackToArrays(actor);
    checkBattleEnd();
    nextTurn();
    return true;
  }

  function performItem(actorId) {
    const actor = getActorById(actorId);
    if (!actor || !isActorAlive(actor)) return false;

    if (S.hasItem("player", "bandage_basic", 1)) {
      S.removeItem("player", "bandage_basic", 1);
      applyHealing(actor, 16, "bandage");
      S.pushCombatLog(`${actor.name} used a bandage.`);
    } else if (S.hasItem("player", "fresh_water", 1)) {
      S.removeItem("player", "fresh_water", 1);
      applyHealing(actor, 8, "fresh water");
      S.pushCombatLog(`${actor.name} drank fresh water and steadied up.`);
    } else if (S.hasItem("player", "berries_wild", 1)) {
      S.removeItem("player", "berries_wild", 1);
      applyHealing(actor, 6, "wild berries");
      S.pushCombatLog(`${actor.name} stress-ate berries. Somehow it helped.`);
    } else {
      S.pushCombatLog(`${actor.name} fumbles for an item, but finds nothing useful.`);
    }

    actor.hasActed = true;
    syncActorStateBackToArrays(actor);
    nextTurn();
    return true;
  }

  function performSwap(actorId) {
    const actor = getActorById(actorId);
    if (!actor || !isActorAlive(actor)) return false;

    S.pushCombatLog(`${actor.name} holds position. Reserve swapping is not fully implemented yet.`);
    actor.hasActed = true;
    syncActorStateBackToArrays(actor);
    nextTurn();
    return true;
  }

  function livingActorsBySide(side) {
    return getAllActors().filter((actor) => actor.side === side && isActorAlive(actor));
  }

  function allActorsActed() {
    return getAllActors()
      .filter(isActorAlive)
      .every((actor) => actor.hasActed);
  }

  function resetRoundFlags() {
    const actors = getAllActors().map((actor) => ({
      ...actor,
      hasActed: false,
      defending: false
    }));

    const sorted = sortActorsByInitiative(actors);
    const sides = rebuildSideArraysFromActors(sorted);

    S.setCombatState({
      actors: sorted,
      allies: sides.allies,
      enemies: sides.enemies,
      turnIndex: 0,
      round: Number(getCombat()?.round || 1) + 1
    });

    S.pushCombatLog(`Round ${Number(getCombat()?.round || 1)} begins.`);
  }

  function nextTurn() {
    if (state.resolvingBattle) return false;
    if (checkBattleEnd()) return false;

    let actors = getAllActors();
    let nextIndex = Number(getCombat()?.turnIndex || 0) + 1;

    while (nextIndex < actors.length) {
      const candidate = actors[nextIndex];
      if (candidate && isActorAlive(candidate) && !candidate.hasActed) {
        S.setCombatState({ turnIndex: nextIndex });
        UI.renderCombatShell?.();
        maybeRunEnemyTurn();
        return true;
      }
      nextIndex += 1;
    }

    if (allActorsActed()) {
      resetRoundFlags();
      actors = getAllActors();
    }

    const freshIndex = actors.findIndex((actor) => isActorAlive(actor) && !actor.hasActed);
    S.setCombatState({ turnIndex: freshIndex >= 0 ? freshIndex : 0 });
    UI.renderCombatShell?.();
    maybeRunEnemyTurn();
    return true;
  }

  function maybeRunEnemyTurn() {
    const actor = getCurrentActor();
    if (!actor || actor.side !== "enemy" || !isActorAlive(actor) || state.resolvingBattle) return;

    window.setTimeout(() => {
      const freshActor = getActorById(actor.id);
      if (!freshActor || !isActorAlive(freshActor)) {
        nextTurn();
        return;
      }

      const target = chooseAutoTarget("ally");
      if (!target) {
        checkBattleEnd();
        return;
      }

      const move = U.pick(freshActor.combatMoves) || "attack";

      if (move === "defend" || move === "shell_guard") {
        performDefend(freshActor.id);
        return;
      }

      performAttack(freshActor.id, target.id, move);
      nextTurn();
    }, 450);
  }

  function handlePlayerCommand(command, targetId = null) {
    const actor = getCurrentActor();
    if (!actor || actor.side !== "ally" || !isActorAlive(actor)) return false;

    const currentEncounterType = getEncounterType();
    const target =
      targetId ||
      state.selectedTargetId ||
      chooseAutoTarget("enemy")?.id ||
      null;

    switch (command) {
      case "attack":
        if (!target) return false;
        performAttack(actor.id, target, "attack");
        nextTurn();
        return true;

      case "skill":
        if (!target) return false;
        if (currentEncounterType === "wildlife") {
          performKnockout(actor.id, target);
        } else {
          performAttack(actor.id, target, "heavy_strike");
        }
        nextTurn();
        return true;

      case "defend":
        performDefend(actor.id);
        return true;

      case "analyze":
        if (!target) return false;
        if (currentEncounterType === "wildlife") {
          performTame(actor.id, target);
        } else {
          performAnalyze(actor.id, target);
        }
        return true;

      case "tame":
        if (!target) return false;
        performTame(actor.id, target);
        return true;

      case "knockout":
        if (!target) return false;
        performKnockout(actor.id, target);
        nextTurn();
        return true;

      case "item":
        performItem(actor.id);
        return true;

      case "swap":
        performSwap(actor.id);
        return true;

      default:
        return false;
    }
  }

  function checkBattleEnd() {
    if (state.resolvingBattle) return true;
    if (!getCombat()?.active) return true;

    const livingAllies = livingActorsBySide("ally");
    const livingEnemies = livingActorsBySide("enemy");

    if (!livingEnemies.length) {
      handleVictory();
      return true;
    }

    if (!livingAllies.length) {
      handleDefeat();
      return true;
    }

    return false;
  }

  function markEncounterSourcePoiResolved(field = "resolved") {
    const meta = getCombat()?.encounterMeta || {};
    const poiId = meta.sourcePoiId;
    if (!poiId) return false;

    const tile = S.getMapTile(
      meta.tileX ?? S.getWorld()?.currentTileX,
      meta.tileY ?? S.getWorld()?.currentTileY
    ) || S.getCurrentMapTile();

    const pois = U.toArray(tile?.pointsOfInterest);
    const poi = pois.find((entry) => entry.id === poiId);
    if (!poi) return false;

    poi[field] = true;
    poi.resolved = true;
    poi.resolvedAt = U.isoNow();

    U.eventBus.emit("world:poiResolved", { poi: U.deepClone(poi), field });
    return true;
  }

  function captureWildlifeResults() {
    const AN = getAnimalsApi();
    if (!AN) return [];

    const captured = [];
    const meta = getCombat()?.encounterMeta || {};

    getEnemies()
      .filter((enemy) => enemy?.speciesId && (enemy.captureReady || enemy.tamedInBattle || enemy.isDown))
      .forEach((enemy) => {
        try {
          const specimen = AN.captureAnimal(enemy.speciesId, {
            method: enemy.tamedInBattle ? "tame_encounter" : "combat_capture",
            name: enemy.name || (S.getAnimalDef(enemy.speciesId)?.name || U.titleCase(enemy.speciesId)),
            level: enemy.level || 1,
            tileX: meta.tileX ?? S.getWorld()?.currentTileX,
            tileY: meta.tileY ?? S.getWorld()?.currentTileY,
            notes: enemy.tamedInBattle
              ? "Tamed during a wildlife encounter."
              : "Secured after a wildlife encounter."
          });

          if (specimen) captured.push(specimen);
        } catch (err) {
          console.warn("Failed to capture wildlife result:", err);
        }
      });

    return captured;
  }

  function handleVictory() {
    if (state.resolvingBattle) return;
    state.resolvingBattle = true;

    const enemies = getEnemies();
    const encounterType = getEncounterType();

    if (encounterType === "wildlife") {
      const captured = captureWildlifeResults();
      const totalXp = enemies.reduce((sum, enemy) => sum + 8 + (Number(enemy.level || 1) * 3), 0);

      P.awardPlayerXp(totalXp, "wildlife encounter");
      syncPlayerStatsFromCombat();

      if (captured.length) {
        S.pushCombatLog(`Encounter resolved. Captured: ${captured.map((entry) => entry.name).join(", ")}.`);
        S.logActivity(`Wildlife encounter resolved. Captured ${captured.length} specimen(s).`, "success");
        S.addToast(`Captured ${captured.length} creature${captured.length === 1 ? "" : "s"}!`, "success");
        markEncounterSourcePoiResolved("captured");
      } else {
        S.pushCombatLog("Wildlife encounter resolved, but nothing was secured.");
        S.logActivity("Wildlife encounter ended with no captures.", "info");
        markEncounterSourcePoiResolved("resolved");
      }

      S.endCombat("victory");
      UI.showScreen?.("game");
      UI.renderEverything?.();
      A.playMusic?.("exploration").catch?.(() => {});
      state.resolvingBattle = false;
      return;
    }

    const totalXp = enemies.reduce((sum, enemy) => sum + 10 + (Number(enemy.level || 1) * 4), 0);
    const money = enemies.reduce((sum) => sum + U.randInt(3, 10), 0);

    P.awardPlayerXp(totalXp, "combat victory");
    S.updatePlayer({
      funds: Number(S.getPlayer()?.funds || CFG.PLAYER.startingFunds || 0) + money
    });

    S.pushCombatLog(`Victory! Gained ${totalXp} XP and ${money} funds.`);
    S.logActivity(`Won the battle. Looted ${money} funds.`, "success");
    S.addToast("Victory!", "success");

    markEncounterSourcePoiResolved("defeated");
    syncPlayerStatsFromCombat();
    S.endCombat("victory");
    UI.showScreen?.("game");
    UI.renderEverything?.();
    A.playMusic?.("exploration").catch?.(() => {});
    state.resolvingBattle = false;
  }

  function handleDefeat() {
    if (state.resolvingBattle) return;
    state.resolvingBattle = true;

    const stats = S.getPlayerStats();
    const reducedHealth = Math.max(1, Math.floor(Number(stats.maxHealth || 100) * 0.25));

    S.updatePlayerStats({
      health: reducedHealth,
      stamina: Math.max(5, Math.floor(Number(stats.maxStamina || 100) * 0.2))
    });

    S.pushCombatLog("Defeat... you limp away from the encounter.");
    S.logActivity("Lost the battle and barely escaped.", "error");
    S.addToast("Defeat...", "error");

    S.endCombat("defeat");
    UI.showScreen?.("game");
    UI.renderEverything?.();
    A.playMusic?.("exploration").catch?.(() => {});
    state.resolvingBattle = false;
  }

  function syncPlayerStatsFromCombat() {
    const playerActor = getActorById("actor_player");
    if (!playerActor) return false;

    S.updatePlayerStats({
      health: playerActor.stats.health,
      stamina: playerActor.stats.stamina
    });

    const party = S.getParty();
    const active = U.toArray(party?.active);
    let changed = false;

    active.forEach((member) => {
      const actor = getAllies().find((entry) => entry.sourceId === member.id);
      if (!actor) return;

      member.stats = {
        ...(member.stats || {}),
        health: actor.stats.health,
        stamina: actor.stats.stamina,
        maxHealth: actor.stats.maxHealth,
        maxStamina: actor.stats.maxStamina
      };
      changed = true;
    });

    if (changed) {
      S.updateParty({ active });
    }

    return true;
  }

  function getCommandDisplayLabel(command) {
    const encounterType = getEncounterType();

    if (encounterType === "wildlife") {
      if (command === "skill") return "Knockout";
      if (command === "analyze") return "Tame Attempt";
    }

    if (command === "skill") return "Heavy Strike";
    return U.titleCase(command || "None");
  }

  function renderCombatDetail(command = null, targetId = null) {
    const panel = U.byId("combatDetailPanel");
    if (!panel) return;

    const target = targetId ? getActorById(targetId) : chooseAutoTarget("enemy");
    const encounterType = getEncounterType();

    const targetHtml = target
      ? `
        <p><strong>Target:</strong> ${htmlEscape(target.name)}</p>
        <p><strong>HP:</strong> ${target.stats.health}/${target.stats.maxHealth}</p>
        <p><strong>ATK/DEF/SPD:</strong> ${target.stats.attack}/${target.stats.defense}/${target.stats.speed}</p>
        ${target.captureEligible ? `<p><strong>Capturable:</strong> Yes</p>` : ""}
      `
      : `<p>No target selected.</p>`;

    const contextualHint =
      encounterType === "wildlife"
        ? `<p class="accent-text"><strong>Wildlife Rules:</strong> Skill = Knockout, Analyze = Tame Attempt.</p>`
        : `<p class="meta-sub">Standard hostile combat.</p>`;

    panel.innerHTML = `
      <p><strong>Command:</strong> ${htmlEscape(getCommandDisplayLabel(command || "None"))}</p>
      ${contextualHint}
      ${targetHtml}
      <div class="admin-console-actions">
        <button id="btnCombatConfirm" class="primary-btn">Confirm</button>
      </div>
    `;

    const confirm = U.byId("btnCombatConfirm");
    if (confirm) {
      U.on(confirm, "click", () => {
        handlePlayerCommand(command || "attack", target?.id || null);
        renderCombatDetail(null, null);
        UI.renderCombatShell?.();
      });
    }
  }

  function renderBattlefieldSelections() {
    const enemyField = U.byId("enemyBattlefield");
    const allyField = U.byId("allyBattlefield");
    if (!enemyField || !allyField) return;

    U.qsa(".battle-slot", enemyField).forEach((slot, idx) => {
      const actor = getEnemies()[idx];
      if (!actor) return;

      U.on(slot, "click", () => {
        state.selectedTargetId = actor.id;
        renderCombatDetail(state.selectedCommand || "attack", actor.id);
      });
    });

    U.qsa(".battle-slot", allyField).forEach((slot, idx) => {
      const actor = getAllies()[idx];
      if (!actor) return;

      U.on(slot, "click", () => {
        state.selectedTargetId = actor.id;
        renderCombatDetail(state.selectedCommand || "item", actor.id);
      });
    });
  }

  function bindCombatButtons() {
    U.qsa("[data-combat-action]").forEach((btn) => {
      if (btn.dataset.combatBound === "true") return;
      btn.dataset.combatBound = "true";

      U.on(btn, "click", () => {
        const action = btn.dataset.combatAction;
        state.selectedCommand = action;

        const target =
          action === "defend" || action === "item" || action === "swap"
            ? null
            : chooseAutoTarget("enemy")?.id || null;

        renderCombatDetail(action, target);

        if (action === "defend" || action === "item" || action === "swap") {
          handlePlayerCommand(action, null);
          UI.renderCombatShell?.();
        }
      });
    });
  }

  function getEncounterRollChance() {
    const biome = S.getCurrentMapTile()?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";

    if (biome === "fungal_grove") return 0.16;
    if (biome === "wetland") return 0.12;
    if (biome === "river_channel") return 0.1;
    return state.randomEncounterBaseChance;
  }

  function maybeTriggerRandomEncounter() {
    if (S.getCurrentScreen?.() === "combat") return false;
    if (getCombat()?.active) return false;

    const lastAt = Number(S.getRuntime()?.timers?.lastRandomEncounterAt || 0);
    const now = Date.now();

    if (now - lastAt < state.randomEncounterCooldownMs) return false;
    if (Math.random() > getEncounterRollChance()) return false;

    const biome = S.getCurrentMapTile()?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";
    const wildlifeBias = biome === "river_channel" || biome === "wetland" || biome === "mudflats";
    const useWildlife = wildlifeBias ? Math.random() < 0.55 : Math.random() < 0.28;

    if (typeof S.setRuntimeTimer === "function") {
      S.setRuntimeTimer("lastRandomEncounterAt", now);
    } else {
      const timers = U.deepMerge(S.getRuntime()?.timers || {}, {
        lastRandomEncounterAt: now
      });
      S.updateRuntime({ timers });
    }

    if (useWildlife) {
      startWildlifeEncounter();
    } else {
      startRandomEncounter();
    }

    return true;
  }

  function bindCombatEvents() {
    U.eventBus.on("combat:started", () => {
      UI.renderCombatShell?.();
      renderBattlefieldSelections();
      renderCombatDetail(null, null);
      bindCombatButtons();
    });

    U.eventBus.on("combat:changed", () => {
      UI.renderCombatShell?.();
      renderBattlefieldSelections();
      bindCombatButtons();
    });

    U.eventBus.on("world:playerMoved", () => {
      maybeTriggerRandomEncounter();
    });
  }

  function startRandomEncounter() {
    const currentTile = S.getCurrentMapTile();
    const biome = currentTile?.biomeId || S.getWorld()?.currentBiomeId;

    const encounterId =
      biome === "fungal_grove" ? "fungal_boss" :
      biome === "wetland" ? "fungal_blight" :
      "fungal_blight";

    return startEncounter(encounterId, {
      encounterType: "fungal",
      captureAllowed: false
    });
  }

  function init() {
    if (state.initialized) return true;

    bindCombatEvents();
    state.initialized = true;
    U.eventBus.emit("combat:initialized");
    return true;
  }

  const API = {
    init,

    getCombat,
    getAllActors,
    getAllies,
    getEnemies,
    getActorById,
    getCurrentActor,
    getEncounterType,

    makeEnemyActor,
    makeWildlifeActor,
    buildEncounterEnemies,
    buildWildlifeEncounterEnemies,

    startEncounter,
    startRandomEncounter,
    startWildlifeEncounter,

    handlePlayerCommand,
    nextTurn,
    performAttack,
    performKnockout,
    performTame,
    performDefend,
    performAnalyze,
    performItem,
    performSwap,

    checkBattleEnd,
    captureWildlifeResults,
    markEncounterSourcePoiResolved,
    syncPlayerStatsFromCombat,
    maybeTriggerRandomEncounter,

    renderCombatDetail,
    renderBattlefieldSelections,
    bindCombatButtons
  };

  window.GL_COMBAT = API;

  return Object.freeze(API);
})();