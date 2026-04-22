window.GrabLabUI = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const SAVE = window.GrabLabSaveLoad;
  const A = window.GrabLabAudio;
  const M = window.GrabLabModal;

  const state = {
    initialized: false,
    toastTimers: new Map()
  };

  function el(id) {
    return U.byId(id);
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
      boot: boot,
      creator: creator,
      game: game,
      combat: combat
    };

    const target = map[screenId] || game;
    if (target) {
      target.classList.add("active");
    }

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

    U.setText(el("hudHealthText"), `${stats.health}/${stats.maxHealth}`);
    U.setText(el("hudStaminaText"), `${stats.stamina}/${stats.maxStamina}`);
    U.setText(el("hudHungerText"), hungerPct >= 70 ? "Fed" : hungerPct >= 40 ? "Hungry" : "Starving");
    U.setText(el("hudThirstText"), thirstPct >= 70 ? "Hydrated" : thirstPct >= 40 ? "Thirsty" : "Parched");
    U.setText(el("hudInfectionText"), `${infectionPct}%`);
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
      const card = U.createEl("div", {
        className: "card"
      });

      const title = U.createEl("div", {
        className: "meta-title",
        text: questDef?.title || U.titleCase(questId)
      });

      const sub = U.createEl("div", {
        className: "meta-sub",
        text: questDef?.summary || "Keep moving forward."
      });

      card.append(title, sub);
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

  function renderNearbyList() {
    const host = el("nearbyList");
    if (!host) return;

    U.emptyEl(host);

    const tile = S.getCurrentMapTile();
    const nearby = U.toArray(tile?.pointsOfInterest);

    if (!nearby.length) {
      host.appendChild(U.createEl("div", {
        className: "card",
        text: "Nothing obvious nearby."
      }));
      return;
    }

    nearby.slice(0, 8).forEach((poi) => {
      host.appendChild(U.createEl("div", {
        className: "card",
        html: `<div class="meta-title">${htmlEscape(poi.name || "Point of Interest")}</div>
               <div class="meta-sub">${htmlEscape(poi.type || "Unknown")}</div>`
      }));
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

    const autoCard = U.createEl("div", {
      className: "card"
    });
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
      const slot = U.createEl("div", {
        className: "inventory-slot"
      });

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
        subtitle: `${U.titleCase(c.speciesId || "creature")} • Level ${c.level || 1}`,
        data: c,
        isPlayer: false
      })),
      ...reserve.map((c) => ({
        id: c.id,
        name: `${c.name || "Reserve"} (Reserve)`,
        subtitle: `${U.titleCase(c.speciesId || "creature")} • Level ${c.level || 1}`,
        data: c,
        isPlayer: false
      }))
    ];

    entries.forEach((entry) => {
      const card = U.createEl("div", { className: "card" });
      card.innerHTML = `
        <div class="meta-title">${htmlEscape(entry.name)}</div>
        <div class="meta-sub">${htmlEscape(entry.subtitle)}</div>
      `;

      U.on(card, "click", () => {
        const d = entry.data || {};
        detail.innerHTML = `
          <h3>${htmlEscape(entry.name)}</h3>
          <p>${htmlEscape(entry.subtitle)}</p>
          <p><strong>Health:</strong> ${htmlEscape(String(d?.stats?.health ?? d?.stats?.maxHealth ?? 0))}/${htmlEscape(String(d?.stats?.maxHealth ?? 0))}</p>
          <p><strong>Stamina:</strong> ${htmlEscape(String(d?.stats?.stamina ?? d?.stats?.maxStamina ?? 0))}/${htmlEscape(String(d?.stats?.maxStamina ?? 0))}</p>
          <p><strong>Traits:</strong> ${htmlEscape(U.toArray(d?.traits).join(", ") || "None")}</p>
        `;
      });

      list.appendChild(card);
    });

    if (!entries.length) {
      detail.textContent = "No party members.";
    }
  }

  function renderBoatModal() {
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
    const host = el("basePanelContent");
    if (!host) return;

    const base = S.getBase();
    host.innerHTML = `
      <h3>${htmlEscape(base?.name || "Field Station Alpha")}</h3>
      <p><strong>Structures:</strong> ${htmlEscape(String(U.toArray(base?.structures).length))}</p>
      <p><strong>Storage Stacks:</strong> ${htmlEscape(String(U.toArray(base?.storage).length))}</p>
      <p><strong>Habitats:</strong> ${htmlEscape(String(U.toArray(base?.habitats).length))}</p>
      <p><strong>Breeding Jobs:</strong> ${htmlEscape(String(U.toArray(base?.breedingJobs).length))}</p>
      <p><strong>Crafting Queues:</strong> ${htmlEscape(String(U.toArray(base?.craftingQueues).length))}</p>
    `;
  }

  function renderCraftModal() {
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

    const discovered = U.toArray(S.getPlayer()?.discoveredSpecies);
    if (!discovered.length) {
      list.appendChild(U.createEl("div", { className: "card", text: "No DNA entries recorded yet." }));
      detail.textContent = "Capture and log animals to populate the DNA database.";
      return;
    }

    discovered.forEach((speciesId) => {
      const def = S.getAnimalDef(speciesId);
      const card = U.createEl("div", { className: "card" });
      card.innerHTML = `
        <div class="meta-title">${htmlEscape(def?.name || U.titleCase(speciesId))}</div>
        <div class="meta-sub">${htmlEscape(def?.family || "Unknown family")}</div>
      `;
      U.on(card, "click", () => {
        detail.innerHTML = `
          <h3>${htmlEscape(def?.name || U.titleCase(speciesId))}</h3>
          <p>${htmlEscape(def?.description || "No DNA notes recorded.")}</p>
          <p><strong>Traits:</strong> ${htmlEscape(U.toArray(def?.traits).join(", ") || "None")}</p>
          <p><strong>Habitat:</strong> ${htmlEscape(def?.habitat || "Unknown")}</p>
        `;
      });
      list.appendChild(card);
    });
  }

  function renderFishingModal() {
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

    const text = history
      .slice(0, 50)
      .map((row) => row.text)
      .join("\n");

    U.setText(host, text);
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
      <p><strong>POI Count:</strong> ${htmlEscape(String(U.toArray(tile?.pointsOfInterest).length))}</p>
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

    if (title) U.setText(title, combat.encounterId ? U.titleCase(combat.encounterId) : "Fungal Encounter");
    if (subtitle) U.setText(subtitle, combat.active ? "Combat in progress." : "The spores twitch in a deeply rude manner.");
    if (actorCardName) U.setText(actorCardName, S.getPlayer()?.name || "Ranger");
    if (actorCardStats) {
      const st = S.getPlayer()?.stats || {};
      U.setText(actorCardStats, `HP ${st.health || 0}/${st.maxHealth || 0} • STA ${st.stamina || 0}/${st.maxStamina || 0}`);
    }

    if (turnOrder) {
      U.emptyEl(turnOrder);
      U.toArray(combat.actors).slice(0, 12).forEach((actor) => {
        turnOrder.appendChild(U.createEl("div", {
          className: "turn-chip",
          text: actor?.name || "Actor"
        }));
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
            className: "battle-slot",
            html: `<div class="battle-portrait"></div><div>${htmlEscape(enemy?.name || "Enemy")}</div>`
          }));
        });
      }
    }

    if (allyField) {
      U.emptyEl(allyField);
      const allies = [
        { name: S.getPlayer()?.name || "Ranger" },
        ...U.toArray(combat.allies)
      ];

      allies.forEach((ally) => {
        allyField.appendChild(U.createEl("div", {
          className: "battle-slot",
          html: `<div class="battle-portrait"></div><div>${htmlEscape(ally?.name || "Ally")}</div>`
        }));
      });
    }
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
        const value = mapper ? mapper(option, i).value : String(option);
        const label = mapper ? mapper(option, i).label : String(option);
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
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

    const perks = [
      "Starts with a field knife and basic fishing kit",
      "Knows how to identify suspicious swamp nonsense",
      "Can survive on spite, coffee, and mildly cursed berries"
    ];

    perks.forEach((perk) => {
      const li = document.createElement("li");
      li.textContent = `• ${perk}`;
      list.appendChild(li);
    });
  }

  function updateCreatorPreview() {
    const name = el("creatorName")?.value?.trim() || CFG.PLAYER.startingName;
    const background = el("creatorBackground")?.selectedOptions?.[0]?.textContent || "Remote Wetlands Field Station";
    const specialty = el("creatorSpecialty")?.selectedOptions?.[0]?.textContent || "Fishing";

    U.setText(el("previewName"), name);
    U.setText(el("previewOrigin"), background);
    U.setText(el("previewSummary"), `Specialty: ${specialty}. Somehow still considered a professional.`);
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

        S.setPlayer({
          ...S.getPlayer(),
          name,
          backgroundId,
          specialtyId,
          traits: U.uniqueBy([traitA, traitB], (x) => x)
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

    if (!btn || !shell) return;

    U.on(btn, "click", () => {
      const runtime = S.getRuntime();
      const expanded = !Boolean(runtime?.ui?.minimapExpanded);

      S.updateRuntime({
        ui: {
          minimapExpanded: expanded
        }
      });

      if (expanded) {
        shell.style.width = "380px";
      } else {
        shell.style.width = "";
      }
    });
  }

  function bindActionButtons() {
    const actions = [
      ["btnInteract", "You inspect the area. Nothing explodes. Encouraging."],
      ["btnHarvest", "You gather a few useful materials."],
      ["btnCastLine", "You cast your line into suspiciously patient water."],
      ["btnUseTool", "You fiddle with your tool like a trained professional."],
      ["btnAttack", "You lash out at the nearest fungal menace."],
      ["btnSneak", "You attempt stealth. Nature remains unconvinced."],
      ["btnRest", "You catch your breath for a moment."]
    ];

    actions.forEach(([id, message]) => {
      const btn = el(id);
      if (!btn) return;

      U.on(btn, "click", () => {
        S.logActivity(message, "info");
        renderActivityLog();
      });
    });

    const btnPause = el("btnPause");
    if (btnPause) {
      U.on(btnPause, "click", () => {
        const paused = !Boolean(S.getWorld()?.isPaused);
        S.updateWorld({ isPaused: paused });
        U.setText(btnPause, paused ? "Resume" : "Pause");
        S.addToast(paused ? "Game paused." : "Game resumed.", paused ? "warning" : "success");
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
    const inventorySearch = el("inventorySearch");
    const craftSearch = el("craftSearch");
    const dnaSearch = el("dnaSearch");

    if (inventorySearch) {
      U.on(inventorySearch, "input", U.debounce(() => {
        const needle = inventorySearch.value.trim().toLowerCase();
        const nodes = U.qsa(".inventory-slot", el("inventoryGrid"));
        nodes.forEach((node) => {
          const title = (node.title || "").toLowerCase();
          node.style.display = !needle || title.includes(needle) ? "" : "none";
        });
      }, 120));
    }

    if (craftSearch) {
      U.on(craftSearch, "input", U.debounce(() => {
        const needle = craftSearch.value.trim().toLowerCase();
        const cards = U.qsa("#recipeList .card");
        cards.forEach((card) => {
          const text = (card.textContent || "").toLowerCase();
          card.style.display = !needle || text.includes(needle) ? "" : "none";
        });
      }, 120));
    }

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
    });
    U.eventBus.on("base:changed", renderBaseModal);
    U.eventBus.on("boat:changed", renderBoatModal);
    U.eventBus.on("quests:changed", () => {
      renderTrackedTasks();
      renderJournalModal();
    });
    U.eventBus.on("inventory:changed", renderInventoryModal);
    U.eventBus.on("ui:activityLogged", renderActivityLog);
    U.eventBus.on("ui:toastAdded", pushToastToDom);
    U.eventBus.on("ui:toastRemoved", removeToastFromDom);
    U.eventBus.on("combat:started", () => {
      renderCombatShell();
      showScreen("combat");
    });
    U.eventBus.on("combat:ended", () => {
      renderCombatShell();
      showScreen("game");
    });
    U.eventBus.on("settings:changed", () => {
      renderSettingsModal();
      applyUiSettings();
    });
    U.eventBus.on("saveLoad:slotSaved", renderSaveSlots);
    U.eventBus.on("saveLoad:slotDeleted", renderSaveSlots);
    U.eventBus.on("saveLoad:autosaved", renderSaveSlots);
    U.eventBus.on("saveLoad:autosaveDeleted", renderSaveSlots);
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