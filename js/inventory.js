window.GrabLabInventory = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedTarget: "player", // inventory location: player | base | boat
    selectedUseTargetId: "player", // eat/drink target: player or companion id
    selectedSort: "name",
    selectedTransferSource: "player",
    selectedTransferDestination: "base",
    searchTerm: ""
  };

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getTargets() {
    return ["player", "base", "boat"];
  }

  function getTargetLabel(target) {
    switch (target) {
      case "player": return "Backpack";
      case "base": return "Base Storage";
      case "boat": return "Boat Storage";
      default: return U.titleCase(target || "inventory");
    }
  }

  function getInventory(target = "player") {
    return U.toArray(S.getInventory(target));
  }

  function getHydratedInventory(target = "player") {
    return S.hydrateInventoryEntries(getInventory(target)).map((entry) => {
      const def = entry.def || S.getItemDef(entry.itemId) || {};

      return {
        ...entry,
        def,
        name: def.name || U.titleCase(entry.itemId || "item"),
        description: def.description || "",
        tags: U.toArray(def.tags),
        effects: U.toArray(def.effects),
        weight: Number(def.weight || 1),
        stackable: def.stackable !== false,
        type: def.type || "item",
        equippableSlots: U.toArray(def.equippableSlots || def.slots),
        usable: Boolean(def.usable || U.toArray(def.effects).length),
        transferLocked: Boolean(def.transferLocked),
        value: Number(def.value || 0)
      };
    });
  }

  function getInventoryCapacity(target = "player") {
    if (target === "player") return Number(CFG.INVENTORY?.playerSlots || 32);
    if (target === "boat") {
      const bonus = Number(S.getBoat()?.storageSlotsBonus || 0);
      return Number(CFG.INVENTORY?.boatSlots || 24) + bonus;
    }
    if (target === "base") {
      const bonus = Number(S.getBase()?.storageSlotsBonus || 0);
      return Number(CFG.INVENTORY?.baseStorageSlots || 60) + bonus;
    }
    return 0;
  }

  function getUsedSlots(target = "player") {
    return getInventory(target).length;
  }

  function getFreeSlots(target = "player") {
    return Math.max(0, getInventoryCapacity(target) - getUsedSlots(target));
  }

  function canAddToInventory(target = "player", itemId = null, quantity = 1) {
    const inventory = getInventory(target);
    const def = S.getItemDef(itemId);

    if (!itemId) return { ok: false, reason: "Missing item ID." };

    const stackable = def?.stackable !== false;
    const existingStack = inventory.find((entry) => entry.itemId === itemId && !entry.uniqueId);

    if (stackable && existingStack) {
      return { ok: true };
    }

    if (getFreeSlots(target) <= 0) {
      return { ok: false, reason: `${getTargetLabel(target)} is full.` };
    }

    void quantity;
    return { ok: true };
  }

  function addItem(target = "player", itemId, quantity = 1, extra = {}) {
    const check = canAddToInventory(target, itemId, quantity);
    if (!check.ok) {
      throw new Error(check.reason);
    }

    S.addItem(target, itemId, quantity, extra);

    if (target === "player") {
      P.recalcEncumbrance?.();
    }

    return true;
  }

  function removeItem(target = "player", itemId, quantity = 1) {
    const ok = S.removeItem(target, itemId, quantity);
    if (ok && target === "player") {
      P.recalcEncumbrance?.();
    }
    return ok;
  }

  function transferItem(itemId, quantity = 1, from = "player", to = "base") {
    if (!itemId) {
      throw new Error("Missing item ID.");
    }

    if (from === to) {
      throw new Error("Source and destination cannot match.");
    }

    if (!S.hasItem(from, itemId, quantity)) {
      throw new Error(`${getTargetLabel(from)} does not have enough of that item.`);
    }

    const def = S.getItemDef(itemId);
    if (def?.transferLocked) {
      throw new Error(`${def.name || itemId} cannot be transferred.`);
    }

    const check = canAddToInventory(to, itemId, quantity);
    if (!check.ok) {
      throw new Error(check.reason);
    }

    S.removeItem(from, itemId, quantity);
    S.addItem(to, itemId, quantity);

    if (from === "player" || to === "player") {
      P.recalcEncumbrance?.();
    }

    S.logActivity(
      `Transferred ${quantity} ${def?.name || U.titleCase(itemId)} from ${getTargetLabel(from)} to ${getTargetLabel(to)}.`,
      "info"
    );

    renderInventoryPanel();
    UI.renderEverything?.();
    return true;
  }

  function splitStack(itemId, quantity = 1, from = "player", to = "base") {
    return transferItem(itemId, quantity, from, to);
  }

  function sortEntries(entries = [], mode = "name") {
    const safe = [...entries];

    switch (mode) {
      case "qty":
        return safe.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
      case "weight":
        return safe.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
      case "value":
        return safe.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
      case "type":
        return safe.sort((a, b) => String(a.type || "").localeCompare(String(b.type || "")));
      case "name":
      default:
        return safe.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
  }

  function normalizeSearchTerm(value = "") {
    return String(value || "").trim().toLowerCase();
  }

  function setSearchTerm(value = "") {
    state.searchTerm = String(value || "");
    syncSearchInputs();
    renderInventoryPanel();
    return state.searchTerm;
  }

  function getSearchTerm() {
    return state.searchTerm || "";
  }

  function getSearchInputEls(root = document) {
    return [
      U.byId("inventorySearchInput"),
      U.byId("inventorySearch"),
      U.byId("inventoryFilterInput"),
      U.byId("inventorySearchInputAuto"),
      ...U.qsa(".inventory-search-input", root)
    ].filter(Boolean);
  }

  function syncSearchInputs() {
    const term = getSearchTerm();
    getSearchInputEls().forEach((input) => {
      if (input && input.value !== term) {
        input.value = term;
      }
    });
  }

  function matchesSearch(entry, term = "") {
    const needle = normalizeSearchTerm(term);
    if (!needle) return true;

    const haystack = [
      entry?.name || "",
      entry?.itemId || "",
      entry?.description || "",
      entry?.type || "",
      ...U.toArray(entry?.tags)
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  }

  function getFilteredEntries(target = state.selectedTarget, sortMode = state.selectedSort, term = state.searchTerm) {
    const entries = getHydratedInventory(target)
      .filter((entry) => matchesSearch(entry, term));

    return sortEntries(entries, sortMode);
  }

  function getSelectedEntry() {
    return S.getRuntime()?.selectedInventoryEntry || null;
  }

  function selectEntry(entry) {
    S.setSelectedInventoryEntry(entry || null);
    renderInventoryDetail(entry || null, true);
    return entry;
  }

  function getUseTargets() {
    const player = S.getPlayer();
    const party = S.getParty();

    const targets = [
      {
        id: "player",
        type: "player",
        name: player?.name || "You",
        label: "You",
        subtitle: "Player"
      }
    ];

    U.toArray(party?.active).forEach((member) => {
      targets.push({
        id: member.id,
        type: "companion",
        companionScope: "active",
        name: member.name || "Companion",
        label: member.name || "Companion",
        subtitle: `${U.titleCase(member.speciesId || "creature")} • Active`
      });
    });

    U.toArray(party?.reserve).forEach((member) => {
      targets.push({
        id: member.id,
        type: "companion",
        companionScope: "reserve",
        name: member.name || "Reserve",
        label: `${member.name || "Reserve"} (Reserve)`,
        subtitle: `${U.titleCase(member.speciesId || "creature")} • Reserve`
      });
    });

    if (!targets.some((target) => target.id === state.selectedUseTargetId)) {
      state.selectedUseTargetId = "player";
    }

    return targets;
  }

  function getUseTargetById(targetId = state.selectedUseTargetId) {
    return getUseTargets().find((target) => target.id === targetId) || getUseTargets()[0];
  }

  function setUseTarget(targetId = "player") {
    state.selectedUseTargetId = targetId || "player";
    renderInventoryPanel();
    return state.selectedUseTargetId;
  }

  function getCompanionById(companionId) {
    const party = S.getParty();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);

    return {
      companion: active.find((entry) => entry.id === companionId) || reserve.find((entry) => entry.id === companionId) || null,
      scope: active.some((entry) => entry.id === companionId) ? "active" : "reserve"
    };
  }

  function updateCompanion(companionId, patch = {}) {
    const party = S.getParty();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);

    const activeIndex = active.findIndex((entry) => entry.id === companionId);
    if (activeIndex >= 0) {
      active[activeIndex] = U.deepMerge(active[activeIndex], patch);
      S.updateParty({ active });
      return active[activeIndex];
    }

    const reserveIndex = reserve.findIndex((entry) => entry.id === companionId);
    if (reserveIndex >= 0) {
      reserve[reserveIndex] = U.deepMerge(reserve[reserveIndex], patch);
      S.updateParty({ reserve });
      return reserve[reserveIndex];
    }

    return null;
  }

  function applyItemEffectsToTarget(itemId, targetId = state.selectedUseTargetId, quantity = 1) {
    const def = S.getItemDef(itemId);
    if (!def) return false;

    const effects = U.toArray(def.effects);
    const target = getUseTargetById(targetId);

    if (!target) {
      S.addToast("No use target selected.", "error");
      return false;
    }

    if (!effects.length) {
      S.addToast(`${def.name || itemId} has no direct use effect.`, "warning");
      return false;
    }

    if (!S.hasItem("player", itemId, quantity)) {
      S.addToast(`You need ${def.name || itemId} in your backpack to use it.`, "warning");
      return false;
    }

    if (target.type === "player") {
      effects.forEach((effect) => {
        if (!effect?.stat) return;
        S.modifyPlayerStat?.(effect.stat, Number(effect.value || 0) * quantity);
      });

      S.removeItem("player", itemId, quantity);
      P.recalcEncumbrance?.();

      S.logActivity(`Used ${def.name || itemId} on ${S.getPlayer()?.name || "you"}.`, "success");
      S.addToast(`Used ${def.name || itemId} on You.`, "success");
      UI.renderEverything?.();
      return true;
    }

    const { companion } = getCompanionById(target.id);
    if (!companion) {
      S.addToast("Companion target not found.", "error");
      state.selectedUseTargetId = "player";
      renderInventoryPanel();
      return false;
    }

    const next = U.deepClone(companion);
    next.needs = next.needs || {};
    next.stats = next.stats || {};

    effects.forEach((effect) => {
      const stat = effect?.stat;
      const value = Number(effect?.value || 0) * quantity;
      if (!stat) return;

      if (["hunger", "thirst", "morale", "comfort"].includes(stat)) {
        next.needs[stat] = U.clamp(Number(next.needs[stat] ?? 50) + value, 0, 100);
      } else if (stat === "health") {
        next.stats.health = U.clamp(
          Number(next.stats.health ?? next.stats.maxHealth ?? 1) + value,
          0,
          Number(next.stats.maxHealth ?? 100)
        );
      } else if (stat === "stamina") {
        next.stats.stamina = U.clamp(
          Number(next.stats.stamina ?? next.stats.maxStamina ?? 1) + value,
          0,
          Number(next.stats.maxStamina ?? 100)
        );
      } else {
        next.needs[stat] = U.clamp(Number(next.needs[stat] ?? 0) + value, 0, 100);
      }
    });

    S.removeItem("player", itemId, quantity);
    P.recalcEncumbrance?.();
    updateCompanion(target.id, next);

    S.logActivity(`Used ${def.name || itemId} on ${target.name}.`, "success");
    S.addToast(`Used ${def.name || itemId} on ${target.label}.`, "success");
    UI.renderEverything?.();
    return true;
  }

  function getConsumableCandidates(kind = "food") {
    return getHydratedInventory("player").filter((entry) => {
      const tags = U.toArray(entry.tags);
      const effects = U.toArray(entry.effects);

      if (kind === "drink") {
        return tags.includes("drink") || effects.some((effect) => effect.stat === "thirst");
      }

      if (kind === "medicine") {
        return tags.includes("medicine") || effects.some((effect) => effect.stat === "health");
      }

      return tags.includes("food") || effects.some((effect) => effect.stat === "hunger");
    });
  }

  function getConsumableScore(entry, stat = "hunger") {
    const effect = U.toArray(entry.effects).find((e) => e.stat === stat);
    if (effect) return Number(effect.value || 0);
    if (stat === "thirst" && U.toArray(entry.tags).includes("drink")) return 8;
    if (stat === "hunger" && U.toArray(entry.tags).includes("food")) return 8;
    return 0;
  }

  function autoUseBest(kind = "food") {
    const stat = kind === "drink" ? "thirst" : "hunger";
    const candidates = getConsumableCandidates(kind);

    if (!candidates.length) {
      S.addToast(kind === "drink" ? "No drink available in backpack." : "No food available in backpack.", "warning");
      return false;
    }

    const best = candidates
      .sort((a, b) => getConsumableScore(b, stat) - getConsumableScore(a, stat))[0];

    if (!best) return false;

    return applyItemEffectsToTarget(best.itemId, state.selectedUseTargetId, 1);
  }

  function getItemActions(entry, target = "player") {
    if (!entry) return [];

    const def = entry.def || {};
    const actions = [];

    if (entry.usable && target === "player") {
      actions.push({ id: "use", label: "Use on Selected Target" });
    }

    if (U.toArray(entry.equippableSlots).length && target === "player") {
      actions.push({ id: "equip", label: "Equip" });
    }

    if (!def.transferLocked) {
      getTargets()
        .filter((dest) => dest !== target)
        .forEach((dest) => {
          actions.push({
            id: `move:${dest}`,
            label: `Move to ${getTargetLabel(dest)}`
          });
        });
    }

    actions.push({ id: "discard", label: "Discard 1" });

    return actions;
  }

  function performItemAction(entry, actionId, target = "player") {
    if (!entry || !actionId) return false;

    const itemId = entry.itemId;
    const def = entry.def || S.getItemDef(itemId) || {};

    if (actionId === "use") {
      const used = applyItemEffectsToTarget(itemId, state.selectedUseTargetId, 1);

      if (!used) {
        S.addToast(`Could not use ${def.name || itemId}.`, "error");
      }

      renderInventoryPanel();
      return used;
    }

    if (actionId === "equip") {
      const slots = U.toArray(def.equippableSlots || def.slots);
      if (!slots.length) {
        S.addToast("That item cannot be equipped.", "error");
        return false;
      }

      const equipped = P.equipItem?.(slots[0], itemId);
      if (equipped) {
        S.addToast(`Equipped ${def.name || itemId}.`, "success");
      } else {
        S.addToast(`Could not equip ${def.name || itemId}.`, "error");
      }
      renderInventoryPanel();
      return equipped;
    }

    if (actionId.startsWith("move:")) {
      const destination = actionId.split(":")[1];
      try {
        transferItem(itemId, 1, target, destination);
        S.addToast(`Moved ${def.name || itemId}.`, "success");
        return true;
      } catch (err) {
        S.addToast(err.message || "Transfer failed.", "error");
        return false;
      }
    }

    if (actionId === "discard") {
      const removed = removeItem(target, itemId, 1);
      if (removed) {
        S.logActivity(`Discarded 1 ${def.name || itemId}.`, "warning");
        S.addToast(`Discarded ${def.name || itemId}.`, "warning");
      }
      renderInventoryPanel();
      return removed;
    }

    return false;
  }

  function bindSearchInputs(root = document) {
    getSearchInputEls(root).forEach((input) => {
      if (input.dataset.inventorySearchBound === "true") return;
      input.dataset.inventorySearchBound = "true";

      U.on(input, "input", () => {
        state.searchTerm = input.value || "";
        syncSearchInputs();
        renderInventoryPanel();
      });
    });

    syncSearchInputs();
  }

  function renderUseTargetPanel(host) {
    const targets = getUseTargets();
    const targetButtons = targets.map((target) => `
      <button
        class="${state.selectedUseTargetId === target.id ? "primary-btn" : "ghost-btn"} inventory-use-target-btn"
        data-use-target-id="${htmlEscape(target.id)}"
        title="${htmlEscape(target.subtitle || "")}"
      >
        ${htmlEscape(target.label)}
      </button>
    `).join("");

    host.insertAdjacentHTML("beforeend", `
      <div class="card inventory-use-target-card" style="margin-bottom:1rem;">
        <div class="meta-title">Eat / Drink Target</div>
        <div class="meta-sub">Food and water are used from your backpack on the selected person or companion.</div>
        <div class="admin-console-actions" style="margin-top:.75rem;">${targetButtons}</div>
        <div class="admin-console-actions" style="margin-top:.75rem;">
          <button id="btnInventoryAutoEat" class="secondary-btn">Eat Best Food</button>
          <button id="btnInventoryAutoDrink" class="secondary-btn">Drink Best Water</button>
        </div>
      </div>
    `);

    U.qsa(".inventory-use-target-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.selectedUseTargetId = btn.dataset.useTargetId || "player";
        renderInventoryPanel();
      });
    });

    const eatBtn = U.byId("btnInventoryAutoEat");
    const drinkBtn = U.byId("btnInventoryAutoDrink");

    if (eatBtn) {
      U.on(eatBtn, "click", () => {
        autoUseBest("food");
        renderInventoryPanel();
      });
    }

    if (drinkBtn) {
      U.on(drinkBtn, "click", () => {
        autoUseBest("drink");
        renderInventoryPanel();
      });
    }
  }

  function renderInventoryHeader(host) {
    const targetOptions = getTargets()
      .map((target) => `
        <button
          class="${state.selectedTarget === target ? "primary-btn" : "ghost-btn"} inventory-target-btn"
          data-target="${htmlEscape(target)}"
        >
          ${htmlEscape(getTargetLabel(target))}
        </button>
      `)
      .join("");

    const sortOptions = [
      ["name", "Name"],
      ["qty", "Qty"],
      ["type", "Type"],
      ["weight", "Weight"],
      ["value", "Value"]
    ].map(([value, label]) => `
      <button
        class="${state.selectedSort === value ? "secondary-btn" : "ghost-btn"} inventory-sort-btn"
        data-sort="${htmlEscape(value)}"
      >
        ${htmlEscape(label)}
      </button>
    `).join("");

    host.insertAdjacentHTML("afterbegin", `
      <div class="card inventory-header-card" style="margin-bottom:1rem;">
        <div class="meta-title">Inventory Location</div>
        <div class="admin-console-actions" id="inventoryTargetButtons" style="margin-top:.55rem;">${targetOptions}</div>
        <div class="admin-console-actions" id="inventorySortButtons" style="margin-top:.75rem;">${sortOptions}</div>
        <div style="margin-top:.75rem;">
          <input
            id="inventorySearchInputAuto"
            class="inventory-search-input"
            type="text"
            placeholder="Search inventory..."
            value="${htmlEscape(getSearchTerm())}"
          />
        </div>
      </div>
    `);

    renderUseTargetPanel(host);

    U.qsa(".inventory-target-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.selectedTarget = btn.dataset.target || "player";
        S.setSelectedInventoryEntry(null);
        renderInventoryPanel();
      });
    });

    U.qsa(".inventory-sort-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.selectedSort = btn.dataset.sort || "name";
        renderInventoryPanel();
      });
    });

    bindSearchInputs(host);
  }

  function renderInventoryGrid(entries, target = "player") {
    const grid = U.byId("inventoryGrid");
    if (!grid) return;

    U.emptyEl(grid);

    if (!entries.length) {
      grid.appendChild(U.createEl("div", {
        className: "card",
        text: getSearchTerm()
          ? `No items in ${getTargetLabel(target)} match "${getSearchTerm()}".`
          : `${getTargetLabel(target)} is empty.`
      }));
      return;
    }

    entries.forEach((entry) => {
      const slot = U.createEl("div", {
        className: "inventory-slot",
        attrs: {
          "data-item-id": entry.itemId || "",
          "data-item-name": entry.name || U.titleCase(entry.itemId || "item")
        }
      });

      const name = entry.name || U.titleCase(entry.itemId || "item");
      slot.title = `${name}\nQty: ${entry.quantity}`;

      slot.innerHTML = `
        <div class="icon-thumb"></div>
        <div style="position:absolute;left:.3rem;right:.3rem;bottom:1.2rem;font-size:.68rem;line-height:1.05;text-align:center;color:var(--text);text-shadow:0 1px 2px rgba(0,0,0,.8);pointer-events:none;max-height:2.2em;overflow:hidden;">
          ${htmlEscape(name)}
        </div>
        <div class="qty">${htmlEscape(String(entry.quantity || 1))}</div>
      `;

      U.on(slot, "click", () => {
        selectEntry({ ...entry, inventoryTarget: target });
      });

      U.on(slot, "contextmenu", (evt) => {
        evt.preventDefault();
        selectEntry({ ...entry, inventoryTarget: target });
        renderInventoryDetail({ ...entry, inventoryTarget: target }, true);
      });

      grid.appendChild(slot);
    });
  }

  function renderInventoryDetail(entry = null, showActions = false) {
    const detail = U.byId("inventoryDetailContent");
    if (!detail) return;

    const useTarget = getUseTargetById();

    if (!entry) {
      detail.innerHTML = `
        <p>Select an item.</p>
        <p><strong>Selected eat/drink target:</strong> ${htmlEscape(useTarget?.label || "You")}</p>
        <p><strong>Backpack:</strong> ${getUsedSlots("player")}/${getInventoryCapacity("player")} slots</p>
        <p><strong>Base:</strong> ${getUsedSlots("base")}/${getInventoryCapacity("base")} slots</p>
        <p><strong>Boat:</strong> ${getUsedSlots("boat")}/${getInventoryCapacity("boat")} slots</p>
      `;
      return;
    }

    const target = entry.inventoryTarget || state.selectedTarget || "player";
    const actions = getItemActions(entry, target);

    detail.innerHTML = `
      <h4>${htmlEscape(entry.name)}</h4>
      <p>${htmlEscape(entry.description || "No description yet.")}</p>
      <p><strong>Quantity:</strong> ${htmlEscape(String(entry.quantity || 1))}</p>
      <p><strong>Type:</strong> ${htmlEscape(entry.type || "item")}</p>
      <p><strong>Weight:</strong> ${htmlEscape(String(entry.weight || 0))}</p>
      <p><strong>Tags:</strong> ${htmlEscape(U.toArray(entry.tags).join(", ") || "None")}</p>
      <p><strong>Location:</strong> ${htmlEscape(getTargetLabel(target))}</p>
      <p><strong>Use Target:</strong> ${htmlEscape(useTarget?.label || "You")}</p>
      <div id="inventoryActionButtons" class="admin-console-actions"></div>
    `;

    const actionHost = U.byId("inventoryActionButtons");
    if (!actionHost) return;

    if (showActions || actions.length) {
      actions.forEach((action) => {
        const btn = U.createEl("button", {
          className: action.id === "use" || action.id === "equip" ? "secondary-btn" : "ghost-btn",
          text: action.label
        });

        U.on(btn, "click", () => {
          performItemAction(entry, action.id, target);
        });

        actionHost.appendChild(btn);
      });
    }
  }

  function renderTransferSummary(detailEl) {
    if (!detailEl) return;

    const current = getSelectedEntry();
    if (!current) return;

    const from = current.inventoryTarget || state.selectedTarget || "player";
    const destinationOptions = getTargets()
      .filter((target) => target !== from)
      .map((target) => `
        <button
          class="ghost-btn inventory-direct-transfer-btn"
          data-dest="${htmlEscape(target)}"
        >
          Move 1 to ${htmlEscape(getTargetLabel(target))}
        </button>
      `)
      .join("");

    detailEl.insertAdjacentHTML("beforeend", `
      <hr />
      <h4>Quick Transfer</h4>
      <div class="admin-console-actions">${destinationOptions}</div>
    `);

    U.qsa(".inventory-direct-transfer-btn", detailEl).forEach((btn) => {
      U.on(btn, "click", () => {
        try {
          transferItem(current.itemId, 1, from, btn.dataset.dest);
        } catch (err) {
          S.addToast(err.message || "Transfer failed.", "error");
        }
      });
    });
  }

  function renderInventoryPanel() {
    const grid = U.byId("inventoryGrid");
    const detailWrap = U.byId("inventoryDetailContent");
    const modalBody = U.byId("inventoryModal")?.querySelector(".modal-body");

    if (!grid || !detailWrap || !modalBody) return;

    U.qsa(".inventory-header-card", modalBody).forEach((node) => node.remove());
    U.qsa(".inventory-use-target-card", modalBody).forEach((node) => node.remove());

    renderInventoryHeader(modalBody);

    const entries = getFilteredEntries(state.selectedTarget, state.selectedSort, state.searchTerm);
    renderInventoryGrid(entries, state.selectedTarget);

    const current = getSelectedEntry();
    const currentStillVisible = current && entries.some((entry) => {
      const currentTarget = current.inventoryTarget || state.selectedTarget;
      return currentTarget === state.selectedTarget && entry.itemId === current.itemId;
    });

    if (currentStillVisible && current && (current.inventoryTarget || state.selectedTarget) === state.selectedTarget) {
      renderInventoryDetail(current, true);
      renderTransferSummary(detailWrap);
    } else {
      if (current && !currentStillVisible) {
        S.setSelectedInventoryEntry(null);
      }
      renderInventoryDetail(null);
    }
  }

  function seedFallbackItemsIfNeeded() {
    const items = U.toArray(S.getData()?.items);
    if (items.length > 0) return false;

    const fallback = [
      {
        id: "berries_wild",
        name: "Wild Berries",
        description: "A little sour, a little suspicious, still technically food.",
        tags: ["food"],
        usable: true,
        weight: 1,
        value: 2,
        effects: [{ stat: "hunger", value: 8 }]
      },
      {
        id: "fresh_water",
        name: "Fresh Water",
        description: "Water. Pretty important, honestly.",
        tags: ["drink"],
        usable: true,
        weight: 1,
        value: 1,
        effects: [{ stat: "thirst", value: 12 }]
      },
      {
        id: "clean_water",
        name: "Clean Water",
        description: "Boiled, cleaner, slightly less risky.",
        tags: ["drink"],
        usable: true,
        weight: 1,
        value: 2,
        effects: [{ stat: "thirst", value: 16 }]
      },
      {
        id: "bandage_basic",
        name: "Basic Bandage",
        description: "A simple dressing for small injuries.",
        tags: ["medicine"],
        usable: true,
        weight: 1,
        value: 6,
        effects: [{ stat: "health", value: 16 }]
      },
      {
        id: "fishing_pole_basic",
        name: "Basic Fishing Pole",
        description: "A humble pole for catching humble fish.",
        tags: ["tool", "fishing"],
        equippableSlots: ["mainHand"],
        weight: 2,
        value: 12
      },
      {
        id: "field_knife",
        name: "Field Knife",
        description: "Handy for cutting, carving, and looking vaguely prepared.",
        tags: ["tool", "weapon"],
        equippableSlots: ["mainHand"],
        weight: 1,
        value: 14
      },
      {
        id: "fiber_bundle",
        name: "Fiber Bundle",
        description: "Plant fibers for building and crafting.",
        tags: ["resource"],
        weight: 1,
        value: 2
      },
      {
        id: "scrap_wood",
        name: "Scrap Wood",
        description: "Warped but still useful wood pieces.",
        tags: ["resource", "building"],
        weight: 2,
        value: 2
      },
      {
        id: "rope_bundle",
        name: "Rope Bundle",
        description: "Simple rope for building, traps, and boat work.",
        tags: ["resource", "building"],
        weight: 1,
        value: 4
      },
      {
        id: "bait_worm",
        name: "Worm Bait",
        description: "Irresistible to fish. Less appealing to everyone else.",
        tags: ["bait", "fishing", "food"],
        weight: 1,
        value: 2
      },
      {
        id: "improvised_snare_trap",
        name: "Improvised Snare Trap",
        description: "A rough reusable trap for small land creatures.",
        tags: ["trap"],
        trapType: "land",
        trapCatchChance: 0.34,
        trapCycleMinutes: 60,
        weight: 2,
        value: 10
      },
      {
        id: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A small woven trap for passive aquatic catches.",
        tags: ["trap", "fishing"],
        trapType: "water",
        trapCatchChance: 0.38,
        trapCycleMinutes: 75,
        weight: 2,
        value: 12
      },
      {
        id: "old_boot",
        name: "Old Boot",
        description: "Not food. Probably.",
        tags: ["junk"],
        weight: 1,
        value: 1
      },
      {
        id: "mold_sample_jar",
        name: "Mold Sample Jar",
        description: "A sealed jar of suspicious spores for research and crafting.",
        tags: ["resource", "science"],
        weight: 1,
        value: 5
      },
      {
        id: "luminous_spores",
        name: "Luminous Spores",
        description: "Pretty glowing spores. Definitely do not inhale.",
        tags: ["resource", "additive"],
        weight: 1,
        value: 9
      },
      {
        id: "chameleon_skin",
        name: "Shredded Chameleon Skin",
        description: "Used in breeding additives with stealth properties.",
        tags: ["resource", "additive"],
        weight: 1,
        value: 8
      },
      {
        id: "algae_bundle",
        name: "Algae Bundle",
        description: "Slimy biomass useful for feed, crafting, and bad smells.",
        tags: ["resource", "food"],
        usable: true,
        weight: 1,
        value: 3,
        effects: [{ stat: "hunger", value: 5 }]
      },
      {
        id: "alcohol_basic",
        name: "Field Alcohol",
        description: "Sanitizes, preserves, and occasionally improves morale.",
        tags: ["drink", "resource"],
        usable: true,
        weight: 1,
        value: 7,
        effects: [{ stat: "morale", value: 6 }, { stat: "focus", value: -2 }]
      },
      {
        id: "chameleon_juice",
        name: "Chameleon Juice",
        description: "A breeding additive that nudges offspring toward camouflage.",
        tags: ["additive", "breeding"],
        weight: 1,
        value: 15,
        breedingEffects: {
          preferredTraits: ["camouflage"],
          preferredMutations: ["camouflage"],
          mutationBonus: 0.05,
          note: "Boosts stealthy outcomes."
        }
      }
    ];

    S.replaceDataBucket("items", fallback);
    return true;
  }

  function bindInventoryEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "inventoryModal") {
        bindSearchInputs();
        renderInventoryPanel();
      }
    });

    U.eventBus.on("inventory:changed", () => {
      if (S.isModalOpen?.("inventoryModal")) {
        renderInventoryPanel();
      }
    });

    U.eventBus.on("player:changed", () => {
      if (S.isModalOpen?.("inventoryModal")) {
        renderInventoryPanel();
      }
    });

    U.eventBus.on("party:changed", () => {
      if (S.isModalOpen?.("inventoryModal")) {
        renderInventoryPanel();
      }
    });
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackItemsIfNeeded();
    bindInventoryEvents();
    bindSearchInputs();
    renderInventoryPanel();

    state.initialized = true;
    U.eventBus.emit("inventory:initialized");
    return true;
  }

  const API = {
    init,

    getTargets,
    getTargetLabel,
    getInventory,
    getHydratedInventory,
    getInventoryCapacity,
    getUsedSlots,
    getFreeSlots,

    canAddToInventory,
    addItem,
    removeItem,
    transferItem,
    splitStack,

    sortEntries,
    setSearchTerm,
    getSearchTerm,
    matchesSearch,
    getFilteredEntries,
    getSelectedEntry,
    selectEntry,

    getUseTargets,
    getUseTargetById,
    setUseTarget,
    applyItemEffectsToTarget,
    getConsumableCandidates,
    autoUseBest,

    getItemActions,
    performItemAction,

    renderUseTargetPanel,
    renderInventoryHeader,
    renderInventoryGrid,
    renderInventoryDetail,
    renderTransferSummary,
    renderInventoryPanel,

    seedFallbackItemsIfNeeded
  };

  window.GL_INVENTORY = API;

  return Object.freeze(API);
})();