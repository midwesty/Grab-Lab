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
    selectedTransferDestination: "base"
  };

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
    if (target === "boat") return Number(CFG.INVENTORY.boatSlots || 24);
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

  function getSelectedEntry() {
    return S.getRuntime()?.selectedInventoryEntry || null;
  }

  function selectEntry(entry) {
    S.setSelectedInventoryEntry(entry || null);
    renderInventoryDetail(entry || null);
    return entry;
  }

  function getItemActions(entry, target = "player") {
    if (!entry) return [];

    const def = entry.def || {};
    const actions = [];

    if (entry.usable) {
      actions.push({ id: "use", label: "Use" });
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

    if (actionId === "use") {
      const used = P.consumeItem(itemId, 1);
      if (!used) {
        S.addToast(`Could not use ${def.name || itemId}.`, "error");
      } else {
        S.addToast(`Used ${def.name || itemId}.`, "success");
      }
      renderInventoryPanel();
      return used;
    }

    if (actionId === "equip") {
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
      <div class="card" style="margin-bottom:1rem;">
        <div class="admin-console-actions" id="inventoryTargetButtons">${targetOptions}</div>
        <div class="admin-console-actions" id="inventorySortButtons" style="margin-top:.75rem;">${sortOptions}</div>
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
  }

  function renderInventoryGrid(entries, target = "player") {
    const grid = U.byId("inventoryGrid");
    if (!grid) return;

    U.emptyEl(grid);

    if (!entries.length) {
      grid.appendChild(U.createEl("div", {
        className: "card",
        text: `${getTargetLabel(target)} is empty.`
      }));
      return;
    }

    entries.forEach((entry) => {
      const slot = U.createEl("div", {
        className: "inventory-slot"
      });

      slot.title = `${entry.name}\nQty: ${entry.quantity}`;

      slot.innerHTML = `
        <div class="icon-thumb"></div>
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

    if (!entry) {
      detail.innerHTML = `
        <p>Select an item.</p>
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

    const oldHeader = modalBody.querySelector(".card");
    if (oldHeader && oldHeader.querySelector("#inventoryTargetButtons")) {
      oldHeader.remove();
    }

    renderInventoryHeader(modalBody);

    const entries = sortEntries(getHydratedInventory(state.selectedTarget), state.selectedSort);
    renderInventoryGrid(entries, state.selectedTarget);

    const current = getSelectedEntry();
    if (current && current.inventoryTarget === state.selectedTarget) {
      renderInventoryDetail(current, true);
      renderTransferSummary(detailWrap);
    } else {
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
        tags: ["bait", "fishing"],
        weight: 1,
        value: 2
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
        effects: [{ stat: "morale", value: 6 }, { stat: "focus", value: -2 }]
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
        id: "clean_water",
        name: "Clean Water",
        description: "Boiled, cleaner, slightly less risky.",
        tags: ["drink"],
        usable: true,
        weight: 1,
        value: 2,
        effects: [{ stat: "thirst", value: 16 }]
      }
    ];

    S.replaceDataBucket("items", fallback);
    return true;
  }

  function bindInventoryEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "inventoryModal") {
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
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackItemsIfNeeded();
    bindInventoryEvents();
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
    getSelectedEntry,
    selectEntry,
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