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

    if (!Array.isArray(base.habitats)) base.habitats = [];
    if (!Array.isArray(base.specimens)) base.specimens = [];
    if (!Array.isArray(base.releasedSpecimens)) base.releasedSpecimens = [];
    if (!Array.isArray(base.breedingJobs)) base.breedingJobs = [];
    if (!Array.isArray(base.cloneQueue)) base.cloneQueue = [];
    if (!Array.isArray(base.cryoFridge)) base.cryoFridge = [];

    if (!base.cryoFridgeMeta || typeof base.cryoFridgeMeta !== "object") {
      base.cryoFridgeMeta = {
        name: "Cryo Fridge",
        description: "A starter cold-storage unit for keeping captured specimens safe indefinitely until a proper habitat is ready.",
        capacity: 999,
        unlockedAt: U.isoNow()
      };
    }

    return base;
  }

  function ensurePlayerCreatureBuckets() {
    const player = S.getPlayer();

    if (!Array.isArray(player.discoveredSpecies)) player.discoveredSpecies = [];
    if (!Array.isArray(player.dnaRegistry)) player.dnaRegistry = [];
    if (!Array.isArray(player.captureLog)) player.captureLog = [];

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

  function getCryoFridgeEntries() {
    ensureAnimalBuckets();
    return U.toArray(S.getBase()?.cryoFridge);
  }

  function getCryoMeta() {
    ensureAnimalBuckets();
    return S.getBase()?.cryoFridgeMeta || {
      name: "Cryo Fridge",
      capacity: 999
    };
  }

  function isSpecimenInCryo(specimenId) {
    return getCryoFridgeEntries().includes(specimenId);
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

    return {
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
      recruitable: options.recruitable !== false,
      storage: options.storage || "unassigned",
      storageTarget: options.storageTarget || null,
      habitatId: options.habitatId || null,
      locationLabel: options.locationLabel || "Unassigned",
      capturedAt: options.capturedAt || U.isoNow(),
      lastUpdatedAt: U.isoNow(),
      notes: options.notes || ""
    };
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

  function setSpecimenStorage(specimenId, storage = "unassigned", details = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    specimen.storage = storage;
    specimen.storageTarget = details.storageTarget || null;
    specimen.habitatId = details.habitatId || null;
    specimen.locationLabel = details.locationLabel || getSpecimenLocationLabel(specimenId, storage);
    specimen.lastUpdatedAt = U.isoNow();

    S.updateBase({ specimens: getBaseSpecimens() });
    return specimen;
  }

  function removeSpecimen(specimenId) {
    const specimens = getBaseSpecimens();
    const next = specimens.filter((entry) => entry.id !== specimenId);

    if (next.length === specimens.length) return false;

    removeSpecimenFromHabitat(specimenId, null, { silent: true });
    removeSpecimenFromCryo(specimenId);
    removeSpecimenFromParty(specimenId);

    S.updateBase({ specimens: next });
    S.logActivity(`Removed specimen ${specimenId}.`, "warning");
    return true;
  }

  function addSpecimenToBase(specimen) {
    ensureAnimalBuckets();
    const specimens = getBaseSpecimens();
    const existingIndex = specimens.findIndex((entry) => entry.id === specimen.id);

    if (existingIndex >= 0) {
      specimens[existingIndex] = specimen;
    } else {
      specimens.push(specimen);
    }

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
      if (specimen) existing.sampleCount = Number(existing.sampleCount || 0) + 1;
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

    const specimen = createSpecimen(speciesId, {
      ...options,
      recruitable: options.recruitable !== false
    });
    addSpecimenToBase(specimen);

    const player = S.getPlayer();
    const captureLog = U.toArray(player.captureLog);
    captureLog.unshift({
      id: U.uid("cap"),
      speciesId,
      specimenId: specimen.id,
      at: U.isoNow(),
      method: options.method || "capture",
      tileX: options.tileX ?? S.getWorld()?.currentTileX,
      tileY: options.tileY ?? S.getWorld()?.currentTileY
    });

    S.updatePlayer({ captureLog });
    P.discoverSpecies(speciesId);
    addDnaRecordForSpecies(speciesId, specimen);

    const placement = options.skipAutoStorage
      ? { ok: true, storage: "unassigned", reason: "Auto-storage skipped." }
      : autoStoreCapturedSpecimen(specimen.id, options);

    S.logActivity(`Captured ${specimen.name} (${getAnimalName(speciesId)}).`, "success");

    if (placement?.storage === "habitat") {
      S.logActivity(`${specimen.name} was moved into ${placement.habitat?.name || "a compatible habitat"}.`, "info");
    } else if (placement?.storage === "cryo") {
      S.logActivity(`${specimen.name} is safe in the Cryo Fridge until you build or free up a proper habitat.`, "info");
    } else if (placement?.reason) {
      S.logActivity(placement.reason, "warning");
    }

    S.addToast(`Captured ${specimen.name}!`, "success");
    P.awardPlayerXp(8 + specimen.level, "capturing wildlife");
    return specimen;
  }

  function releaseSpecimen(specimenId, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return false;

    removeSpecimenFromHabitat(specimenId, null, { silent: true });
    removeSpecimenFromCryo(specimenId);
    removeSpecimenFromParty(specimenId);

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
    if (specimen.recruitable === false) return { ok: false, reason: "This specimen is not recruitable yet." };

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
    setSpecimenStorage(specimenId, "party", { storageTarget: "active", locationLabel: "Active Party" });
    S.logActivity(`${specimen.name} joined the active party.`, "success");
    return added;
  }

  function sendSpecimenToReserve(specimenId, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    const reserve = U.toArray(S.getParty()?.reserve);
    const existing = reserve.find((member) => member.sourceSpecimenId === specimenId);
    if (existing) return existing;

    const companion = specimenToCompanion(specimen, options);
    const added = S.addCompanion(companion, true);
    setSpecimenStorage(specimenId, "party", { storageTarget: "reserve", locationLabel: "Reserve Party" });
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
    const specimen = getSpecimen(specimenId);
    if (specimen && specimen.storage === "party") {
      setSpecimenStorage(specimenId, "unassigned", { locationLabel: "Unassigned" });
    }
    S.logActivity(`Removed ${target.name} from the party roster.`, "info");
    return true;
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

  function getSpecimenLocationLabel(specimenId, fallback = "unassigned") {
    const habitat = getSpecimenHabitat(specimenId);
    if (habitat) return habitat.name || "Habitat";
    if (isSpecimenInCryo(specimenId)) return getCryoMeta().name || "Cryo Fridge";
    if (U.toArray(S.getParty()?.active).some((entry) => entry.sourceSpecimenId === specimenId)) return "Active Party";
    if (U.toArray(S.getParty()?.reserve).some((entry) => entry.sourceSpecimenId === specimenId)) return "Reserve Party";
    if (fallback === "cryo") return getCryoMeta().name || "Cryo Fridge";
    if (fallback === "habitat") return "Habitat";
    return "Unassigned";
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
      const traits = U.toArray(specimen.traits);
      const tags = U.toArray(specimen.tags);
      const aquatic = traits.includes("gills") || traits.includes("swim") || tags.includes("fish") || tags.includes("aquatic");
      const flying = traits.includes("flight") || tags.includes("bird") || tags.includes("flying");

      if (!(habitatType === "aviary" && flying) && !(habitatType === "aquarium" && aquatic)) {
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
      tileX: Number(options.tileX ?? S.getWorld().currentTileX),
      tileY: Number(options.tileY ?? S.getWorld().currentTileY),
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

  function getCompatibleHabitatsForSpecimen(specimenId) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return [];

    return getHabitats()
      .map((habitat) => ({ habitat, compat: getHabitatCompatibility(specimen, habitat) }))
      .filter((entry) => entry.compat.ok)
      .map((entry) => entry.habitat);
  }

  function findFirstCompatibleHabitat(specimenId) {
    return getCompatibleHabitatsForSpecimen(specimenId)[0] || null;
  }

  function assignSpecimenToHabitat(specimenId, habitatId, options = {}) {
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

    const cryo = getCryoFridgeEntries().filter((id) => id !== specimenId);
    S.updateBase({ habitats, cryoFridge: cryo });
    setSpecimenStorage(specimenId, "habitat", {
      storageTarget: "base",
      habitatId: habitat.id,
      locationLabel: habitat.name || "Habitat"
    });

    if (!options.silent) {
      S.logActivity(`Assigned ${specimen.name} to ${habitat.name}.`, "success");
    }

    return { ok: true, storage: "habitat", habitat };
  }

  function removeSpecimenFromHabitat(specimenId, habitatId = null, options = {}) {
    const habitats = getHabitats();
    let changed = false;

    habitats.forEach((entry) => {
      if (habitatId && entry.id !== habitatId) return;
      const before = U.toArray(entry.occupants).length;
      entry.occupants = U.toArray(entry.occupants).filter((id) => id !== specimenId);
      if (entry.occupants.length !== before) changed = true;
    });

    if (changed) {
      S.updateBase({ habitats });
      const specimen = getSpecimen(specimenId);
      if (specimen && specimen.storage === "habitat") {
        setSpecimenStorage(specimenId, "unassigned", { locationLabel: "Unassigned" });
      }
      if (!options.silent) {
        S.logActivity(`Removed ${specimen?.name || specimenId} from habitat.`, "info");
      }
    }

    return changed;
  }

  function getSpecimenHabitat(specimenId) {
    return getHabitats().find((entry) => U.toArray(entry.occupants).includes(specimenId)) || null;
  }

  function removeSpecimenFromCryo(specimenId) {
    const cryo = getCryoFridgeEntries();
    const next = cryo.filter((id) => id !== specimenId);
    if (next.length === cryo.length) return false;

    S.updateBase({ cryoFridge: next });
    const specimen = getSpecimen(specimenId);
    if (specimen && specimen.storage === "cryo") {
      setSpecimenStorage(specimenId, "unassigned", { locationLabel: "Unassigned" });
    }
    return true;
  }

  function moveSpecimenToCryo(specimenId, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return { ok: false, reason: "Specimen not found." };

    removeSpecimenFromHabitat(specimenId, null, { silent: true });

    const cryo = getCryoFridgeEntries().filter((id) => id !== specimenId);
    const meta = getCryoMeta();
    const capacity = Number(meta.capacity || 999);

    if (cryo.length >= capacity) {
      return { ok: false, reason: "Cryo Fridge is full." };
    }

    cryo.push(specimenId);
    S.updateBase({ cryoFridge: cryo });
    setSpecimenStorage(specimenId, "cryo", {
      storageTarget: "base",
      locationLabel: meta.name || "Cryo Fridge"
    });

    if (!options.silent) {
      S.logActivity(`${specimen.name} was moved to the Cryo Fridge.`, "info");
    }

    return { ok: true, storage: "cryo", specimen };
  }

  function autoStoreCapturedSpecimen(specimenId, options = {}) {
    const habitat = findFirstCompatibleHabitat(specimenId);
    if (habitat) {
      const assigned = assignSpecimenToHabitat(specimenId, habitat.id, { silent: true });
      if (assigned?.ok) return { ok: true, storage: "habitat", habitat };
    }

    const cryo = moveSpecimenToCryo(specimenId, { silent: true });
    if (cryo?.ok) return { ok: true, storage: "cryo" };

    setSpecimenStorage(specimenId, "unassigned", { locationLabel: "Unassigned" });
    return {
      ok: false,
      storage: "unassigned",
      reason: options.failureReason || "No compatible habitat or Cryo Fridge space was available. The specimen is unassigned."
    };
  }

  function getAnimalFeedCandidates() {
    const preferredTags = ["animal_feed", "food", "fishing", "bait"];
    return ["player", "base", "boat"].flatMap((source) => {
      return U.toArray(S.getInventory(source)).map((entry) => {
        const def = S.getItemDef(entry.itemId) || {};
        const tags = U.toArray(def.tags);
        const edible = preferredTags.some((tag) => tags.includes(tag)) || U.toArray(def.effects).some((effect) => effect.stat === "hunger");
        if (!edible) return null;

        const hungerEffect = U.toArray(def.effects).find((effect) => effect.stat === "hunger");
        return {
          source,
          itemId: entry.itemId,
          quantity: Number(entry.quantity || 0),
          name: def.name || U.titleCase(entry.itemId),
          amount: Number(def.animalFeedValue || hungerEffect?.value || (tags.includes("bait") ? 8 : 12))
        };
      }).filter(Boolean);
    }).filter((entry) => entry.quantity > 0);
  }

  function chooseBestAnimalFeed() {
    const candidates = getAnimalFeedCandidates();
    if (!candidates.length) return null;
    return candidates.sort((a, b) => b.amount - a.amount)[0];
  }

  function feedSpecimen(specimenId, amount = 10, options = {}) {
    const specimen = getSpecimen(specimenId);
    if (!specimen) return null;

    let feedAmount = Number(amount || 0);
    let feedLabel = "field ration";

    if (!options.free) {
      const chosen = options.itemId
        ? getAnimalFeedCandidates().find((entry) => entry.itemId === options.itemId)
        : chooseBestAnimalFeed();

      if (!chosen) {
        S.addToast("No food, bait, or edible catch available for feeding.", "warning");
        S.logActivity(`Could not feed ${specimen.name}; no suitable food was available.`, "warning");
        return null;
      }

      S.removeItem(chosen.source, chosen.itemId, 1);
      feedAmount = Number(options.amount || chosen.amount || feedAmount || 10);
      feedLabel = chosen.name;
    }

    specimen.needs.hunger = U.clamp(Number(specimen.needs?.hunger || 0) + feedAmount, 0, 100);
    specimen.needs.comfort = U.clamp(Number(specimen.needs?.comfort || 0) + 2, 0, 100);
    specimen.lastUpdatedAt = U.isoNow();

    S.updateBase({ specimens: getBaseSpecimens() });
    S.logActivity(`Fed ${specimen.name} with ${feedLabel}.`, "success");
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
      if (specimen.storage === "cryo" || isSpecimenInCryo(specimen.id)) {
        specimen.needs.hunger = U.clamp(Number(specimen.needs?.hunger || 0), 0, 100);
        specimen.needs.comfort = U.clamp(Math.max(Number(specimen.needs?.comfort || 0), 70), 0, 100);
        specimen.needs.cleanliness = U.clamp(Math.max(Number(specimen.needs?.cleanliness || 0), 70), 0, 100);
      } else {
        specimen.needs.hunger = U.clamp(Number(specimen.needs?.hunger || 0) - hungerLoss, 0, 100);
        specimen.needs.comfort = U.clamp(Number(specimen.needs?.comfort || 0) - comfortLoss, 0, 100);
        specimen.needs.cleanliness = U.clamp(Number(specimen.needs?.cleanliness || 0) - cleanlinessLoss, 0, 100);
      }
      specimen.lastUpdatedAt = U.isoNow();
    });

    S.updateBase({ specimens });
    return true;
  }

  function getEligibleBreedingSpecimens() {
    return getBaseSpecimens().filter((specimen) => {
      return specimen.storage !== "cryo" &&
             !isSpecimenInCryo(specimen.id) &&
             Boolean(getSpecimenHabitat(specimen.id)) &&
             Number(specimen.needs?.hunger || 0) >= 40 &&
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

    const source = getSpecimen(job.sourceSpecimenId) || getReleasedSpecimens().find((entry) => entry.id === job.sourceSpecimenId);
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
    autoStoreCapturedSpecimen(clone.id);

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
        tags: ["fish", "starter", "river", "aquatic"],
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
      },
      {
        id: "marsy_marsupial",
        name: "Marsy",
        defaultNickname: "Marsy",
        family: "marsupial",
        habitat: "field_station_island",
        habitatType: "general",
        size: "small",
        tags: ["starter", "companion", "guide"],
        traits: ["keen_nose", "field_notebook", "weird_luck"],
        colors: ["rust", "cream"],
        baseHealth: 38,
        baseStamina: 34,
        baseAttack: 6,
        baseDefense: 5,
        baseSpeed: 8,
        temperament: "helpful",
        allowedRoles: ["scout", "support", "fighter"],
        combatMoves: ["scratch", "encourage", "sniff_out"]
      }
    ];

    S.replaceDataBucket("animals", fallback);
    return true;
  }

  function seedStarterHabitatsIfNeeded() {
    const habitats = getHabitats();
    if (habitats.length > 0) return false;

    const structures = U.toArray(S.getBase()?.structures);
    const habitatStructures = structures.filter((entry) => {
      const def = S.getStructureDef(entry.structureId);
      return def?.tags?.includes?.("habitat") || def?.habitatType;
    });

    let created = false;
    habitatStructures.forEach((entry) => {
      const count = Math.max(1, Number(entry.quantity || 1));
      for (let i = 0; i < count; i += 1) {
        try {
          addHabitat(entry.structureId, { name: S.getStructureDef(entry.structureId)?.name || "Starter Habitat" });
          created = true;
        } catch {
          // Ignore malformed starter structure records.
        }
      }
    });

    return created;
  }

  function seedStarterCompanionIfNeeded() {
    ensureAnimalBuckets();
    ensurePlayerCreatureBuckets();

    const party = S.getParty();
    const existingCompanion = [...U.toArray(party?.active), ...U.toArray(party?.reserve)]
      .find((entry) => entry.speciesId === "marsy_marsupial" || entry.sourceSpecimenId === "spec_marsy");

    if (existingCompanion) return existingCompanion;

    let specimen = getBaseSpecimens().find((entry) => entry.speciesId === "marsy_marsupial" || entry.id === "spec_marsy");
    if (!specimen) {
      specimen = captureAnimal("marsy_marsupial", {
        id: "spec_marsy",
        method: "starter_recruit",
        name: "Marsy",
        role: "scout",
        level: 1,
        skipAutoStorage: true,
        notes: "Marsy joined at the Field Station Dock and seems to know more than they should."
      });
    }

    if (!specimen) return null;

    removeSpecimenFromCryo(specimen.id);
    removeSpecimenFromHabitat(specimen.id, null, { silent: true });
    setSpecimenStorage(specimen.id, "party", {
      storageTarget: "active",
      locationLabel: "Active Party"
    });

    return addSpecimenToParty(specimen.id, { role: "scout" });
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
    getCryoFridgeEntries,
    getCryoMeta,
    isSpecimenInCryo,
    getSpecimenLocationLabel,

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
    getCompatibleHabitatsForSpecimen,
    findFirstCompatibleHabitat,
    autoStoreCapturedSpecimen,
    assignSpecimenToHabitat,
    removeSpecimenFromHabitat,
    getSpecimenHabitat,
    moveSpecimenToCryo,
    removeSpecimenFromCryo,

    getAnimalFeedCandidates,
    chooseBestAnimalFeed,
    feedSpecimen,
    cleanHabitat,
    tickSpecimenNeeds,
    getEligibleBreedingSpecimens,

    cloneSpecimenRecord,
    completeCloneJob,

    seedFallbackAnimalsIfNeeded,
    seedStarterHabitatsIfNeeded,
    seedStarterCompanionIfNeeded
  };

  window.GL_ANIMALS = API;

  return Object.freeze(API);
})();