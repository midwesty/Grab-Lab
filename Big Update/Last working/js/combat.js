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
    selectedTargetId: null
  };

  function getCombat() {
    return S.getRuntime()?.combat || {};
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
    return actor && !actor.isDown && actorHp(actor) > 0;
  }

  function markActorDown(actor) {
    if (!actor) return;
    actor.stats.health = 0;
    actor.isDown = true;
    actor.hasActed = true;
  }

  function getAllActors() {
    const combat = getCombat();
    return U.toArray(combat.actors);
  }

  function getAllies() {
    const combat = getCombat();
    return U.toArray(combat.allies);
  }

  function getEnemies() {
    const combat = getCombat();
    return U.toArray(combat.enemies);
  }

  function getActorById(actorId) {
    return getAllActors().find((actor) => actor.id === actorId) || null;
  }

  function getCurrentActor() {
    const combat = getCombat();
    const actors = getAllActors();
    return actors[Number(combat.turnIndex || 0)] || null;
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
      portrait: CFG.IMAGE_FALLBACKS.portraitPlayer,
      combatMoves: ["attack", "defend", "analyze", "item"],
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
    const companions = U.toArray(S.getParty()?.active);

    return companions.map((companion, i) => {
      return makeActorBase({
        id: `actor_comp_${i}_${companion.id}`,
        sourceId: companion.id,
        name: companion.name || "Companion",
        speciesId: companion.speciesId || null,
        classId: companion.classId || "support",
        portrait: companion.portrait || CFG.IMAGE_FALLBACKS.portraitCompanion,
        level: Number(companion.level || 1),
        combatMoves: U.toArray(companion.combatMoves).length
          ? companion.combatMoves
          : ["attack", "defend"],
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
      fungal_boss: ["Bloom Tyrant", "The Rot Crown", "Spore Bishop"]
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
      name: options.name || generateEnemyName(kind),
      classId: kind,
      level,
      portrait: CFG.IMAGE_FALLBACKS.portraitCompanion,
      combatMoves: kind === "fungal_boss"
        ? ["attack", "attack", "spore_burst", "defend"]
        : ["attack", "spore_burst", "defend"],
      stats: base
    }, "enemy", "enemy");
  }

  function buildEncounterEnemies(encounterId = "fungal_blight") {
    const playerLevel = P.getPlayerLevel();
    const currentTile = S.getCurrentMapTile();
    const biome = currentTile?.biomeId || S.getWorld()?.currentBiomeId || "field_station_island";

    if (encounterId === "fungal_boss") {
      return [
        makeEnemyActor({ kind: "fungal_boss", level: playerLevel + 1 }),
        makeEnemyActor({ kind: "fungal_blight", level: playerLevel }),
        makeEnemyActor({ kind: "fungal_stalker", level: playerLevel })
      ];
    }

    const count =
      biome === "fungal_grove" ? U.randInt(3, 5) :
      biome === "wetland" ? U.randInt(2, 4) :
      U.randInt(1, 3);

    const enemies = [];
    for (let i = 0; i < count; i += 1) {
      enemies.push(
        makeEnemyActor({
          kind: U.randBool(0.25) ? "fungal_stalker" : "fungal_blight",
          level: Math.max(1, playerLevel + U.randInt(-1, 1))
        })
      );
    }

    return enemies;
  }

  function sortActorsByInitiative(actors = []) {
    return [...actors]
      .map((actor) => ({
        ...actor,
        initiative: rollInitiative(actor)
      }))
      .sort((a, b) => b.initiative - a.initiative);
  }

  function syncCombatState(allies, enemies, encounterId = "fungal_blight") {
    const actors = sortActorsByInitiative([...allies, ...enemies]);

    S.startCombat(encounterId, {
      actors,
      allies,
      enemies,
      turnIndex: 0,
      round: 1,
      log: []
    });

    state.selectedCommand = null;
    state.selectedTargetId = null;
    UI.renderCombatShell();
    return getCombat();
  }

  function startEncounter(encounterId = "fungal_blight", options = {}) {
    const allies = [buildPlayerActor(), ...buildCompanionActors()];
    const enemies = options.enemies || buildEncounterEnemies(encounterId);

    syncCombatState(allies, enemies, encounterId);
    S.pushCombatLog(`Encounter started: ${U.titleCase(encounterId)}.`);
    S.logActivity(`Combat started: ${U.titleCase(encounterId)}.`, "warning");

    A.playMusic("combat").catch?.(() => {});
    return getCombat();
  }

  function syncActorStateBackToArrays(actor) {
    const combat = getCombat();
    const actors = getAllActors();
    const allies = getAllies();
    const enemies = getEnemies();

    const patchIn = (list) => {
      const idx = list.findIndex((entry) => entry.id === actor.id);
      if (idx >= 0) list[idx] = actor;
    };

    patchIn(actors);
    patchIn(allies);
    patchIn(enemies);

    S.setCombatState({
      actors,
      allies,
      enemies
    });

    return combat;
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

    if (move === "spore_burst") {
      power += 3;
    }

    if (move === "heavy_strike") {
      power += 4;
    }

    if (defender?.defending) {
      power *= (1 - CFG.COMBAT.defendReduction);
    }

    const crit = Math.random() < CFG.COMBAT.critChanceBase;
    if (crit) {
      power = Math.floor(power * CFG.COMBAT.critMultiplier);
    }

    const damage = Math.max(1, Math.floor(power));
    return {
      damage,
      crit
    };
  }

  function applyDamage(target, amount, sourceText = "an attack") {
    const dmg = Math.max(0, Number(amount || 0));
    const hp = Number(target?.stats?.health || 0);
    target.stats.health = Math.max(0, hp - dmg);

    if (target.stats.health <= 0) {
      markActorDown(target);
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

  function performAttack(attackerId, targetId, move = "attack") {
    const attacker = getActorById(attackerId);
    const target = getActorById(targetId);

    if (!attacker || !target || !isActorAlive(attacker) || !isActorAlive(target)) {
      return false;
    }

    const result = calculateDamage(attacker, target, move);
    const dmg = applyDamage(target, result.damage, move);

    const critText = result.crit ? " Critical hit!" : "";
    S.pushCombatLog(`${attacker.name} used ${move} on ${target.name} for ${dmg} damage.${critText}`);

    if (attacker.kind === "player") {
      P.registerCombatAction("combat_blunt");
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
      `${actor.name} analyzes ${target.name}: HP ${target.stats.health}/${target.stats.maxHealth}, ATK ${target.stats.attack}, DEF ${target.stats.defense}.`
    );

    actor.hasActed = true;
    syncActorStateBackToArrays(actor);
    nextTurn();
    return true;
  }

  function performItem(actorId) {
    const actor = getActorById(actorId);
    if (!actor || !isActorAlive(actor)) return false;

    const usedWater = S.hasItem("player", "fresh_water", 1);
    const usedBandage = S.hasItem("player", "bandage_basic", 1);

    if (usedBandage) {
      S.removeItem("player", "bandage_basic", 1);
      applyHealing(actor, 16, "bandage");
      S.pushCombatLog(`${actor.name} used a bandage.`);
    } else if (usedWater) {
      S.removeItem("player", "fresh_water", 1);
      applyHealing(actor, 8, "fresh water");
      S.pushCombatLog(`${actor.name} drank fresh water and steadied up.`);
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

    S.pushCombatLog(`${actor.name} considers switching, but reserve swapping is not implemented yet.`);
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

    const allies = actors.filter((actor) => actor.side === "ally");
    const enemies = actors.filter((actor) => actor.side === "enemy");

    const sorted = sortActorsByInitiative(actors);
    S.setCombatState({
      actors: sorted,
      allies,
      enemies,
      turnIndex: 0,
      round: Number(getCombat()?.round || 1) + 1
    });

    S.pushCombatLog(`Round ${getCombat()?.round || 1} begins.`);
  }

  function nextTurn() {
    if (checkBattleEnd()) return;

    let actors = getAllActors();
    let combat = getCombat();
    let nextIndex = Number(combat.turnIndex || 0) + 1;

    while (nextIndex < actors.length) {
      const candidate = actors[nextIndex];
      if (candidate && isActorAlive(candidate) && !candidate.hasActed) {
        S.setCombatState({ turnIndex: nextIndex });
        UI.renderCombatShell();
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
    UI.renderCombatShell();
    maybeRunEnemyTurn();
    return true;
  }

  function maybeRunEnemyTurn() {
    const actor = getCurrentActor();
    if (!actor || actor.side !== "enemy" || !isActorAlive(actor)) return;

    window.setTimeout(() => {
      if (!isActorAlive(actor)) {
        nextTurn();
        return;
      }

      const target = chooseAutoTarget("ally");
      if (!target) {
        checkBattleEnd();
        return;
      }

      const move = U.pick(actor.combatMoves) || "attack";

      if (move === "defend") {
        performDefend(actor.id);
        return;
      }

      performAttack(actor.id, target.id, move);
      nextTurn();
    }, 450);
  }

  function handlePlayerCommand(command, targetId = null) {
    const actor = getCurrentActor();
    if (!actor || actor.side !== "ally" || !isActorAlive(actor)) return false;

    const target =
      targetId ||
      state.selectedTargetId ||
      (command === "analyze" ? chooseAutoTarget("enemy")?.id : chooseAutoTarget("enemy")?.id);

    switch (command) {
      case "attack":
      case "skill":
        if (!target) return false;
        performAttack(actor.id, target, command === "skill" ? "heavy_strike" : "attack");
        nextTurn();
        return true;

      case "defend":
        performDefend(actor.id);
        return true;

      case "analyze":
        if (!target) return false;
        performAnalyze(actor.id, target);
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

  function handleVictory() {
    const enemies = getEnemies();
    const totalXp = enemies.reduce((sum, enemy) => sum + 10 + (Number(enemy.level || 1) * 4), 0);
    const money = enemies.reduce((sum) => sum + U.randInt(3, 10), 0);

    P.awardPlayerXp(totalXp, "combat victory");
    S.updatePlayer({
      funds: Number(S.getPlayer()?.funds || CFG.PLAYER.startingFunds || 0) + money
    });

    S.pushCombatLog(`Victory! Gained ${totalXp} XP and ${money} funds.`);
    S.logActivity(`Won the battle. Looted ${money} funds.`, "success");
    S.addToast("Victory!", "success");

    syncPlayerStatsFromCombat();
    S.endCombat("victory");
    UI.showScreen("game");
    UI.renderEverything();
    A.playMusic("exploration").catch?.(() => {});
  }

  function handleDefeat() {
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
    UI.showScreen("game");
    UI.renderEverything();
    A.playMusic("exploration").catch?.(() => {});
  }

  function syncPlayerStatsFromCombat() {
    const playerActor = getActorById("actor_player");
    if (!playerActor) return false;

    S.updatePlayerStats({
      health: playerActor.stats.health,
      stamina: playerActor.stats.stamina
    });

    return true;
  }

  function renderCombatDetail(command = null, targetId = null) {
    const panel = U.byId("combatDetailPanel");
    if (!panel) return;

    const target = targetId ? getActorById(targetId) : chooseAutoTarget("enemy");
    const targetHtml = target
      ? `
        <p><strong>Target:</strong> ${htmlEscape(target.name)}</p>
        <p><strong>HP:</strong> ${target.stats.health}/${target.stats.maxHealth}</p>
        <p><strong>ATK/DEF/SPD:</strong> ${target.stats.attack}/${target.stats.defense}/${target.stats.speed}</p>
      `
      : `<p>No target selected.</p>`;

    panel.innerHTML = `
      <p><strong>Command:</strong> ${htmlEscape(command || "None")}</p>
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
        UI.renderCombatShell();
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

  function renderBattlefieldSelections() {
    const enemyField = U.byId("enemyBattlefield");
    const allyField = U.byId("allyBattlefield");
    if (!enemyField || !allyField) return;

    const wireSlots = (root, side) => {
      U.qsa(".battle-slot", root).forEach((slot, idx) => {
        const actor = side === "enemy" ? getEnemies()[idx] : [makeActorBase(), ...getAllies()][idx];
        if (!actor) return;

        U.on(slot, "click", () => {
          state.selectedTargetId = actor.id;
          renderCombatDetail(state.selectedCommand || "attack", actor.id);
        });
      });
    };

    wireSlots(enemyField, "enemy");
    wireSlots(allyField, "ally");
  }

  function bindCombatButtons() {
    U.qsa("[data-combat-action]").forEach((btn) => {
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
          UI.renderCombatShell();
        }
      });
    });
  }

  function bindCombatEvents() {
    U.eventBus.on("combat:started", () => {
      UI.renderCombatShell();
      renderBattlefieldSelections();
      renderCombatDetail(null, null);
      bindCombatButtons();
    });

    U.eventBus.on("combat:changed", () => {
      UI.renderCombatShell();
      renderBattlefieldSelections();
      bindCombatButtons();
    });
  }

  function startRandomEncounter() {
    const currentTile = S.getCurrentMapTile();
    const biome = currentTile?.biomeId || S.getWorld()?.currentBiomeId;

    const encounterId =
      biome === "fungal_grove" ? "fungal_boss" :
      biome === "wetland" ? "fungal_blight" :
      "fungal_blight";

    return startEncounter(encounterId);
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
    startEncounter,
    startRandomEncounter,
    handlePlayerCommand,
    nextTurn,
    performAttack,
    performDefend,
    performAnalyze,
    performItem,
    performSwap,
    checkBattleEnd,
    syncPlayerStatsFromCombat
  };

  window.GL_COMBAT = API;

  return Object.freeze(API);
})();