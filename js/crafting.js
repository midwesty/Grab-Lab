window.GrabLabCrafting = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedRecipeId: null,
    selectedStationFilter: "all"
  };

  function getRecipes() {
    return U.toArray(S.getData()?.recipes);
  }

  function getRecipe(recipeId) {
    return S.getRecipeDef(recipeId) || null;
  }

  function getCraftingQueues() {
    return U.toArray(S.getBase()?.craftingQueues);
  }

  function getRecipeName(recipeId) {
    const recipe = getRecipe(recipeId);
    return recipe?.name || U.titleCase(recipeId || "recipe");
  }

  function getRecipeInputs(recipe) {
    return U.toArray(recipe?.inputs);
  }

  function getRecipeOutputs(recipe) {
    return U.toArray(recipe?.outputs);
  }

  function getRecipeStation(recipe) {
    return recipe?.station || "workbench";
  }

  function getAccessibleStations() {
    const base = S.getBase();
    const structures = U.toArray(base?.structures);

    const stationIds = new Set(["workbench"]);

    structures.forEach((entry) => {
      const def = S.getStructureDef(entry.structureId);
      if (!def) return;

      U.toArray(def.stations).forEach((stationId) => stationIds.add(stationId));
      if (def.stationId) stationIds.add(def.stationId);
      if (def.tags?.includes?.("crafting")) {
        stationIds.add(def.id);
      }
    });

    if (stationIds.has("field_stove_t1")) stationIds.add("stove");
    if (stationIds.has("breeding_tank_t1")) stationIds.add("breeding_tank");

    return [...stationIds];
  }

  function getInventoryAmount(itemId, source = "all") {
    if (!itemId) return 0;

    if (source === "player") return S.getItemQuantity("player", itemId);
    if (source === "base") return S.getItemQuantity("base", itemId);
    if (source === "boat") return S.getItemQuantity("boat", itemId);

    return (
      S.getItemQuantity("player", itemId) +
      S.getItemQuantity("base", itemId) +
      S.getItemQuantity("boat", itemId)
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

  function canUseStation(recipe) {
    const station = getRecipeStation(recipe);
    if (!station || station === "none") return true;

    const accessible = getAccessibleStations();
    return accessible.includes(station);
  }

  function canCraft(recipeId, quantity = 1, source = "all") {
    const recipe = getRecipe(recipeId);
    if (!recipe) {
      return { ok: false, reason: "Recipe not found." };
    }

    if (!canUseStation(recipe)) {
      return {
        ok: false,
        reason: `Required station unavailable: ${getRecipeStation(recipe)}`
      };
    }

    if (!hasRequiredItems(recipe, quantity, source)) {
      return {
        ok: false,
        reason: "Missing required materials.",
        missing: getMissingInputs(recipe, quantity, source)
      };
    }

    return { ok: true };
  }

  function removeIngredients(recipe, quantity = 1, preferredSources = ["player", "base", "boat"]) {
    const inputs = getRecipeInputs(recipe);

    for (const input of inputs) {
      let remaining = Number(input.quantity || 1) * Math.max(1, Number(quantity || 1));

      for (const source of preferredSources) {
        if (remaining <= 0) break;

        const available = getInventoryAmount(input.itemId, source);
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        S.removeItem(source, input.itemId, take);
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(`Failed to remove enough ${input.itemId}.`);
      }
    }

    return true;
  }

  function addOutputs(recipe, quantity = 1, target = "player") {
    const outputs = getRecipeOutputs(recipe);

    outputs.forEach((output) => {
      const amount = Number(output.quantity || 1) * Math.max(1, Number(quantity || 1));
      S.addItem(target, output.itemId, amount);
    });

    return true;
  }

  function getRecipeDurationMinutes(recipe) {
    return Number(recipe?.durationMinutes || recipe?.craftTimeMinutes || 15);
  }

  function createCraftingJob(recipeId, quantity = 1, options = {}) {
    const recipe = getRecipe(recipeId);
    if (!recipe) throw new Error("Recipe not found.");

    const validation = canCraft(recipeId, quantity, options.source || "all");
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    removeIngredients(recipe, quantity, options.preferredSources || ["player", "base", "boat"]);

    const job = {
      id: U.uid("craft"),
      recipeId,
      quantity: Math.max(1, Number(quantity || 1)),
      station: getRecipeStation(recipe),
      startedAt: U.isoNow(),
      progressMinutes: 0,
      durationMinutes: getRecipeDurationMinutes(recipe),
      outputTarget: options.outputTarget || "player",
      status: "active"
    };

    const queues = getCraftingQueues();
    queues.push(job);
    S.updateBase({ craftingQueues: queues });

    P.registerCraftAction();
    S.logActivity(`Started crafting ${getRecipeName(recipeId)} x${job.quantity}.`, "success");
    S.addToast(`Crafting ${getRecipeName(recipeId)}...`, "success");
    renderCraftingPanel();

    return job;
  }

  function craftInstant(recipeId, quantity = 1, options = {}) {
    const recipe = getRecipe(recipeId);
    if (!recipe) throw new Error("Recipe not found.");

    const validation = canCraft(recipeId, quantity, options.source || "all");
    if (!validation.ok) throw new Error(validation.reason);

    removeIngredients(recipe, quantity, options.preferredSources || ["player", "base", "boat"]);
    addOutputs(recipe, quantity, options.outputTarget || "player");

    P.registerCraftAction();
    P.awardPlayerXp(4 + quantity, `crafting ${getRecipeName(recipeId)}`);

    S.logActivity(`Crafted ${getRecipeName(recipeId)} x${quantity}.`, "success");
    S.addToast(`Crafted ${getRecipeName(recipeId)}`, "success");
    renderCraftingPanel();

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

  function cancelCraftingJob(jobId, refundRatio = CFG.BUILDING.refundRatioOnDemolish) {
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
    }

    const next = queues.filter((entry) => entry.id !== jobId);
    S.updateBase({ craftingQueues: next });

    S.logActivity(`Cancelled crafting job ${getRecipeName(job.recipeId)}.`, "warning");
    renderCraftingPanel();
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

    addOutputs(recipe, Number(job.quantity || 1), job.outputTarget || "player");

    const next = queues.filter((entry) => entry.id !== jobId);
    S.updateBase({ craftingQueues: next });

    P.awardPlayerXp(5 + Number(job.quantity || 1), `completing ${getRecipeName(job.recipeId)}`);

    S.logActivity(`Finished crafting ${getRecipeName(job.recipeId)} x${job.quantity}.`, "success");
    S.addToast(`${getRecipeName(job.recipeId)} complete`, "success");
    renderCraftingPanel();

    return true;
  }

  function tickCraftingQueues(gameMinutes = 5) {
    const queues = getCraftingQueues();
    if (!queues.length) return false;

    let changed = false;
    const completed = [];

    queues.forEach((job) => {
      if (job.status !== "active") return;

      job.progressMinutes = Number(job.progressMinutes || 0) + gameMinutes;
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

  function getRecipeDisplayData(recipe) {
    const inputs = getRecipeInputs(recipe).map((entry) => {
      const def = S.getItemDef(entry.itemId);
      return {
        ...entry,
        name: def?.name || U.titleCase(entry.itemId),
        have: getInventoryAmount(entry.itemId, "all")
      };
    });

    const outputs = getRecipeOutputs(recipe).map((entry) => {
      const def = S.getItemDef(entry.itemId);
      return {
        ...entry,
        name: def?.name || U.titleCase(entry.itemId)
      };
    });

    return {
      recipe,
      station: getRecipeStation(recipe),
      canCraft: canCraft(recipe.id).ok,
      inputs,
      outputs
    };
  }

  function filterRecipes(searchText = "", stationFilter = "all") {
    const needle = String(searchText || "").trim().toLowerCase();

    return getRecipes().filter((recipe) => {
      if (stationFilter !== "all" && getRecipeStation(recipe) !== stationFilter) {
        return false;
      }

      if (!needle) return true;

      const haystack = [
        recipe.id,
        recipe.name,
        recipe.description,
        recipe.station
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

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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
      const card = U.createEl("div", { className: "card" });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(recipe.name || U.titleCase(recipe.id))}</div>
        <div class="meta-sub">${htmlEscape(recipe.station || "workbench")}</div>
        <div class="meta-sub">${data.canCraft ? "Ready to craft" : "Missing materials or station"}</div>
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

    detail.innerHTML = `
      <h3>${htmlEscape(recipe.name || U.titleCase(recipe.id))}</h3>
      <p>${htmlEscape(recipe.description || "No description yet.")}</p>
      <p><strong>Station:</strong> ${htmlEscape(data.station)}</p>

      <h4>Inputs</h4>
      <ul>
        ${data.inputs.map((entry) => `
          <li>
            ${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity || 1))}
            — Have ${htmlEscape(String(entry.have || 0))}
          </li>
        `).join("")}
      </ul>

      <h4>Outputs</h4>
      <ul>
        ${data.outputs.map((entry) => `
          <li>${htmlEscape(entry.name)} x${htmlEscape(String(entry.quantity || 1))}</li>
        `).join("")}
      </ul>

      <div class="admin-console-actions">
        <button id="btnCraftOnce" class="primary-btn">Craft</button>
        <button id="btnQueueCraft" class="secondary-btn">Queue</button>
      </div>
    `;

    const btnCraftOnce = U.byId("btnCraftOnce");
    const btnQueueCraft = U.byId("btnQueueCraft");

    if (btnCraftOnce) {
      U.on(btnCraftOnce, "click", () => {
        try {
          craftInstant(recipe.id, 1);
          UI.renderEverything();
        } catch (err) {
          S.addToast(err.message || "Craft failed.", "error");
        }
      });
    }

    if (btnQueueCraft) {
      U.on(btnQueueCraft, "click", () => {
        try {
          createCraftingJob(recipe.id, 1);
          UI.renderEverything();
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
      : queues.map((job) => `
        <div class="card" style="margin-top:.6rem;">
          <div class="meta-title">${htmlEscape(getRecipeName(job.recipeId))}</div>
          <div class="meta-sub">Progress: ${htmlEscape(String(job.progressMinutes || 0))}/${htmlEscape(String(job.durationMinutes || 0))} minutes</div>
          <div class="meta-sub">Output: ${htmlEscape(job.outputTarget || "player")}</div>
          <button class="ghost-btn crafting-cancel-job-btn" data-job-id="${htmlEscape(job.id)}">Cancel Job</button>
        </div>
      `).join("");

    detail.innerHTML += `
      <hr />
      <h4>Crafting Queue</h4>
      ${queueHtml}
    `;

    U.qsa(".crafting-cancel-job-btn", detail).forEach((btn) => {
      U.on(btn, "click", () => {
        cancelCraftingJob(btn.dataset.jobId);
        renderCraftingPanel();
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
    `;

    const buttonsHost = filterCard.querySelector("#craftStationFilterButtons");

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

    list.prepend(filterCard);
  }

  function renderCraftingPanel() {
    renderRecipeList();
    renderRecipeDetail();
    renderQueueSummary();
    renderStationFilters();
  }

  function seedFallbackRecipesIfNeeded() {
    const recipes = getRecipes();
    if (recipes.length > 0) return false;

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
      if (S.isModalOpen("craftModal")) {
        renderCraftingPanel();
      }
    });

    U.eventBus.on("base:changed", () => {
      if (S.isModalOpen("craftModal")) {
        renderCraftingPanel();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackRecipesIfNeeded();
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
    getCraftingQueues,
    getRecipeName,
    getRecipeInputs,
    getRecipeOutputs,
    getRecipeStation,
    getAccessibleStations,

    getInventoryAmount,
    hasRequiredItems,
    getMissingInputs,
    canUseStation,
    canCraft,

    removeIngredients,
    addOutputs,
    getRecipeDurationMinutes,

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

    renderCraftingPanel,
    seedFallbackRecipesIfNeeded
  };

  window.GL_CRAFTING = API;

  return Object.freeze(API);
})();