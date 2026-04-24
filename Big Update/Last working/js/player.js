window.GrabLabPlayer = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;

  const state = {
    initialized: false
  };

  function getPlayer() {
    return S.getPlayer();
  }

  function getStats() {
    return S.getPlayerStats();
  }

  function getSkills() {
    return U.deepClone(getPlayer()?.skills || {});
  }

  function getSkillLevel(skillId) {
    const skills = getPlayer()?.skills || {};
    return Number(skills?.[skillId] || 0);
  }

  function getSkillXpTable(level = 0) {
    const safeLevel = Math.max(0, Number(level || 0));
    if (safeLevel <= 0) return 10;
    return 10 + (safeLevel * 8) + Math.floor((safeLevel * safeLevel) * 2.5);
  }

  function ensurePlayerProgressBuckets() {
    const player = getPlayer();

    if (!U.isObject(player.skillProgress)) {
      player.skillProgress = {};
    }

    if (!Array.isArray(player.levelRewardsClaimed)) {
      player.levelRewardsClaimed = [];
    }

    if (!Array.isArray(player.discoveredActions)) {
      player.discoveredActions = [];
    }

    if (!U.isObject(player.skillUseCounts)) {
      player.skillUseCounts = {};
    }

    return player;
  }

  function getSkillProgress(skillId) {
    const player = ensurePlayerProgressBuckets();
    if (!U.isObject(player.skillProgress[skillId])) {
      player.skillProgress[skillId] = {
        xp: 0,
        level: getSkillLevel(skillId)
      };
    }
    return player.skillProgress[skillId];
  }

  function syncSkillProgressToSkills(skillId) {
    const player = ensurePlayerProgressBuckets();
    const progress = getSkillProgress(skillId);

    if (!U.isObject(player.skills)) {
      player.skills = {};
    }

    player.skills[skillId] = Number(progress.level || 0);
    return player.skills[skillId];
  }

  function getPlayerLevel() {
    return Number(getStats()?.level || 1);
  }

  function getXpForLevel(level = 1) {
    const safeLevel = Math.max(1, Number(level || 1));
    let total = 0;

    for (let i = 1; i < safeLevel; i += 1) {
      total += 100 + ((i - 1) * 45);
    }

    return total;
  }

  function getXpNeededForNextLevel(level = getPlayerLevel()) {
    const safeLevel = Math.max(1, Number(level || 1));
    return 100 + ((safeLevel - 1) * 45);
  }

  function clampCoreStats() {
    const stats = getStats();

    const clamped = {
      health: U.clamp(Number(stats.health || 0), 0, Number(stats.maxHealth || 100)),
      stamina: U.clamp(Number(stats.stamina || 0), 0, Number(stats.maxStamina || 100)),
      hunger: U.clamp(Number(stats.hunger || 0), 0, 100),
      thirst: U.clamp(Number(stats.thirst || 0), 0, 100),
      infection: U.clamp(Number(stats.infection || 0), 0, 100),
      morale: U.clamp(Number(stats.morale || 0), 0, 100),
      focus: U.clamp(Number(stats.focus || 0), 0, 100),
      hygiene: U.clamp(Number(stats.hygiene || 0), 0, 100),
      xp: Math.max(0, Number(stats.xp || 0)),
      level: U.clamp(Number(stats.level || 1), 1, CFG.PLAYER.maxLevel)
    };

    S.updatePlayerStats(clamped);
    return clamped;
  }

  function awardPlayerXp(amount = 0, reason = "progress") {
    const xpGain = Math.max(0, Number(amount || 0));
    if (!xpGain) return 0;

    const stats = getStats();
    const newXp = Number(stats.xp || 0) + xpGain;

    S.updatePlayerStats({ xp: newXp });
    S.logActivity(`Gained ${xpGain} XP from ${reason}.`, "success");

    checkLevelUp();
    return xpGain;
  }

  function checkLevelUp() {
    const stats = getStats();
    let level = Number(stats.level || 1);
    let xp = Number(stats.xp || 0);
    let leveled = false;

    while (level < CFG.PLAYER.maxLevel) {
      const threshold = getXpForLevel(level + 1);
      if (xp < threshold) break;

      level += 1;
      leveled = true;

      const nextMaxHealth = Number(stats.maxHealth || 100) + 8;
      const nextMaxStamina = Number(stats.maxStamina || 100) + 6;
      const nextUnspent = Number(stats.unspentPerkPoints || 0) + 1;

      S.updatePlayerStats({
        level,
        maxHealth: nextMaxHealth,
        maxStamina: nextMaxStamina,
        health: nextMaxHealth,
        stamina: nextMaxStamina,
        unspentPerkPoints: nextUnspent
      });

      S.logActivity(`Level up! You reached level ${level}.`, "success");
      S.addToast(`Level ${level}!`, "success");
    }

    if (leveled) {
      clampCoreStats();
    }

    return leveled;
  }

  function awardSkillXp(skillId, amount = 1, reason = "use") {
    if (!skillId) return null;

    const player = ensurePlayerProgressBuckets();
    const progress = getSkillProgress(skillId);
    const useCounts = player.skillUseCounts;

    const skillDef = S.getSkillDef(skillId);
    const firstTimeBonus = useCounts[skillId] ? 0 : 12;
    const baseGain = Math.max(0, Number(amount || 0));
    const totalGain = baseGain + firstTimeBonus;

    progress.xp = Number(progress.xp || 0) + totalGain;
    useCounts[skillId] = Number(useCounts[skillId] || 0) + 1;

    let leveled = false;

    while (progress.level < 20) {
      const needed = getSkillXpTable(progress.level);
      if (progress.xp < needed) break;
      progress.xp -= needed;
      progress.level += 1;
      leveled = true;
    }

    syncSkillProgressToSkills(skillId);

    if (leveled) {
      const label = skillDef?.name || U.titleCase(skillId);
      S.logActivity(`${label} increased to ${progress.level}.`, "success");
      S.addToast(`${label} +1`, "success");
      awardPlayerXp(10 + progress.level * 2, `${label} training`);
    } else if (totalGain > 0) {
      S.logActivity(`Gained ${totalGain} ${U.titleCase(skillId)} XP from ${reason}.`, "info");
    }

    return U.deepClone(progress);
  }

  function useAction(actionId, options = {}) {
    const player = ensurePlayerProgressBuckets();
    if (!player.discoveredActions.includes(actionId)) {
      player.discoveredActions.push(actionId);
    }

    const statChanges = options.statChanges || {};
    const skillId = options.skillId || null;
    const skillXp = Number(options.skillXp || 0);
    const playerXp = Number(options.playerXp || 0);

    Object.entries(statChanges).forEach(([statKey, amount]) => {
      S.modifyPlayerStat(statKey, Number(amount || 0), {});
    });

    if (skillId && skillXp > 0) {
      awardSkillXp(skillId, skillXp, actionId);
    }

    if (playerXp > 0) {
      awardPlayerXp(playerXp, actionId);
    }

    clampCoreStats();
    return true;
  }

  function registerMovementAction() {
    return useAction("movement", {
      skillId: "boating",
      skillXp: 1,
      playerXp: 1,
      statChanges: {
        stamina: -1
      }
    });
  }

  function registerHarvestAction() {
    return useAction("harvest", {
      skillId: "harvesting",
      skillXp: 2,
      playerXp: 2,
      statChanges: {
        stamina: -2,
        hunger: -1,
        thirst: -1
      }
    });
  }

  function registerFishingAction() {
    return useAction("fishing", {
      skillId: "fishing",
      skillXp: 3,
      playerXp: 3,
      statChanges: {
        stamina: -2,
        hunger: -1,
        thirst: -1
      }
    });
  }

  function registerCraftAction() {
    return useAction("crafting", {
      skillId: "crafting",
      skillXp: 3,
      playerXp: 4,
      statChanges: {
        stamina: -2
      }
    });
  }

  function registerBuildAction() {
    return useAction("building", {
      skillId: "carpentry",
      skillXp: 4,
      playerXp: 4,
      statChanges: {
        stamina: -3,
        hunger: -1,
        thirst: -1
      }
    });
  }

  function registerCombatAction(weaponType = "combat_blunt") {
    return useAction("combat", {
      skillId: weaponType,
      skillXp: 3,
      playerXp: 4,
      statChanges: {
        stamina: -3
      }
    });
  }

  function registerBreedAction() {
    return useAction("breeding", {
      skillId: "breeding",
      skillXp: 4,
      playerXp: 5,
      statChanges: {
        focus: -2
      }
    });
  }

  function adjustHealth(amount = 0, reason = "health change") {
    const result = S.modifyPlayerStat("health", Number(amount || 0), {
      min: 0,
      maxKey: "maxHealth"
    });

    if (Number(amount || 0) < 0) {
      S.logActivity(`Lost ${Math.abs(Number(amount || 0))} health from ${reason}.`, "warning");
    } else if (Number(amount || 0) > 0) {
      S.logActivity(`Recovered ${Number(amount || 0)} health from ${reason}.`, "success");
    }

    checkCriticalNeeds();
    return result;
  }

  function adjustStamina(amount = 0, reason = "stamina change") {
    const result = S.modifyPlayerStat("stamina", Number(amount || 0), {
      min: 0,
      maxKey: "maxStamina"
    });

    if (Number(amount || 0) < 0) {
      S.logActivity(`Used ${Math.abs(Number(amount || 0))} stamina for ${reason}.`, "info");
    }

    return result;
  }

  function adjustNeed(statKey, amount = 0, reason = "need change") {
    const stat = String(statKey || "");
    if (!["hunger", "thirst", "infection", "morale", "focus", "hygiene"].includes(stat)) {
      return null;
    }

    const current = Number(getStats()?.[stat] || 0);
    const next = U.clamp(current + Number(amount || 0), 0, 100);

    S.updatePlayerStats({ [stat]: next });

    if (amount !== 0) {
      const direction = amount > 0 ? "Changed" : "Reduced";
      S.logActivity(`${direction} ${stat} from ${reason}.`, "info");
    }

    checkCriticalNeeds();
    return next;
  }

  function fullyRestoreNeeds() {
    S.updatePlayerStats({
      hunger: 100,
      thirst: 100,
      stamina: Number(getStats()?.maxStamina || 100),
      morale: 100,
      focus: 100,
      hygiene: 100
    });

    S.logActivity("Fully restored needs.", "success");
    return true;
  }

  function fullHeal() {
    S.updatePlayerStats({
      health: Number(getStats()?.maxHealth || 100),
      stamina: Number(getStats()?.maxStamina || 100),
      infection: 0
    });

    S.logActivity("Fully healed.", "success");
    return true;
  }

  function checkCriticalNeeds() {
    const stats = getStats();

    if (Number(stats.health || 0) <= 0) {
      S.addToast("You collapsed.", "error");
      S.logActivity("The ranger has collapsed.", "error");
      return "downed";
    }

    if (Number(stats.hunger || 0) <= 5) {
      S.addToast("Starving!", "error");
    }

    if (Number(stats.thirst || 0) <= 5) {
      S.addToast("Dehydrated!", "error");
    }

    if (Number(stats.infection || 0) >= 85) {
      S.addToast("Infection critical!", "error");
    }

    return "ok";
  }

  function getEquipment() {
    return U.deepClone(getPlayer()?.equipment || {});
  }

  function equipItem(slotKey, itemId) {
    const equipment = getPlayer()?.equipment || {};
    const itemDef = S.getItemDef(itemId);

    if (!slotKey || !itemId) return false;
    if (!itemDef) return false;

    equipment[slotKey] = itemId;
    S.updatePlayer({ equipment });

    S.logActivity(`Equipped ${itemDef.name || U.titleCase(itemId)} to ${slotKey}.`, "success");
    return true;
  }

  function unequipItem(slotKey) {
    const equipment = getPlayer()?.equipment || {};
    if (!slotKey || !equipment[slotKey]) return false;

    const removed = equipment[slotKey];
    equipment[slotKey] = null;

    S.updatePlayer({ equipment });
    S.logActivity(`Unequipped ${U.titleCase(removed)} from ${slotKey}.`, "info");
    return true;
  }

  function getEquippedItemDef(slotKey) {
    const itemId = getPlayer()?.equipment?.[slotKey];
    if (!itemId) return null;
    return S.getItemDef(itemId);
  }

  function getCarryWeight() {
    const inventory = U.toArray(S.getInventory("player"));

    return inventory.reduce((sum, entry) => {
      const def = S.getItemDef(entry.itemId);
      const weight = Number(def?.weight || 1);
      const qty = Number(entry.quantity || 1);
      return sum + (weight * qty);
    }, 0);
  }

  function recalcEncumbrance() {
    const weight = getCarryWeight();
    S.updatePlayerStats({ encumbrance: weight });
    return weight;
  }

  function consumeItem(itemId, quantity = 1) {
    const def = S.getItemDef(itemId);
    if (!def) return false;

    if (!S.hasItem("player", itemId, quantity)) {
      S.addToast(`Missing ${def.name || itemId}.`, "error");
      return false;
    }

    S.removeItem("player", itemId, quantity);

    const effects = U.toArray(def.effects);
    const statPatch = {};

    effects.forEach((effect) => {
      const stat = effect?.stat;
      const value = Number(effect?.value || 0);
      if (!stat) return;

      if (["health", "stamina", "hunger", "thirst", "infection", "morale", "focus", "hygiene"].includes(stat)) {
        const current = Number(getStats()?.[stat] || 0);
        const max = stat === "health"
          ? Number(getStats()?.maxHealth || 100)
          : stat === "stamina"
            ? Number(getStats()?.maxStamina || 100)
            : 100;

        statPatch[stat] = U.clamp(current + value, 0, max);
      }
    });

    if (Object.keys(statPatch).length) {
      S.updatePlayerStats(statPatch);
    }

    S.logActivity(`Consumed ${def.name || U.titleCase(itemId)}.`, "success");
    recalcEncumbrance();
    checkCriticalNeeds();
    return true;
  }

  function discoverSpecies(speciesId) {
    if (!speciesId) return false;

    const player = getPlayer();
    const discovered = U.toArray(player.discoveredSpecies);

    if (!discovered.includes(speciesId)) {
      discovered.push(speciesId);
      S.updatePlayer({ discoveredSpecies: discovered });
      S.logActivity(`Discovered species: ${U.titleCase(speciesId)}.`, "success");
      awardPlayerXp(6, `discovering ${speciesId}`);
      return true;
    }

    return false;
  }

  function addStatusEffect(effectId) {
    if (!effectId) return false;

    const effects = U.toArray(getPlayer()?.statusEffects);
    if (!effects.includes(effectId)) {
      effects.push(effectId);
      S.updatePlayer({ statusEffects: effects });
      S.logActivity(`Gained status effect: ${U.titleCase(effectId)}.`, "warning");
      return true;
    }

    return false;
  }

  function removeStatusEffect(effectId) {
    if (!effectId) return false;

    const effects = U.toArray(getPlayer()?.statusEffects).filter((id) => id !== effectId);
    S.updatePlayer({ statusEffects: effects });
    S.logActivity(`Removed status effect: ${U.titleCase(effectId)}.`, "info");
    return true;
  }

  function initPlayerProgress() {
    ensurePlayerProgressBuckets();

    const skills = getPlayer()?.skills || {};
    Object.keys(skills).forEach((skillId) => {
      const progress = getSkillProgress(skillId);
      progress.level = Number(skills[skillId] || 0);
    });

    clampCoreStats();
    recalcEncumbrance();
    return true;
  }

  function seedStarterCompanionIfNeeded() {
    const party = S.getParty();
    const active = U.toArray(party?.active);

    if (active.length > 0) return false;

    S.addCompanion({
      id: "comp_mudminnow_1",
      name: "Muddy",
      speciesId: "mud_minnow",
      classId: "support",
      level: 1,
      traits: ["wet", "loyal"],
      stats: {
        health: 42,
        maxHealth: 42,
        stamina: 30,
        maxStamina: 30
      }
    });

    S.logActivity("Starter companion joined: Muddy.", "success");
    return true;
  }

  function bindActionHooks() {
    U.eventBus.on("world:playerMoved", registerMovementAction);
  }

  function init() {
    if (state.initialized) return true;

    initPlayerProgress();
    seedStarterCompanionIfNeeded();
    bindActionHooks();

    state.initialized = true;
    U.eventBus.emit("player:initialized");
    return true;
  }

  const API = {
    init,

    getPlayer,
    getStats,
    getSkills,
    getSkillLevel,
    getSkillXpTable,
    getPlayerLevel,
    getXpForLevel,
    getXpNeededForNextLevel,

    ensurePlayerProgressBuckets,
    getSkillProgress,
    syncSkillProgressToSkills,

    clampCoreStats,
    awardPlayerXp,
    checkLevelUp,
    awardSkillXp,

    useAction,
    registerMovementAction,
    registerHarvestAction,
    registerFishingAction,
    registerCraftAction,
    registerBuildAction,
    registerCombatAction,
    registerBreedAction,

    adjustHealth,
    adjustStamina,
    adjustNeed,
    fullyRestoreNeeds,
    fullHeal,
    checkCriticalNeeds,

    getEquipment,
    equipItem,
    unequipItem,
    getEquippedItemDef,

    getCarryWeight,
    recalcEncumbrance,
    consumeItem,

    discoverSpecies,
    addStatusEffect,
    removeStatusEffect,

    initPlayerProgress,
    seedStarterCompanionIfNeeded
  };

  window.GL_PLAYER = API;

  return Object.freeze(API);
})();