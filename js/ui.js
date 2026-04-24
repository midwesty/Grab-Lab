window.GrabLabUI = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const SAVE = window.GrabLabSaveLoad;
  const A = window.GrabLabAudio;
  const M = window.GrabLabModal;

  const state = {
    initialized: false,
    baseModalMode: "base", // base | build | traps
    toastTimers: new Map(),
    minimap: {
      expanded: false,
      collapsed: false,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      originLeft: 0,
      originTop: 0
    }
  };

  function el(id) {
    return U.byId(id);
  }

  function getBuildApi() {
    return window.GL_BUILD || window.GrabLabBuild || null;
  }

  function getInventoryApi() {
    return window.GL_INVENTORY || window.GrabLabInventory || null;
  }

  function getCraftingApi() {
    return window.GL_CRAFTING || window.GrabLabCrafting || null;
  }

  function getBreedingApi() {
    return window.GL_BREEDING || window.GrabLabBreeding || null;
  }

  function getFishingApi() {
    return window.GL_FISHING || window.GrabLabFishing || null;
  }

  function getCombatApi() {
    return window.GL_COMBAT || window.GrabLabCombat || null;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getBiomeLabel(biomeId) {
    if (!biomeId) return "Unknown";
    return U.titleCase(String(biomeId).replaceAll("_", " "));
  }

  function getWeatherLabel(weatherId) {
    if (!weatherId) return "Unknown";
    return U.titleCase(String(weatherId).replaceAll("_", " "));
  }

  function percentFromPair(current = 0, max = 100) {
    const cur = Number(current || 0);
    const mx = Math.max(1, Number(max || 1));
    return U.clamp((cur / mx) * 100, 0, 100);
  }

  function showScreen(screenId) {
    const boot = el("bootScreen");
    const creator = el("characterCreatorScreen");
    const game = el("gameScreen");
    const combat = el("combatScreen");

    [boot, creator, game, combat].forEach((node) => {
      if (!node) return;
      node.classList.remove("active");
    });

    const map = {
      boot,
      creator,
      game,
      combat
    };

    const target = map[screenId] || game;
    if (target) target.classList.add("active");

    S.setCurrentScreen(screenId);
  }

  function renderHud() {
    const world = S.getWorld();
    const player = S.getPlayer();
    const stats = player?.stats || {};

    U.setText(el("hudDay"), `Day ${world.day}`);
    U.setText(el("hudTime"), U.formatClock(world.hour, world.minute));
    U.setText(el("hudWeather"), getWeatherLabel(world.weather));
    U.setText(el("hudBiome"), getBiomeLabel(world.currentBiomeId));

    const healthPct = percentFromPair(stats.health, stats.maxHealth);
    const staminaPct = percentFromPair(stats.stamina, stats.maxStamina);
    const hungerPct = U.clamp(Number(stats.hunger || 0), 0, 100);
    const thirstPct = U.clamp(Number(stats.thirst || 0), 0, 100);
    const infectionPct = U.clamp(Number(stats.infection || 0), 0, 100);

    const barHealth = el("barHealth");
    const barStamina = el("barStamina");
    const barHunger = el("barHunger");
    const barThirst = el("barThirst");
    const barInfection = el("barInfection");

    if (barHealth) barHealth.style.width = `${healthPct}%`;
    if (barStamina) barStamina.style.width = `${staminaPct}%`;
    if (barHunger) barHunger.style.width = `${hungerPct}%`;
    if (barThirst) barThirst.style.width = `${thirstPct}%`;
    if (barInfection) barInfection.style.width = `${infectionPct}%`;

    U.setText(el("hudHealthText"), `${Math.round(stats.health || 0)}/${Math.round(stats.maxHealth || 0)}`);
    U.setText(el("hudStaminaText"), `${Math.round(stats.stamina || 0)}/${Math.round(stats.maxStamina || 0)}`);
    U.setText(el("hudHungerText"), hungerPct >= 70 ? "Fed" : hungerPct >= 40 ? "Hungry" : "Starving");
    U.setText(el("hudThirstText"), thirstPct >= 70 ? "Hydrated" : thirstPct >= 40 ? "Thirsty" : "Parched");
    U.setText(el("hudInfectionText"), `${Math.round(infectionPct)}%`);
  }

  function renderStatusEffects() {
    const host = el("statusEffectList");
    if (!host) return;

    U.emptyEl(host);

    const effects = U.toArray(S.getPlayer()?.statusEffects);
    if (!effects.length) {
      host.appendChild(U.createEl("div", {
        className: "status-chip",
        text: "No active effects"
      }));
      return;
    }

    effects.forEach((entry) => {
      const id = typeof entry === "string" ? entry : entry?.id;
      const def = S.getDataEntry("statusEffects", id);
      const label = def?.name || entry?.name || U.titleCase(id || "effect");
      host.appendChild(U.createEl("div", {
        className: "status-chip",
        text: label
      }));
    });
  }

  function renderTrackedTasks() {
    const host = el("trackedTaskList");
    if (!host) return;

    U.emptyEl(host);

    const quests = S.getQuests();
    const active = U.toArray(quests?.active);

    if (!active.length) {
      host.appendChild(U.createEl("div", {
        className: "card",
        text: "No active tasks."
      }));
      return;
    }

    active.slice(0, 6).forEach((questId) => {
      const questDef = S.getDataEntry("dialogue", questId) || null;
      const card = U.createEl("div", { className: "card" });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(questDef?.title || U.titleCase(questId))}</div>
        <div class="meta-sub">${htmlEscape(questDef?.summary || "Keep moving forward.")}</div>
      `;

      host.appendChild(card);
    });
  }

  function renderPartyMini() {
    const host = el("partyRosterMini");
    if (!host) return;

    U.emptyEl(host);

    const player = S.getPlayer();
    const activeCompanions = U.toArray(S.getParty()?.active);

    const entries = [
      {
        id: player?.id || "player",
        name: player?.name || CFG.PLAYER.startingName,
        sub: `Lv ${player?.stats?.level || 1} Ranger`
      },
      ...activeCompanions.map((comp) => ({
        id: comp?.id,
        name: comp?.name || "Companion",
        sub: `${U.titleCase(comp?.speciesId || "creature")} • Lv ${comp?.level || 1}`
      }))
    ];

    if (!entries.length) {
      host.appendChild(U.createEl("div", {
        className: "card",
        text: "No party members."
      }));
      return;
    }

    entries.forEach((entry) => {
      const row = U.createEl("div");
      const portrait = U.createEl("div", { className: "mini-portrait" });
      const meta = U.createEl("div");
      const title = U.createEl("div", { className: "meta-title", text: entry.name });
      const sub = U.createEl("div", { className: "meta-sub", text: entry.sub });

      meta.append(title, sub);
      row.append(portrait, meta);
      host.appendChild(row);
    });
  }

  function isPoiResolved(poi) {
    return Boolean(poi?.captured || poi?.recruited || poi?.resolved || poi?.hidden);
  }

  function renderNearbyList() {
    const host = el("nearbyList");
    if (!host) return;

    U.emptyEl(host);

    const tile = S.getCurrentMapTile();
    const nearby = U.toArray(tile?.pointsOfInterest).filter((poi) => !isPoiResolved(poi));

    if (!nearby.length) {
      host.appendChild(U.createEl("div", {
        className: "card",
        text: "Nothing obvious nearby."
      }));
      return;
    }

    nearby.slice(0, 10).forEach((poi) => {
      let action = "Inspect";
      let tone = "info";

      if (poi.type === "npc" && poi.recruitable) {
        action = "Recruitable";
        tone = "success";
      } else if ((poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable !== false) {
        action = "Capturable • Grab";
        tone = "success";
      } else if (poi.hostile || poi.encounterId || poi.type === "hostile" || poi.type === "enemy" || poi.type === "combat" || poi.type === "fungal_enemy") {
        action = "Hostile • Fight";
        tone = "warning";
      } else if (poi.type === "fish_spot") {
        action = "Fishing spot";
      } else if (poi.type === "dock") {
        action = "Boat / dock";
      }

      host.appendChild(U.createEl("div", {
        className: "card",
        html: `
          <div class="meta-title">${htmlEscape(poi.name || "Point of Interest")}</div>
          <div class="meta-sub">${htmlEscape(U.titleCase(poi.type || "Unknown"))}</div>
          <div class="meta-sub">${htmlEscape(action)}</div>
        `
      }));

      void tone;
    });
  }

  function renderActivityLog() {
    const host = el("activityLog");
    if (!host) return;

    const log = U.toArray(S.getRuntime()?.ui?.activityLog);
    if (!log.length) {
      U.setText(host, "Activity log empty.");
      return;
    }

    const text = log
      .slice(0, 40)
      .map((entry) => {
        const date = new Date(entry.at || Date.now());
        const stamp = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
        return `[${stamp}] ${entry.message}`;
      })
      .join("\n");

    U.setText(host, text);
  }

  function pushToastToDom(toast) {
    const host = el("toastLayer");
    if (!host || !toast) return;

    const node = U.createEl("div", {
      className: "toast",
      id: toast.id,
      html: `<strong>${htmlEscape(U.titleCase(toast.type || "info"))}</strong><div>${htmlEscape(toast.message || "")}</div>`
    });

    host.appendChild(node);

    const timer = setTimeout(() => {
      removeToastFromDom(toast.id);
      S.removeToast(toast.id);
    }, CFG.UI.toastDurationMs);

    state.toastTimers.set(toast.id, timer);
  }

  function removeToastFromDom(toastId) {
    const node = el(toastId);
    if (node) node.remove();

    if (state.toastTimers.has(toastId)) {
      clearTimeout(state.toastTimers.get(toastId));
      state.toastTimers.delete(toastId);
    }
  }

  function renderAllToasts() {
    const host = el("toastLayer");
    if (!host) return;

    U.emptyEl(host);

    const toasts = U.toArray(S.getRuntime()?.ui?.toasts);
    toasts.forEach((toast) => pushToastToDom(toast));
  }

  function renderSaveSlots() {
    const list = el("saveSlotList");
    const detail = el("saveSlotDetail");
    if (!list || !detail) return;

    U.emptyEl(list);

    const all = SAVE.listAllSaves();

    const autoCard = U.createEl("div", { className: "card" });
    autoCard.innerHTML = `
      <div class="meta-title">Autosave</div>
      <div class="meta-sub">${htmlEscape(SAVE.getHumanSummaryText(all.autosave))}</div>
    `;

    U.on(autoCard, "click", () => {
      detail.innerHTML = `
        <h3>Autosave</h3>
        <pre>${htmlEscape(SAVE.getDetailedSummaryText(all.autosave))}</pre>
        <div class="admin-console-actions">
          <button id="btnLoadAutosave" class="primary-btn">Load Autosave</button>
          <button id="btnDeleteAutosave" class="ghost-btn">Delete Autosave</button>
        </div>
      `;

      const btnLoad = U.byId("btnLoadAutosave");
      const btnDelete = U.byId("btnDeleteAutosave");

      if (btnLoad) {
        U.on(btnLoad, "click", () => {
          try {
            SAVE.loadAutosave();
            renderEverything();
            M.closeModal("saveLoadModal");
            showScreen("game");
          } catch (err) {
            S.addToast(err.message || "Failed to load autosave.", "error");
          }
        });
      }

      if (btnDelete) {
        U.on(btnDelete, "click", () => {
          SAVE.deleteAutosave();
          renderSaveSlots();
        });
      }
    });

    list.appendChild(autoCard);

    all.manual.forEach((slot) => {
      const card = U.createEl("div", { className: "card" });
      card.innerHTML = `
        <div class="meta-title">Slot ${slot.slotId}</div>
        <div class="meta-sub">${htmlEscape(SAVE.getHumanSummaryText(slot))}</div>
      `;

      U.on(card, "click", () => {
        detail.innerHTML = `
          <h3>Slot ${slot.slotId}</h3>
          <pre>${htmlEscape(SAVE.getDetailedSummaryText(slot))}</pre>
          <div class="admin-console-actions">
            <button id="btnSaveSlotNow" class="primary-btn">Save Here</button>
            <button id="btnLoadSlotNow" class="secondary-btn">Load</button>
            <button id="btnDeleteSlotNow" class="ghost-btn">Delete</button>
          </div>
        `;

        const btnSave = U.byId("btnSaveSlotNow");
        const btnLoad = U.byId("btnLoadSlotNow");
        const btnDelete = U.byId("btnDeleteSlotNow");

        if (btnSave) {
          U.on(btnSave, "click", () => {
            try {
              SAVE.saveToSlot(slot.slotId);
              renderSaveSlots();
              renderActivityLog();
              S.addToast(`Saved to slot ${slot.slotId}.`, "success");
            } catch (err) {
              S.addToast(err.message || "Save failed.", "error");
            }
          });
        }

        if (btnLoad) {
          U.on(btnLoad, "click", () => {
            try {
              SAVE.loadFromSlot(slot.slotId);
              renderEverything();
              M.closeModal("saveLoadModal");
              showScreen("game");
            } catch (err) {
              S.addToast(err.message || "Load failed.", "error");
            }
          });
        }

        if (btnDelete) {
          U.on(btnDelete, "click", () => {
            try {
              SAVE.deleteSlot(slot.slotId);
              renderSaveSlots();
              S.addToast(`Deleted slot ${slot.slotId}.`, "warning");
            } catch (err) {
              S.addToast(err.message || "Delete failed.", "error");
            }
          });
        }
      });

      list.appendChild(card);
    });

    detail.innerHTML = `
      <h3>Save Slots</h3>
      <p>Select a slot to save, load, or delete.</p>
      <p>You can also export your current world as JSON from the top of this window.</p>
    `;
  }

  function renderInventoryModal() {
    const api = getInventoryApi();
    if (api?.renderInventoryPanel) {
      api.renderInventoryPanel();
      return;
    }

    const grid = el("inventoryGrid");
    const detail = el("inventoryDetailContent");
    if (!grid || !detail) return;

    U.emptyEl(grid);

    const entries = S.hydrateInventoryEntries(S.getInventory("player"));
    if (!entries.length) {
      grid.appendChild(U.createEl("div", {
        className: "card",
        text: "Inventory empty."
      }));
      detail.textContent = "Select an item.";
      return;
    }

    entries.forEach((entry) => {
      const slot = U.createEl("div", { className: "inventory-slot" });
      const name = entry?.def?.name || U.titleCase(entry?.itemId || "item");

      slot.innerHTML = `
        <div class="icon-thumb"></div>
        <div class="qty">${htmlEscape(String(entry.quantity || 1))}</div>
      `;
      slot.title = name;

      U.on(slot, "click", () => {
        S.setSelectedInventoryEntry(entry);
        detail.innerHTML = `
          <h4>${htmlEscape(name)}</h4>
          <p>${htmlEscape(entry?.def?.description || "No description yet.")}</p>
          <p><strong>Quantity:</strong> ${htmlEscape(String(entry.quantity || 1))}</p>
          <p><strong>Tags:</strong> ${htmlEscape(U.toArray(entry?.def?.tags).join(", ") || "None")}</p>
        `;
      });

      grid.appendChild(slot);
    });
  }

  function renderPartyModal() {
    const list = el("partyMemberList");
    const detail = el("partyMemberDetail");
    if (!list || !detail) return;

    U.emptyEl(list);

    const player = S.getPlayer();
    const companions = U.toArray(S.getParty()?.active);
    const reserve = U.toArray(S.getParty()?.reserve);
    const specimens = U.toArray(S.getBase()?.specimens);

    const entries = [
      {
        id: player?.id || "player",
        name: player?.name || "Ranger",
        subtitle: `Level ${player?.stats?.level || 1} Conservationist`,
        data: player,
        isPlayer: true
      },
      ...companions.map((c) => ({
        id: c.id,
        name: c.name || "Companion",
        subtitle: `${U.titleCase(c.speciesId || "creature")} • Active • Level ${c.level || 1}`,
        data: c,
        isPlayer: false
      })),
      ...reserve.map((c) => ({
        id: c.id,
        name: `${c.name || "Reserve"} (Reserve)`,
        subtitle: `${U.titleCase(c.speciesId || "creature")} • Reserve • Level ${c.level || 1}`,
        data: c,
        isPlayer: false
      })),
      ...specimens
        .filter((spec) => {
          const inActive = companions.some((c) => c.sourceSpecimenId === spec.id);
          const inReserve = reserve.some((c) => c.sourceSpecimenId === spec.id);
          return !inActive && !inReserve;
        })
        .map((spec) => ({
          id: spec.id,
          name: `${spec.name || spec.speciesId} (Specimen)`,
          subtitle: `${U.titleCase(spec.speciesId || "creature")} • ${U.titleCase(spec.storage || "stored")} • Level ${spec.level || 1}`,
          data: spec,
          isPlayer: false,
          isSpecimen: true
        }))
    ];

    if (!entries.length) {
      list.appendChild(U.createEl("div", {
        className: "card",
        text: "No party members."
      }));
      detail.textContent = "No party members.";
      return;
    }

    entries.forEach((entry) => {
      const card = U.createEl("div", { className: "card" });
      card.innerHTML = `
        <div class="meta-title">${htmlEscape(entry.name)}</div>
        <div class="meta-sub">${htmlEscape(entry.subtitle)}</div>
      `;

      U.on(card, "click", () => {
        const d = entry.data || {};
        const needs = d.needs || {};
        const location = window.GL_ANIMALS?.getSpecimenLocationLabel?.(d.id, d.storage) || d.storage || "Party";

        detail.innerHTML = `
          <h3>${htmlEscape(entry.name)}</h3>
          <p>${htmlEscape(entry.subtitle)}</p>
          <p><strong>Location:</strong> ${htmlEscape(entry.isPlayer ? "Player" : location)}</p>
          <p><strong>Health:</strong> ${htmlEscape(String(d?.stats?.health ?? d?.stats?.maxHealth ?? 0))}/${htmlEscape(String(d?.stats?.maxHealth ?? 0))}</p>
          <p><strong>Stamina:</strong> ${htmlEscape(String(d?.stats?.stamina ?? d?.stats?.maxStamina ?? 0))}/${htmlEscape(String(d?.stats?.maxStamina ?? 0))}</p>
          ${entry.isSpecimen ? `<p><strong>Hunger:</strong> ${htmlEscape(String(Math.round(needs.hunger ?? 0)))}</p>` : ""}
          ${entry.isSpecimen ? `<p><strong>Comfort:</strong> ${htmlEscape(String(Math.round(needs.comfort ?? 0)))}</p>` : ""}
          ${entry.isSpecimen ? `<p><strong>Cleanliness:</strong> ${htmlEscape(String(Math.round(needs.cleanliness ?? 0)))}</p>` : ""}
          <p><strong>Traits:</strong> ${htmlEscape(U.toArray(d?.traits).join(", ") || "None")}</p>
        `;
      });

      list.appendChild(card);
    });
  }

  function renderBoatModal() {
    const buildApi = getBuildApi();
    if (buildApi?.renderBoatPanelEnhancements) {
      buildApi.renderBoatPanelEnhancements();
      return;
    }

    const statsEl = el("boatStats");
    const upgradesEl = el("boatUpgradeList");
    if (!statsEl || !upgradesEl) return;

    const boat = S.getBoat();

    statsEl.innerHTML = `
      <p><strong>Name:</strong> ${htmlEscape(boat?.name || "Mudskipper")}</p>
      <p><strong>Tier:</strong> ${htmlEscape(String(boat?.tier || 1))}</p>
      <p><strong>HP:</strong> ${htmlEscape(String(boat?.hp || 0))}/${htmlEscape(String(boat?.maxHp || 0))}</p>
      <p><strong>Fuel:</strong> ${htmlEscape(String(boat?.fuel || 0))}/${htmlEscape(String(boat?.maxFuel || 0))}</p>
      <p><strong>Storage Stacks:</strong> ${htmlEscape(String(U.toArray(boat?.storage).length))}</p>
    `;

    const upgrades = U.toArray(boat?.upgradesUnlocked);
    upgradesEl.innerHTML = upgrades.length
      ? upgrades.map((u) => `<div class="card">${htmlEscape(U.titleCase(u))}</div>`).join("")
      : `<div class="card">No upgrades unlocked yet.</div>`;
  }

  function renderBaseModal() {
    const buildApi = getBuildApi();

    if (buildApi) {
      if (state.baseModalMode === "build" && buildApi.renderBuildPanels) {
        buildApi.renderBuildPanels();
        return;
      }

      if (buildApi.renderBaseEnhancements) {
        buildApi.renderBaseEnhancements();

        if (state.baseModalMode === "traps") {
          window.setTimeout(() => {
            const trapSection = el("baseTrapCards");
            trapSection?.scrollIntoView?.({ behavior: "smooth", block: "start" });
          }, 0);
        }

        return;
      }
    }

    const host = el("basePanelContent");
    if (!host) return;

    const base = S.getBase();
    host.innerHTML = `
      <h3>${htmlEscape(base?.name || "Field Station Alpha")}</h3>
      <p><strong>Structures:</strong> ${htmlEscape(String(U.toArray(base?.structures).length))}</p>
      <p><strong>Storage Stacks:</strong> ${htmlEscape(String(U.toArray(base?.storage).length))}</p>
      <p><strong>Habitats:</strong> ${htmlEscape(String(U.toArray(base?.habitats).length))}</p>
      <p><strong>Specimens:</strong> ${htmlEscape(String(U.toArray(base?.specimens).length))}</p>
      <p><strong>Cryo Fridge:</strong> ${htmlEscape(String(U.toArray(base?.cryoFridge).length))} stored</p>
      <p><strong>Traps:</strong> ${htmlEscape(String(U.toArray(base?.traps).length))}</p>
      <p><strong>Breeding Jobs:</strong> ${htmlEscape(String(U.toArray(base?.breedingJobs).length))}</p>
      <p><strong>Crafting Queues:</strong> ${htmlEscape(String(U.toArray(base?.craftingQueues).length))}</p>
    `;
  }

  function renderCraftModal() {
    const api = getCraftingApi();
    if (api?.renderCraftingPanel) {
      api.renderCraftingPanel();
      return;
    }

    const list = el("recipeList");
    const detail = el("recipeDetail");
    if (!list || !detail) return;

    U.emptyEl(list);

    const recipes = U.toArray(S.getData()?.recipes);
    if (!recipes.length) {
      list.appendChild(U.createEl("div", { className: "card", text: "No recipes loaded." }));
      detail.textContent = "Select a recipe.";
      return;
    }

    recipes.slice(0, 50).forEach((recipe) => {
      const card = U.createEl("div", { className: "card" });
      card.innerHTML = `
        <div class="meta-title">${htmlEscape(recipe.name || U.titleCase(recipe.id || "recipe"))}</div>
        <div class="meta-sub">${htmlEscape(recipe.station || "Workbench")}</div>
      `;

      U.on(card, "click", () => {
        detail.innerHTML = `
          <h3>${htmlEscape(recipe.name || U.titleCase(recipe.id || "recipe"))}</h3>
          <p>${htmlEscape(recipe.description || "No description yet.")}</p>
          <p><strong>Station:</strong> ${htmlEscape(recipe.station || "Workbench")}</p>
          <p><strong>Inputs:</strong> ${htmlEscape(U.safeStringify(recipe.inputs || [], "[]"))}</p>
          <p><strong>Outputs:</strong> ${htmlEscape(U.safeStringify(recipe.outputs || [], "[]"))}</p>
        `;
      });

      list.appendChild(card);
    });
  }

  function renderDnaModal() {
    const list = el("dnaList");
    const detail = el("dnaDetail");
    if (!list || !detail) return;

    U.emptyEl(list);

    const player = S.getPlayer();
    const dnaRegistry = U.toArray(player?.dnaRegistry);
    const discovered = U.toArray(player?.discoveredSpecies);

    const entries = dnaRegistry.length
      ? dnaRegistry.map((record) => record.speciesId)
      : discovered;

    if (!entries.length) {
      list.appendChild(U.createEl("div", {
        className: "card",
        text: "No DNA entries recorded yet."
      }));
      detail.textContent = "Capture and log animals to populate the DNA database.";
      return;
    }

    entries.forEach((speciesId) => {
      const def = S.getAnimalDef(speciesId);
      const record = dnaRegistry.find((entry) => entry.speciesId === speciesId);
      const card = U.createEl("div", { className: "card" });

      card.innerHTML = `
        <div class="meta-title">${htmlEscape(def?.name || record?.name || U.titleCase(speciesId))}</div>
        <div class="meta-sub">${htmlEscape(def?.family || record?.family || "Unknown family")}</div>
        <div class="meta-sub">Samples: ${htmlEscape(String(record?.sampleCount || 0))}</div>
      `;

      U.on(card, "click", () => {
        detail.innerHTML = `
          <h3>${htmlEscape(def?.name || record?.name || U.titleCase(speciesId))}</h3>
          <p>${htmlEscape(def?.description || "No DNA notes recorded.")}</p>
          <p><strong>Traits:</strong> ${htmlEscape(U.toArray(def?.traits || record?.traits).join(", ") || "None")}</p>
          <p><strong>Habitat:</strong> ${htmlEscape(def?.habitat || record?.habitat || "Unknown")}</p>
          <p><strong>Family:</strong> ${htmlEscape(def?.family || record?.family || "Unknown")}</p>
          <p><strong>Samples:</strong> ${htmlEscape(String(record?.sampleCount || 0))}</p>
        `;
      });

      list.appendChild(card);
    });
  }

  function renderFishingModal() {
    const api = getFishingApi();
    if (api?.renderFishingPanel) {
      api.renderFishingPanel();
      return;
    }

    const panel = el("fishingPanel");
    const catchPanel = el("fishingCatchPanel");
    if (!panel || !catchPanel) return;

    const world = S.getWorld();
    panel.innerHTML = `
      <h3>Fishing Operations</h3>
      <p><strong>Current Water:</strong> ${htmlEscape(getBiomeLabel(world.currentBiomeId))}</p>
      <p><strong>Weather:</strong> ${htmlEscape(getWeatherLabel(world.weather))}</p>
      <p><strong>Passive Line Slots:</strong> ${htmlEscape(String(CFG.FISHING.passiveLineSlotsBase))}</p>
      <p><strong>Cast Time:</strong> ${htmlEscape(String(CFG.FISHING.castLineBaseSeconds))} seconds</p>
    `;

    catchPanel.innerHTML = `
      <h3>Recent / Possible Catches</h3>
      <div class="card">Minnow, reed carp, snapping mudfish, drift crab, lost boot, deeply judgmental turtle.</div>
    `;
  }

  function renderJournalModal() {
    const host = el("journalContent");
    if (!host) return;

    const quests = S.getQuests();
    host.innerHTML = `
      <h3>Journal</h3>
      <p><strong>Active Quests:</strong> ${htmlEscape(String(U.toArray(quests?.active).length))}</p>
      <p><strong>Completed Quests:</strong> ${htmlEscape(String(U.toArray(quests?.completed).length))}</p>
      <p><strong>Notes:</strong> ${htmlEscape(String(U.toArray(quests?.journalNotes).length))}</p>
    `;
  }

  function renderTutorialModal() {
    const host = el("tutorialContent");
    if (!host) return;

    const tutorials = U.toArray(S.getData()?.tutorials);
    const first = tutorials[0];

    host.innerHTML = first
      ? `
        <h3>${htmlEscape(first.title || "Welcome to Grab Lab")}</h3>
        <p>${htmlEscape(first.body || first.description || "Move around, gather resources, fish, and survive.")}</p>
      `
      : `
        <h3>Welcome to Grab Lab</h3>
        <p>Move around, inspect things, gather resources, fish, build, breed creatures, and keep the fungus from eating the world.</p>
      `;
  }

  function renderSettingsModal() {
    const settings = S.getSettings();

    const music = el("settingMusicVolume");
    const sfx = el("settingSfxVolume");
    const ambient = el("settingAmbientVolume");
    const uiScale = el("settingUiScale");
    const reduceMotion = el("settingReduceMotion");
    const dmgNums = el("settingShowDamageNumbers");

    if (music) music.value = String(Math.round((settings.musicVolume ?? CFG.AUDIO.defaultMusicVolume) * 100));
    if (sfx) sfx.value = String(Math.round((settings.sfxVolume ?? CFG.AUDIO.defaultSfxVolume) * 100));
    if (ambient) ambient.value = String(Math.round((settings.ambientVolume ?? CFG.AUDIO.defaultAmbientVolume) * 100));
    if (uiScale) uiScale.value = String(Math.round((settings.uiScale ?? 1) * 100));
    if (reduceMotion) reduceMotion.checked = Boolean(settings.reduceMotion);
    if (dmgNums) dmgNums.checked = Boolean(settings.showDamageNumbers);
  }

  function renderAdminModal() {
    const host = el("adminLog");
    if (!host) return;

    const history = U.toArray(S.getRuntime()?.admin?.commandHistory);
    if (!history.length) {
      U.setText(host, "No admin commands run yet.");
      return;
    }

    U.setText(host, history.slice(0, 50).map((row) => row.text).join("\n"));
  }

  function renderMapModal() {
    const info = el("mapLocationInfo");
    if (!info) return;

    const tile = S.getCurrentMapTile();
    const world = S.getWorld();

    info.innerHTML = `
      <p><strong>Current Tile:</strong> ${htmlEscape(`${world.currentTileX}, ${world.currentTileY}`)}</p>
      <p><strong>Biome:</strong> ${htmlEscape(getBiomeLabel(world.currentBiomeId))}</p>
      <p><strong>Revealed Tiles:</strong> ${htmlEscape(String(U.toArray(world.revealedTiles).length))}</p>
      <p><strong>Cleared Tiles:</strong> ${htmlEscape(String(U.toArray(world.clearedTiles).length))}</p>
      <p><strong>POI Count:</strong> ${htmlEscape(String(U.toArray(tile?.pointsOfInterest).filter((poi) => !isPoiResolved(poi)).length))}</p>
    `;
  }

  function renderCombatActorCard(actor) {
    const hpPct = percentFromPair(actor?.stats?.health, actor?.stats?.maxHealth);
    const down = actor?.isDown || Number(actor?.stats?.health || 0) <= 0;
    const capturable = actor?.captureEligible ? " • Capturable" : "";
    const captureReady = actor?.captureReady ? " • Ready" : "";

    return `
      <div class="battle-portrait ${down ? "down" : ""}"></div>
      <div class="meta-title">${htmlEscape(actor?.name || "Actor")}</div>
      <div class="meta-sub">${htmlEscape(U.titleCase(actor?.kind || actor?.side || "actor"))}${htmlEscape(capturable)}${htmlEscape(captureReady)}</div>
      <div class="bar" style="margin-top:.35rem;"><div class="fill" style="width:${hpPct}%;"></div></div>
      <div class="meta-sub">HP ${htmlEscape(String(Math.round(actor?.stats?.health || 0)))}/${htmlEscape(String(Math.round(actor?.stats?.maxHealth || 0)))}</div>
    `;
  }

  function renderCombatShell() {
    const combat = S.getRuntime()?.combat || {};
    const title = el("combatTitle");
    const subtitle = el("combatSubtitle");
    const turnOrder = el("combatTurnOrder");
    const actorCardName = el("combatActorName");
    const actorCardStats = el("combatActorStats");
    const enemyField = el("enemyBattlefield");
    const allyField = el("allyBattlefield");
    const logEl = el("combatLog");

    const currentActor = U.toArray(combat.actors)[Number(combat.turnIndex || 0)] || null;
    const encounterType = combat.encounterType || "fungal";

    if (title) {
      U.setText(title, combat.encounterId ? U.titleCase(combat.encounterId) : "Encounter");
    }

    if (subtitle) {
      const typeText = encounterType === "wildlife"
        ? "Wildlife encounter. Knock out or tame creatures to capture them."
        : "Hostile combat. Keep your party alive.";
      U.setText(subtitle, combat.active ? typeText : "No active encounter.");
    }

    if (actorCardName) {
      U.setText(actorCardName, currentActor?.name || S.getPlayer()?.name || "Ranger");
    }

    if (actorCardStats) {
      if (currentActor) {
        U.setText(
          actorCardStats,
          `Turn: ${currentActor.name} • HP ${Math.round(currentActor.stats.health || 0)}/${Math.round(currentActor.stats.maxHealth || 0)} • STA ${Math.round(currentActor.stats.stamina || 0)}/${Math.round(currentActor.stats.maxStamina || 0)}`
        );
      } else {
        const st = S.getPlayer()?.stats || {};
        U.setText(actorCardStats, `HP ${st.health || 0}/${st.maxHealth || 0} • STA ${st.stamina || 0}/${st.maxStamina || 0}`);
      }
    }

    if (turnOrder) {
      U.emptyEl(turnOrder);
      U.toArray(combat.actors).slice(0, 12).forEach((actor, index) => {
        const chip = U.createEl("div", {
          className: `turn-chip ${index === Number(combat.turnIndex || 0) ? "active" : ""}`,
          text: `${actor?.name || "Actor"}${actor?.isDown ? " ✕" : ""}`
        });
        turnOrder.appendChild(chip);
      });
    }

    if (enemyField) {
      U.emptyEl(enemyField);
      const enemies = U.toArray(combat.enemies);

      if (!enemies.length) {
        enemyField.appendChild(U.createEl("div", {
          className: "battle-slot",
          html: `<div class="battle-portrait"></div><div>Awaiting enemies</div>`
        }));
      } else {
        enemies.forEach((enemy) => {
          enemyField.appendChild(U.createEl("div", {
            className: `battle-slot ${enemy?.isDown ? "down" : ""}`,
            html: renderCombatActorCard(enemy)
          }));
        });
      }
    }

    if (allyField) {
      U.emptyEl(allyField);
      const allies = U.toArray(combat.allies);

      if (!allies.length) {
        allyField.appendChild(U.createEl("div", {
          className: "battle-slot",
          html: `<div class="battle-portrait"></div><div>No allies loaded</div>`
        }));
      } else {
        allies.forEach((ally) => {
          allyField.appendChild(U.createEl("div", {
            className: `battle-slot ${ally?.isDown ? "down" : ""}`,
            html: renderCombatActorCard(ally)
          }));
        });
      }
    }

    if (logEl) {
      const logLines = U.toArray(combat.log).slice(-20);
      U.setText(logEl, logLines.length ? logLines.join("\n") : "Combat log empty.");
    }

    const combatApi = getCombatApi();
    combatApi?.renderBattlefieldSelections?.();
    combatApi?.bindCombatButtons?.();
  }

  function renderMiniMapVisibility() {
    const shell = el("miniMapShell");
    if (!shell) return;

    const visible = Boolean(S.getRuntime()?.ui?.minimapVisible);
    shell.style.display = visible ? "" : "none";
  }

  function applyUiSettings() {
    const settings = S.getSettings();
    const app = el("app");

    if (app) {
      app.style.setProperty("--ui-scale", String(settings.uiScale || 1));
    }

    if (settings.reduceMotion) {
      document.body.classList.add("reduce-motion");
    } else {
      document.body.classList.remove("reduce-motion");
    }
  }

  function populateCharacterCreator() {
    const data = S.getData();

    const backgroundSel = el("creatorBackground");
    const specialtySel = el("creatorSpecialty");
    const hairSel = el("creatorHairStyle");
    const hairColorSel = el("creatorHairColor");
    const outfitSel = el("creatorOutfit");
    const traitASel = el("creatorTraitA");
    const traitBSel = el("creatorTraitB");

    const backgrounds = U.toArray(data?.classes).slice(0, 8);
    const traits = U.toArray(data?.traits).slice(0, 24);

    const simpleOptions = {
      hairStyles: ["Short", "Messy", "Long", "Ponytail", "Shaved", "Field Disaster"],
      hairColors: ["Brown", "Black", "Blonde", "Red", "Gray", "Green"],
      outfits: ["Field Greens", "Dock Wear", "Rain Gear", "Utility Overalls", "Warden Vest"]
    };

    function fillSelect(selectEl, options, mapper) {
      if (!selectEl) return;
      U.emptyEl(selectEl);

      options.forEach((option, i) => {
        const mapped = mapper ? mapper(option, i) : { value: String(option), label: String(option) };
        const opt = document.createElement("option");
        opt.value = mapped.value;
        opt.textContent = mapped.label;
        selectEl.appendChild(opt);
      });
    }

    fillSelect(backgroundSel, backgrounds.length ? backgrounds : [
      { id: "wetland_observer", name: "Wetland Observer" },
      { id: "small_game_ranger", name: "Small Game Ranger" }
    ], (entry) => ({
      value: entry.id,
      label: entry.name || U.titleCase(entry.id)
    }));

    fillSelect(specialtySel, [
      { id: "fishing", name: "Fishing" },
      { id: "trapping", name: "Trapping" },
      { id: "foraging", name: "Foraging" },
      { id: "breeding", name: "Breeding" }
    ], (entry) => ({
      value: entry.id,
      label: entry.name
    }));

    fillSelect(hairSel, simpleOptions.hairStyles);
    fillSelect(hairColorSel, simpleOptions.hairColors);
    fillSelect(outfitSel, simpleOptions.outfits);

    fillSelect(traitASel, traits.length ? traits : [
      { id: "steady_hands", name: "Steady Hands" },
      { id: "field_notebook", name: "Field Notebook" }
    ], (entry) => ({
      value: entry.id,
      label: entry.name || U.titleCase(entry.id)
    }));

    fillSelect(traitBSel, traits.length ? traits : [
      { id: "weird_luck", name: "Weird Luck" },
      { id: "boat_brain", name: "Boat Brain" }
    ], (entry) => ({
      value: entry.id,
      label: entry.name || U.titleCase(entry.id)
    }));

    renderCreatorPerks();
  }

  function renderCreatorPerks() {
    const list = el("creatorPerkList");
    if (!list) return;

    U.emptyEl(list);

    [
      "Starts with a field knife and basic fishing kit",
      "Knows how to identify suspicious swamp nonsense",
      "Can survive on spite, coffee, and mildly cursed berries"
    ].forEach((perk) => {
      const li = document.createElement("li");
      li.textContent = `• ${perk}`;
      list.appendChild(li);
    });
  }

  function getCreatorColorValue(colorName = "") {
    const normalized = String(colorName || "").trim().toLowerCase();

    const map = {
      brown: "#5c3b24",
      black: "#171717",
      blonde: "#d7b65f",
      red: "#93452f",
      gray: "#7d8287",
      green: "#4f7b57"
    };

    return map[normalized] || "#5c3b24";
  }

  function getCreatorOutfitValue(outfitName = "") {
    const normalized = String(outfitName || "").trim().toLowerCase();

    const map = {
      "field greens": "#6e9a5e",
      "dock wear": "#59718d",
      "rain gear": "#d1bb4a",
      "utility overalls": "#7f6f5f",
      "warden vest": "#4f8662"
    };

    return map[normalized] || "#6e9a5e";
  }

  function getHairShapeCss(styleName = "") {
    const normalized = String(styleName || "").trim().toLowerCase();

    switch (normalized) {
      case "messy":
        return "radial-gradient(ellipse at 50% 20%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 13%, transparent 13.4%), radial-gradient(circle at 40% 14%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 5.2%, transparent 5.4%), radial-gradient(circle at 61% 14%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 4.8%, transparent 5.1%)";
      case "long":
        return "radial-gradient(circle at 50% 20%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 12.5%, transparent 12.9%), linear-gradient(180deg, transparent 0 23%, var(--creator-hair-color, rgba(62,37,15,0.92)) 23% 46%, transparent 46.4%)";
      case "ponytail":
        return "radial-gradient(circle at 50% 20%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 12%, transparent 12.4%), radial-gradient(ellipse at 72% 27%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 6%, transparent 6.4%)";
      case "shaved":
        return "radial-gradient(circle at 50% 19%, rgba(70,52,39,0.35) 0 10.5%, transparent 10.9%)";
      case "field disaster":
        return "radial-gradient(circle at 50% 20%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 11.7%, transparent 12.1%), radial-gradient(circle at 33% 18%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 4%, transparent 4.4%), radial-gradient(circle at 66% 15%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 4.5%, transparent 4.9%)";
      case "short":
      default:
        return "radial-gradient(circle at 50% 22%, var(--creator-hair-color, rgba(62,37,15,0.92)) 0 12%, transparent 12.4%)";
    }
  }

  function getAccessoryCss(specialtyName = "", traitA = "", traitB = "") {
    const specialty = String(specialtyName || "").trim().toLowerCase();
    const traits = [traitA, traitB].map((x) => String(x || "").trim().toLowerCase());

    if (specialty === "fishing") {
      return "radial-gradient(circle at 62% 41%, rgba(126,200,255,0.95) 0 2.6%, transparent 3%), linear-gradient(180deg, transparent 0 38%, rgba(126,200,255,0.12) 38% 40%, transparent 40.2%)";
    }

    if (specialty === "trapping") {
      return "radial-gradient(circle at 62% 41%, rgba(255, 209, 102, 0.92) 0 2.8%, transparent 3.2%), linear-gradient(180deg, transparent 0 52%, rgba(255, 209, 102, 0.14) 52% 54%, transparent 54.2%)";
    }

    if (specialty === "foraging") {
      return "radial-gradient(circle at 62% 41%, rgba(130, 209, 115, 0.92) 0 2.8%, transparent 3.2%)";
    }

    if (specialty === "breeding") {
      return "radial-gradient(circle at 62% 41%, rgba(215, 124, 255, 0.9) 0 2.8%, transparent 3.2%)";
    }

    if (traits.includes("weird_luck")) {
      return "radial-gradient(circle at 62% 41%, rgba(255, 214, 102, 0.88) 0 2.6%, transparent 3%)";
    }

    return "radial-gradient(circle at 62% 41%, rgba(255, 214, 102, 0.88) 0 2.6%, transparent 3%)";
  }

  function applyCreatorAvatarVisuals() {
    const preview = el("creatorPreviewAvatar") || document.querySelector(".avatar-preview");
    if (!preview) return;

    const hairLayer = preview.querySelector(".avatar-hair") || document.querySelector(".avatar-hair");
    const outfitLayer = preview.querySelector(".avatar-outfit") || document.querySelector(".avatar-outfit");
    const accessoryLayer = preview.querySelector(".avatar-accessory") || document.querySelector(".avatar-accessory");

    const hairStyle = el("creatorHairStyle")?.value || "Short";
    const hairColor = el("creatorHairColor")?.value || "Brown";
    const outfit = el("creatorOutfit")?.value || "Field Greens";
    const specialty = el("creatorSpecialty")?.selectedOptions?.[0]?.textContent || "Fishing";
    const traitA = el("creatorTraitA")?.value || "";
    const traitB = el("creatorTraitB")?.value || "";

    const hairColorCss = getCreatorColorValue(hairColor);
    const outfitColorCss = getCreatorOutfitValue(outfit);

    preview.style.setProperty("--creator-hair-color", hairColorCss);
    preview.style.setProperty("--creator-outfit-color", outfitColorCss);

    preview.dataset.hairStyle = hairStyle;
    preview.dataset.hairColor = hairColor;
    preview.dataset.outfit = outfit;
    preview.dataset.specialty = specialty;

    if (hairLayer) hairLayer.style.background = getHairShapeCss(hairStyle);
    if (outfitLayer) outfitLayer.style.background = `linear-gradient(180deg, transparent 0 45%, ${outfitColorCss} 45% 68%, transparent 68%)`;
    if (accessoryLayer) accessoryLayer.style.background = getAccessoryCss(specialty, traitA, traitB);
  }

  function updateCreatorPreview() {
    const name = el("creatorName")?.value?.trim() || CFG.PLAYER.startingName;
    const background = el("creatorBackground")?.selectedOptions?.[0]?.textContent || "Remote Wetlands Field Station";
    const specialty = el("creatorSpecialty")?.selectedOptions?.[0]?.textContent || "Fishing";
    const hairStyle = el("creatorHairStyle")?.value || "Short";
    const hairColor = el("creatorHairColor")?.value || "Brown";
    const outfit = el("creatorOutfit")?.value || "Field Greens";

    U.setText(el("previewName"), name);
    U.setText(el("previewOrigin"), background);
    U.setText(
      el("previewSummary"),
      `Specialty: ${specialty}. ${hairStyle} hair in ${hairColor}. Outfit: ${outfit}.`
    );

    applyCreatorAvatarVisuals();
  }

  function renderEverything() {
    renderHud();
    renderStatusEffects();
    renderTrackedTasks();
    renderPartyMini();
    renderNearbyList();
    renderActivityLog();
    renderInventoryModal();
    renderPartyModal();
    renderBoatModal();
    renderBaseModal();
    renderCraftModal();
    renderDnaModal();
    renderFishingModal();
    renderJournalModal();
    renderTutorialModal();
    renderSettingsModal();
    renderAdminModal();
    renderMapModal();
    renderCombatShell();
    renderMiniMapVisibility();
    applyUiSettings();
  }

  function bindBootButtons() {
    const btnContinue = el("btnContinue");
    const btnNewGame = el("btnNewGame");
    const btnLoadGame = el("btnLoadGame");
    const btnOpenSettings = el("btnOpenSettings");
    const btnOpenCredits = el("btnOpenCredits");
    const btnBackToBoot = el("btnBackToBootFromCreator");
    const btnStartGame = el("btnStartGame");

    if (btnContinue) {
      U.on(btnContinue, "click", () => {
        try {
          SAVE.quickLoad();
          renderEverything();
          showScreen("game");
          A.playMusic("exploration");
          A.playAmbient("field_station_ambient");
        } catch {
          M.openModal("saveLoadModal");
        }
      });
    }

    if (btnNewGame) {
      U.on(btnNewGame, "click", () => {
        S.resetGame();
        populateCharacterCreator();
        updateCreatorPreview();
        showScreen("creator");
      });
    }

    if (btnLoadGame) {
      U.on(btnLoadGame, "click", () => {
        renderSaveSlots();
        M.openModal("saveLoadModal");
      });
    }

    if (btnOpenSettings) {
      U.on(btnOpenSettings, "click", () => {
        renderSettingsModal();
        M.openModal("settingsModal");
      });
    }

    if (btnOpenCredits) {
      U.on(btnOpenCredits, "click", () => {
        S.addToast("Grab Lab prototype by your extremely tired field station crew.", "info");
      });
    }

    if (btnBackToBoot) {
      U.on(btnBackToBoot, "click", () => {
        showScreen("boot");
      });
    }

    if (btnStartGame) {
      U.on(btnStartGame, "click", () => {
        const name = el("creatorName")?.value?.trim() || CFG.PLAYER.startingName;
        const backgroundId = el("creatorBackground")?.value || CFG.PLAYER.startingBackground;
        const specialtyId = el("creatorSpecialty")?.value || CFG.PLAYER.startingSpecialty;
        const traitA = el("creatorTraitA")?.value || CFG.PLAYER.startingTraits[0];
        const traitB = el("creatorTraitB")?.value || CFG.PLAYER.startingTraits[1];
        const hairStyle = el("creatorHairStyle")?.value || "Short";
        const hairColor = el("creatorHairColor")?.value || "Brown";
        const outfit = el("creatorOutfit")?.value || "Field Greens";

        S.setPlayer({
          ...S.getPlayer(),
          name,
          backgroundId,
          specialtyId,
          traits: U.uniqueBy([traitA, traitB], (x) => x),
          appearance: {
            hairStyle,
            hairColor,
            outfit
          }
        });

        S.revealTile(S.getWorld().currentTileX, S.getWorld().currentTileY);
        S.logActivity(`${name} begins their assignment at Field Station Alpha.`, "info");
        renderEverything();
        showScreen("game");
        A.playMusic("exploration");
        A.playAmbient("field_station_ambient");
      });
    }
  }

  function bindSettingsControls() {
    const music = el("settingMusicVolume");
    const sfx = el("settingSfxVolume");
    const ambient = el("settingAmbientVolume");
    const uiScale = el("settingUiScale");
    const reduceMotion = el("settingReduceMotion");
    const dmgNums = el("settingShowDamageNumbers");

    if (music) {
      U.on(music, "input", () => {
        A.setMusicVolume(Number(music.value) / 100);
        renderSettingsModal();
      });
    }

    if (sfx) {
      U.on(sfx, "input", () => {
        A.setSfxVolume(Number(sfx.value) / 100);
        renderSettingsModal();
      });
    }

    if (ambient) {
      U.on(ambient, "input", () => {
        A.setAmbientVolume(Number(ambient.value) / 100);
        renderSettingsModal();
      });
    }

    if (uiScale) {
      U.on(uiScale, "input", () => {
        S.updateSettings({ uiScale: Number(uiScale.value) / 100 });
        SAVE.saveSettings();
        applyUiSettings();
      });
    }

    if (reduceMotion) {
      U.on(reduceMotion, "change", () => {
        S.updateSettings({ reduceMotion: reduceMotion.checked });
        SAVE.saveSettings();
        applyUiSettings();
      });
    }

    if (dmgNums) {
      U.on(dmgNums, "change", () => {
        S.updateSettings({ showDamageNumbers: dmgNums.checked });
        SAVE.saveSettings();
      });
    }
  }

  function bindSaveControls() {
    const exportBtn = el("btnExportSave");
    const importInput = el("importSaveInput");

    if (exportBtn) {
      U.on(exportBtn, "click", () => {
        try {
          SAVE.exportCurrentSave();
        } catch (err) {
          S.addToast(err.message || "Export failed.", "error");
        }
      });
    }

    if (importInput) {
      U.on(importInput, "change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;

        try {
          await SAVE.importAndLoadFile(file);
          renderEverything();
          showScreen("game");
          M.closeModal("saveLoadModal");
        } catch (err) {
          S.addToast(err.message || "Import failed.", "error");
        } finally {
          importInput.value = "";
        }
      });
    }
  }

  function bindMiniMapControls() {
    const btn = el("btnExpandMiniMap");
    const shell = el("miniMapShell");
    const header = shell?.querySelector(".mini-map-header");
    const canvas = el("miniMapCanvas");

    if (!btn || !shell || !header || !canvas) return;

    function applyMiniMapState() {
      shell.classList.toggle("expanded", state.minimap.expanded);
      shell.classList.toggle("collapsed", state.minimap.collapsed);
      canvas.style.display = state.minimap.collapsed ? "none" : "block";
      btn.textContent = state.minimap.collapsed
        ? "Open"
        : (state.minimap.expanded ? "Shrink" : "Expand");
    }

    U.on(btn, "click", () => {
      if (state.minimap.collapsed) {
        state.minimap.collapsed = false;
        state.minimap.expanded = false;
      } else if (!state.minimap.expanded) {
        state.minimap.expanded = true;
      } else {
        state.minimap.expanded = false;
        state.minimap.collapsed = true;
      }
      applyMiniMapState();
    });

    U.on(header, "pointerdown", (evt) => {
      if (evt.target === btn) return;
      state.minimap.dragging = true;
      state.minimap.pointerId = evt.pointerId ?? null;
      state.minimap.startX = evt.clientX ?? 0;
      state.minimap.startY = evt.clientY ?? 0;
      const rect = shell.getBoundingClientRect();
      shell.style.right = "auto";
      shell.style.bottom = "auto";
      shell.style.left = `${rect.left}px`;
      shell.style.top = `${rect.top}px`;
      state.minimap.originLeft = rect.left;
      state.minimap.originTop = rect.top;
      header.setPointerCapture?.(evt.pointerId);
    });

    U.on(header, "pointermove", (evt) => {
      if (!state.minimap.dragging) return;
      if (state.minimap.pointerId != null && evt.pointerId !== state.minimap.pointerId) return;
      const nextLeft = state.minimap.originLeft + ((evt.clientX ?? 0) - state.minimap.startX);
      const nextTop = state.minimap.originTop + ((evt.clientY ?? 0) - state.minimap.startY);
      const rect = shell.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      shell.style.left = `${U.clamp(nextLeft, 8, maxLeft)}px`;
      shell.style.top = `${U.clamp(nextTop, 8, maxTop)}px`;
    });

    function endDrag(evt) {
      if (!state.minimap.dragging) return;
      if (state.minimap.pointerId != null && evt.pointerId != null && evt.pointerId !== state.minimap.pointerId) return;
      state.minimap.dragging = false;
      state.minimap.pointerId = null;
    }

    U.on(header, "pointerup", endDrag);
    U.on(header, "pointercancel", endDrag);

    applyMiniMapState();
  }

  function bindQuickPanelButtons() {
    const openModal = (modalId, afterOpen = null) => {
      const btnId = {
        inventoryModal: "btnInventory",
        partyModal: "btnParty",
        mapModal: "btnMap",
        boatModal: "btnBoat",
        craftModal: "btnCraft",
        journalModal: "btnJournal",
        dnaModal: "btnDNA",
        breedingModal: "btnBreed",
        fishingModal: "btnFish"
      }[modalId];

      const btn = btnId ? el(btnId) : null;
      if (!btn) return;

      U.on(btn, "click", () => {
        M.openModal(modalId);
        afterOpen?.();
      });
    };

    openModal("inventoryModal", renderInventoryModal);
    openModal("partyModal", renderPartyModal);
    openModal("mapModal", () => {
      renderMapModal();
      window.GL_MAP?.drawMap?.();
    });
    openModal("boatModal", renderBoatModal);
    openModal("craftModal", renderCraftModal);
    openModal("journalModal", renderJournalModal);
    openModal("dnaModal", renderDnaModal);
    openModal("breedingModal", () => {
      getBreedingApi()?.renderBreedingPanel?.();
    });
    openModal("fishingModal", renderFishingModal);

    const btnBase = el("btnBase");
    if (btnBase) {
      U.on(btnBase, "click", () => {
        state.baseModalMode = "base";
        M.openModal("baseModal");
        renderBaseModal();
      });
    }

    const btnBuild = el("btnBuild");
    if (btnBuild) {
      U.on(btnBuild, "click", () => {
        state.baseModalMode = "build";
        M.openModal("baseModal");
        renderBaseModal();
      });
    }

    const btnTraps = el("btnTraps");
    if (btnTraps) {
      U.on(btnTraps, "click", () => {
        state.baseModalMode = "traps";
        M.openModal("baseModal");
        renderBaseModal();
      });
    }

    const btnTutorial = el("btnTutorial");
    if (btnTutorial) {
      U.on(btnTutorial, "click", () => {
        M.openModal("tutorialModal");
        renderTutorialModal();
      });
    }

    const btnAdmin = el("btnAdmin");
    if (btnAdmin) {
      U.on(btnAdmin, "click", () => {
        M.openModal("adminModal");
        renderAdminModal();
      });
    }
  }

  function bindActionButtons() {
    const btnPause = el("btnPause");
    if (btnPause) {
      U.on(btnPause, "click", () => {
        const paused = !Boolean(S.getWorld()?.isPaused);
        S.updateWorld({ isPaused: paused });
        U.setText(btnPause, paused ? "Resume" : "Pause");
        S.addToast(paused ? "Game paused." : "Game resumed.", paused ? "warning" : "success");
      });
    }

    const btnCastLine = el("btnCastLine");
    if (btnCastLine) {
      U.on(btnCastLine, "click", () => {
        const fishing = getFishingApi();
        if (fishing?.castLine) {
          fishing.castLine();
        } else {
          M.openModal("fishingModal");
          renderFishingModal();
          S.logActivity("Open Fishing to cast, place passive lines, or collect catches.", "info");
        }
      });
    }

    const btnUseTool = el("btnUseTool");
    if (btnUseTool) {
      U.on(btnUseTool, "click", () => {
        M.openModal("inventoryModal");
        renderInventoryModal();
        S.logActivity("Tool use is handled through Inventory, Fishing, Build, and Crafting systems.", "info");
      });
    }

    const btnSneak = el("btnSneak");
    if (btnSneak) {
      U.on(btnSneak, "click", () => {
        S.logActivity("You attempt stealth. The swamp pretends not to notice.", "info");
        renderActivityLog();
      });
    }

    const btnRest = el("btnRest");
    if (btnRest) {
      U.on(btnRest, "click", () => {
        S.modifyPlayerStat?.("stamina", 12);
        S.modifyPlayerStat?.("morale", 2);
        S.logActivity("You catch your breath and recover a little stamina.", "success");
        renderHud();
        renderActivityLog();
      });
    }

    const btnFleeCombat = el("btnFleeCombat");
    if (btnFleeCombat) {
      U.on(btnFleeCombat, "click", () => {
        S.endCombat("fled");
        showScreen("game");
        renderEverything();
      });
    }
  }

  function bindSearchInputs() {
    const dnaSearch = el("dnaSearch");

    if (dnaSearch) {
      U.on(dnaSearch, "input", U.debounce(() => {
        const needle = dnaSearch.value.trim().toLowerCase();
        const cards = U.qsa("#dnaList .card");
        cards.forEach((card) => {
          const text = (card.textContent || "").toLowerCase();
          card.style.display = !needle || text.includes(needle) ? "" : "none";
        });
      }, 120));
    }
  }

  function bindCreatorInputs() {
    [
      "creatorName",
      "creatorBackground",
      "creatorSpecialty",
      "creatorHairStyle",
      "creatorHairColor",
      "creatorOutfit",
      "creatorTraitA",
      "creatorTraitB"
    ].forEach((id) => {
      const node = el(id);
      if (!node) return;
      U.on(node, "input", updateCreatorPreview);
      U.on(node, "change", updateCreatorPreview);
    });

    const btnRand = el("btnRandomizeCharacter");
    if (btnRand) {
      U.on(btnRand, "click", () => {
        const namePool = ["Marlow", "Tess", "Beck", "Rook", "Nell", "Ash", "June"];
        const nameEl = el("creatorName");
        if (nameEl) nameEl.value = U.pick(namePool) || CFG.PLAYER.startingName;

        ["creatorHairStyle", "creatorHairColor", "creatorOutfit", "creatorTraitA", "creatorTraitB", "creatorSpecialty", "creatorBackground"]
          .forEach((id) => {
            const select = el(id);
            if (!select || !select.options.length) return;
            select.selectedIndex = U.randInt(0, select.options.length - 1);
          });

        updateCreatorPreview();
      });
    }
  }

  function bindEventBusRenders() {
    U.eventBus.on("player:changed", renderEverything);
    U.eventBus.on("playerStats:changed", renderHud);
    U.eventBus.on("world:changed", renderEverything);
    U.eventBus.on("world:timeChanged", renderHud);

    U.eventBus.on("party:changed", () => {
      renderPartyMini();
      renderPartyModal();
      renderInventoryModal();
    });

    U.eventBus.on("base:changed", () => {
      renderBaseModal();
      renderPartyModal();
      renderDnaModal();
    });

    U.eventBus.on("boat:changed", renderBoatModal);

    U.eventBus.on("quests:changed", () => {
      renderTrackedTasks();
      renderJournalModal();
    });

    U.eventBus.on("inventory:changed", () => {
      renderInventoryModal();
      renderCraftModal();
      renderBaseModal();
    });

    U.eventBus.on("ui:activityLogged", renderActivityLog);
    U.eventBus.on("ui:toastAdded", pushToastToDom);
    U.eventBus.on("ui:toastRemoved", removeToastFromDom);

    U.eventBus.on("combat:started", () => {
      renderCombatShell();
      showScreen("combat");
    });

    U.eventBus.on("combat:changed", renderCombatShell);

    U.eventBus.on("combat:ended", () => {
      renderCombatShell();
      showScreen("game");
      renderEverything();
    });

    U.eventBus.on("settings:changed", () => {
      renderSettingsModal();
      applyUiSettings();
    });

    U.eventBus.on("saveLoad:slotSaved", renderSaveSlots);
    U.eventBus.on("saveLoad:slotDeleted", renderSaveSlots);
    U.eventBus.on("saveLoad:autosaved", renderSaveSlots);
    U.eventBus.on("saveLoad:autosaveDeleted", renderSaveSlots);

    U.eventBus.on("world:poiResolved", () => {
      renderNearbyList();
      renderMapModal();
    });
  }

  function seedDemoUiState() {
    const playerInv = S.getInventory("player");
    if (!playerInv.length) {
      S.addItem("player", "berries_wild", 4);
      S.addItem("player", "fresh_water", 2);
      S.addItem("player", "fishing_pole_basic", 1);
    }

    if (!S.getRuntime()?.ui?.activityLog?.length) {
      S.logActivity("Field station systems online.", "success");
      S.logActivity("Boat secured at the dock.", "info");
      S.logActivity("Air quality: surprisingly not lethal.", "info");
    }
  }

  function init() {
    if (state.initialized) return true;

    populateCharacterCreator();
    updateCreatorPreview();

    bindBootButtons();
    bindSettingsControls();
    bindSaveControls();
    bindMiniMapControls();
    bindQuickPanelButtons();
    bindActionButtons();
    bindSearchInputs();
    bindCreatorInputs();
    bindEventBusRenders();

    seedDemoUiState();
    renderAllToasts();
    renderSaveSlots();
    renderEverything();

    state.initialized = true;
    U.eventBus.emit("ui:initialized");
    return true;
  }

  const API = {
    init,
    showScreen,
    renderHud,
    renderStatusEffects,
    renderTrackedTasks,
    renderPartyMini,
    renderNearbyList,
    renderActivityLog,
    renderSaveSlots,
    renderInventoryModal,
    renderPartyModal,
    renderBoatModal,
    renderBaseModal,
    renderCraftModal,
    renderDnaModal,
    renderFishingModal,
    renderJournalModal,
    renderTutorialModal,
    renderSettingsModal,
    renderAdminModal,
    renderMapModal,
    renderCombatShell,
    renderMiniMapVisibility,
    applyUiSettings,
    populateCharacterCreator,
    updateCreatorPreview,
    renderEverything
  };

  window.GL_UI = API;

  return Object.freeze(API);
})();