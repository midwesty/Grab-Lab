window.GrabLabCrafting = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedRecipeId: null,
    selectedStationFilter: "all",
    selectedStationTarget: "base" // base | boat | all
  };

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getRecipes() {
    return U.toArray(S.getData()?.recipes);
  }

  function getRecipe(recipeId) {
    return S.getRecipeDef?.(recipeId) || getRecipes().find((entry) => entry.id === recipeId) || null;
  }

  function ensureCraftingBuckets() {
    const base = S.getBase();
    if (!Array.isArray(base.craftingQueues)) base.craftingQueues = [];
    return base;
  }

  function getCraftingQueues() {
    ensureCraftingBuckets();
    return U.toArray(S.getBase()?.craftingQueues);
  }

  function getRecipeName(recipeId) {
    const recipe = getRecipe(recipeId);
    return recipe?.name || U.titleCase(recipeId || "recipe");
  }

  function normalizeItemList(raw = []) {
    if (Array.isArray(raw)) {
      return raw
        .map((entry) => {
          if (typeof entry === "string") {
            return { itemId: entry, quantity: 1 };
          }

          return {
            itemId: entry.itemId || entry.id || entry.item || entry.outputId || entry.inputId,
            quantity: Number(entry.quantity || entry.qty || entry.amount || entry.count || 1)
          };
        })
        .filter((entry) => entry.itemId);
    }

    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([itemId, quantity]) => ({
        itemId,
        quantity: Number(quantity || 1)
      }));
    }

    return [];
  }

  function getRecipeInputs(recipe) {
    return normalizeItemList(recipe?.inputs || recipe?.ingredients || recipe?.materials || recipe?.cost || recipe?.costs || []);
  }

  function getRecipeOutputs(recipe) {
    return normalizeItemList(recipe?.outputs || recipe?.results || recipe?.result || recipe?.output || []);
  }

  function getRecipeStation(recipe) {
    return recipe?.station || recipe?.stationId || recipe?.workstation || "workbench";
  }

  function getStructureStationIds(entry) {
    const def = S.getStructureDef?.(entry?.structureId);
    if (!def) return [];

    const stationIds = new Set();

    U.toArray(def.stations).forEach((stationId) => stationIds.add(stationId));
    if (def.stationId) stationIds.add(def.stationId);
    if (def.workstationId) stationIds.add(def.workstationId);
    if (U.toArray(def.tags).includes("crafting")) stationIds.add(def.id);

    if (def.id === "field_stove_t1") stationIds.add("stove");
    if (def.id === "breeding_tank_t1") stationIds.add("breeding_tank");
    if (def.id === "workbench_t1") stationIds.add("workbench");
    if (def.id === "rough_workbench") stationIds.add("workbench");

    return [...stationIds];
  }

  function getBaseBuiltStations() {
    const structures = U.toArray(S.getBase()?.structures);
    const stationIds = new Set();

    U.toArray(S.getBase()?.stationsUnlocked).forEach((stationId) => stationIds.add(stationId));

    structures.forEach((entry) => {
      getStructureStationIds(entry).forEach((stationId) => stationIds.add(stationId));
    });

    return [...stationIds];
  }

  function getBoatBuiltStations() {
    const modules = U.toArray(S.getBoat()?.modules);
    const stationIds = new Set();

    U.toArray(S.getBoat()?.stationsUnlocked).forEach((stationId) => stationIds.add(stationId));

    modules.forEach((entry) => {
      getStructureStationIds(entry).forEach((stationId) => stationIds.add(stationId));
    });

    return [...stationIds];
  }

  function getAccessibleStations(target = state.selectedStationTarget || "all") {
    const safeTarget = target || "all";
    const baseStations = getBaseBuiltStations();
    const boatStations = getBoatBuiltStations();

    if (safeTarget === "base") return baseStations;
    if (safeTarget === "boat") return boatStations;

    return U.uniqueBy([...baseStations, ...boatStations], (x) => String(x));
  }

  function getInventoryAmount(itemId, source = "all") {
    if (!itemId) return 0;

    if (source === "player") return S.getItemQuantity?.("player", itemId) || 0;
    if (source === "base") return S.getItemQuantity?.("base", itemId) || 0;
    if (source === "boat") return S.getItemQuantity?.("boat", itemId) || 0;

    return (
      (S.getItemQuantity?.("player", itemId) || 0) +
      (S.getItemQuantity?.("base", itemId) || 0) +
      (S.getItemQuantity?.("boat", itemId) || 0)
    );
  }

  function hasRequiredItems(recipe, quantity = 1, source = "all") {
    const inputs = getRecipeInputs(recipe);
    if (!inputs.length) return true;

    return inputs.every((input) => {
      const needed = Number(input.quantity || 1) * Math.max(1, Number(quantity || 1));
      return getInventoryAmount(input.itemId, source) >= needed;
    });
  }

  function getMissingInputs(recipe, quantity = 1, source = "all") {
    return getRecipeInputs(recipe)
      .map((input) => {
        const needed = Number(input.quantity || 1) * Math.max(1, Number(quantity || 1));
        const have = getInventoryAmount(input.itemId, source);

        return {
          itemId: input.itemId,
          needed,
          have,
          missing: Math.max(0, needed - have)
        };
      })
      .filter((entry) => entry.missing > 0);
  }

  function recipeAllowsHandCrafting(recipe) {
    const station = getRecipeStation(recipe);
    return !station || station === "none" || station === "hand" || station === "field";
  }

  function canUseStation(recipe, target = state.selectedStationTarget || "all") {
    if (recipeAllowsHandCrafting(recipe)) return true;

    const station = getRecipeStation(recipe);
    return getAccessibleStations(target).includes(station);
  }

  function getStationFailureReason(recipe, target = state.selectedStationTarget || "all") {
    const station = getRecipeStation(recipe);
    if (recipeAllowsHandCrafting(recipe)) return "";

    if (target === "boat") return `Required station unavailable on boat: ${station}`;
    if (target === "base") return `Required station unavailable at base: ${station}`;

    return `Required station unavailable: ${station}`;
  }

  function canCraft(recipeId, quantity = 1, source = "all", target = state.selectedStationTarget || "all") {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
      return { ok: false, reason: "Recipe not found." };
    }

    if (!canUseStation(recipe, target)) {
      return {
        ok: false,
        reason: getStationFailureReason(recipe, target)
      };
    }

    if (!hasRequiredItems(recipe, quantity, source)) {
      return {
        ok: false,
        reason: "Missing required materials.",
        missing: getMissingInputs(recipe, quantity, source)
      };
    }

    const outputs = getRecipeOutputs(recipe);
    if (!outputs.length) {
      return {
        ok: false,
        reason: "Recipe has no outputs configured."
      };
    }

    return { ok: true };
  }

  function removeIngredients(recipe, quantity = 1, preferredSources = ["player", "base", "boat"]) {
    getRecipeInputs(recipe).forEach((input) => {
      let remaining = Number(input.quantity || 1) * Math.max(1, Number(quantity || 1));

      preferredSources.forEach((source) => {
        if (remaining <= 0) return;

        const available = getInventoryAmount(input.itemId, source);
        if (available <= 0) return;

        const take = Math.min(available, remaining);
        S.removeItem(source, input.itemId, take);
        remaining -= take;
      });

      if (remaining > 0) {
        throw new Error(`Failed to remove enough ${getItemName(input.itemId)}.`);
      }
    });

    return true;
  }

  function addOutputs(recipe, quantity = 1, target = "player") {
    const outputs = getRecipeOutputs(recipe);

    if (!outputs.length) {
      throw new Error("Recipe has no outputs configured.");
    }

    outputs.forEach((output) => {
      const amount = Number(output.quantity || 1) * Math.max(1, Number(quantity || 1));
      if (amount <= 0) return;
      S.addItem(target, output.itemId, amount);
    });

    U.eventBus.emit("crafting:outputsAdded", {
      recipeId: recipe?.id,
      quantity,
      target
    });

    U.eventBus.emit("inventory:changed", {
      target,
      reason: "crafting_output"
    });

    return true;
  }

  function getRecipeDurationMinutes(recipe) {
    return Math.max(0, Number(recipe?.durationMinutes ?? recipe?.craftTimeMinutes ?? recipe?.timeMinutes ?? 15));
  }

  function getDefaultOutputTargetForRecipe(recipe, stationTarget = state.selectedStationTarget) {
    if (recipe?.outputTarget) return recipe.outputTarget;
    if (stationTarget === "boat") return "boat";
    return "player";
  }

  function createCraftingJob(recipeId, quantity = 1, options = {}) {
    const recipe = getRecipe(recipeId);
    if (!recipe) throw new Error("Recipe not found.");

    const source = options.source || "all";
    const stationTarget = options.stationTarget || state.selectedStationTarget || "all";
    const qty = Math.max(1, Number(quantity || 1));

    const validation = canCraft(recipeId, qty, source, stationTarget);
    if (!validation.ok) throw new Error(validation.reason);

    removeIngredients(recipe, qty, options.preferredSources || ["player", "base", "boat"]);

    const duration = getRecipeDurationMinutes(recipe);
    const outputTarget = options.outputTarget || getDefaultOutputTargetForRecipe(recipe, stationTarget);

    if (duration <= 0 || options.instant) {
      addOutputs(recipe, qty, outputTarget);
      P.registerCraftAction?.();
      P.awardPlayerXp?.(4 + qty, `crafting ${getRecipeName(recipeId)}`);
      P.awardSkillXp?.("crafting", 4 + qty, "instant craft");
      S.logActivity(`Crafted ${getRecipeName(recipeId)} x${qty}.`, "success");
      S.addToast(`Crafted ${getRecipeName(recipeId)}`, "success");
      renderCraftingPanel();
      UI.renderEverything?.();
      return null;
    }

    const job = {
      id: U.uid("craft"),
      recipeId,
      quantity: qty,
      station: getRecipeStation(recipe),
      stationTarget,
      startedAt: U.isoNow(),
      progressMinutes: 0,
      durationMinutes: duration,
      outputTarget,
      status: "active"
    };

    const queues = getCraftingQueues();
    queues.push(job);
    S.updateBase({ craftingQueues: queues });

    P.registerCraftAction?.();
    P.awardSkillXp?.("crafting", 3, "starting craft");

    S.logActivity(`Started crafting ${getRecipeName(recipeId)} x${job.quantity}.`, "success");
    S.addToast(`Crafting ${getRecipeName(recipeId)}...`, "success");
    renderCraftingPanel();
    UI.renderEverything?.();

    return job;
  }

  function craftInstant(recipeId, quantity = 1, options = {}) {
    const recipe = getRecipe(recipeId);
    if (!recipe) throw new Error("Recipe not found.");

    const source = options.source || "all";
    const stationTarget = options.stationTarget || state.selectedStationTarget || "all";
    const qty = Math.max(1, Number(quantity || 1));
    const outputTarget = options.outputTarget || getDefaultOutputTargetForRecipe(recipe, stationTarget);

    const validation = canCraft(recipeId, qty, source, stationTarget);
    if (!validation.ok) throw new Error(validation.reason);

    removeIngredients(recipe, qty, options.preferredSources || ["player", "base", "boat"]);
    addOutputs(recipe, qty, outputTarget);

    P.registerCraftAction?.();
    P.awardSkillXp?.("crafting", 4 + qty, "instant craft");
    P.awardPlayerXp?.(4 + qty, `crafting ${getRecipeName(recipeId)}`);

    S.logActivity(`Crafted ${getRecipeName(recipeId)} x${qty}.`, "success");
    S.addToast(`Crafted ${getRecipeName(recipeId)}`, "success");
    renderCraftingPanel();
    UI.renderEverything?.();

    return true;
  }

  function getCraftingJob(jobId) {
    return getCraftingQueues().find((job) => job.id === jobId) || null;
  }

  function updateCraftingJob(jobId, patch = {}) {
    const queues = getCraftingQueues();
    const target = queues.find((job) => job.id === jobId);

    if (!target) return null;

    Object.assign(target, U.deepMerge(target, patch));
    S.updateBase({ craftingQueues: queues });

    return target;
  }

  function cancelCraftingJob(jobId, refundRatio = CFG.BUILDING?.refundRatioOnDemolish ?? 0.5) {
    const queues = getCraftingQueues();
    const job = queues.find((entry) => entry.id === jobId);

    if (!job) return false;

    const recipe = getRecipe(job.recipeId);

    if (recipe) {
      getRecipeInputs(recipe).forEach((input) => {
        const original = Number(input.quantity || 1) * Number(job.quantity || 1);
        const refund = Math.floor(original * Number(refundRatio || 0));

        if (refund > 0) {
          S.addItem("player", input.itemId, refund);
        }
      });

      U.eventBus.emit("inventory:changed", {
        target: "player",
        reason: "crafting_refund"
      });
    }

    const next = queues.filter((entry) => entry.id !== jobId);
    S.updateBase({ craftingQueues: next });

    S.logActivity(`Cancelled crafting job ${getRecipeName(job.recipeId)}.`, "warning");
    S.addToast("Crafting job cancelled.", "warning");
    renderCraftingPanel();
    UI.renderEverything?.();

    return true;
  }

  function completeCraftingJob(jobId) {
    const queues = getCraftingQueues();
    const job = queues.find((entry) => entry.id === jobId);

    if (!job) return null;

    const recipe = getRecipe(job.recipeId);

    if (!recipe) {
      cancelCraftingJob(jobId, 0);
      return null;
    }

    addOutputs(recipe, Number(job.quantity || 1), job.outputTarget || getDefaultOutputTargetForRecipe(recipe, job.stationTarget));

    const next = queues.filter((entry) => entry.id !== jobId);
    S.updateBase({ craftingQueues: next });

    P.awardSkillXp?.("crafting", 5 + Number(job.quantity || 1), "completed craft");
    P.awardPlayerXp?.(5 + Number(job.quantity || 1), `completing ${getRecipeName(job.recipeId)}`);

    S.logActivity(`Finished crafting ${getRecipeName(job.recipeId)} x${job.quantity}.`, "success");
    S.addToast(`${getRecipeName(job.recipeId)} complete`, "success");
    renderCraftingPanel();
    UI.renderEverything?.();

    return true;
  }

  function tickCraftingQueues(gameMinutes = 5) {
    const queues = getCraftingQueues();

    if (!queues.length) return false;

    let changed = false;
    const completed = [];

    queues.forEach((job) => {
      if (job.status !== "active") return;

      job.progressMinutes = Number(job.progressMinutes || 0) + Number(gameMinutes || 0);
      changed = true;

      if (job.progressMinutes >= Number(job.durationMinutes || 0)) {
        completed.push(job.id);
      }
    });

    if (changed) {
      S.updateBase({ craftingQueues: queues });
    }

    completed.forEach((jobId) => {
      completeCraftingJob(jobId);
    });

    return changed;
  }

  function getItemName(itemId) {
    const def = S.getItemDef?.(itemId);
    return def?.name || U.titleCase(itemId || "item");
  }

  function getRecipeDisplayData(recipe) {
    const inputs = getRecipeInputs(recipe).map((entry) => ({
      ...entry,
      name: getItemName(entry.itemId),
      have: getInventoryAmount(entry.itemId, "all")
    }));

    const outputs = getRecipeOutputs(recipe).map((entry) => ({
      ...entry,
      name: getItemName(entry.itemId)
    }));

    const validation = canCraft(recipe.id, 1, "all", state.selectedStationTarget);

    return {
      recipe,
      station: getRecipeStation(recipe),
      canCraft: validation.ok,
      reason: validation.reason || "",
      missing: U.toArray(validation.missing),
      inputs,
      outputs
    };
  }

  function filterRecipes(searchText = "", stationFilter = "all") {
    const needle = String(searchText || "").trim().toLowerCase();

    return getRecipes().filter((recipe) => {
      if (!recipe?.id) return false;

      if (stationFilter !== "all" && getRecipeStation(recipe) !== stationFilter) {
        return false;
      }

      if (!needle) return true;

      const itemText = [
        ...getRecipeInputs(recipe).map((entry) => `${entry.itemId} ${getItemName(entry.itemId)}`),
        ...getRecipeOutputs(recipe).map((entry) => `${entry.itemId} ${getItemName(entry.itemId)}`)
      ].join(" ");

      const haystack = [
        recipe.id,
        recipe.name,
        recipe.description,
        getRecipeStation(recipe),
        itemText
      ].join(" ").toLowerCase();

      return haystack.includes(needle);
    });
  }

  function selectRecipe(recipeId) {
    state.selectedRecipeId = recipeId || null;
    renderCraftingPanel();
    return state.selectedRecipeId;
  }

  function setStationFilter(filterId = "all") {
    state.selectedStationFilter = filterId || "all";
    renderCraftingPanel();
    return state.selectedStationFilter;
  }

  function setStationTarget(target = "base") {
    state.selectedStationTarget = ["base", "boat", "all"].includes(target) ? target : "base";
    renderCraftingPanel();
    return state.selectedStationTarget;
  }

  function getCraftOutputTargetForStationTarget(stationTarget = state.selectedStationTarget) {
    if (stationTarget === "boat") return "boat";
    return "player";
  }

  function renderRecipeList() {
    const list = U.byId("recipeList");
    if (!list) return;

    U.emptyEl(list);

    const search = U.byId("craftSearch")?.value || "";
    const recipes = filterRecipes(search, state.selectedStationFilter);

    if (!recipes.length) {
      list.appendChild(U.createEl("div", {
        className: "card",
        text: "No recipes match the current filter."
      }));
      return;
    }

    recipes.forEach((recipe) => {
      const data = getRecipeDisplayData(recipe);
      const selected = state.selectedRecipeId === recipe.id;
      const card = U.createEl("div", {
        className: `card ${selected ? "selected" : ""}`
      });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(recipe.name || U.titleCase(recipe.id))}</div>
        <div class="meta-sub">${htmlEscape(data.station || "workbench")}</div>
        <div class="meta-sub">${data.canCraft ? "Ready to craft" : htmlEscape(data.reason || "Missing materials or station")}</div>
      `;

      U.on(card, "click", () => {
        selectRecipe(recipe.id);
      });

      list.appendChild(card);
    });
  }

  function renderRecipeDetail() {
    const detail = U.byId("recipeDetail");
    if (!detail) return;

    const recipe = state.selectedRecipeId ? getRecipe(state.selectedRecipeId) : null;

    if (!recipe) {
      detail.innerHTML = `
        <h3>Select a recipe</h3>
        <p>Choose a recipe from the list to inspect ingredients and craft it.</p>
      `;
      return;
    }

    const data = getRecipeDisplayData(recipe);
    const duration = getRecipeDurationMinutes(recipe);
    const outputTarget = getDefaultOutputTargetForRecipe(recipe, state.selectedStationTarget);

    detail.innerHTML = `
      <h3>${htmlEscape(recipe.name || U.titleCase(recipe.id))}</h3>
      <p>${htmlEscape(recipe.description || "No description yet.")}</p>
      <p><strong>Station:</strong> ${htmlEscape(data.station)}</p>
      <p><strong>Using:</strong> ${htmlEscape(U.titleCase(state.selectedStationTarget))}</p>
      <p><strong>Duration:</strong> ${htmlEscape(String(duration))} in-game minute${duration === 1 ? "" : "s"}</p>
      <p><strong>Output Target:</strong> ${htmlEscape(outputTarget === "boat" ? "Boat Storage" : outputTarget === "base" ? "Base Storage" : "Backpack")}</p>

      <h4>Inputs</h4>
      <ul>
        ${
          data.inputs.length
            ? data.inputs.map((entry) => `
              <li>
                ${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity || 1))}
                — Have ${htmlEscape(String(entry.have || 0))}
              </li>
            `).join("")
            : "<li>No inputs required.</li>"
        }
      </ul>

      <h4>Outputs</h4>
      <ul>
        ${
          data.outputs.length
            ? data.outputs.map((entry) => `
              <li>${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity || 1))}</li>
            `).join("")
            : "<li>No outputs listed.</li>"
        }
      </ul>

      ${
        data.canCraft
          ? `<p class="accent-text">All requirements met.</p>`
          : `<p class="danger-text">${htmlEscape(data.reason || "Cannot craft right now.")}</p>`
      }

      ${
        data.missing.length
          ? `<p class="danger-text">Missing: ${htmlEscape(data.missing.map((m) => `${getItemName(m.itemId)} x${m.missing}`).join(", "))}</p>`
          : ""
      }

      <div class="admin-console-actions">
        <button id="btnCraftOnce" class="primary-btn" ${data.canCraft ? "" : "disabled"}>Craft Now</button>
        <button id="btnQueueCraft" class="secondary-btn" ${data.canCraft ? "" : "disabled"}>Queue Timed Craft</button>
      </div>
    `;

    const btnCraftOnce = U.byId("btnCraftOnce");
    const btnQueueCraft = U.byId("btnQueueCraft");

    if (btnCraftOnce) {
      U.on(btnCraftOnce, "click", () => {
        try {
          craftInstant(recipe.id, 1, {
            stationTarget: state.selectedStationTarget,
            outputTarget
          });
        } catch (err) {
          S.addToast(err.message || "Craft failed.", "error");
        }
      });
    }

    if (btnQueueCraft) {
      U.on(btnQueueCraft, "click", () => {
        try {
          createCraftingJob(recipe.id, 1, {
            stationTarget: state.selectedStationTarget,
            outputTarget
          });
        } catch (err) {
          S.addToast(err.message || "Queue failed.", "error");
        }
      });
    }
  }

  function renderQueueSummary() {
    const detail = U.byId("recipeDetail");
    if (!detail) return;

    const queues = getCraftingQueues();
    const queueHtml = !queues.length
      ? `<p>No active crafting jobs.</p>`
      : queues.map((job) => {
        const pct = U.clamp(
          (Number(job.progressMinutes || 0) / Math.max(1, Number(job.durationMinutes || 1))) * 100,
          0,
          100
        );

        return `
          <div class="card" style="margin-top:.6rem;">
            <div class="meta-title">${htmlEscape(getRecipeName(job.recipeId))}</div>
            <div class="meta-sub">Progress: ${htmlEscape(String(Math.floor(job.progressMinutes || 0)))}/${htmlEscape(String(job.durationMinutes || 0))} minutes (${htmlEscape(String(Math.floor(pct)))}%)</div>
            <div class="meta-sub">Station: ${htmlEscape(job.station || "workbench")} • ${htmlEscape(U.titleCase(job.stationTarget || "base"))}</div>
            <div class="meta-sub">Output: ${htmlEscape(job.outputTarget || "player")}</div>
            <div class="admin-console-actions">
              <button class="ghost-btn crafting-cancel-job-btn" data-job-id="${htmlEscape(job.id)}">Cancel Job</button>
              <button class="secondary-btn crafting-complete-job-btn" data-job-id="${htmlEscape(job.id)}">Complete Now</button>
            </div>
          </div>
        `;
      }).join("");

    detail.innerHTML += `
      <hr />
      <h4>Crafting Queue</h4>
      ${queueHtml}
    `;

    U.qsa(".crafting-cancel-job-btn", detail).forEach((btn) => {
      U.on(btn, "click", () => {
        cancelCraftingJob(btn.dataset.jobId);
      });
    });

    U.qsa(".crafting-complete-job-btn", detail).forEach((btn) => {
      U.on(btn, "click", () => {
        completeCraftingJob(btn.dataset.jobId);
      });
    });
  }

  function renderStationFilters() {
    const list = U.byId("recipeList");
    if (!list) return;

    const stations = ["all", ...U.uniqueBy(getRecipes().map(getRecipeStation), (x) => String(x))];

    const filterCard = U.createEl("div", { className: "card" });
    filterCard.innerHTML = `
      <div class="meta-title">Station Filter</div>
      <div class="admin-console-actions" id="craftStationFilterButtons"></div>
      <div class="meta-title" style="margin-top:.75rem;">Use Stations From</div>
      <div class="admin-console-actions" id="craftStationTargetButtons"></div>
      <div class="meta-sub" style="margin-top:.75rem;">
        Base stations: ${htmlEscape(getBaseBuiltStations().join(", ") || "none")}<br />
        Boat stations: ${htmlEscape(getBoatBuiltStations().join(", ") || "none")}
      </div>
    `;

    const buttonsHost = filterCard.querySelector("#craftStationFilterButtons");
    const targetHost = filterCard.querySelector("#craftStationTargetButtons");

    stations.forEach((stationId) => {
      const btn = U.createEl("button", {
        className: stationId === state.selectedStationFilter ? "primary-btn" : "ghost-btn",
        text: stationId === "all" ? "All" : U.titleCase(stationId)
      });

      U.on(btn, "click", () => {
        setStationFilter(stationId);
      });

      buttonsHost.appendChild(btn);
    });

    ["base", "boat", "all"].forEach((targetId) => {
      const btn = U.createEl("button", {
        className: targetId === state.selectedStationTarget ? "secondary-btn" : "ghost-btn",
        text: U.titleCase(targetId)
      });

      U.on(btn, "click", () => {
        setStationTarget(targetId);
      });

      targetHost.appendChild(btn);
    });

    list.prepend(filterCard);
  }

  function renderCraftingPanel() {
    renderRecipeList();
    renderRecipeDetail();
    renderQueueSummary();
    renderStationFilters();
  }

  function ensureEssentialCraftingRecipes() {
    const recipes = getRecipes();
    const byId = new Set(recipes.map((recipe) => recipe.id));
    const essential = [
      {
        id: "hand_twist_rope_bundle",
        name: "Hand-Twisted Rope Bundle",
        description: "Twist plant fiber into rope without needing a station. Slower, but always available.",
        station: "field",
        durationMinutes: 14,
        inputs: [{ itemId: "fiber_bundle", quantity: 3 }],
        outputs: [{ itemId: "rope_bundle", quantity: 1 }]
      },
      {
        id: "rope_bundle_from_fiber",
        name: "Twisted Rope Bundle",
        description: "Twist fresh fiber into a stronger, more useful bundle of rope.",
        station: "workbench",
        durationMinutes: 9,
        inputs: [{ itemId: "fiber_bundle", quantity: 3 }],
        outputs: [{ itemId: "rope_bundle", quantity: 1 }]
      },
      {
        id: "scrap_wood_from_reeds",
        name: "Dry Reed Scrap Wood",
        description: "Bundle and harden reeds into rough building scrap when wood is scarce.",
        station: "workbench",
        durationMinutes: 12,
        inputs: [{ itemId: "fiber_bundle", quantity: 4 }],
        outputs: [{ itemId: "scrap_wood", quantity: 2 }]
      },
      {
        id: "basic_fishing_net",
        name: "Basic Fishing Net",
        description: "A simple net for scooping up small catches and algae.",
        station: "workbench",
        durationMinutes: 16,
        inputs: [
          { itemId: "fiber_bundle", quantity: 5 },
          { itemId: "rope_bundle", quantity: 2 }
        ],
        outputs: [{ itemId: "fishing_net_basic", quantity: 1 }]
      },
      {
        id: "passive_line_basic",
        name: "Passive Fishing Line",
        description: "A set-and-check line for passive fishing.",
        station: "workbench",
        durationMinutes: 12,
        inputs: [
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 1 },
          { itemId: "bait_worm", quantity: 1 }
        ],
        outputs: [{ itemId: "passive_line_basic", quantity: 1 }]
      },
      {
        id: "improvised_snare_trap",
        name: "Improvised Snare Trap",
        description: "A rough reusable land trap for small and medium marsh creatures.",
        station: "field",
        durationMinutes: 10,
        inputs: [
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 1 },
          { itemId: "scrap_wood", quantity: 1 }
        ],
        outputs: [{ itemId: "improvised_snare_trap", quantity: 1 }]
      },
      {
        id: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A woven water trap for passive aquatic catches.",
        station: "field",
        durationMinutes: 10,
        inputs: [
          { itemId: "fiber_bundle", quantity: 3 },
          { itemId: "rope_bundle", quantity: 1 }
        ],
        outputs: [{ itemId: "reed_fish_trap", quantity: 1 }]
      },
      {
        id: "cage_trap_basic",
        name: "Basic Cage Trap",
        description: "A sturdier trap with better odds and room for larger land animals.",
        station: "field",
        durationMinutes: 15,
        inputs: [
          { itemId: "scrap_wood", quantity: 4 },
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 2 }
        ],
        outputs: [{ itemId: "cage_trap_basic", quantity: 1 }]
      }
    ];

    let changed = false;
    essential.forEach((recipe) => {
      if (!byId.has(recipe.id)) {
        recipes.push(recipe);
        changed = true;
      }
    });

    if (changed) S.replaceDataBucket("recipes", recipes);
    return changed;
  }

  function seedFallbackRecipesIfNeeded() {
    const recipes = getRecipes();
    if (recipes.length > 0) {
      ensureEssentialCraftingRecipes();
      return false;
    }

    const fallback = [
      {
        id: "bandage_basic",
        name: "Basic Bandage",
        description: "A simple field dressing.",
        station: "workbench",
        durationMinutes: 10,
        inputs: [
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "fresh_water", quantity: 1 }
        ],
        outputs: [
          { itemId: "bandage_basic", quantity: 1 }
        ]
      },
      {
        id: "bait_worm",
        name: "Prepared Worm Bait",
        description: "Reliable bait for river fishing.",
        station: "workbench",
        durationMinutes: 5,
        inputs: [
          { itemId: "berries_wild", quantity: 1 }
        ],
        outputs: [
          { itemId: "bait_worm", quantity: 2 }
        ]
      },
      {
        id: "improvised_snare_trap",
        name: "Improvised Snare Trap",
        description: "A quick land trap for passive small-creature catches.",
        station: "workbench",
        durationMinutes: 12,
        inputs: [
          { itemId: "fiber_bundle", quantity: 2 },
          { itemId: "rope_bundle", quantity: 1 },
          { itemId: "scrap_wood", quantity: 1 }
        ],
        outputs: [
          { itemId: "improvised_snare_trap", quantity: 1 }
        ]
      },
      {
        id: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A water trap for passive aquatic catches.",
        station: "workbench",
        durationMinutes: 14,
        inputs: [
          { itemId: "fiber_bundle", quantity: 3 },
          { itemId: "rope_bundle", quantity: 1 }
        ],
        outputs: [
          { itemId: "reed_fish_trap", quantity: 1 }
        ]
      },
      {
        id: "boiled_water",
        name: "Boiled Water",
        description: "Safer water, slightly less crunchy.",
        station: "stove",
        durationMinutes: 8,
        inputs: [
          { itemId: "fresh_water", quantity: 1 }
        ],
        outputs: [
          { itemId: "clean_water", quantity: 1 }
        ]
      },
      {
        id: "rope_bundle_from_fiber",
        name: "Twisted Rope Bundle",
        description: "Twist fresh fiber into a stronger, more useful bundle of rope.",
        station: "workbench",
        durationMinutes: 9,
        inputs: [
          { itemId: "fiber_bundle", quantity: 3 }
        ],
        outputs: [
          { itemId: "rope_bundle", quantity: 1 }
        ]
      },
      {
        id: "chameleon_juice",
        name: "Chameleon Juice",
        description: "A mutation additive for stealth-friendly offspring.",
        station: "workbench",
        durationMinutes: 15,
        inputs: [
          { itemId: "fresh_water", quantity: 1 },
          { itemId: "alcohol_basic", quantity: 1 },
          { itemId: "chameleon_skin", quantity: 1 }
        ],
        outputs: [
          { itemId: "chameleon_juice", quantity: 1 }
        ]
      }
    ];

    S.replaceDataBucket("recipes", fallback);
    ensureEssentialCraftingRecipes();
    return true;
  }

  function bindTickEvents() {
    U.eventBus.on("world:timeChanged", ({ minute }) => {
      if (minute % 5 === 0) {
        tickCraftingQueues(5);
      }
    });

    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "craftModal") {
        renderCraftingPanel();
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen?.("craftModal")) {
        renderCraftingPanel();
      }
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen?.("craftModal")) {
        renderCraftingPanel();
      }
    });

    U.eventBus.on("boat:changed", () => {
      if (S.isModalOpen?.("craftModal")) {
        renderCraftingPanel();
      }
    });

    const search = U.byId("craftSearch");
    if (search && search.dataset.craftSearchBound !== "true") {
      search.dataset.craftSearchBound = "true";
      U.on(search, "input", U.debounce(() => {
        renderCraftingPanel();
      }, 100));
    }
  }

  function init() {
    if (state.initialized) return true;

    ensureCraftingBuckets();
    seedFallbackRecipesIfNeeded();
    ensureEssentialCraftingRecipes();
    bindTickEvents();
    renderCraftingPanel();

    state.initialized = true;
    U.eventBus.emit("crafting:initialized");
    return true;
  }

  const API = {
    init,

    getRecipes,
    getRecipe,
    ensureCraftingBuckets,
    getCraftingQueues,
    getRecipeName,
    getRecipeInputs,
    getRecipeOutputs,
    getRecipeStation,
    getAccessibleStations,
    getBaseBuiltStations,
    getBoatBuiltStations,

    normalizeItemList,
    getInventoryAmount,
    hasRequiredItems,
    getMissingInputs,
    recipeAllowsHandCrafting,
    canUseStation,
    getStationFailureReason,
    canCraft,

    removeIngredients,
    addOutputs,
    getRecipeDurationMinutes,
    getDefaultOutputTargetForRecipe,

    createCraftingJob,
    craftInstant,
    getCraftingJob,
    updateCraftingJob,
    cancelCraftingJob,
    completeCraftingJob,
    tickCraftingQueues,

    getRecipeDisplayData,
    filterRecipes,
    selectRecipe,
    setStationFilter,
    setStationTarget,
    getCraftOutputTargetForStationTarget,

    renderCraftingPanel,
    ensureEssentialCraftingRecipes,
    seedFallbackRecipesIfNeeded
  };

  window.GL_CRAFTING = API;

  return Object.freeze(API);
})();