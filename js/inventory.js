window.GrabLabInventory = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const P = window.GrabLabPlayer;
  const UI = window.GrabLabUI;

  const state = {
    initialized: false,
    selectedTarget: "player",
    selectedSort: "name",
    selectedTransferSource: "player",
    selectedTransferDestination: "base",
    selectedConsumerId: "player",
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
      const def = entry.def || {};
      return {
        ...entry,
        name: def.name || U.titleCase(entry.itemId || "item"),
        description: def.description || "",
        tags: U.toArray(def.tags),
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
    if (target === "player") return Number(CFG.INVENTORY.playerSlots || 32);
    if (target === "boat") {
      const bonus = Number(S.getBoat()?.storageSlotsBonus || 0);
      return Number(CFG.INVENTORY.boatSlots || 24) + bonus;
    }
    if (target === "base") {
      const bonus = Number(S.getBase()?.storageSlotsBonus || 0);
      return Number(CFG.INVENTORY.baseStorageSlots || 60) + bonus;
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
      P.recalcEncumbrance();
    }

    return true;
  }

  function removeItem(target = "player", itemId, quantity = 1) {
    const ok = S.removeItem(target, itemId, quantity);
    if (ok && target === "player") {
      P.recalcEncumbrance();
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
      P.recalcEncumbrance();
    }

    S.logActivity(
      `Transferred ${quantity} ${def?.name || U.titleCase(itemId)} from ${getTargetLabel(from)} to ${getTargetLabel(to)}.`,
      "info"
    );

    renderInventoryPanel();
    UI.renderEverything();
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
    renderInventoryDetail(entry || null);
    return entry;
  }

  function getConsumerTargets() {
    const player = S.getPlayer();
    const party = S.getParty();

    const targets = [
      {
        id: "player",
        type: "player",
        label: player?.name || CFG.PLAYER.startingName || "Player",
        sub: "You"
      }
    ];

    U.toArray(party?.active).forEach((member) => {
      targets.push({
        id: member.id,
        type: "companion",
        bucket: "active",
        label: member.name || "Companion",
        sub: `${U.titleCase(member.speciesId || member.classId || "active companion")}`
      });
    });

    U.toArray(party?.reserve).forEach((member) => {
      targets.push({
        id: member.id,
        type: "companion",
        bucket: "reserve",
        label: member.name || "Reserve Companion",
        sub: `${U.titleCase(member.speciesId || member.classId || "reserve companion")}`
      });
    });

    return targets;
  }

  function getSelectedConsumerId() {
    const targets = getConsumerTargets();
    const runtimeSelected = S.getRuntime()?.selectedPartyMemberId;

    if (runtimeSelected && targets.some((target) => target.id === runtimeSelected)) {
      state.selectedConsumerId = runtimeSelected;
    }

    if (!targets.some((target) => target.id === state.selectedConsumerId)) {
      state.selectedConsumerId = "player";
    }

    return state.selectedConsumerId;
  }

  function setSelectedConsumerId(targetId = "player") {
    const targets = getConsumerTargets();
    const safe = targets.some((target) => target.id === targetId) ? targetId : "player";

    state.selectedConsumerId = safe;

    if (safe !== "player") {
      S.updateRuntime({ selectedPartyMemberId: safe });
    }

    renderInventoryPanel();
    return safe;
  }

  function getConsumerTarget(targetId = getSelectedConsumerId()) {
    return getConsumerTargets().find((target) => target.id === targetId) || getConsumerTargets()[0];
  }

  function getCompanionById(companionId) {
    const party = S.getParty();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);

    const activeMatch = active.find((member) => member.id === companionId);
    if (activeMatch) return { member: activeMatch, bucket: "active" };

    const reserveMatch = reserve.find((member) => member.id === companionId);
    if (reserveMatch) return { member: reserveMatch, bucket: "reserve" };

    return null;
  }

  function getEffectValue(def, stat) {
    return U.toArray(def?.effects)
      .filter((effect) => effect?.stat === stat)
      .reduce((sum, effect) => sum + Number(effect.value || 0), 0);
  }

  function itemMatchesConsumableKind(def, kind = "food") {
    const tags = U.toArray(def?.tags);
    const effects = U.toArray(def?.effects);

    if (kind === "food") {
      return tags.includes("food") || effects.some((effect) => effect?.stat === "hunger");
    }

    if (kind === "drink") {
      return tags.includes("drink") || effects.some((effect) => effect?.stat === "thirst");
    }

    return Boolean(def?.usable || effects.length);
  }

  function getConsumableEntries(kind = "food", source = "all") {
    const sources = source === "all" ? getTargets() : [source];

    return sources.flatMap((target) => {
      return getHydratedInventory(target)
        .filter((entry) => itemMatchesConsumableKind(entry.def, kind))
        .map((entry) => {
          const stat = kind === "drink" ? "thirst" : "hunger";
          const effectValue = getEffectValue(entry.def, stat);
          const fallbackValue = kind === "drink" ? 10 : 8;

          return {
            ...entry,
            inventoryTarget: target,
            consumerKind: kind,
            primaryEffectStat: stat,
            primaryEffectValue: effectValue || fallbackValue
          };
        });
    });
  }

  function chooseBestConsumable(kind = "food", source = "all") {
    const priority = {
      player: 3,
      boat: 2,
      base: 1
    };

    return getConsumableEntries(kind, source)
      .sort((a, b) => {
        const valueDiff = Number(b.primaryEffectValue || 0) - Number(a.primaryEffectValue || 0);
        if (valueDiff !== 0) return valueDiff;

        return Number(priority[b.inventoryTarget] || 0) - Number(priority[a.inventoryTarget] || 0);
      })[0] || null;
  }

  function applyEffectsToPlayer(def) {
    const effects = U.toArray(def?.effects);
    const stats = S.getPlayerStats();
    const statPatch = {};

    effects.forEach((effect) => {
      const stat = effect?.stat;
      const value = Number(effect?.value || 0);
      if (!stat) return;

      if (["health", "stamina", "hunger", "thirst", "infection", "morale", "focus", "hygiene"].includes(stat)) {
        const current = Number(stats?.[stat] || 0);
        const max = stat === "health"
          ? Number(stats?.maxHealth || 100)
          : stat === "stamina"
            ? Number(stats?.maxStamina || 100)
            : 100;

        statPatch[stat] = U.clamp(current + value, 0, max);
      }
    });

    if (Object.keys(statPatch).length) {
      S.updatePlayerStats(statPatch);
    }

    P.checkCriticalNeeds?.();
    P.recalcEncumbrance?.();

    return statPatch;
  }

  function applyEffectsToCompanion(companionId, def) {
    const found = getCompanionById(companionId);
    if (!found) return null;

    const party = S.getParty();
    const active = U.toArray(party?.active);
    const reserve = U.toArray(party?.reserve);
    const bucketArray = found.bucket === "reserve" ? reserve : active;
    const index = bucketArray.findIndex((member) => member.id === companionId);

    if (index < 0) return null;

    const member = bucketArray[index];

    if (!member.needs || typeof member.needs !== "object") {
      member.needs = {
        hunger: 75,
        thirst: 75,
        morale: 70,
        comfort: 70
      };
    }

    if (!member.stats || typeof member.stats !== "object") {
      member.stats = {};
    }

    U.toArray(def?.effects).forEach((effect) => {
      const stat = effect?.stat;
      const value = Number(effect?.value || 0);
      if (!stat) return;

      if (stat === "hunger" || stat === "thirst" || stat === "morale" || stat === "comfort") {
        member.needs[stat] = U.clamp(Number(member.needs[stat] ?? 75) + value, 0, 100);
        return;
      }

      if (stat === "health") {
        member.stats.health = U.clamp(
          Number(member.stats.health || 0) + value,
          0,
          Number(member.stats.maxHealth || 50)
        );
        return;
      }

      if (stat === "stamina") {
        member.stats.stamina = U.clamp(
          Number(member.stats.stamina || 0) + value,
          0,
          Number(member.stats.maxStamina || 50)
        );
      }
    });

    bucketArray[index] = member;

    if (found.bucket === "reserve") {
      S.updateParty({ reserve: bucketArray });
    } else {
      S.updateParty({ active: bucketArray });
    }

    return member;
  }

  function consumeItemForTarget(itemId, targetId = getSelectedConsumerId(), options = {}) {
    const def = S.getItemDef(itemId);
    if (!def) return false;

    const source = options.source || "player";
    const quantity = Math.max(1, Number(options.quantity || 1));

    if (!S.hasItem(source, itemId, quantity)) {
      S.addToast(`Missing ${def.name || itemId}.`, "error");
      return false;
    }

    const target = getConsumerTarget(targetId);
    if (!target) {
      S.addToast("No valid consumer selected.", "error");
      return false;
    }

    S.removeItem(source, itemId, quantity);

    if (target.id === "player") {
      applyEffectsToPlayer(def);
    } else {
      applyEffectsToCompanion(target.id, def);
    }

    if (source === "player") {
      P.recalcEncumbrance();
    }

    S.logActivity(`${target.label} consumed ${def.name || U.titleCase(itemId)}.`, "success");
    S.addToast(`${target.label} used ${def.name || itemId}.`, "success");

    renderInventoryPanel();
    UI.renderEverything();
    return true;
  }

  function autoConsume(kind = "food", targetId = getSelectedConsumerId()) {
    const chosen = chooseBestConsumable(kind, "all");
    const target = getConsumerTarget(targetId);

    if (!chosen) {
      const label = kind === "drink" ? "drink" : "food";
      S.addToast(`No ${label} available.`, "warning");
      S.logActivity(`No ${label} available for ${target?.label || "the selected target"}.`, "warning");
      return false;
    }

    const ok = consumeItemForTarget(chosen.itemId, targetId, {
      source: chosen.inventoryTarget,
      quantity: 1
    });

    if (ok) {
      const verb = kind === "drink" ? "drank" : "ate";
      S.logActivity(`${target?.label || "Selected target"} ${verb} ${chosen.name}.`, "success");
    }

    return ok;
  }

  function autoEat(targetId = getSelectedConsumerId()) {
    return autoConsume("food", targetId);
  }

  function autoDrink(targetId = getSelectedConsumerId()) {
    return autoConsume("drink", targetId);
  }

  function getItemActions(entry, target = "player") {
    if (!entry) return [];

    const def = entry.def || {};
    const actions = [];

    if (entry.usable) {
      actions.push({ id: "use", label: "Use on Selected" });
    }

    if (itemMatchesConsumableKind(def, "food")) {
      actions.push({ id: "eat", label: "Eat / Feed Selected" });
    }

    if (itemMatchesConsumableKind(def, "drink")) {
      actions.push({ id: "drink", label: "Drink / Water Selected" });
    }

    if (U.toArray(entry.equippableSlots).length) {
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
    const def = entry.def || {};

    if (actionId === "use" || actionId === "eat" || actionId === "drink") {
      const used = consumeItemForTarget(itemId, getSelectedConsumerId(), {
        source: target,
        quantity: 1
      });

      if (!used) {
        S.addToast(`Could not use ${def.name || itemId}.`, "error");
      }

      renderInventoryPanel();
      return used;
    }

    if (actionId === "equip") {
      if (target !== "player") {
        S.addToast("Move the item to your backpack before equipping.", "warning");
        return false;
      }

      const slots = U.toArray(def.equippableSlots);
      if (!slots.length) {
        S.addToast("That item cannot be equipped.", "error");
        return false;
      }

      const equipped = P.equipItem(slots[0], itemId);
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

  function renderInventoryHeader(host) {
    const selectedConsumerId = getSelectedConsumerId();
    const consumerOptions = getConsumerTargets()
      .map((target) => `
        <option value="${htmlEscape(target.id)}" ${selectedConsumerId === target.id ? "selected" : ""}>
          ${htmlEscape(target.label)} — ${htmlEscape(target.sub || target.type)}
        </option>
      `)
      .join("");

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

    const bestFood = chooseBestConsumable("food", "all");
    const bestDrink = chooseBestConsumable("drink", "all");

    host.insertAdjacentHTML("afterbegin", `
      <div class="card inventory-header-card" style="margin-bottom:1rem;">
        <div class="meta-title">Inventory</div>

        <div class="admin-console-actions" id="inventoryTargetButtons">${targetOptions}</div>
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

        <div class="card" style="margin-top:.9rem;background:rgba(255,255,255,.035);">
          <div class="meta-title">Eat / Drink Target</div>
          <div class="meta-sub" style="margin-bottom:.5rem;">
            Select the player or companion who should receive food, water, or usable item effects.
          </div>
          <select id="inventoryConsumerSelect">${consumerOptions}</select>
          <div class="admin-console-actions" style="margin-top:.75rem;">
            <button id="btnAutoEatSelected" class="secondary-btn" ${bestFood ? "" : "disabled"}>
              Eat Best Food${bestFood ? `: ${htmlEscape(bestFood.name)}` : ""}
            </button>
            <button id="btnAutoDrinkSelected" class="secondary-btn" ${bestDrink ? "" : "disabled"}>
              Drink Best Water${bestDrink ? `: ${htmlEscape(bestDrink.name)}` : ""}
            </button>
          </div>
        </div>
      </div>
    `);

    U.qsa(".inventory-target-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.selectedTarget = btn.dataset.target || "player";
        renderInventoryPanel();
      });
    });

    U.qsa(".inventory-sort-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        state.selectedSort = btn.dataset.sort || "name";
        renderInventoryPanel();
      });
    });

    const consumerSelect = U.byId("inventoryConsumerSelect");
    if (consumerSelect) {
      U.on(consumerSelect, "change", () => {
        setSelectedConsumerId(consumerSelect.value || "player");
      });
    }

    const eatBtn = U.byId("btnAutoEatSelected");
    const drinkBtn = U.byId("btnAutoDrinkSelected");

    if (eatBtn) {
      U.on(eatBtn, "click", () => {
        autoEat(getSelectedConsumerId());
      });
    }

    if (drinkBtn) {
      U.on(drinkBtn, "click", () => {
        autoDrink(getSelectedConsumerId());
      });
    }

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
        className: "inventory-slot"
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

  function renderConsumerStatus() {
    const selectedId = getSelectedConsumerId();
    const target = getConsumerTarget(selectedId);

    if (!target) return "";

    if (target.id === "player") {
      const stats = S.getPlayerStats();
      return `
        <p><strong>Selected:</strong> ${htmlEscape(target.label)}</p>
        <p><strong>Hunger:</strong> ${htmlEscape(String(Math.round(stats.hunger || 0)))} / 100</p>
        <p><strong>Thirst:</strong> ${htmlEscape(String(Math.round(stats.thirst || 0)))} / 100</p>
        <p><strong>Health:</strong> ${htmlEscape(String(Math.round(stats.health || 0)))} / ${htmlEscape(String(Math.round(stats.maxHealth || 100)))}</p>
      `;
    }

    const found = getCompanionById(target.id);
    const member = found?.member;
    const needs = member?.needs || {};
    const stats = member?.stats || {};

    return `
      <p><strong>Selected:</strong> ${htmlEscape(target.label)}</p>
      <p><strong>Hunger:</strong> ${htmlEscape(String(Math.round(needs.hunger ?? 75)))} / 100</p>
      <p><strong>Thirst:</strong> ${htmlEscape(String(Math.round(needs.thirst ?? 75)))} / 100</p>
      <p><strong>Health:</strong> ${htmlEscape(String(Math.round(stats.health || 0)))} / ${htmlEscape(String(Math.round(stats.maxHealth || 50)))}</p>
    `;
  }

  function renderInventoryDetail(entry = null, showActions = false) {
    const detail = U.byId("inventoryDetailContent");
    if (!detail) return;

    if (!entry) {
      detail.innerHTML = `
        <p>Select an item.</p>
        <p><strong>Backpack:</strong> ${getUsedSlots("player")}/${getInventoryCapacity("player")} slots</p>
        <p><strong>Base:</strong> ${getUsedSlots("base")}/${getInventoryCapacity("base")} slots</p>
        <p><strong>Boat:</strong> ${getUsedSlots("boat")}/${getInventoryCapacity("boat")} slots</p>
        <hr />
        <h4>Selected Eat / Drink Target</h4>
        ${renderConsumerStatus()}
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
      <hr />
      <h4>Selected Eat / Drink Target</h4>
      ${renderConsumerStatus()}
      <div id="inventoryActionButtons" class="admin-console-actions"></div>
    `;

    const actionHost = U.byId("inventoryActionButtons");
    if (!actionHost) return;

    if (showActions || actions.length) {
      actions.forEach((action) => {
        const btn = U.createEl("button", {
          className: action.id === "use" || action.id === "equip" || action.id === "eat" || action.id === "drink"
            ? "secondary-btn"
            : "ghost-btn",
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

    const from = current.inventoryTarget || state.selectedTarget;
    const destinationOptions = getTargets()
      .filter((target) => target !== from)
      .map((target) => `
        <button class="ghost-btn inventory-direct-transfer-btn" data-dest="${htmlEscape(target)}">
          Send 1 to ${htmlEscape(getTargetLabel(target))}
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
        usable: true,
        weight: 1,
        value: 2,
        effects: [{ stat: "hunger", value: 3 }]
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
        id: "alcohol_basic",
        name: "Field Alcohol",
        description: "Sanitizes, preserves, and occasionally improves morale.",
        tags: ["drink", "resource"],
        usable: true,
        weight: 1,
        value: 7,
        effects: [{ stat: "morale", value: 6 }, { stat: "focus", value: -2 }, { stat: "thirst", value: 2 }]
      },
      {
        id: "chameleon_juice",
        name: "Chameleon Juice",
        description: "A breeding additive that nudges offspring toward camouflage.",
        tags: ["additive"],
        weight: 1,
        value: 15,
        breedingEffects: {
          preferredTraits: ["camouflage"],
          preferredMutations: ["camouflage"],
          mutationBonus: 0.05,
          note: "Boosts stealthy outcomes."
        }
      },
      {
        id: "improvised_snare_trap",
        name: "Improvised Snare",
        description: "A small reusable snare for passive land-animal captures.",
        tags: ["trap"],
        trapType: "land",
        trapCycleMinutes: 60,
        trapCatchChance: 0.34,
        weight: 1,
        value: 10
      },
      {
        id: "reed_fish_trap",
        name: "Reed Fish Trap",
        description: "A woven trap for passive aquatic captures.",
        tags: ["trap", "fishing"],
        trapType: "water",
        trapCycleMinutes: 50,
        trapCatchChance: 0.4,
        weight: 2,
        value: 12
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
      if (S.isModalOpen("inventoryModal")) {
        renderInventoryPanel();
      }
    });

    U.eventBus.on("player:changed", () => {
      if (S.isModalOpen("inventoryModal")) {
        renderInventoryPanel();
      }
    });

    U.eventBus.on("party:changed", () => {
      if (S.isModalOpen("inventoryModal")) {
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

    getConsumerTargets,
    getSelectedConsumerId,
    setSelectedConsumerId,
    getConsumerTarget,
    getCompanionById,
    getConsumableEntries,
    chooseBestConsumable,
    consumeItemForTarget,
    autoConsume,
    autoEat,
    autoDrink,

    getItemActions,
    performItemAction,

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