window.GrabLabBreeding = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;

  const state = {
    initialized: false,
    selectedParentA: null,
    selectedParentB: null,
    selectedAdditiveId: null,
    selectedFilter: "eligible" // eligible | all | same | cross
  };

  function getAnimalsApi() {
    return window.GL_ANIMALS || window.GrabLabAnimals || null;
  }

  function getInventoryApi() {
    return window.GL_INVENTORY || window.GrabLabInventory || null;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getPlayerLevel() {
    if (typeof P?.getPlayerLevel === "function") return P.getPlayerLevel();
    return Number(S.getPlayer()?.stats?.level || 1);
  }

  function isCrossSpeciesUnlocked() {
    return getPlayerLevel() >= 3;
  }

  function ensureBreedingBuckets() {
    const base = S.getBase();

    if (!Array.isArray(base.breedingJobs)) base.breedingJobs = [];
    if (!Array.isArray(base.breedingHistory)) base.breedingHistory = [];

    return base;
  }

  function getBreedingJobs() {
    ensureBreedingBuckets();
    return U.toArray(S.getBase()?.breedingJobs);
  }

  function getBreedingHistory() {
    ensureBreedingBuckets();
    return U.toArray(S.getBase()?.breedingHistory);
  }

  function getAnimalName(speciesId) {
    const animals = getAnimalsApi();
    return animals?.getAnimalName?.(speciesId) || S.getAnimalDef(speciesId)?.name || U.titleCase(speciesId || "creature");
  }

  function getSpecimenName(specimen) {
    if (!specimen) return "Unknown Specimen";
    return specimen.name || specimen.nickname || getAnimalName(specimen.speciesId);
  }

  function getSpecimen(specimenId) {
    return getAnimalsApi()?.getSpecimen?.(specimenId) || null;
  }

  function getSpecimenHabitat(specimenId) {
    return getAnimalsApi()?.getSpecimenHabitat?.(specimenId, "all") || null;
  }

  function getSpecimenLocation(specimen) {
    const animals = getAnimalsApi();
    if (!specimen) return "Unknown";
    return animals?.getSpecimenLocationLabel?.(specimen.id, specimen.storage) || specimen.locationLabel || U.titleCase(specimen.storage || "Unknown");
  }

  function getEligibleBreedingSpecimens(options = {}) {
    const animals = getAnimalsApi();
    if (!animals) return [];

    const allowAllForDebug = options.all === true || state.selectedFilter === "all";
    const baseList = allowAllForDebug
      ? animals.getBaseSpecimens?.() || []
      : animals.getEligibleBreedingSpecimens?.({
        allowCryo: false,
        requireHabitat: true
      }) || [];

    return U.toArray(baseList).filter((specimen) => {
      if (!specimen) return false;
      if (specimen.storage === "released") return false;
      if (specimen.storage === "party") return false;

      if (!allowAllForDebug && !getSpecimenHabitat(specimen.id)) {
        return false;
      }

      if (!allowAllForDebug && (specimen.storage === "cryo" || animals.isSpecimenInCryo?.(specimen.id))) {
        return false;
      }

      return true;
    });
  }

  function isSpecimenActuallyBreedable(specimen) {
    if (!specimen) return { ok: false, reason: "Missing specimen." };

    const animals = getAnimalsApi();
    const habitat = getSpecimenHabitat(specimen.id);

    if (specimen.storage === "released") {
      return { ok: false, reason: "Released specimens cannot breed." };
    }

    if (specimen.storage === "party") {
      return { ok: false, reason: "Move this creature out of party/reserve and into a habitat first." };
    }

    if (specimen.storage === "cryo" || animals?.isSpecimenInCryo?.(specimen.id)) {
      return { ok: false, reason: "Cryo specimens must be moved into a habitat before breeding." };
    }

    if (!habitat) {
      return { ok: false, reason: "Specimen needs a habitat before breeding." };
    }

    if (Number(specimen.needs?.hunger || 0) < 30) {
      return { ok: false, reason: "Specimen is too hungry to breed." };
    }

    if (Number(specimen.needs?.comfort || 0) < 25) {
      return { ok: false, reason: "Specimen comfort is too low." };
    }

    if (Number(specimen.needs?.cleanliness || 0) < 20) {
      return { ok: false, reason: "Specimen or habitat needs cleaning." };
    }

    return { ok: true };
  }

  function canPairBreed(parentAId, parentBId) {
    const a = getSpecimen(parentAId);
    const b = getSpecimen(parentBId);

    if (!a || !b) return { ok: false, reason: "Select two parents." };
    if (a.id === b.id) return { ok: false, reason: "Choose two different parents." };

    const aCheck = isSpecimenActuallyBreedable(a);
    if (!aCheck.ok) return { ok: false, reason: `${getSpecimenName(a)}: ${aCheck.reason}` };

    const bCheck = isSpecimenActuallyBreedable(b);
    if (!bCheck.ok) return { ok: false, reason: `${getSpecimenName(b)}: ${bCheck.reason}` };

    if (a.speciesId !== b.speciesId && !isCrossSpeciesUnlocked()) {
      return { ok: false, reason: "Cross-species breeding unlocks at player level 3." };
    }

    // Any two animal specimens may cross-breed once the player reaches level 3.
    // Do not apply family/species compatibility gates here; the game fantasy is broad hybridization.
    return { ok: true };
  }

  function getCompatibleParentOptions(parentId = null) {
    const candidates = getEligibleBreedingSpecimens({ all: state.selectedFilter === "all" });

    if (!parentId) return candidates;

    return candidates.filter((candidate) => {
      if (candidate.id === parentId) return false;

      const test = canPairBreed(parentId, candidate.id);

      if (state.selectedFilter === "same") {
        const parent = getSpecimen(parentId);
        return parent && parent.speciesId === candidate.speciesId && test.ok;
      }

      if (state.selectedFilter === "cross") {
        const parent = getSpecimen(parentId);
        return parent && parent.speciesId !== candidate.speciesId && isCrossSpeciesUnlocked() && test.ok;
      }

      return test.ok || state.selectedFilter === "all";
    });
  }

  function setParentA(specimenId) {
    state.selectedParentA = specimenId || null;

    if (state.selectedParentB === state.selectedParentA) {
      state.selectedParentB = null;
    }

    const pairCheck = state.selectedParentB ? canPairBreed(state.selectedParentA, state.selectedParentB) : { ok: true };
    if (!pairCheck.ok && state.selectedFilter !== "all") {
      state.selectedParentB = null;
    }

    renderBreedingPanel();
    return state.selectedParentA;
  }

  function setParentB(specimenId) {
    state.selectedParentB = specimenId || null;

    if (state.selectedParentA === state.selectedParentB) {
      state.selectedParentB = null;
    }

    renderBreedingPanel();
    return state.selectedParentB;
  }

  function setAdditive(itemId) {
    state.selectedAdditiveId = itemId || null;
    renderBreedingPanel();
    return state.selectedAdditiveId;
  }

  function setFilter(filter = "eligible") {
    state.selectedFilter = ["eligible", "all", "same", "cross"].includes(filter) ? filter : "eligible";
    renderBreedingPanel();
    return state.selectedFilter;
  }

  function getBreedingAdditives() {
    const sources = ["player", "base", "boat"];
    const out = [];

    sources.forEach((source) => {
      U.toArray(S.getInventory(source)).forEach((entry) => {
        const def = S.getItemDef(entry.itemId) || {};
        const tags = U.toArray(def.tags);
        const isAdditive =
          tags.includes("additive") ||
          tags.includes("breeding") ||
          Boolean(def.breedingEffects);

        if (!isAdditive || Number(entry.quantity || 0) <= 0) return;

        out.push({
          source,
          itemId: entry.itemId,
          quantity: Number(entry.quantity || 0),
          name: def.name || U.titleCase(entry.itemId),
          def
        });
      });
    });

    return out;
  }

  function getSelectedAdditive() {
    if (!state.selectedAdditiveId) return null;
    return getBreedingAdditives().find((entry) => entry.itemId === state.selectedAdditiveId) || null;
  }

  function consumeAdditive(additive) {
    if (!additive) return true;
    return S.removeItem(additive.source, additive.itemId, 1);
  }

  function getInheritedTraits(a, b, additive = null) {
    const aDef = S.getAnimalDef(a.speciesId) || {};
    const bDef = S.getAnimalDef(b.speciesId) || {};
    const pool = U.uniqueBy([
      ...U.toArray(aDef.traits),
      ...U.toArray(bDef.traits),
      ...U.toArray(a.traits),
      ...U.toArray(b.traits),
      ...U.toArray(a.genetics?.dominantTraits),
      ...U.toArray(b.genetics?.dominantTraits),
      ...U.toArray(a.genetics?.recessiveTraits),
      ...U.toArray(b.genetics?.recessiveTraits)
    ], (x) => String(x));

    const inherited = [];

    pool.forEach((trait) => {
      const chance = 0.42 +
        (U.toArray(a.traits).includes(trait) && U.toArray(b.traits).includes(trait) ? 0.22 : 0);

      if (Math.random() < chance) inherited.push(trait);
    });

    const preferredTraits = U.toArray(additive?.def?.breedingEffects?.preferredTraits);
    preferredTraits.forEach((trait) => {
      if (!inherited.includes(trait) && Math.random() < 0.7) inherited.push(trait);
    });

    if (a.speciesId !== b.speciesId) {
      // Cross-species offspring should be where traversal traits become exciting.
      // Parent traits still matter most, but hybrids get a small extra roll at movement traits.
      ["gills", "swim", "fins", "flight", "wings", "claws", "camouflage"].forEach((trait) => {
        if (!inherited.includes(trait) && pool.includes(trait) && Math.random() < 0.28) {
          inherited.push(trait);
        }
      });
    }

    if (!inherited.length) {
      inherited.push(U.pick(pool) || "scrappy");
    }

    return U.uniqueBy(inherited, (x) => String(x)).slice(0, 8);
  }

  function getInheritedMutations(a, b, additive = null) {
    const mutationPool = U.uniqueBy([
      ...U.toArray(a.mutations),
      ...U.toArray(b.mutations)
    ], (x) => String(x));

    const mutations = mutationPool.filter(() => Math.random() < 0.32);

    const preferredMutations = U.toArray(additive?.def?.breedingEffects?.preferredMutations);
    const mutationBonus = Number(additive?.def?.breedingEffects?.mutationBonus || 0);

    preferredMutations.forEach((mutation) => {
      if (!mutations.includes(mutation) && Math.random() < 0.35 + mutationBonus) {
        mutations.push(mutation);
      }
    });

    const baseMutationChance = Number(CFG.BREEDING?.baseMutationChance ?? 0.06) + mutationBonus;
    if (Math.random() < baseMutationChance) {
      mutations.push(U.pick(["bright_eyes", "odd_coloration", "hardy", "quick_reflexes", "spore_touched", "fins", "wings"]) || "odd_coloration");
    }

    return U.uniqueBy(mutations, (x) => String(x)).slice(0, 5);
  }

  function chooseOffspringSpecies(a, b) {
    if (a.speciesId === b.speciesId) return a.speciesId;

    const aDef = S.getAnimalDef(a.speciesId) || {};
    const bDef = S.getAnimalDef(b.speciesId) || {};

    const hybridIdA = `${a.speciesId}_${b.speciesId}_hybrid`;
    const hybridIdB = `${b.speciesId}_${a.speciesId}_hybrid`;

    if (S.getAnimalDef(hybridIdA)) return hybridIdA;
    if (S.getAnimalDef(hybridIdB)) return hybridIdB;

    if (aDef.hybridOffspring) return aDef.hybridOffspring;
    if (bDef.hybridOffspring) return bDef.hybridOffspring;

    return Math.random() < 0.5 ? a.speciesId : b.speciesId;
  }

  function getOffspringName(speciesId, a, b) {
    const speciesName = getAnimalName(speciesId);

    if (a.speciesId !== b.speciesId) {
      return `${speciesName} Hybrid`;
    }

    const names = [
      `Young ${speciesName}`,
      `${speciesName} Juvenile`,
      `${a.name || speciesName} Jr.`,
      `Tiny ${speciesName}`
    ];

    return U.pick(names) || `Young ${speciesName}`;
  }

  function blendStats(a, b, speciesId) {
    const base = getAnimalsApi()?.getDefaultSpecimenStats?.(speciesId, 1) || {};
    const statsA = a.stats || {};
    const statsB = b.stats || {};

    const statKeys = ["maxHealth", "maxStamina", "attack", "defense", "speed"];

    const stats = {
      ...base
    };

    statKeys.forEach((key) => {
      const avg = Math.round((Number(statsA[key] || base[key] || 10) + Number(statsB[key] || base[key] || 10)) / 2);
      const variance = U.randInt(-2, 3);
      stats[key] = Math.max(1, avg + variance);
    });

    stats.health = stats.maxHealth;
    stats.stamina = stats.maxStamina;

    return stats;
  }

  function createOffspring(parentAId, parentBId, additive = null) {
    const animals = getAnimalsApi();
    const a = getSpecimen(parentAId);
    const b = getSpecimen(parentBId);

    if (!animals || !a || !b) return null;

    const speciesId = chooseOffspringSpecies(a, b);
    const traits = getInheritedTraits(a, b, additive);
    const mutations = getInheritedMutations(a, b, additive);
    const generation = Math.max(
      Number(a.genetics?.generation || 1),
      Number(b.genetics?.generation || 1)
    ) + 1;

    const offspring = animals.createSpecimen(speciesId, {
      name: getOffspringName(speciesId, a, b),
      level: 1,
      traits,
      mutations,
      stats: blendStats(a, b, speciesId),
      genetics: {
        generation,
        lineage: U.uniqueBy([
          ...U.toArray(a.genetics?.lineage),
          ...U.toArray(b.genetics?.lineage),
          a.id,
          b.id
        ], (x) => String(x)),
        ancestry: U.uniqueBy([
          ...U.toArray(a.genetics?.ancestry),
          ...U.toArray(b.genetics?.ancestry),
          a.speciesId,
          b.speciesId
        ], (x) => String(x)),
        dominantTraits: U.uniqueBy(traits.filter(() => Math.random() < 0.64), (x) => String(x)),
        recessiveTraits: U.uniqueBy([
          ...U.toArray(a.traits),
          ...U.toArray(b.traits),
          ...U.toArray(a.genetics?.recessiveTraits),
          ...U.toArray(b.genetics?.recessiveTraits)
        ].filter((trait) => !traits.includes(trait) || Math.random() < 0.35), (x) => String(x)).slice(0, 10),
        parentAId: a.id,
        parentBId: b.id,
        parentASpeciesId: a.speciesId,
        parentBSpeciesId: b.speciesId,
        additiveId: additive?.itemId || null
      },
      notes: `Bred from ${a.name || getAnimalName(a.speciesId)} and ${b.name || getAnimalName(b.speciesId)}.`
    });

    animals.addSpecimenToBase(offspring);
    animals.moveSpecimenToCryo(offspring.id, { silent: true });

    return offspring;
  }

  function reduceParentNeeds(parentAId, parentBId) {
    const a = getSpecimen(parentAId);
    const b = getSpecimen(parentBId);
    const specimens = getAnimalsApi()?.getBaseSpecimens?.() || [];

    [a, b].filter(Boolean).forEach((specimen) => {
      specimen.needs = specimen.needs || {};
      specimen.needs.hunger = U.clamp(Number(specimen.needs.hunger || 0) - 18, 0, 100);
      specimen.needs.comfort = U.clamp(Number(specimen.needs.comfort || 0) - 8, 0, 100);
      specimen.needs.cleanliness = U.clamp(Number(specimen.needs.cleanliness || 0) - 5, 0, 100);
      specimen.lastUpdatedAt = U.isoNow();
    });

    S.updateBase({ specimens });
  }

  function getBreedingDurationMinutes(parentAId, parentBId) {
    const a = getSpecimen(parentAId);
    const b = getSpecimen(parentBId);

    const sameSpecies = a && b && a.speciesId === b.speciesId;
    const baseDuration = Number(CFG.BREEDING?.baseDurationMinutes || 180);

    return sameSpecies ? baseDuration : Math.round(baseDuration * 1.5);
  }

  function startBreedingJob(parentAId = state.selectedParentA, parentBId = state.selectedParentB) {
    const check = canPairBreed(parentAId, parentBId);
    if (!check.ok) {
      S.addToast(check.reason, "error");
      return null;
    }

    const additive = getSelectedAdditive();

    if (additive && !consumeAdditive(additive)) {
      S.addToast("Could not consume breeding additive.", "error");
      return null;
    }

    reduceParentNeeds(parentAId, parentBId);

    const a = getSpecimen(parentAId);
    const b = getSpecimen(parentBId);
    const job = {
      id: U.uid("breed"),
      parentAId,
      parentBId,
      parentASpeciesId: a.speciesId,
      parentBSpeciesId: b.speciesId,
      additiveId: additive?.itemId || null,
      additiveName: additive?.name || null,
      startedAt: U.isoNow(),
      progressMinutes: 0,
      durationMinutes: getBreedingDurationMinutes(parentAId, parentBId),
      status: "active",
      resultSpecimenId: null
    };

    const jobs = getBreedingJobs();
    jobs.push(job);
    S.updateBase({ breedingJobs: jobs });

    if (P.awardSkillXp) {
      P.awardSkillXp("breeding", a.speciesId === b.speciesId ? 8 : 14, "starting breeding job");
    }

    S.logActivity(
      `Started breeding ${getSpecimenName(a)} and ${getSpecimenName(b)}${additive ? ` using ${additive.name}` : ""}.`,
      "success"
    );
    S.addToast("Breeding job started.", "success");

    state.selectedParentA = null;
    state.selectedParentB = null;
    state.selectedAdditiveId = null;

    renderBreedingPanel();
    return job;
  }

  function completeBreedingJob(jobId) {
    const jobs = getBreedingJobs();
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) return null;

    const additive = job.additiveId
      ? { itemId: job.additiveId, def: S.getItemDef(job.additiveId), name: job.additiveName || U.titleCase(job.additiveId) }
      : null;

    const offspring = createOffspring(job.parentAId, job.parentBId, additive);

    const history = getBreedingHistory();
    history.unshift({
      ...job,
      completedAt: U.isoNow(),
      status: offspring ? "completed" : "failed",
      resultSpecimenId: offspring?.id || null,
      resultSpeciesId: offspring?.speciesId || null
    });

    const nextJobs = jobs.filter((entry) => entry.id !== jobId);
    S.updateBase({
      breedingJobs: nextJobs,
      breedingHistory: history
    });

    if (offspring) {
      if (P.awardSkillXp) P.awardSkillXp("breeding", 16, "completed breeding job");
      if (P.awardPlayerXp) P.awardPlayerXp(12 + Number(offspring.level || 1), "successful breeding");

      S.logActivity(`${offspring.name} was born and sent to the Cryo Fridge. Manage it from Party > All Captures.`, "success");
      S.addToast(`${offspring.name} born!`, "success");
    } else {
      S.logActivity("A breeding job failed to produce offspring.", "warning");
      S.addToast("Breeding job failed.", "warning");
    }

    renderBreedingPanel();
    return offspring;
  }

  function cancelBreedingJob(jobId) {
    const jobs = getBreedingJobs();
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) return false;

    const nextJobs = jobs.filter((entry) => entry.id !== jobId);
    S.updateBase({ breedingJobs: nextJobs });

    S.logActivity("Breeding job cancelled.", "warning");
    S.addToast("Breeding job cancelled.", "warning");

    renderBreedingPanel();
    return true;
  }

  function tickBreedingJobs(gameMinutes = 5) {
    const jobs = getBreedingJobs();
    if (!jobs.length) return false;

    const completed = [];

    jobs.forEach((job) => {
      if (job.status !== "active") return;

      job.progressMinutes = Number(job.progressMinutes || 0) + Number(gameMinutes || 0);

      if (job.progressMinutes >= Number(job.durationMinutes || 0)) {
        completed.push(job.id);
      }
    });

    S.updateBase({ breedingJobs: jobs });

    completed.forEach((jobId) => completeBreedingJob(jobId));

    return true;
  }

  function renderParentList(hostId, selectedId, onSelect, options = {}) {
    const host = U.byId(hostId);
    if (!host) return;

    U.emptyEl(host);

    const candidates = options.compatibleWith
      ? getCompatibleParentOptions(options.compatibleWith)
      : getEligibleBreedingSpecimens({ all: state.selectedFilter === "all" });

    if (!candidates.length) {
      const msg = options.compatibleWith
        ? "No compatible second parent available. Same species works now; cross-species unlocks at level 3."
        : "No eligible parents. Parents must be in a habitat, not Cryo/Party, and have enough hunger, comfort, and cleanliness.";
      host.appendChild(U.createEl("div", { className: "card", text: msg }));
      return;
    }

    candidates.forEach((specimen) => {
      const check = isSpecimenActuallyBreedable(specimen);
      const location = getSpecimenLocation(specimen);
      const habitat = getSpecimenHabitat(specimen.id);
      const card = U.createEl("div", {
        className: `card ${selectedId === specimen.id ? "selected" : ""}`
      });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(getSpecimenName(specimen))}</div>
        <div class="meta-sub">${htmlEscape(getAnimalName(specimen.speciesId))} • Lv ${htmlEscape(String(specimen.level || 1))}</div>
        <div class="meta-sub">${htmlEscape(location)}${habitat ? ` • ${htmlEscape(habitat.name || "Habitat")}` : ""}</div>
        <div class="meta-sub">Hunger ${htmlEscape(String(Math.round(specimen.needs?.hunger ?? 0)))} • Comfort ${htmlEscape(String(Math.round(specimen.needs?.comfort ?? 0)))} • Clean ${htmlEscape(String(Math.round(specimen.needs?.cleanliness ?? 0)))}</div>
        ${check.ok ? `<div class="success-text">Eligible</div>` : `<div class="warning-text">${htmlEscape(check.reason)}</div>`}
      `;

      U.on(card, "click", () => {
        onSelect(specimen.id);
      });

      host.appendChild(card);
    });
  }

  function renderAdditives(host) {
    if (!host) return;

    const additives = getBreedingAdditives();

    if (!additives.length) {
      host.insertAdjacentHTML("beforeend", `
        <h4>Additive</h4>
        <p>No breeding additives available.</p>
      `);
      return;
    }

    host.insertAdjacentHTML("beforeend", `
      <h4>Additive</h4>
      <select id="breedingAdditiveSelect">
        <option value="">No additive</option>
        ${additives.map((entry) => `
          <option value="${htmlEscape(entry.itemId)}" ${state.selectedAdditiveId === entry.itemId ? "selected" : ""}>
            ${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity))} (${htmlEscape(entry.source)})
          </option>
        `).join("")}
      </select>
    `);

    const select = U.byId("breedingAdditiveSelect");
    if (select) {
      U.on(select, "change", () => {
        setAdditive(select.value || null);
      });
    }
  }

  function renderJobs(host) {
    if (!host) return;

    const jobs = getBreedingJobs();

    host.insertAdjacentHTML("beforeend", `
      <h4>Active Jobs</h4>
      ${
        jobs.length
          ? jobs.map((job) => {
            const a = getSpecimen(job.parentAId);
            const b = getSpecimen(job.parentBId);
            const pct = U.clamp((Number(job.progressMinutes || 0) / Math.max(1, Number(job.durationMinutes || 1))) * 100, 0, 100);
            return `
              <div class="card compact-card">
                <div class="meta-title">${htmlEscape(getSpecimenName(a))} + ${htmlEscape(getSpecimenName(b))}</div>
                <div class="meta-sub">Progress ${htmlEscape(String(Math.floor(job.progressMinutes || 0)))}/${htmlEscape(String(job.durationMinutes || 0))} minutes (${htmlEscape(String(Math.floor(pct)))}%)</div>
                <div class="bar" style="margin:.45rem 0;"><div class="fill" style="width:${pct}%;"></div></div>
                <div class="admin-console-actions">
                  <button class="ghost-btn breeding-cancel-job-btn" data-job-id="${htmlEscape(job.id)}">Cancel</button>
                  <button class="secondary-btn breeding-complete-job-btn" data-job-id="${htmlEscape(job.id)}">Complete Now</button>
                </div>
              </div>
            `;
          }).join("")
          : `<p>No active breeding jobs.</p>`
      }
    `);

    U.qsa(".breeding-cancel-job-btn", host).forEach((btn) => {
      U.on(btn, "click", () => cancelBreedingJob(btn.dataset.jobId));
    });

    U.qsa(".breeding-complete-job-btn", host).forEach((btn) => {
      U.on(btn, "click", () => completeBreedingJob(btn.dataset.jobId));
    });
  }

  function renderResultPanel() {
    const host = U.byId("breedingResultPanel");
    if (!host) return;

    U.emptyEl(host);

    const a = getSpecimen(state.selectedParentA);
    const b = getSpecimen(state.selectedParentB);
    const pairCheck = canPairBreed(state.selectedParentA, state.selectedParentB);
    const selectedAdditive = getSelectedAdditive();

    const unlockText = isCrossSpeciesUnlocked()
      ? "Cross-species breeding unlocked."
      : `Cross-species breeding unlocks at level 3. Current level: ${getPlayerLevel()}.`;

    host.innerHTML = `
      <h3>Breeding Controls</h3>

      <div class="admin-console-actions" style="margin-bottom:.75rem;">
        <button class="${state.selectedFilter === "eligible" ? "primary-btn" : "ghost-btn"} breeding-filter-btn" data-filter="eligible">Eligible</button>
        <button class="${state.selectedFilter === "same" ? "primary-btn" : "ghost-btn"} breeding-filter-btn" data-filter="same">Same Species</button>
        <button class="${state.selectedFilter === "cross" ? "primary-btn" : "ghost-btn"} breeding-filter-btn" data-filter="cross">Cross Species</button>
        <button class="${state.selectedFilter === "all" ? "primary-btn" : "ghost-btn"} breeding-filter-btn" data-filter="all">All</button>
      </div>

      <p><strong>Parent A:</strong> ${htmlEscape(a ? getSpecimenName(a) : "None selected")}</p>
      <p><strong>Parent B:</strong> ${htmlEscape(b ? getSpecimenName(b) : "None selected")}</p>
      <p><strong>Unlock:</strong> ${htmlEscape(unlockText)}</p>
      <p><strong>Status:</strong> ${pairCheck.ok ? `<span class="success-text">Ready</span>` : `<span class="warning-text">${htmlEscape(pairCheck.reason)}</span>`}</p>
      <p><strong>Offspring Storage:</strong> Cryo Fridge by default</p>
    `;

    renderAdditives(host);

    host.insertAdjacentHTML("beforeend", `
      <div class="admin-console-actions" style="margin-top:.8rem;">
        <button id="btnStartBreedingJob" class="primary-btn" ${pairCheck.ok ? "" : "disabled"}>Start Breeding</button>
        <button id="btnClearBreedingParents" class="ghost-btn">Clear Parents</button>
      </div>
    `);

    if (selectedAdditive) {
      host.insertAdjacentHTML("beforeend", `
        <p class="accent-text">Selected additive: ${htmlEscape(selectedAdditive.name)}</p>
      `);
    }

    renderJobs(host);

    U.qsa(".breeding-filter-btn", host).forEach((btn) => {
      U.on(btn, "click", () => setFilter(btn.dataset.filter || "eligible"));
    });

    const startBtn = U.byId("btnStartBreedingJob");
    if (startBtn) {
      U.on(startBtn, "click", () => startBreedingJob());
    }

    const clearBtn = U.byId("btnClearBreedingParents");
    if (clearBtn) {
      U.on(clearBtn, "click", () => {
        state.selectedParentA = null;
        state.selectedParentB = null;
        renderBreedingPanel();
      });
    }
  }


  function renderMutationGuide() {
    const host = U.byId("breedingResultPanel");
    if (!host) return false;

    const traits = U.toArray(S.getData()?.traits);
    const mutations = U.toArray(S.getData()?.mutations);
    host.innerHTML = `
      <h3>Mutation Guide</h3>
      <p>Cross-species breeding unlocks at level 3. Offspring inherit a random blend of parent traits, recessive traits, ancestry, and possible mutations.</p>
      <h4>Known Traits</h4>
      ${traits.length ? traits.map((trait) => `<div class="card compact-card"><div class="meta-title">${htmlEscape(trait.name || trait.id)}</div><div class="meta-sub">${htmlEscape(trait.id || "")}</div><p>${htmlEscape(trait.description || "")}</p></div>`).join("") : "<p>No traits loaded.</p>"}
      <h4>Known Mutations</h4>
      ${mutations.length ? mutations.map((mutation) => `<div class="card compact-card"><div class="meta-title">${htmlEscape(mutation.name || mutation.id)}</div><div class="meta-sub">${htmlEscape(mutation.id || "")}</div><p>${htmlEscape(mutation.description || "")}</p></div>`).join("") : "<p>No mutations loaded.</p>"}
      <div class="admin-console-actions"><button id="btnBackToBreedingPanel" class="secondary-btn">Back to Breeding</button></div>
    `;

    const back = U.byId("btnBackToBreedingPanel");
    if (back) U.on(back, "click", () => renderBreedingPanel());
    return true;
  }

  function bindMutationGuideButton() {
    const btn = U.byId("btnOpenMutationGuide");
    if (!btn || btn.dataset.breedingGuideBound === "true") return;
    btn.dataset.breedingGuideBound = "true";
    U.on(btn, "click", () => renderMutationGuide());
  }

  function renderBreedingPanel() {
    renderParentList("breedingParentA", state.selectedParentA, setParentA);

    renderParentList("breedingParentB", state.selectedParentB, setParentB, {
      compatibleWith: state.selectedParentA
    });

    renderResultPanel();
  }

  function bindEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "breedingModal") {
        bindMutationGuideButton();
        renderBreedingPanel();
      }
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen?.("breedingModal")) renderBreedingPanel();
    });

    U.eventBus.on("party:changed", () => {
      if (S.isModalOpen?.("breedingModal")) renderBreedingPanel();
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen?.("breedingModal")) renderBreedingPanel();
    });

    U.eventBus.on("player:changed", () => {
      if (S.isModalOpen?.("breedingModal")) renderBreedingPanel();
    });

    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) {
        tickBreedingJobs(5);
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    ensureBreedingBuckets();
    bindEvents();
    bindMutationGuideButton();
    renderBreedingPanel();

    state.initialized = true;
    U.eventBus.emit("breeding:initialized");
    return true;
  }

  const API = {
    init,

    ensureBreedingBuckets,
    getBreedingJobs,
    getBreedingHistory,

    isCrossSpeciesUnlocked,
    getEligibleBreedingSpecimens,
    isSpecimenActuallyBreedable,
    canPairBreed,
    getCompatibleParentOptions,

    setParentA,
    setParentB,
    setAdditive,
    setFilter,

    getBreedingAdditives,
    getSelectedAdditive,

    createOffspring,
    startBreedingJob,
    completeBreedingJob,
    cancelBreedingJob,
    tickBreedingJobs,

    renderBreedingPanel,
    renderMutationGuide
  };

  window.GL_BREEDING = API;

  return Object.freeze(API);
})();