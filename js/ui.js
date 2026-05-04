window.GrabLabUI = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const SAVE = window.GrabLabSaveLoad;
  const A = window.GrabLabAudio;
  const M = window.GrabLabModal;

  const state = {
    initialized: false,
    partyModalMode: "active", // active | reserve | captures | habitats
    partyCaptureFilter: "all",
    partyCaptureSort: "newest",
    partyCaptureSearch: "",
    baseModalMode: "overview", // overview | storage
    toastTimers: new Map(),
    rightPanelCollapsed: {
      partyRosterMini: false,
      nearbyList: false,
      activityLog: false
    },
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

  function getAnimalsApi() {
    return window.GL_ANIMALS || window.GrabLabAnimals || null;
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

    const controlledId = S.getRuntime()?.activeAvatarId || "player";

    entries.forEach((entry) => {
      const row = U.createEl("div", {
        className: entry.id === controlledId ? "party-mini-card selected" : "party-mini-card",
        attrs: {
          role: "button",
          tabindex: "0",
          title: `Control ${entry.name}`
        }
      });
      const portrait = U.createEl("div", { className: "mini-portrait" });
      const meta = U.createEl("div");
      const title = U.createEl("div", { className: "meta-title", text: `${entry.id === controlledId ? "▶ " : ""}${entry.name}` });
      const sub = U.createEl("div", { className: "meta-sub", text: `${entry.sub} • Click to control` });

      U.on(row, "click", () => {
        if (window.GL_PARTY_CONTROL?.setControlledAvatar) {
          window.GL_PARTY_CONTROL.setControlledAvatar(entry.id || "player");
        } else {
          S.updateRuntime({ activeAvatarId: entry.id || "player" });
          S.addToast(`Now controlling ${entry.name}.`, "success");
          window.GL_WORLD?.drawWorld?.();
        }
        renderPartyMini();
      });

      U.on(row, "keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          row.click();
        }
      });

      meta.append(title, sub);
      row.append(portrait, meta);
      host.appendChild(row);
    });
  }

  function isPoiResolved(poi) {
    return Boolean(poi?.captured || poi?.recruited || poi?.resolved || poi?.hidden);
  }

  function getVisibleNearbyPois(radius = 5) {
    const world = S.getWorld();
    const out = [];

    for (let y = world.currentTileY - radius; y <= world.currentTileY + radius; y += 1) {
      for (let x = world.currentTileX - radius; x <= world.currentTileX + radius; x += 1) {
        if (x < 0 || y < 0 || x >= CFG.WORLD.worldWidthTiles || y >= CFG.WORLD.worldHeightTiles) continue;

        const dx = Math.abs(x - world.currentTileX);
        const dy = Math.abs(y - world.currentTileY);
        const dist = Math.max(dx, dy);

        if (dist > radius) continue;

        const tile = S.getMapTile(x, y);
        const pois = U.toArray(tile?.pointsOfInterest).filter((poi) => !isPoiResolved(poi));

        pois.forEach((poi) => {
          out.push({
            ...poi,
            distanceTiles: dist,
            sourceTileName: tile?.name || `${x},${y}`,
            sourceBiomeId: tile?.biomeId || world.currentBiomeId
          });
        });
      }
    }

    return out.sort((a, b) => {
      const distDiff = Number(a.distanceTiles || 0) - Number(b.distanceTiles || 0);
      if (distDiff !== 0) return distDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function renderNearbyList() {
    const host = el("nearbyList");
    if (!host) return;

    U.emptyEl(host);

    const nearby = getVisibleNearbyPois(5);

    if (!nearby.length) {
      host.appendChild(U.createEl("div", {
        className: "card",
        text: "Nothing obvious nearby."
      }));
      return;
    }

    nearby.slice(0, 16).forEach((poi) => {
      let action = "Inspect";
      let toneClass = "";

      if (poi.type === "npc" && poi.recruitable) {
        action = "Recruitable";
        toneClass = "success-text";
      } else if ((poi.type === "capturable_animal" || poi.type === "wild_animal") && poi.capturable !== false) {
        action = "Capturable • Grab";
        toneClass = "success-text";
      } else if (poi.hostile || poi.encounterId || poi.type === "hostile" || poi.type === "enemy" || poi.type === "combat" || poi.type === "fungal_enemy") {
        action = "Hostile • Fight";
        toneClass = "danger-text";
      } else if (poi.type === "fish_spot") {
        action = "Fishing spot";
        toneClass = "accent-text";
      } else if (poi.type === "dock") {
        action = "Boat / dock";
      }

      const distanceText = Number(poi.distanceTiles || 0) === 0
        ? "Here"
        : `${poi.distanceTiles} tile${poi.distanceTiles === 1 ? "" : "s"} away`;

      const card = U.createEl("div", {
        className: "card nearby-card",
        html: `
          <div class="meta-title">${htmlEscape(poi.name || "Point of Interest")}</div>
          <div class="meta-sub">${htmlEscape(distanceText)} • ${htmlEscape(poi.sourceTileName || "Unknown tile")}</div>
          <div class="meta-sub ${toneClass}">${htmlEscape(action)}</div>
        `
      });

      U.on(card, "click", () => {
        const input = window.GL_INPUT || window.GrabLabInput;
        if (input?.setSelectedWorldTarget) {
          input.setSelectedWorldTarget(poi);
        }
        S.addToast(`${poi.name || "POI"} is ${distanceText.toLowerCase()}.`, "info");
      });

      host.appendChild(card);
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

  function getSpecimenDisplayName(specimen) {
    if (!specimen) return "Unknown Specimen";
    const def = S.getAnimalDef(specimen.speciesId);
    return specimen.name || specimen.nickname || def?.name || U.titleCase(specimen.speciesId || "specimen");
  }

  function getSpecimenLocationLabel(specimen) {
    const animals = getAnimalsApi();
    if (animals?.getSpecimenLocationLabel) {
      return animals.getSpecimenLocationLabel(specimen.id, specimen.storage);
    }

    if (specimen.storage === "cryo") return "Cryo Fridge";
    if (specimen.storage === "habitat") return specimen.locationLabel || "Habitat";
    if (specimen.storage === "party") return "Active Party";
    if (specimen.storage === "reserve") return "Reserve";
    if (specimen.storage === "released") return "Released";
    return specimen.locationLabel || U.titleCase(specimen.storage || "Unassigned");
  }

  function setPartyTab(mode = "active") {
    state.partyModalMode = ["active", "reserve", "captures", "habitats"].includes(mode) ? mode : "active";
    renderPartyModal();
  }

  function getPartyEntriesForMode() {
    const player = S.getPlayer();
    const party = S.getParty();
    const base = S.getBase();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);
    const specimens = U.toArray(base?.specimens);

    if (state.partyModalMode === "active") {
      return [
        {
          id: player?.id || "player",
          name: player?.name || "Ranger",
          subtitle: `Level ${player?.stats?.level || 1} Conservationist`,
          data: player,
          type: "player"
        },
        ...active.map((c) => ({
          id: c.id,
          name: c.name || "Companion",
          subtitle: `${U.titleCase(c.speciesId || "creature")} • Active • Level ${c.level || 1}`,
          data: c,
          type: "active"
        }))
      ];
    }

    if (state.partyModalMode === "reserve") {
      return reserve.map((c) => ({
        id: c.id,
        name: c.name || "Reserve Companion",
        subtitle: `${U.titleCase(c.speciesId || "creature")} • Reserve • Level ${c.level || 1}`,
        data: c,
        type: "reserve"
      }));
    }

    if (state.partyModalMode === "habitats") {
      const habitats = [
        ...U.toArray(base?.habitats).map((h) => ({ ...h, hostTarget: "base" })),
        ...U.toArray(S.getBoat()?.habitats).map((h) => ({ ...h, hostTarget: "boat" }))
      ];

      return habitats.map((h) => ({
        id: h.id,
        name: h.name || U.titleCase(h.structureId || "Habitat"),
        subtitle: `${U.titleCase(h.hostTarget || "base")} • ${U.titleCase(h.habitatType || "general")} • ${U.toArray(h.occupants).length}/${h.capacity || 2}`,
        data: h,
        type: "habitat"
      }));
    }

    let captures = specimens.filter((spec) => {
      const filter = state.partyCaptureFilter || "all";
      const location = getSpecimenLocationLabel(spec).toLowerCase();
      const species = String(spec.speciesId || "").toLowerCase();
      const family = String(spec.family || "").toLowerCase();
      const search = String(state.partyCaptureSearch || "").trim().toLowerCase();

      if (filter === "cryo" && !(spec.storage === "cryo" || location.includes("cryo"))) return false;
      if (filter === "reserve" && !(spec.storage === "reserve" || location.includes("reserve"))) return false;
      if (filter === "habitat" && !spec.habitatId) return false;
      if (filter === "bred" && !(spec.method === "breeding" || spec.bred || Number(spec.genetics?.generation || 1) > 1)) return false;
      if (filter === "grabbed" && !(spec.method === "field_capture" || spec.method === "grab" || spec.capturedAt)) return false;
      if (!["all", "cryo", "reserve", "habitat", "bred", "grabbed"].includes(filter)) {
        if (species !== filter && family !== filter) return false;
      }

      if (search) {
        const haystack = [spec.name, spec.nickname, spec.speciesId, spec.family, location, U.toArray(spec.traits).join(" "), U.toArray(spec.mutations).join(" ")].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    switch (state.partyCaptureSort || "newest") {
      case "name":
        captures = captures.sort((a, b) => String(getSpecimenDisplayName(a)).localeCompare(String(getSpecimenDisplayName(b))));
        break;
      case "species":
        captures = captures.sort((a, b) => String(a.speciesId || "").localeCompare(String(b.speciesId || "")));
        break;
      case "oldest":
        captures = captures.sort((a, b) => String(a.capturedAt || "").localeCompare(String(b.capturedAt || "")));
        break;
      case "newest":
      default:
        captures = captures.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
        break;
    }

    return captures.map((spec) => ({
      id: spec.id,
      name: getSpecimenDisplayName(spec),
      subtitle: `${U.titleCase(spec.speciesId || "creature")} • ${getSpecimenLocationLabel(spec)} • Lv ${spec.level || 1}`,
      data: spec,
      type: "capture"
    }));
  }

  function renderPartyModeButtons() {
    const buttons = [
      ["btnPartyTabActive", "active"],
      ["btnPartyTabReserve", "reserve"],
      ["btnPartyTabCaptures", "captures"],
      ["btnPartyTabHabitats", "habitats"]
    ];

    buttons.forEach(([id, mode]) => {
      const btn = el(id);
      if (!btn) return;

      btn.classList.toggle("primary-btn", state.partyModalMode === mode);
      btn.classList.toggle("secondary-btn", state.partyModalMode !== mode);

      if (btn.dataset.partyTabBound === "true") return;
      btn.dataset.partyTabBound = "true";

      U.on(btn, "click", () => {
        setPartyTab(mode);
      });
    });
  }

  function renderSpecimenActionButtons(host, specimen) {
    const animals = getAnimalsApi();
    if (!host || !specimen || !animals) return;

    const actions = U.createEl("div", { className: "admin-console-actions" });

    const addParty = U.createEl("button", {
      className: "secondary-btn",
      text: "Add to Party"
    });

    U.on(addParty, "click", () => {
      try {
        const ok = animals.addSpecimenToParty?.(specimen.id);
        if (ok) {
          S.addToast(`${getSpecimenDisplayName(specimen)} joined the active party.`, "success");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not add to party.", "error");
      }
    });

    const reserve = U.createEl("button", {
      className: "ghost-btn",
      text: "Move to Reserve"
    });

    U.on(reserve, "click", () => {
      try {
        const ok = animals.addSpecimenToReserve?.(specimen.id);
        if (ok) {
          S.addToast(`${getSpecimenDisplayName(specimen)} moved to reserve.`, "success");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not move to reserve.", "error");
      }
    });

    const cryo = U.createEl("button", {
      className: "ghost-btn",
      text: "Move to Cryo"
    });

    U.on(cryo, "click", () => {
      try {
        const ok = animals.moveSpecimenToCryo?.(specimen.id);
        if (ok) {
          S.addToast(`${getSpecimenDisplayName(specimen)} moved to Cryo Fridge.`, "success");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not move to cryo.", "error");
      }
    });

    const feed = U.createEl("button", {
      className: "ghost-btn",
      text: "Feed"
    });

    U.on(feed, "click", () => {
      try {
        const ok = animals.feedSpecimen?.(specimen.id);
        if (ok) {
          S.addToast(`${getSpecimenDisplayName(specimen)} was fed.`, "success");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not feed specimen.", "error");
      }
    });

    const water = U.createEl("button", {
      className: "ghost-btn",
      text: "Water"
    });

    U.on(water, "click", () => {
      try {
        const ok = animals.waterSpecimen?.(specimen.id);
        if (ok != null) {
          S.addToast(`${getSpecimenDisplayName(specimen)} was watered.`, "success");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not water specimen.", "error");
      }
    });

    const release = U.createEl("button", {
      className: "ghost-btn",
      text: "Release"
    });

    U.on(release, "click", () => {
      try {
        const ok = animals.releaseSpecimen?.(specimen.id);
        if (ok) {
          S.addToast(`${getSpecimenDisplayName(specimen)} released.`, "warning");
          renderEverything();
        }
      } catch (err) {
        S.addToast(err.message || "Could not release specimen.", "error");
      }
    });

    const breed = U.createEl("button", {
      className: "secondary-btn",
      text: "Open Breeding"
    });

    U.on(breed, "click", () => {
      M.openModal("breedingModal");
      getBreedingApi()?.setParentA?.(specimen.id);
      getBreedingApi()?.renderBreedingPanel?.();
    });

    actions.append(addParty, reserve, cryo, feed, water, release, breed);
    host.appendChild(actions);
  }

  function renderCompanionActionButtons(host, companion, type) {
    const animals = getAnimalsApi();
    if (!host || !companion || !animals) return;

    const actions = U.createEl("div", { className: "admin-console-actions" });

    if (type === "active") {
      const removeBtn = U.createEl("button", {
        className: "ghost-btn",
        text: "Remove from Party"
      });

      U.on(removeBtn, "click", () => {
        try {
          const ok = animals.removeCompanionFromActiveParty?.(companion.id);
          if (ok) {
            S.addToast(`${companion.name || "Companion"} moved out of active party.`, "success");
            renderEverything();
          }
        } catch (err) {
          S.addToast(err.message || "Could not remove from party.", "error");
        }
      });

      actions.appendChild(removeBtn);
    }

    if (type === "reserve") {
      const addBtn = U.createEl("button", {
        className: "secondary-btn",
        text: "Add to Party"
      });

      U.on(addBtn, "click", () => {
        try {
          const ok = animals.moveReserveCompanionToActive?.(companion.id);
          if (ok) {
            S.addToast(`${companion.name || "Companion"} joined the active party.`, "success");
            renderEverything();
          }
        } catch (err) {
          S.addToast(err.message || "Could not add to party.", "error");
        }
      });

      actions.appendChild(addBtn);
    }

    if (companion.sourceSpecimenId) {
      const cryoBtn = U.createEl("button", {
        className: "ghost-btn",
        text: "Return Specimen to Cryo"
      });

      U.on(cryoBtn, "click", () => {
        try {
          const ok = animals.moveSpecimenToCryo?.(companion.sourceSpecimenId);
          if (ok) {
            S.addToast(`${companion.name || "Companion"} returned to Cryo.`, "success");
            renderEverything();
          }
        } catch (err) {
          S.addToast(err.message || "Could not return to cryo.", "error");
        }
      });

      actions.appendChild(cryoBtn);
    }

    host.appendChild(actions);
  }

  function renderHabitatDetailActions(host, habitat) {
    const animals = getAnimalsApi();
    if (!host || !habitat || !animals) return;

    const occupantIds = U.toArray(habitat.occupants);
    const specimens = U.toArray(S.getBase()?.specimens);
    const occupants = occupantIds
      .map((id) => specimens.find((spec) => spec.id === id))
      .filter(Boolean);

    const assignable = specimens.filter((spec) => {
      if (occupantIds.includes(spec.id)) return false;
      if (spec.storage === "party" || spec.storage === "reserve") return false;

      if (animals.canAssignSpecimenToHabitat) {
        return animals.canAssignSpecimenToHabitat(spec.id, habitat.id, habitat.hostTarget || "base").ok;
      }

      return true;
    });

    const wrap = U.createEl("div", { className: "habitat-management-block" });

    wrap.innerHTML = `
      <h4>Occupants</h4>
      ${
        occupants.length
          ? occupants.map((spec) => `
            <div class="card compact-card">
              <div class="meta-title">${htmlEscape(getSpecimenDisplayName(spec))}</div>
              <div class="meta-sub">Hunger ${htmlEscape(String(Math.round(spec.needs?.hunger ?? 0)))} • Comfort ${htmlEscape(String(Math.round(spec.needs?.comfort ?? 0)))} • Clean ${htmlEscape(String(Math.round(spec.needs?.cleanliness ?? 0)))}</div>
              <div class="admin-console-actions">
                <button class="ghost-btn habitat-feed-btn" data-specimen-id="${htmlEscape(spec.id)}">Feed</button>
                <button class="secondary-btn habitat-party-btn" data-specimen-id="${htmlEscape(spec.id)}">Add to Party</button>
                <button class="ghost-btn habitat-cryo-btn" data-specimen-id="${htmlEscape(spec.id)}">Move to Cryo</button>
                <button class="secondary-btn habitat-breed-btn" data-specimen-id="${htmlEscape(spec.id)}">Breed</button>
              </div>
            </div>
          `).join("")
          : `<p>No occupants assigned.</p>`
      }

      <h4>Assign Capture to This Habitat</h4>
      ${
        assignable.length
          ? `
            <select id="habitatAssignSelect">
              ${assignable.map((spec) => `
                <option value="${htmlEscape(spec.id)}">${htmlEscape(getSpecimenDisplayName(spec))} — ${htmlEscape(U.titleCase(spec.speciesId))}</option>
              `).join("")}
            </select>
            <div class="admin-console-actions">
              <button id="btnAssignToHabitat" class="primary-btn">Assign Selected</button>
            </div>
          `
          : `<p>No compatible unassigned/cryo captures available.</p>`
      }
    `;

    host.appendChild(wrap);

    U.qsa(".habitat-feed-btn", wrap).forEach((btn) => {
      U.on(btn, "click", () => {
        try {
          const ok = animals.feedSpecimen?.(btn.dataset.specimenId);
          if (ok) renderEverything();
        } catch (err) {
          S.addToast(err.message || "Could not feed.", "error");
        }
      });
    });

    U.qsa(".habitat-party-btn", wrap).forEach((btn) => {
      U.on(btn, "click", () => {
        try {
          const ok = animals.addSpecimenToParty?.(btn.dataset.specimenId);
          if (ok) renderEverything();
        } catch (err) {
          S.addToast(err.message || "Could not add to party.", "error");
        }
      });
    });

    U.qsa(".habitat-cryo-btn", wrap).forEach((btn) => {
      U.on(btn, "click", () => {
        try {
          const ok = animals.moveSpecimenToCryo?.(btn.dataset.specimenId);
          if (ok) renderEverything();
        } catch (err) {
          S.addToast(err.message || "Could not move to cryo.", "error");
        }
      });
    });

    U.qsa(".habitat-breed-btn", wrap).forEach((btn) => {
      U.on(btn, "click", () => {
        M.openModal("breedingModal");
        getBreedingApi()?.setParentA?.(btn.dataset.specimenId);
        getBreedingApi()?.renderBreedingPanel?.();
      });
    });

    const assignBtn = el("btnAssignToHabitat");
    const assignSelect = el("habitatAssignSelect");

    if (assignBtn && assignSelect) {
      U.on(assignBtn, "click", () => {
        try {
          const ok = animals.assignSpecimenToHabitat?.(assignSelect.value, habitat.id, habitat.hostTarget || "base");
          if (ok) {
            S.addToast("Assigned to habitat.", "success");
            renderEverything();
          }
        } catch (err) {
          S.addToast(err.message || "Could not assign to habitat.", "error");
        }
      });
    }
  }

  function renderPartyDetail(entry) {
    const detail = el("partyMemberDetail");
    if (!detail) return;

    if (!entry) {
      detail.innerHTML = `
        <h3>Party Management</h3>
        <p>Select an active party member, reserve creature, capture, or habitat.</p>
        <p>This is now the main place to manage captured animals, party assignment, reserve status, Cryo storage, habitats, feeding, breeding, and release.</p>
      `;
      return;
    }

    const d = entry.data || {};

    if (entry.type === "player") {
      detail.innerHTML = `
        <h3>${htmlEscape(entry.name)}</h3>
        <p>${htmlEscape(entry.subtitle)}</p>
        <p><strong>Health:</strong> ${htmlEscape(String(d?.stats?.health ?? 0))}/${htmlEscape(String(d?.stats?.maxHealth ?? 0))}</p>
        <p><strong>Stamina:</strong> ${htmlEscape(String(d?.stats?.stamina ?? 0))}/${htmlEscape(String(d?.stats?.maxStamina ?? 0))}</p>
        <p><strong>Traits:</strong> ${htmlEscape(U.toArray(d?.traits).join(", ") || "None")}</p>
      `;
      return;
    }

    if (entry.type === "habitat") {
      const occupants = U.toArray(d.occupants);
      detail.innerHTML = `
        <h3>${htmlEscape(entry.name)}</h3>
        <p>${htmlEscape(entry.subtitle)}</p>
        <p><strong>Type:</strong> ${htmlEscape(U.titleCase(d.habitatType || "general"))}</p>
        <p><strong>Capacity:</strong> ${htmlEscape(String(occupants.length))}/${htmlEscape(String(d.capacity || 2))}</p>
        <p><strong>Comfort:</strong> ${htmlEscape(String(Math.round(d.comfort ?? 70)))}</p>
        <p><strong>Cleanliness:</strong> ${htmlEscape(String(Math.round(d.cleanliness ?? 75)))}</p>
        <p><strong>Host:</strong> ${htmlEscape(U.titleCase(d.hostTarget || "base"))}</p>
      `;
      renderHabitatDetailActions(detail, d);
      return;
    }

    if (entry.type === "capture") {
      const needs = d.needs || {};
      detail.innerHTML = `
        <h3>${htmlEscape(entry.name)}</h3>
        <p>${htmlEscape(entry.subtitle)}</p>
        <p><strong>Location:</strong> ${htmlEscape(getSpecimenLocationLabel(d))}</p>
        <p><strong>Species:</strong> ${htmlEscape(U.titleCase(d.speciesId || "unknown"))}</p>
        <p><strong>Family:</strong> ${htmlEscape(U.titleCase(d.family || "unknown"))}</p>
        <p><strong>Habitat Type:</strong> ${htmlEscape(U.titleCase(d.habitatType || "general"))}</p>
        <p><strong>Health:</strong> ${htmlEscape(String(d?.stats?.health ?? 0))}/${htmlEscape(String(d?.stats?.maxHealth ?? 0))}</p>
        <p><strong>Hunger:</strong> ${htmlEscape(String(Math.round(needs.hunger ?? 0)))}</p>
        <p><strong>Thirst:</strong> ${htmlEscape(String(Math.round(needs.thirst ?? 100)))}</p>
        <p><strong>Comfort:</strong> ${htmlEscape(String(Math.round(needs.comfort ?? 0)))}</p>
        <p><strong>Cleanliness:</strong> ${htmlEscape(String(Math.round(needs.cleanliness ?? 0)))}</p>
        <p><strong>Traits:</strong> ${htmlEscape(U.toArray(d?.traits).join(", ") || "None")}</p>
        <p><strong>Mutations:</strong> ${htmlEscape(U.toArray(d?.mutations).join(", ") || "None")}</p>
      `;
      renderSpecimenActionButtons(detail, d);
      return;
    }

    const needs = d.needs || {};
    detail.innerHTML = `
      <h3>${htmlEscape(entry.name)}</h3>
      <p>${htmlEscape(entry.subtitle)}</p>
      <p><strong>Health:</strong> ${htmlEscape(String(d?.stats?.health ?? 0))}/${htmlEscape(String(d?.stats?.maxHealth ?? 0))}</p>
      <p><strong>Stamina:</strong> ${htmlEscape(String(d?.stats?.stamina ?? 0))}/${htmlEscape(String(d?.stats?.maxStamina ?? 0))}</p>
      <p><strong>Hunger:</strong> ${htmlEscape(String(Math.round(needs.hunger ?? 75)))}</p>
      <p><strong>Thirst:</strong> ${htmlEscape(String(Math.round(needs.thirst ?? 75)))}</p>
      <p><strong>Traits:</strong> ${htmlEscape(U.toArray(d?.traits).join(", ") || "None")}</p>
    `;

    renderCompanionActionButtons(detail, d, entry.type);
  }

  function renderPartyModal() {
    const list = el("partyMemberList");
    const detail = el("partyMemberDetail");
    if (!list || !detail) return;

    renderPartyModeButtons();
    U.emptyEl(list);

    if (state.partyModalMode === "captures") {
      const toolbar = U.createEl("div", { className: "card capture-filter-card" });
      const speciesOptions = U.uniqueBy(U.toArray(S.getBase()?.specimens).map((spec) => spec.family || spec.speciesId).filter(Boolean), (x) => String(x));
      toolbar.innerHTML = `
        <div class="meta-title">Capture Filters</div>
        <div class="capture-filter-grid">
          <input id="partyCaptureSearch" type="text" placeholder="Search captures..." value="${htmlEscape(state.partyCaptureSearch || "")}" />
          <select id="partyCaptureFilter">
            <option value="all">All Captures</option>
            <option value="cryo">In Cryo</option>
            <option value="reserve">In Reserve</option>
            <option value="habitat">In Habitats</option>
            <option value="bred">Bred</option>
            <option value="grabbed">Grabbed/Captured</option>
            ${speciesOptions.map((option) => `<option value="${htmlEscape(String(option).toLowerCase())}">${htmlEscape(U.titleCase(option))}</option>`).join("")}
          </select>
          <select id="partyCaptureSort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="species">Animal Type</option>
          </select>
        </div>
        <div class="admin-console-actions" style="margin-top:.6rem;">
          <button id="btnFeedWaterAllCaptures" class="secondary-btn">Feed & Water All</button>
          <button id="btnCleanAllCaptures" class="ghost-btn">Clean All</button>
          <button id="btnComfortAllCaptures" class="ghost-btn">Comfort All</button>
        </div>
      `;
      list.appendChild(toolbar);

      const filterEl = toolbar.querySelector("#partyCaptureFilter");
      const sortEl = toolbar.querySelector("#partyCaptureSort");
      const searchEl = toolbar.querySelector("#partyCaptureSearch");
      if (filterEl) filterEl.value = state.partyCaptureFilter || "all";
      if (sortEl) sortEl.value = state.partyCaptureSort || "newest";

      U.on(filterEl, "change", () => { state.partyCaptureFilter = filterEl.value || "all"; renderPartyModal(); });
      U.on(sortEl, "change", () => { state.partyCaptureSort = sortEl.value || "newest"; renderPartyModal(); });
      U.on(searchEl, "input", U.debounce(() => { state.partyCaptureSearch = searchEl.value || ""; renderPartyModal(); }, 140));

      const animals = getAnimalsApi();
      U.on(toolbar.querySelector("#btnFeedWaterAllCaptures"), "click", () => { animals?.feedAndWaterAll?.(); renderEverything(); });
      U.on(toolbar.querySelector("#btnCleanAllCaptures"), "click", () => { animals?.cleanAll?.(); renderEverything(); });
      U.on(toolbar.querySelector("#btnComfortAllCaptures"), "click", () => { animals?.comfortAll?.(); renderEverything(); });
    }

    const entries = getPartyEntriesForMode();

    if (!entries.length) {
      list.appendChild(U.createEl("div", {
        className: "card",
        text: state.partyModalMode === "captures"
          ? "No captured animals yet."
          : state.partyModalMode === "habitats"
            ? "No habitats built yet."
            : "No entries in this list."
      }));
      renderPartyDetail(null);
      return;
    }

    entries.forEach((entry) => {
      const card = U.createEl("div", { className: "card party-management-card" });
      card.innerHTML = `
        <div class="meta-title">${htmlEscape(entry.name)}</div>
        <div class="meta-sub">${htmlEscape(entry.subtitle)}</div>
      `;

      U.on(card, "click", () => {
        U.qsa(".party-management-card", list).forEach((node) => node.classList.remove("selected"));
        card.classList.add("selected");
        renderPartyDetail(entry);
      });

      list.appendChild(card);
    });

    renderPartyDetail(null);
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
      <p><strong>Modules:</strong> ${htmlEscape(String(U.toArray(boat?.modules).length))}</p>
      <p><strong>Boat Habitats:</strong> ${htmlEscape(String(U.toArray(boat?.habitats).length))}</p>
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
    const animals = getAnimalsApi();

    const cryoCount = U.toArray(base?.cryoFridge).length;
    const habitatCount = U.toArray(base?.habitats).length;
    const specimenCount = U.toArray(base?.specimens).length;
    const structures = U.toArray(base?.structures);

    host.innerHTML = `
      <div class="base-overview-root">
        <h3>${htmlEscape(base?.name || "Field Station Alpha")}</h3>
        <div class="overview-stat-grid">
          <div class="card"><strong>Structures</strong><br>${htmlEscape(String(structures.length))}</div>
          <div class="card"><strong>Habitats</strong><br>${htmlEscape(String(habitatCount))}</div>
          <div class="card"><strong>Captures</strong><br>${htmlEscape(String(specimenCount))}</div>
          <div class="card"><strong>Cryo Stored</strong><br>${htmlEscape(String(cryoCount))}</div>
          <div class="card"><strong>Traps</strong><br>${htmlEscape(String(U.toArray(base?.traps).length))}</div>
          <div class="card"><strong>Crafting Jobs</strong><br>${htmlEscape(String(U.toArray(base?.craftingQueues).length))}</div>
        </div>

        <h4>Built Structures</h4>
        <div class="card-list">
          ${
            structures.length
              ? structures.map((entry) => {
                const def = S.getStructureDef(entry.structureId);
                return `
                  <div class="card compact-card">
                    <div class="meta-title">${htmlEscape(def?.name || U.titleCase(entry.structureId))} x${htmlEscape(String(entry.quantity || 1))}</div>
                    <div class="meta-sub">${htmlEscape(def?.description || "")}</div>
                  </div>
                `;
              }).join("")
              : `<div class="card">No structures built.</div>`
          }
        </div>

        <h4>Habitat Snapshot</h4>
        <div class="card-list">
          ${
            U.toArray(base?.habitats).length
              ? U.toArray(base?.habitats).map((hab) => `
                <div class="card compact-card">
                  <div class="meta-title">${htmlEscape(hab.name || U.titleCase(hab.structureId || "Habitat"))}</div>
                  <div class="meta-sub">${htmlEscape(U.titleCase(hab.habitatType || "general"))} • ${htmlEscape(String(U.toArray(hab.occupants).length))}/${htmlEscape(String(hab.capacity || 2))}</div>
                  <button class="secondary-btn base-manage-habitat-btn" data-habitat-id="${htmlEscape(hab.id)}">Manage in Party</button>
                </div>
              `).join("")
              : `<div class="card">No habitats yet.</div>`
          }
        </div>

        <div class="admin-console-actions">
          <button id="btnBaseOpenBuild" class="primary-btn">Open Build Menu</button>
          <button id="btnBaseOpenPartyCaptures" class="secondary-btn">Manage Captures</button>
          <button id="btnBaseOpenTraps" class="secondary-btn">Open Trap Yard</button>
        </div>
      </div>
    `;

    U.qsa(".base-manage-habitat-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.partyModalMode = "habitats";
        M.openModal("partyModal");
        renderPartyModal();
      });
    });

    const openBuild = el("btnBaseOpenBuild");
    const openCaptures = el("btnBaseOpenPartyCaptures");
    const openTraps = el("btnBaseOpenTraps");

    if (openBuild) {
      U.on(openBuild, "click", () => {
        M.openModal("buildModal");
        renderBuildModal();
      });
    }

    if (openCaptures) {
      U.on(openCaptures, "click", () => {
        state.partyModalMode = "captures";
        M.openModal("partyModal");
        renderPartyModal();
      });
    }

    if (openTraps) {
      U.on(openTraps, "click", () => {
        M.openModal("trapsModal");
        renderTrapsModal();
      });
    }

    void animals;
  }

  function renderBuildModal() {
    const buildApi = getBuildApi();
    if (buildApi?.renderBuildPanels) {
      buildApi.renderBuildPanels("buildPanelContent");
      return;
    }

    const host = el("buildPanelContent");
    if (!host) return;

    const structures = U.toArray(S.getData()?.structures);
    host.innerHTML = `
      <h3>Build & Structures</h3>
      <p>Build system not ready yet.</p>
      <div class="card-list">
        ${
          structures.length
            ? structures.map((def) => `
              <div class="card">
                <div class="meta-title">${htmlEscape(def.name || U.titleCase(def.id))}</div>
                <div class="meta-sub">${htmlEscape(def.description || "")}</div>
              </div>
            `).join("")
            : `<div class="card">No structures loaded.</div>`
        }
      </div>
    `;
  }

  function renderTrapsModal() {
    const buildApi = getBuildApi();
    if (buildApi?.renderTrapPanel) {
      buildApi.renderTrapPanel("trapPanelContent");
      return;
    }

    const host = el("trapPanelContent");
    if (!host) return;

    const traps = U.toArray(S.getBase()?.traps);
    host.innerHTML = `
      <h3>Trap Yard</h3>
      <p>Trap management system not ready yet.</p>
      <div class="card-list">
        ${
          traps.length
            ? traps.map((trap) => `
              <div class="card">
                <div class="meta-title">${htmlEscape(trap.name || U.titleCase(trap.trapType || "Trap"))}</div>
                <div class="meta-sub">${htmlEscape(trap.status || "idle")}</div>
              </div>
            `).join("")
            : `<div class="card">No traps placed.</div>`
        }
      </div>
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
      <p><strong>POI Count Here:</strong> ${htmlEscape(String(U.toArray(tile?.pointsOfInterest).filter((poi) => !isPoiResolved(poi)).length))}</p>
      <p><strong>Visible Nearby POIs:</strong> ${htmlEscape(String(getVisibleNearbyPois(5).length))}</p>
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
    const preview = el("characterPreviewAvatar") || el("creatorPreviewAvatar") || document.querySelector(".avatar-preview");
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
    const preserveOpenModal = Boolean(window.GL_UI_STABILITY?.shouldPreserveOpenModalState?.());

    renderHud();
    renderStatusEffects();
    renderTrackedTasks();
    renderPartyMini();
    renderNearbyList();
    renderActivityLog();

    // Passive ticks and broad renderEverything() calls should not rebuild open modal bodies.
    // Rebuilding the DOM is what made submenus jump back to their main tab every few seconds.
    if (!preserveOpenModal) {
      renderInventoryModal();
      renderPartyModal();
      renderBoatModal();
      renderBaseModal();
      renderBuildModal();
      renderTrapsModal();
      renderCraftModal();
      renderDnaModal();
      renderFishingModal();
      renderJournalModal();
      renderTutorialModal();
      renderSettingsModal();
      renderAdminModal();
      renderMapModal();
    }

    renderCombatShell();
    renderMiniMapVisibility();
    renderSidebarCollapseStates();
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
        M.openModal("creditsModal");
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
        fishingModal: "btnFish",
        buildModal: "btnBuild",
        trapsModal: "btnTraps",
        baseModal: "btnBase"
      }[modalId];

      const btn = btnId ? el(btnId) : null;
      if (!btn) return;

      U.on(btn, "click", () => {
        M.openModal(modalId);
        afterOpen?.();
      });
    };

    openModal("inventoryModal", renderInventoryModal);
    openModal("partyModal", () => {
      state.partyModalMode = "active";
      renderPartyModal();
    });
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
    openModal("baseModal", renderBaseModal);
    openModal("buildModal", renderBuildModal);
    openModal("trapsModal", renderTrapsModal);

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

  function renderSidebarCollapseStates() {
    Object.entries(state.rightPanelCollapsed).forEach(([bodyId, collapsed]) => {
      const body = el(bodyId);
      const btn = U.qs(`[data-collapse-target="${bodyId}"]`);

      if (body) {
        body.classList.toggle("collapsed", Boolean(collapsed));
        body.style.display = collapsed ? "none" : "";
      }

      if (btn) {
        btn.textContent = collapsed ? "Show" : "Hide";
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
    });
  }

  function bindSidebarCollapsers() {
    U.qsa(".sidebar-collapse-btn").forEach((btn) => {
      if (btn.dataset.boundCollapse === "true") return;
      btn.dataset.boundCollapse = "true";

      U.on(btn, "click", () => {
        const target = btn.dataset.collapseTarget;
        if (!target) return;
        state.rightPanelCollapsed[target] = !Boolean(state.rightPanelCollapsed[target]);
        renderSidebarCollapseStates();
      });
    });

    renderSidebarCollapseStates();
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
      renderBuildModal();
      renderTrapsModal();
      renderPartyModal();
      renderDnaModal();
    });

    U.eventBus.on("boat:changed", () => {
      renderBoatModal();
      renderBuildModal();
      renderPartyModal();
    });

    U.eventBus.on("quests:changed", () => {
      renderTrackedTasks();
      renderJournalModal();
    });

    U.eventBus.on("inventory:changed", () => {
      renderInventoryModal();
      renderCraftModal();
      renderBuildModal();
      renderTrapsModal();
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
    bindSidebarCollapsers();
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
    renderBuildModal,
    renderTrapsModal,
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
    renderSidebarCollapseStates,
    applyUiSettings,
    populateCharacterCreator,
    updateCreatorPreview,
    renderEverything,
    getVisibleNearbyPois,
    setPartyTab
  };

  window.GL_UI = API;

  return Object.freeze(API);
})();