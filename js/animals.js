window.GrabLabAnimals = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;

  const state = {
    initialized: false
  };

  function getAnimalDefs() {
    return U.toArray(S.getData()?.animals);
  }

  function getAnimalDef(speciesId) {
    return S.getAnimalDef(speciesId);
  }

  function ensureAnimalBuckets() {
    const base = S.getBase();

    if (!Array.isArray(base.habitats)) {
      base.habitats = [];
    }

    if (!Array.isArray(base.specimens)) {
      base.specimens = [];
    }

    if (!Array.isArray(base.releasedSpecimens)) {
      base.releasedSpecimens = [];
    }

    if (!Array.isArray(base.breedingJobs)) {
      base.breedingJobs = [];
    }

    if (!Array.isArray(base.cloneQueue)) {
      base.cloneQueue = [];
    }

    return base;
  }

  function ensurePlayerCreatureBuckets() {
    const player = S.getPlayer();

    if (!Array.isArray(player.discoveredSpecies)) {
      player.discoveredSpecies = [];
    }

    if (!Array.isArray(player.dnaRegistry)) {
      player.dnaRegistry = [];
    }

    if (!Array.isArray(player.captureLog)) {
      player.captureLog = [];
    }

    return player;
  }

  function getBaseSpecimens() {
    ensureAnimalBuckets();
    return U.toArray(S.getBase()?.specimens);
  }

  function getReleasedSpecimens() {
    ensureAnimalBuckets();
    return U.toArray(S.getBase()?.releasedSpecimens);
  }

  function getHabitats() {
    ensureAnimalBuckets();
    return U.toArray(S.getBase()?.habitats);
  }

  function getHabitatDefByStructureId(structureId) {
    const structure = S.getStructureDef(structureId);
    if (!structure) return null;

    return {
      id: structure.id,
      name: structure.name || U.titleCase(structure.id),
      habitatType: structure.habitatType || structure.capacityType || "general",
      capacity: Number(structure.capacity || structure.maxOccupants || 2),
      sizeLimit: structure.sizeLimit || "medium",
      water: Boolean(structure.water),
      flying: Boolean(structure.flying)
    };
  }

  function getAnimalSize(speciesId) {
    const def = getAnimalDef(speciesId);
    return def?.size || "medium";
  }

  function getAnimalFamily(speciesId) {
    const def = getAnimalDef(speciesId);
    return def?.family || "unknown";
  }

  function getAnimalName(speciesId) {
    const def = getAnimalDef(speciesId);
    return def?.name || U.titleCase(speciesId || "creature");
  }

  function getAnimalBaseTraits(speciesId) {
    const def = getAnimalDef(speciesId);
    return U.toArray(def?.traits);
  }

  function getAnimalAllowedRoles(speciesId) {
    const def = getAnimalDef(speciesId);
    return U.toArray(def?.allowedRoles?.length ? def.allowedRoles : ["support", "scout", "fighter"]);
  }

  function getSpeciesPortrait(speciesId) {
    const def = getAnimalDef(speciesId);
    return def?.portrait || CFG.IMAGE_FALLBACKS.portraitCompanion;
  }

  function getDefaultSpecimenStats(speciesId, level = 1) {
    const def = getAnimalDef(speciesId) || {};
    const lvl = Math.max(1, Number(level || 1));

    const baseHealth = Number(def.baseHealth || 30);
    const baseStamina = Number(def.baseStamina || 24);

    return {
      health: baseHealth + (lvl * 4),
      maxHealth: baseHealth + (lvl * 4),
      stamina: baseStamina + (lvl * 3),
      maxStamina: baseStamina + (lvl * 3),
      attack: Number(def.baseAttack || 6) + lvl,
      defense: Number(def.baseDefense || 4) + Math.floor(lvl / 2),
      speed: Number(def.baseSpeed || 5) + Math.floor(lvl / 2)
    };
  }

  function createSpecimen(speciesId, options = {}) {
    const def = getAnimalDef(speciesId);

    if (!speciesId) {
      throw new Error("Cannot create specimen without a speciesId.");
    }

    const level = Math.max(1, Number(options.level || 1));
    const stats = U.deepMerge(getDefaultSpecimenStats(speciesId, level), options.stats || {});
    const baseTraits = getAnimalBaseTraits(speciesId);
    const extraTraits = U.toArray(options.traits);
    const mergedTraits = U.uniqueBy([...baseTraits, ...extraTraits], (x) => String(x));

    const specimen = {
      id: options.id || U.uid("spec"),
      speciesId,
      name: options.name || def?.defaultNickname || getAnimalName(speciesId),
      nickname: options.nickname || options.name || null,
      family: getAnimalFamily(speciesId),
      size: options.size || getAnimalSize(speciesId),
      classId: options.classId || null,
      level,
      xp: Number(options.xp || 0),
      role: options.role || null,
      temperament: options.temperament || def?.temperament || "neutral",
      habitatType: options.habitatType || def?.habitatType || "general",
      tags: U.uniqueBy([...U.toArray(def?.tags), ...U.toArray(options.tags)], (x) => String(x)),
      traits: mergedTraits,
      mutations: U.uniqueBy(U.toArray(options.mutations), (x) => String(x)),
      colors: U.toArray(options.colors).length ? U.toArray(options.colors) : U.toArray(def?.colors),
      portrait: options.portrait || getSpeciesPortrait(speciesId),
      sprite: options.sprite || def?.sprite || null,
      stats,
      needs: {
        hunger: Number(options.needs?.hunger ?? 100),
        comfort: Number(options.needs?.comfort ?? 75),
        cleanliness: Number(options.needs?.cleanliness ?? 75)
      },
      genetics: U.deepMerge({
        generation: Number(options.genetics?.generation || 1),
        lineage: U.toArray(options.genetics?.lineage),
        dominantTraits: U.toArray(options.genetics?.dominantTraits),
        recessiveTraits: U.toArray(options.genetics?.recessiveTraits)
      }, options.genetics || {}),
      combatMoves: U.toArray(options.combatMoves).length ? U.toArray(options.combatMoves) : U.toArray(def?.combatMoves),
      allowedRoles: getAnimalAllowedRoles(speciesId),
      capturedAt: options.capturedAt || U.isoNow(),
      lastUpdatedAt: U.isoNow(),
      notes: options.notes || ""
    };

    return specimen;
  }

  function listSpecimensBySpecies(speciesId) {
    return getBaseSpecimens().filter((specimen) => specimen.speciesId === speciesId);
  }

  function getSpecimen(specimenId) {
    return getBaseSpecimens().find((entry) => entry.id === specimenId) || null;
  }

  function updateSpecimen(specimenId, patch = {}) {
    const specimens = getBaseSpecimens();
    const target = specimens.find((entry) => entry.id === specimenId);
    if (!target) return null;

    Object.assign(target, U.deepMerge(target, patch), {
      lastUpdatedAt: U.isoNow()
    });

    S.updateBase({ specimens });
    return target;
  }

  function removeSpecimen(specimenId) {
    const specimens = getBaseSpecimens();
    const next = specimens.filter((entry) => entry.id !== specimenId);

    if (next.length === specimens.length) return false;

    S.updateBase({ specimens: next });

    const party = S.getParty();
    const active = U.toArray(party.active).filter((member) => member?.sourceSpecimenId !== specimenId);
    const reserve = U.toArray(party.reserve).filter((member) => member?.sourceSpecimenId !== specimenId);
    S.updateParty({ active, reserve });

    S.logActivity(`Removed specimen ${specimenId}.`, "warning");
    return true;
  }

  function addSpecimenToBase(specimen) {
    ensureAnimalBuckets();
    const specimens = getBaseSpecimens();
    specimens.push(specimen);
    S.updateBase({ specimens });
    return specimen;
  }

  function addDnaRecordForSpecies(speciesId, specimen = null) {
    ensurePlayerCreatureBuckets();
    const player = S.getPlayer();
    const dnaRegistry = U.toArray(player.dnaRegistry);

    const existing = dnaRegistry.find((entry) => entry.speciesId === speciesId);
    if (existing) {
      existing.lastSeenAt = U.isoNow();
      if (specimen) {
        existing.sampleCount = Number(existing.sampleCount || 1) + 1;
      }
      S.updatePlayer({ dnaRegistry });
      return existing;
    }

    const def = getAnimalDef(speciesId);

    const record = {
      id: U.uid("dna"),
      speciesId,
      name: def?.name || U.titleCase(speciesId),
      family: def?.family || "unknown",
      habitat: def?.habitat || "unknown",
      traits: U.toArray(def?.traits),
      sampleCount: specimen ? 1 : 0,
      firstLoggedAt: U.isoNow(),
      lastSeenAt: U.isoNow()
    };

    dnaRegistry.push(record);
    S.updatePlayer({ dnaRegistry });
    return record;
  }

  function captureAnimal(speciesId, options = {}) {
    ensureAnimalBuckets();
    ensurePlayerCreatureBuckets();

    const specimen = createSpecimen(speciesId, options);
    addSpecimenToBase(specimen);

    const player = S.getPlayer();
    const captureLog = U.toArray(player.captureLog);
    captureLog.unshift({
      id: U.uid("cap"),
      speciesId,
      specimenId: specimen.id,
      at: U.isoNow(),
      method: options.method || "capture"
    });

    S.updatePlayer({
      captureLog
    });

    P.discoverSpecies(speciesId);
    addDnaRecordForSpecies(speciesId, specimen);

    S.logActivity(`Captured ${specimen.name} (${getAnimalName(speciesId)}).`, "success");
    S.addToast(`Captured ${specimen.name}!`, "success");
    P.awardPlayerXp(8 + specimen.level, "capturing wildlife");

    return specimen;
  }

  function releaseSpecimen(specimenId, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return false;

    const remaining = getBaseSpecimens().filter((entry) => entry.id !== specimenId);
    const released = getReleasedSpecimens();

    released.push({
      ...U.deepClone(specimen),
      releasedAt: U.isoNow(),
      releaseReason: options.reason || "return_to_wild"
    });

    S.updateBase({
      specimens: remaining,
      releasedSpecimens: released
    });

    S.logActivity(`Released ${specimen.name} back into the wild.`, "success");
    P.awardPlayerXp(10 + Number(specimen.level || 1), "conservation release");
    return true;
  }

  function canSpecimenJoinParty(specimenId) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return { ok: false, reason: "Specimen not found." };

    const active = U.toArray(S.getParty()?.active);
    if (active.length >= Math.max(0, CFG.PARTY.maxPartySize - 1)) {
      return { ok: false, reason: "Party is full." };
    }

    if (active.some((member) => member.sourceSpecimenId === specimenId)) {
      return { ok: false, reason: "Already in the active party." };
    }

    return { ok: true };
  }

  function specimenToCompanion(specimen, options = {}) {
    const role = options.role || specimen.role || specimen.allowedRoles?.[0] || "support";

    return {
      id: options.id || U.uid("comp"),
      sourceSpecimenId: specimen.id,
      speciesId: specimen.speciesId,
      name: specimen.name,
      classId: options.classId || specimen.classId || role,
      level: Number(specimen.level || 1),
      role,
      portrait: specimen.portrait,
      traits: U.uniqueBy([...U.toArray(specimen.traits), ...U.toArray(specimen.mutations)], (x) => String(x)),
      stats: {
        health: Number(specimen.stats?.health || 40),
        maxHealth: Number(specimen.stats?.maxHealth || 40),
        stamina: Number(specimen.stats?.stamina || 30),
        maxStamina: Number(specimen.stats?.maxStamina || 30),
        attack: Number(specimen.stats?.attack || 6),
        defense: Number(specimen.stats?.defense || 4),
        speed: Number(specimen.stats?.speed || 5)
      },
      combatMoves: U.toArray(specimen.combatMoves)
    };
  }

  function addSpecimenToParty(specimenId, options = {}) {
    const check = canSpecimenJoinParty(specimenId);
    if (!check.ok) {
      S.addToast(check.reason, "error");
      return null;
    }

    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    const companion = specimenToCompanion(specimen, options);
    const added = S.addCompanion(companion, false);

    S.logActivity(`${specimen.name} joined the active party.`, "success");
    return added;
  }

  function sendSpecimenToReserve(specimenId, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    const reserve = U.toArray(S.getParty()?.reserve);
    if (reserve.some((member) => member.sourceSpecimenId === specimenId)) {
      return reserve.find((member) => member.sourceSpecimenId === specimenId);
    }

    const companion = specimenToCompanion(specimen, options);
    const added = S.addCompanion(companion, true);

    S.logActivity(`${specimen.name} moved to reserve companions.`, "info");
    return added;
  }

  function removeSpecimenFromParty(specimenId) {
    const party = S.getParty();
    const target =
      U.toArray(party.active).find((member) => member.sourceSpecimenId === specimenId) ||
      U.toArray(party.reserve).find((member) => member.sourceSpecimenId === specimenId);

    if (!target) return false;

    S.removeCompanion(target.id);
    S.logActivity(`Removed ${target.name} from the party roster.`, "info");
    return true;
  }

  function getHabitatCompatibility(specimen, habitat) {
    if (!specimen || !habitat) return { ok: false, reason: "Missing habitat or specimen." };

    const habitatType = habitat.habitatType || "general";
    const sizeLimit = habitat.sizeLimit || "medium";
    const occupantCount = U.toArray(habitat.occupants).length;

    const sizeOrder = {
      tiny: 1,
      small: 2,
      medium: 3,
      large: 4,
      huge: 5
    };

    if (occupantCount >= Number(habitat.capacity || 0)) {
      return { ok: false, reason: "Habitat is full." };
    }

    if ((sizeOrder[specimen.size] || 3) > (sizeOrder[sizeLimit] || 3)) {
      return { ok: false, reason: "Specimen is too large for this habitat." };
    }

    if (habitatType !== "general" && specimen.habitatType !== habitatType) {
      if (!(habitatType === "aviary" && specimen.traits.includes("flight")) &&
          !(habitatType === "aquarium" && specimen.traits.includes("gills"))) {
        return { ok: false, reason: "Habitat type is incompatible." };
      }
    }

    return { ok: true };
  }

  function createHabitatFromStructure(structureId, options = {}) {
    const def = getHabitatDefByStructureId(structureId);
    if (!def) {
      throw new Error(`Structure ${structureId} is not a valid habitat structure.`);
    }

    return {
      id: options.id || U.uid("hab"),
      structureId,
      name: options.name || def.name,
      habitatType: def.habitatType,
      capacity: def.capacity,
      sizeLimit: def.sizeLimit,
      water: def.water,
      flying: def.flying,
      tileX: Number(options.tileX || S.getWorld().currentTileX),
      tileY: Number(options.tileY || S.getWorld().currentTileY),
      occupants: U.toArray(options.occupants),
      cleanliness: Number(options.cleanliness ?? 75),
      comfort: Number(options.comfort ?? 70),
      notes: options.notes || ""
    };
  }

  function addHabitat(structureId, options = {}) {
    ensureAnimalBuckets();
    const habitats = getHabitats();
    const habitat = createHabitatFromStructure(structureId, options);
    habitats.push(habitat);
    S.updateBase({ habitats });
    S.logActivity(`Built habitat: ${habitat.name}.`, "success");
    return habitat;
  }

  function getHabitat(habitatId) {
    return getHabitats().find((entry) => entry.id === habitatId) || null;
  }

  function assignSpecimenToHabitat(specimenId, habitatId) {
    const specimen = getSpecimen(specimenId);
    const habitats = getHabitats();
    const habitat = habitats.find((entry) => entry.id === habitatId);

    if (!specimen || !habitat) return { ok: false, reason: "Habitat or specimen not found." };

    const compat = getHabitatCompatibility(specimen, habitat);
    if (!compat.ok) return compat;

    habitats.forEach((entry) => {
      entry.occupants = U.toArray(entry.occupants).filter((id) => id !== specimenId);
    });

    habitat.occupants = U.toArray(habitat.occupants);
    habitat.occupants.push(specimenId);

    S.updateBase({ habitats });
    S.logActivity(`Assigned ${specimen.name} to ${habitat.name}.`, "success");
    return { ok: true };
  }

  function removeSpecimenFromHabitat(specimenId, habitatId = null) {
    const habitats = getHabitats();
    let changed = false;

    habitats.forEach((entry) => {
      if (habitatId && entry.id !== habitatId) return;
      const before = U.toArray(entry.occupants).length;
      entry.occupants = U.toArray(entry.occupants).filter((id) => id !== specimenId);
      if (entry.occupants.length !== before) {
        changed = true;
      }
    });

    if (changed) {
      S.updateBase({ habitats });
      const specimen = getSpecimen(specimenId);
      S.logActivity(`Removed ${specimen?.name || specimenId} from habitat.`, "info");
    }

    return changed;
  }

  function getSpecimenHabitat(specimenId) {
    return getHabitats().find((entry) => U.toArray(entry.occupants).includes(specimenId)) || null;
  }

  function feedSpecimen(specimenId, amount = 10) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    const current = Number(specimen.needs?.hunger || 0);
    specimen.needs.hunger = U.clamp(current + Number(amount || 0), 0, 100);
    specimen.lastUpdatedAt = U.isoNow();

    S.updateBase({ specimens: getBaseSpecimens() });
    S.logActivity(`Fed ${specimen.name}.`, "success");
    return specimen.needs.hunger;
  }

  function cleanHabitat(habitatId, amount = 20) {
    const habitats = getHabitats();
    const habitat = habitats.find((entry) => entry.id === habitatId);
    if (!habitat) return null;

    habitat.cleanliness = U.clamp(Number(habitat.cleanliness || 0) + Number(amount || 0), 0, 100);
    S.updateBase({ habitats });
    S.logActivity(`Cleaned habitat ${habitat.name}.`, "success");
    return habitat.cleanliness;
  }

  function tickSpecimenNeeds(gameMinutes = 5) {
    const specimens = getBaseSpecimens();
    if (!specimens.length) return false;

    const hungerLoss = gameMinutes * 0.08;
    const comfortLoss = gameMinutes * 0.03;
    const cleanlinessLoss = gameMinutes * 0.025;

    specimens.forEach((specimen) => {
      specimen.needs.hunger = U.clamp(Number(specimen.needs?.hunger || 0) - hungerLoss, 0, 100);
      specimen.needs.comfort = U.clamp(Number(specimen.needs?.comfort || 0) - comfortLoss, 0, 100);
      specimen.needs.cleanliness = U.clamp(Number(specimen.needs?.cleanliness || 0) - cleanlinessLoss, 0, 100);
      specimen.lastUpdatedAt = U.isoNow();
    });

    S.updateBase({ specimens });
    return true;
  }

  function getEligibleBreedingSpecimens() {
    return getBaseSpecimens().filter((specimen) => {
      return Number(specimen.needs?.hunger || 0) >= 40 &&
             Number(specimen.needs?.comfort || 0) >= 40 &&
             Number(specimen.needs?.cleanliness || 0) >= 35;
    });
  }

  function cloneSpecimenRecord(specimenId) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    ensureAnimalBuckets();
    const cloneQueue = U.toArray(S.getBase()?.cloneQueue);

    const job = {
      id: U.uid("clone"),
      sourceSpecimenId: specimen.id,
      speciesId: specimen.speciesId,
      startedAt: U.isoNow(),
      durationMinutes: CFG.BREEDING.cloneDurationMinutes,
      status: "queued"
    };

    cloneQueue.push(job);
    S.updateBase({ cloneQueue });

    S.logActivity(`Queued clone job for ${specimen.name}.`, "info");
    return job;
  }

  function completeCloneJob(jobId) {
    const base = ensureAnimalBuckets();
    const queue = U.toArray(base.cloneQueue);
    const job = queue.find((entry) => entry.id === jobId);
    if (!job) return null;

    const source =
      getSpecimen(job.sourceSpecimenId) ||
      getReleasedSpecimens().find((entry) => entry.id === job.sourceSpecimenId);

    if (!source) return null;

    const clone = createSpecimen(source.speciesId, {
      name: `${source.name} Clone`,
      level: source.level,
      traits: source.traits,
      mutations: source.mutations,
      genetics: {
        generation: Number(source.genetics?.generation || 1),
        lineage: [...U.toArray(source.genetics?.lineage), source.id]
      }
    });

    addSpecimenToBase(clone);

    const nextQueue = queue.filter((entry) => entry.id !== jobId);
    S.updateBase({ cloneQueue: nextQueue });

    S.logActivity(`Clone completed: ${clone.name}.`, "success");
    return clone;
  }

  function seedFallbackAnimalsIfNeeded() {
    const animals = getAnimalDefs();
    if (animals.length > 0) return false;

    const fallback = [
      {
        id: "mud_minnow",
        name: "Mud Minnow",
        family: "fish",
        habitat: "river_channel",
        habitatType: "aquarium",
        size: "small",
        tags: ["fish", "starter", "river"],
        traits: ["gills", "schooling"],
        colors: ["brown", "silver"],
        baseHealth: 24,
        baseStamina: 20,
        baseAttack: 5,
        baseDefense: 3,
        baseSpeed: 7,
        temperament: "skittish",
        combatMoves: ["splash", "dart", "mud_spit"]
      },
      {
        id: "reed_hopper",
        name: "Reed Hopper",
        family: "amphibian",
        habitat: "wetland",
        habitatType: "general",
        size: "small",
        tags: ["wetland", "hopper"],
        traits: ["jump", "wet_skin"],
        colors: ["green", "yellow"],
        baseHealth: 30,
        baseStamina: 25,
        baseAttack: 6,
        baseDefense: 4,
        baseSpeed: 8,
        temperament: "alert",
        combatMoves: ["tongue_snap", "hop_strike"]
      },
      {
        id: "dock_turtle",
        name: "Dock Turtle",
        family: "reptile",
        habitat: "field_station_island",
        habitatType: "general",
        size: "medium",
        tags: ["shell", "river"],
        traits: ["shell", "swim"],
        colors: ["olive", "brown"],
        baseHealth: 42,
        baseStamina: 18,
        baseAttack: 7,
        baseDefense: 8,
        baseSpeed: 3,
        temperament: "calm",
        combatMoves: ["shell_bash", "snap"]
      }
    ];

    S.replaceDataBucket("animals", fallback);
    return true;
  }

  function seedStarterHabitatsIfNeeded() {
    const habitats = getHabitats();
    if (habitats.length > 0) return false;

    const structures = U.toArray(S.getBase()?.structures);

    const firstHabitatStructure = structures.find((entry) => {
      const def = S.getStructureDef(entry.structureId);
      return def?.tags?.includes?.("habitat") || def?.habitatType;
    });

    if (firstHabitatStructure) {
      try {
        addHabitat(firstHabitatStructure.structureId, {
          name: "Starter Habitat"
        });
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  function bindWorldTicks() {
    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) {
        tickSpecimenNeeds(5);
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    ensureAnimalBuckets();
    ensurePlayerCreatureBuckets();
    seedFallbackAnimalsIfNeeded();
    seedStarterHabitatsIfNeeded();
    bindWorldTicks();

    state.initialized = true;
    U.eventBus.emit("animals:initialized");
    return true;
  }

  const API = {
    init,

    getAnimalDefs,
    getAnimalDef,
    getAnimalSize,
    getAnimalFamily,
    getAnimalName,
    getAnimalBaseTraits,
    getAnimalAllowedRoles,
    getSpeciesPortrait,

    ensureAnimalBuckets,
    ensurePlayerCreatureBuckets,
    getBaseSpecimens,
    getReleasedSpecimens,
    getHabitats,

    getDefaultSpecimenStats,
    createSpecimen,
    listSpecimensBySpecies,
    getSpecimen,
    updateSpecimen,
    removeSpecimen,
    addSpecimenToBase,

    addDnaRecordForSpecies,
    captureAnimal,
    releaseSpecimen,

    canSpecimenJoinParty,
    specimenToCompanion,
    addSpecimenToParty,
    sendSpecimenToReserve,
    removeSpecimenFromParty,

    getHabitatDefByStructureId,
    createHabitatFromStructure,
    addHabitat,
    getHabitat,
    getHabitatCompatibility,
    assignSpecimenToHabitat,
    removeSpecimenFromHabitat,
    getSpecimenHabitat,

    feedSpecimen,
    cleanHabitat,
    tickSpecimenNeeds,
    getEligibleBreedingSpecimens,

    cloneSpecimenRecord,
    completeCloneJob,

    seedFallbackAnimalsIfNeeded,
    seedStarterHabitatsIfNeeded
  };

  window.GL_ANIMALS = API;

  return Object.freeze(API);
})();