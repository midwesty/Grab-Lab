window.GrabLabBreeding = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const AN = window.GrabLabAnimals;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedParentA: null,
    selectedParentB: null,
    selectedAdditives: [],
    previewResult: null
  };

  function getBreedingJobs() {
    return U.toArray(S.getBase()?.breedingJobs);
  }

  function getMutations() {
    return U.toArray(S.getData()?.mutations);
  }

  function getTraits() {
    return U.toArray(S.getData()?.traits);
  }

  function getAdditiveItems() {
    return U.toArray(S.getInventory("player"))
      .map((entry) => ({
        ...entry,
        def: S.getItemDef(entry.itemId)
      }))
      .filter((entry) => U.toArray(entry?.def?.tags).includes("additive"));
  }

  function setParentA(specimenId) {
    state.selectedParentA = specimenId || null;
    refreshPreview();
    return state.selectedParentA;
  }

  function setParentB(specimenId) {
    state.selectedParentB = specimenId || null;
    refreshPreview();
    return state.selectedParentB;
  }

  function toggleAdditive(itemId) {
    if (!itemId) return state.selectedAdditives;

    if (state.selectedAdditives.includes(itemId)) {
      state.selectedAdditives = state.selectedAdditives.filter((id) => id !== itemId);
    } else if (state.selectedAdditives.length < CFG.BREEDING.additiveSlots) {
      state.selectedAdditives.push(itemId);
    } else {
      S.addToast(`Only ${CFG.BREEDING.additiveSlots} additives can be used at once.`, "warning");
    }

    refreshPreview();
    return [...state.selectedAdditives];
  }

  function clearSelectedParents() {
    state.selectedParentA = null;
    state.selectedParentB = null;
    state.selectedAdditives = [];
    state.previewResult = null;
  }

  function getSelectedParents() {
    return {
      parentA: state.selectedParentA ? AN.getSpecimen(state.selectedParentA) : null,
      parentB: state.selectedParentB ? AN.getSpecimen(state.selectedParentB) : null
    };
  }

  function hasCrossSpeciesUnlock() {
    if (!CFG.BREEDING.crossSpeciesUnlockRequired) return true;
    return S.getFlag(CFG.BREEDING.crossSpeciesUnlockId, false);
  }

  function canBreedPair(parentA, parentB) {
    if (!parentA || !parentB) {
      return { ok: false, reason: "Two parents are required." };
    }

    if (parentA.id === parentB.id) {
      return { ok: false, reason: "A specimen cannot breed with itself." };
    }

    if (Number(parentA.needs?.hunger || 0) < 40 || Number(parentB.needs?.hunger || 0) < 40) {
      return { ok: false, reason: "Both parents must be fed." };
    }

    if (Number(parentA.needs?.comfort || 0) < 40 || Number(parentB.needs?.comfort || 0) < 40) {
      return { ok: false, reason: "Both parents need better comfort." };
    }

    if (parentA.speciesId !== parentB.speciesId && !hasCrossSpeciesUnlock()) {
      return { ok: false, reason: "Cross-species breeding is locked." };
    }

    return { ok: true };
  }

  function additiveInfluenceFromItem(itemId) {
    const def = S.getItemDef(itemId);
    if (!def) return null;

    return {
      itemId,
      name: def.name || U.titleCase(itemId),
      preferredTraits: U.toArray(def.breedingEffects?.preferredTraits || def.preferredTraits),
      preferredMutations: U.toArray(def.breedingEffects?.preferredMutations || def.preferredMutations),
      colorBias: U.toArray(def.breedingEffects?.colorBias || def.colorBias),
      mutationBonus: Number(def.breedingEffects?.mutationBonus || 0),
      note: def.breedingEffects?.note || def.description || ""
    };
  }

  function collectAdditiveInfluences() {
    return state.selectedAdditives
      .map(additiveInfluenceFromItem)
      .filter(Boolean);
  }

  function gatherInheritedTraits(parentA, parentB) {
    const allTraits = U.uniqueBy([
      ...U.toArray(parentA?.traits),
      ...U.toArray(parentB?.traits)
    ], (x) => String(x));

    const inherited = [];
    const rollCount = Math.min(CFG.BREEDING.maxTraitInheritanceRolls, Math.max(2, allTraits.length));

    for (let i = 0; i < rollCount; i += 1) {
      const chosen = U.pick(allTraits);
      if (chosen && !inherited.includes(chosen) && U.randBool(0.58)) {
        inherited.push(chosen);
      }
    }

    return inherited;
  }

  function gatherTraitPool(parentA, parentB, additives = []) {
    const direct = U.uniqueBy([
      ...U.toArray(parentA?.traits),
      ...U.toArray(parentB?.traits),
      ...U.toArray(parentA?.mutations),
      ...U.toArray(parentB?.mutations)
    ], (x) => String(x));

    const additiveTraits = U.uniqueBy(
      additives.flatMap((entry) => U.toArray(entry.preferredTraits)),
      (x) => String(x)
    );

    return U.uniqueBy([...direct, ...additiveTraits], (x) => String(x));
  }

  function gatherMutationPool(parentA, parentB, additives = []) {
    const existing = U.uniqueBy([
      ...U.toArray(parentA?.mutations),
      ...U.toArray(parentB?.mutations)
    ], (x) => String(x));

    const speciesDefs = [
      S.getAnimalDef(parentA?.speciesId),
      S.getAnimalDef(parentB?.speciesId)
    ];

    const speciesSuggested = U.uniqueBy(
      speciesDefs.flatMap((def) => U.toArray(def?.possibleMutations)),
      (x) => String(x)
    );

    const additiveSuggested = U.uniqueBy(
      additives.flatMap((entry) => U.toArray(entry.preferredMutations)),
      (x) => String(x)
    );

    const dataPool = getMutations().map((entry) => entry.id);

    return U.uniqueBy(
      [...existing, ...speciesSuggested, ...additiveSuggested, ...dataPool],
      (x) => String(x)
    );
  }

  function pickChildSpecies(parentA, parentB) {
    if (parentA.speciesId === parentB.speciesId) {
      return parentA.speciesId;
    }

    const roll = Math.random();
    if (roll < 0.4) return parentA.speciesId;
    if (roll < 0.8) return parentB.speciesId;

    return `${parentA.speciesId}_${parentB.speciesId}_hybrid`;
  }

  function buildHybridDisplayName(parentA, parentB) {
    const a = AN.getAnimalName(parentA.speciesId);
    const b = AN.getAnimalName(parentB.speciesId);

    const halfA = a.slice(0, Math.max(2, Math.floor(a.length / 2)));
    const halfB = b.slice(Math.max(0, Math.floor(b.length / 2)));
    return `${halfA}${halfB}`;
  }

  function selectChildColors(parentA, parentB, additives = []) {
    const baseColors = U.uniqueBy([
      ...U.toArray(parentA?.colors),
      ...U.toArray(parentB?.colors)
    ], (x) => String(x));

    const additiveColors = U.uniqueBy(
      additives.flatMap((entry) => U.toArray(entry.colorBias)),
      (x) => String(x)
    );

    const pool = U.uniqueBy([...baseColors, ...additiveColors], (x) => String(x));
    const out = [];

    if (!pool.length) return out;

    out.push(U.pick(pool));

    if (U.randBool(CFG.BREEDING.colorMutationChance)) {
      out.push(U.pick(pool));
    }

    return U.uniqueBy(out.filter(Boolean), (x) => String(x));
  }

  function rollMutationCount(additives = []) {
    const additiveBonus = additives.reduce((sum, entry) => sum + Number(entry.mutationBonus || 0), 0);
    const baseChance = CFG.BREEDING.mutationChanceBase + additiveBonus;
    let count = 0;

    for (let i = 0; i < CFG.BREEDING.maxMutationRolls; i += 1) {
      if (Math.random() < baseChance) {
        count += 1;
      }
    }

    if (Math.random() < CFG.BREEDING.rareMutationChance) {
      count += 1;
    }

    return Math.max(0, count);
  }

  function selectMutations(parentA, parentB, additives = []) {
    const pool = gatherMutationPool(parentA, parentB, additives);
    const count = rollMutationCount(additives);
    const chosen = [];

    for (let i = 0; i < count; i += 1) {
      const picked = U.pick(pool);
      if (picked && !chosen.includes(picked)) {
        chosen.push(picked);
      }
    }

    return chosen;
  }

  function buildOffspringPreview(parentA, parentB) {
    const additives = collectAdditiveInfluences();
    const childSpeciesId = pickChildSpecies(parentA, parentB);
    const inheritedTraits = gatherInheritedTraits(parentA, parentB);
    const availableTraitPool = gatherTraitPool(parentA, parentB, additives);
    const mutations = selectMutations(parentA, parentB, additives);
    const colors = selectChildColors(parentA, parentB, additives);

    const bonusTraits = [];
    while (bonusTraits.length < 2 && availableTraitPool.length) {
      const picked = U.pick(availableTraitPool);
      if (picked && !inheritedTraits.includes(picked) && !bonusTraits.includes(picked) && U.randBool(0.35)) {
        bonusTraits.push(picked);
      } else {
        break;
      }
    }

    const traits = U.uniqueBy([...inheritedTraits, ...bonusTraits], (x) => String(x));
    const hybrid = parentA.speciesId !== parentB.speciesId;

    const level = Math.max(1, Math.floor((Number(parentA.level || 1) + Number(parentB.level || 1)) / 2));
    const childName = hybrid
      ? buildHybridDisplayName(parentA, parentB)
      : `${AN.getAnimalName(childSpeciesId)} Hatchling`;

    return {
      childSpeciesId,
      hybrid,
      childName,
      level,
      traits,
      mutations,
      colors,
      additives,
      note: hybrid
        ? "Cross-species result. Biology has resigned."
        : "Stable same-species breeding result."
    };
  }

  function refreshPreview() {
    const { parentA, parentB } = getSelectedParents();

    if (!parentA || !parentB) {
      state.previewResult = null;
      return null;
    }

    const check = canBreedPair(parentA, parentB);
    if (!check.ok) {
      state.previewResult = {
        blocked: true,
        reason: check.reason
      };
      return state.previewResult;
    }

    state.previewResult = buildOffspringPreview(parentA, parentB);
    return state.previewResult;
  }

  function getPreview() {
    return state.previewResult ? U.deepClone(state.previewResult) : null;
  }

  function consumeSelectedAdditives() {
    state.selectedAdditives.forEach((itemId) => {
      S.removeItem("player", itemId, 1);
    });
  }

  function createOffspringSpecimen(parentA, parentB, preview) {
    const childSpeciesId = preview.childSpeciesId;
    const baseDef = S.getAnimalDef(childSpeciesId);

    const generatedSpeciesId = childSpeciesId.includes("_hybrid")
      ? parentA.speciesId
      : childSpeciesId;

    const child = AN.createSpecimen(generatedSpeciesId, {
      name: preview.childName,
      level: preview.level,
      traits: preview.traits,
      mutations: preview.mutations,
      colors: preview.colors,
      genetics: {
        generation: Math.max(
          Number(parentA.genetics?.generation || 1),
          Number(parentB.genetics?.generation || 1)
        ) + 1,
        lineage: U.uniqueBy([
          parentA.id,
          parentB.id,
          ...U.toArray(parentA.genetics?.lineage),
          ...U.toArray(parentB.genetics?.lineage)
        ], (x) => String(x)),
        dominantTraits: preview.traits.slice(0, 2),
        recessiveTraits: preview.traits.slice(2)
      },
      habitatType: baseDef?.habitatType || parentA.habitatType || parentB.habitatType || "general"
    });

    if (preview.hybrid) {
      child.notes = `Hybrid offspring of ${parentA.name} and ${parentB.name}.`;
      child.tags = U.uniqueBy([
        ...U.toArray(child.tags),
        "hybrid"
      ], (x) => String(x));
    }

    return child;
  }

  function createBreedingJob(parentAId, parentBId, options = {}) {
    const parentA = AN.getSpecimen(parentAId);
    const parentB = AN.getSpecimen(parentBId);

    const check = canBreedPair(parentA, parentB);
    if (!check.ok) {
      throw new Error(check.reason);
    }

    const preview = buildOffspringPreview(parentA, parentB);
    const additives = [...state.selectedAdditives];

    const job = {
      id: U.uid("breed"),
      parentAId,
      parentBId,
      preview,
      additives,
      startedAt: U.isoNow(),
      durationMinutes: Number(options.durationMinutes || CFG.BREEDING.baseDurationMinutes),
      progressMinutes: 0,
      status: "active"
    };

    const jobs = getBreedingJobs();
    jobs.push(job);

    S.updateBase({ breedingJobs: jobs });
    consumeSelectedAdditives();

    parentA.needs.comfort = U.clamp(Number(parentA.needs?.comfort || 0) - 8, 0, 100);
    parentB.needs.comfort = U.clamp(Number(parentB.needs?.comfort || 0) - 8, 0, 100);

    S.updateBase({ specimens: AN.getBaseSpecimens() });

    P.registerBreedAction();
    S.logActivity(`Started breeding job: ${parentA.name} + ${parentB.name}.`, "success");
    S.addToast("Breeding started.", "success");

    clearSelectedParents();
    renderBreedingPanel();

    return job;
  }

  function getBreedingJob(jobId) {
    return getBreedingJobs().find((entry) => entry.id === jobId) || null;
  }

  function updateBreedingJob(jobId, patch = {}) {
    const jobs = getBreedingJobs();
    const target = jobs.find((entry) => entry.id === jobId);
    if (!target) return null;

    Object.assign(target, U.deepMerge(target, patch));
    S.updateBase({ breedingJobs: jobs });
    return target;
  }

  function cancelBreedingJob(jobId) {
    const jobs = getBreedingJobs();
    const next = jobs.filter((entry) => entry.id !== jobId);

    if (next.length === jobs.length) return false;

    S.updateBase({ breedingJobs: next });
    S.logActivity(`Cancelled breeding job ${jobId}.`, "warning");
    return true;
  }

  function completeBreedingJob(jobId) {
    const job = getBreedingJob(jobId);
    if (!job) return null;

    const parentA = AN.getSpecimen(job.parentAId);
    const parentB = AN.getSpecimen(job.parentBId);

    if (!parentA || !parentB) {
      cancelBreedingJob(jobId);
      return null;
    }

    const child = createOffspringSpecimen(parentA, parentB, job.preview);
    AN.addSpecimenToBase(child);

    const remaining = getBreedingJobs().filter((entry) => entry.id !== jobId);
    S.updateBase({ breedingJobs: remaining });

    AN.addDnaRecordForSpecies(child.speciesId, child);
    P.discoverSpecies(child.speciesId);
    P.awardPlayerXp(15 + Number(child.level || 1), "successful breeding");

    S.logActivity(`Breeding complete: ${child.name} was born.`, "success");
    S.addToast(`${child.name} was born!`, "success");

    renderBreedingPanel();
    return child;
  }

  function tickBreedingJobs(gameMinutes = 5) {
    const jobs = getBreedingJobs();
    if (!jobs.length) return false;

    let changed = false;
    const completed = [];

    jobs.forEach((job) => {
      if (job.status !== "active") return;

      job.progressMinutes = Number(job.progressMinutes || 0) + gameMinutes;
      changed = true;

      if (job.progressMinutes >= Number(job.durationMinutes || CFG.BREEDING.baseDurationMinutes)) {
        completed.push(job.id);
      }
    });

    if (changed) {
      S.updateBase({ breedingJobs: jobs });
    }

    completed.forEach((jobId) => {
      completeBreedingJob(jobId);
    });

    return changed;
  }

  function formatParentCard(specimen, slotLabel) {
    if (!specimen) {
      return `
        <div class="card">
          <div class="meta-title">${slotLabel}</div>
          <div class="meta-sub">No parent selected.</div>
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="meta-title">${htmlEscape(specimen.name)}</div>
        <div class="meta-sub">${htmlEscape(AN.getAnimalName(specimen.speciesId))} • Lv ${htmlEscape(String(specimen.level || 1))}</div>
        <div class="meta-sub">Traits: ${htmlEscape(U.toArray(specimen.traits).join(", ") || "None")}</div>
        <div class="meta-sub">Mutations: ${htmlEscape(U.toArray(specimen.mutations).join(", ") || "None")}</div>
      </div>
    `;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderBreedingPanel() {
    const parentAEl = U.byId("breedingParentA");
    const parentBEl = U.byId("breedingParentB");
    const resultEl = U.byId("breedingResultPanel");

    if (!parentAEl || !parentBEl || !resultEl) return;

    const eligible = AN.getEligibleBreedingSpecimens();
    const { parentA, parentB } = getSelectedParents();
    const preview = refreshPreview();

    parentAEl.innerHTML = `
      ${formatParentCard(parentA, "Parent A")}
      <div class="card-list">
        ${eligible.map((specimen) => `
          <button class="panel-btn breeding-parent-a-btn" data-specimen-id="${htmlEscape(specimen.id)}">
            ${htmlEscape(specimen.name)} (${htmlEscape(AN.getAnimalName(specimen.speciesId))})
          </button>
        `).join("")}
      </div>
    `;

    parentBEl.innerHTML = `
      ${formatParentCard(parentB, "Parent B")}
      <div class="card-list">
        ${eligible.map((specimen) => `
          <button class="panel-btn breeding-parent-b-btn" data-specimen-id="${htmlEscape(specimen.id)}">
            ${htmlEscape(specimen.name)} (${htmlEscape(AN.getAnimalName(specimen.speciesId))})
          </button>
        `).join("")}
      </div>
    `;

    const additives = getAdditiveItems();
    const jobs = getBreedingJobs();

    resultEl.innerHTML = `
      <div class="card">
        <h3>Preview</h3>
        ${
          !preview
            ? `<p>Select two parents.</p>`
            : preview.blocked
              ? `<p class="danger-text">${htmlEscape(preview.reason || "Breeding unavailable.")}</p>`
              : `
                <p><strong>Result:</strong> ${htmlEscape(preview.childName)}</p>
                <p><strong>Species Basis:</strong> ${htmlEscape(preview.childSpeciesId)}</p>
                <p><strong>Traits:</strong> ${htmlEscape(U.toArray(preview.traits).join(", ") || "None")}</p>
                <p><strong>Mutations:</strong> ${htmlEscape(U.toArray(preview.mutations).join(", ") || "None")}</p>
                <p><strong>Colors:</strong> ${htmlEscape(U.toArray(preview.colors).join(", ") || "None")}</p>
                <p>${htmlEscape(preview.note || "")}</p>
              `
        }
      </div>

      <div class="card">
        <h3>Additives</h3>
        ${
          !additives.length
            ? `<p>No breeding additives in inventory.</p>`
            : additives.map((entry) => `
              <button
                class="panel-btn breeding-additive-btn"
                data-item-id="${htmlEscape(entry.itemId)}"
              >
                ${htmlEscape(entry.def?.name || entry.itemId)}
                ${state.selectedAdditives.includes(entry.itemId) ? " ✓" : ""}
              </button>
            `).join("")
        }
      </div>

      <div class="card">
        <button id="btnStartBreedingJob" class="primary-btn">Start Breeding</button>
        <button id="btnClearBreedingSelection" class="ghost-btn">Clear Selection</button>
      </div>

      <div class="card">
        <h3>Active Jobs</h3>
        ${
          !jobs.length
            ? `<p>No active breeding jobs.</p>`
            : jobs.map((job) => `
              <div class="card" style="margin-bottom:.6rem;">
                <div class="meta-title">${htmlEscape(job.preview?.childName || "Unknown Offspring")}</div>
                <div class="meta-sub">Progress: ${htmlEscape(String(job.progressMinutes || 0))}/${htmlEscape(String(job.durationMinutes || 0))} minutes</div>
                <button class="ghost-btn breeding-cancel-job-btn" data-job-id="${htmlEscape(job.id)}">Cancel Job</button>
              </div>
            `).join("")
        }
      </div>
    `;

    U.qsa(".breeding-parent-a-btn", parentAEl).forEach((btn) => {
      U.on(btn, "click", () => {
        setParentA(btn.dataset.specimenId);
        renderBreedingPanel();
      });
    });

    U.qsa(".breeding-parent-b-btn", parentBEl).forEach((btn) => {
      U.on(btn, "click", () => {
        setParentB(btn.dataset.specimenId);
        renderBreedingPanel();
      });
    });

    U.qsa(".breeding-additive-btn", resultEl).forEach((btn) => {
      U.on(btn, "click", () => {
        toggleAdditive(btn.dataset.itemId);
        renderBreedingPanel();
      });
    });

    U.qsa(".breeding-cancel-job-btn", resultEl).forEach((btn) => {
      U.on(btn, "click", () => {
        cancelBreedingJob(btn.dataset.jobId);
        renderBreedingPanel();
      });
    });

    const startBtn = U.byId("btnStartBreedingJob");
    const clearBtn = U.byId("btnClearBreedingSelection");

    if (startBtn) {
      U.on(startBtn, "click", () => {
        const current = getSelectedParents();
        try {
          createBreedingJob(current.parentA?.id, current.parentB?.id);
          renderBreedingPanel();
          UI.renderEverything();
        } catch (err) {
          S.addToast(err.message || "Could not start breeding.", "error");
        }
      });
    }

    if (clearBtn) {
      U.on(clearBtn, "click", () => {
        clearSelectedParents();
        renderBreedingPanel();
      });
    }
  }

  function seedFallbackMutationsIfNeeded() {
    const mutations = getMutations();
    if (mutations.length > 0) return false;

    const fallback = [
      {
        id: "camouflage",
        name: "Camouflage",
        description: "Blends into surroundings and gains stealth bonuses."
      },
      {
        id: "gills",
        name: "Gills",
        description: "Allows better water movement and aquatic survival."
      },
      {
        id: "claws",
        name: "Claws",
        description: "Improves physical attack capability."
      },
      {
        id: "flight",
        name: "Flight",
        description: "Can access elevated or otherwise unreachable areas."
      },
      {
        id: "thick_shell",
        name: "Thick Shell",
        description: "Improves defense and resilience."
      },
      {
        id: "luminous",
        name: "Luminous",
        description: "Emits a gentle glow in dark areas."
      }
    ];

    S.replaceDataBucket("mutations", fallback);
    return true;
  }

  function seedFallbackTraitsIfNeeded() {
    const traits = getTraits();
    if (traits.length > 0) return false;

    const fallback = [
      { id: "gills", name: "Gills" },
      { id: "jump", name: "Jump" },
      { id: "shell", name: "Shell" },
      { id: "flight", name: "Flight" },
      { id: "camouflage", name: "Camouflage" },
      { id: "claws", name: "Claws" },
      { id: "wet_skin", name: "Wet Skin" },
      { id: "schooling", name: "Schooling" }
    ];

    S.replaceDataBucket("traits", fallback);
    return true;
  }

  function bindTimeTicks() {
    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) {
        tickBreedingJobs(5);
      }
    });

    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "breedingModal") {
        renderBreedingPanel();
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen("breedingModal")) {
        renderBreedingPanel();
      }
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen("breedingModal")) {
        renderBreedingPanel();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackMutationsIfNeeded();
    seedFallbackTraitsIfNeeded();
    bindTimeTicks();
    refreshPreview();

    state.initialized = true;
    U.eventBus.emit("breeding:initialized");
    return true;
  }

  const API = {
    init,

    getBreedingJobs,
    getMutations,
    getTraits,
    getAdditiveItems,

    setParentA,
    setParentB,
    toggleAdditive,
    clearSelectedParents,
    getSelectedParents,

    canBreedPair,
    additiveInfluenceFromItem,
    collectAdditiveInfluences,
    gatherInheritedTraits,
    gatherTraitPool,
    gatherMutationPool,
    pickChildSpecies,
    buildHybridDisplayName,
    selectChildColors,
    rollMutationCount,
    selectMutations,
    buildOffspringPreview,
    refreshPreview,
    getPreview,

    createBreedingJob,
    getBreedingJob,
    updateBreedingJob,
    cancelBreedingJob,
    completeBreedingJob,
    tickBreedingJobs,

    renderBreedingPanel,

    seedFallbackMutationsIfNeeded,
    seedFallbackTraitsIfNeeded
  };

  window.GL_BREEDING = API;

  return Object.freeze(API);
})();