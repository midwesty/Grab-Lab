window.GrabLabUIIcons = (() => {
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;

  const state = {
    initialized: false,
    observer: null,
    renderTimer: null,
    lastPassAt: 0
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function titleCase(value = "") {
    if (U?.titleCase) return U.titleCase(value);
    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function toArray(value) {
    if (U?.toArray) return U.toArray(value);
    return Array.isArray(value) ? value : [];
  }

  function getAnimalDefs() {
    return toArray(S?.getData?.()?.animals);
  }

  function getAnimalDef(speciesId) {
    if (!speciesId) return null;
    return S?.getAnimalDef?.(speciesId) || getAnimalDefs().find((animal) => animal.id === speciesId) || null;
  }

  function getFallbackIconForSpecies(speciesId = "", def = null) {
    const id = String(speciesId || "").toLowerCase();
    const family = String(def?.family || "").toLowerCase();
    const tags = toArray(def?.tags).map((tag) => String(tag).toLowerCase());
    const habitatType = String(def?.habitatType || "").toLowerCase();

    if (id.includes("marsy")) return "🦝";
    if (tags.includes("fish") || tags.includes("aquatic") || habitatType === "aquarium" || family === "fish") return "🐟";
    if (family === "amphibian" || id.includes("frog") || id.includes("hopper")) return "🐸";
    if (family === "reptile" || id.includes("turtle")) return "🐢";
    if (family === "crustacean" || id.includes("crab")) return "🦀";
    if (family === "insect" || tags.includes("flying") || id.includes("moth")) return "🦋";
    if (family === "mammal" || id.includes("fox")) return "🦊";
    if (tags.includes("shell")) return "🐢";
    if (tags.includes("predator")) return "🦊";
    return "🐾";
  }

  function getAnimalIcon(speciesId = "", fallbackText = "") {
    const def = getAnimalDef(speciesId);

    if (def?.icon) return def.icon;

    if (!speciesId && fallbackText) {
      const guessed = findSpeciesIdFromText(fallbackText);
      if (guessed) {
        const guessedDef = getAnimalDef(guessed);
        return guessedDef?.icon || getFallbackIconForSpecies(guessed, guessedDef);
      }
    }

    return getFallbackIconForSpecies(speciesId, def);
  }

  function getAnimalIconBg(speciesId = "", fallbackText = "") {
    const def = getAnimalDef(speciesId);

    if (def?.iconBg) return def.iconBg;

    const text = `${speciesId} ${fallbackText}`.toLowerCase();

    if (text.includes("fish") || text.includes("minnow") || text.includes("aquatic")) return "aqua";
    if (text.includes("frog") || text.includes("hopper") || text.includes("reed")) return "green";
    if (text.includes("turtle") || text.includes("shell")) return "olive";
    if (text.includes("fox") || text.includes("marsy")) return "rust";
    if (text.includes("moth") || text.includes("spore")) return "violet";
    if (text.includes("crab")) return "red";
    return "neutral";
  }

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function findSpeciesIdFromText(text = "") {
    const haystack = normalizeText(text);
    if (!haystack) return null;

    const animals = getAnimalDefs();

    const direct = animals.find((animal) => {
      const id = normalizeText(animal.id);
      const name = normalizeText(animal.name);
      const shortName = normalizeText(animal.shortName);

      return (
        (id && haystack.includes(id)) ||
        (name && haystack.includes(name)) ||
        (shortName && haystack.includes(shortName))
      );
    });

    if (direct?.id) return direct.id;

    if (haystack.includes("marsy")) return "marsy_marsupial";
    if (haystack.includes("minnow")) return "mud_minnow";
    if (haystack.includes("hopper")) return "reed_hopper";
    if (haystack.includes("turtle")) return "dock_turtle";
    if (haystack.includes("fox")) return "mire_fox";
    if (haystack.includes("moth")) return "spore_moth";
    if (haystack.includes("crab")) return "bog_crab";

    return null;
  }

  function getSpeciesFromPartyMember(member = {}) {
    return member.speciesId || member.sourceSpeciesId || member.animalId || "";
  }

  function createIconNode(speciesId = "", labelText = "", extraClass = "") {
    const icon = getAnimalIcon(speciesId, labelText);
    const bg = getAnimalIconBg(speciesId, labelText);

    const node = document.createElement("span");
    node.className = `animal-ui-icon animal-ui-icon-${bg} ${extraClass}`.trim();
    node.setAttribute("aria-hidden", "true");
    node.textContent = icon;

    return node;
  }

  function getItemIcon(itemId = "", labelText = "") {
    const id = String(itemId || labelText || "").toLowerCase();
    if (id.includes("water")) return "💧";
    if (id.includes("berry")) return "🫐";
    if (id.includes("bandage")) return "🩹";
    if (id.includes("knife")) return "🔪";
    if (id.includes("shovel")) return "🪏";
    if (id.includes("pole") || id.includes("line") || id.includes("lure")) return "🎣";
    if (id.includes("net")) return "🕸️";
    if (id.includes("worm") || id.includes("bait")) return "🪱";
    if (id.includes("wood")) return "🪵";
    if (id.includes("fiber") || id.includes("rope")) return "🧵";
    if (id.includes("mold") || id.includes("spore") || id.includes("fung")) return "🍄";
    if (id.includes("fuel")) return "⛽";
    if (id.includes("alcohol")) return "🧪";
    if (id.includes("skin")) return "🦎";
    if (id.includes("shell") || id.includes("turtle")) return "🐢";
    if (id.includes("fish") || id.includes("minnow") || id.includes("carp") || id.includes("eel")) return "🐟";
    if (id.includes("crab")) return "🦀";
    if (id.includes("shrimp")) return "🦐";
    if (id.includes("boot")) return "🥾";
    if (id.includes("seed")) return "🌱";
    if (id.includes("trap")) return "🪤";
    return "📦";
  }

  function ensureIconStyles() {
    if (byId("grabLabAnimalIconStyles")) return;

    const style = document.createElement("style");
    style.id = "grabLabAnimalIconStyles";
    style.textContent = `
      .animal-ui-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        min-width: 2rem;
        border-radius: 999px;
        font-size: 1.12rem;
        line-height: 1;
        margin-right: .55rem;
        border: 1px solid rgba(255,255,255,.18);
        box-shadow: inset 0 0 0 1px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.2);
        background: rgba(130, 160, 120, .26);
      }

      .animal-ui-icon-small {
        width: 1.45rem;
        height: 1.45rem;
        min-width: 1.45rem;
        font-size: .9rem;
        margin-right: .38rem;
      }

      .animal-ui-icon-large {
        width: 2.55rem;
        height: 2.55rem;
        min-width: 2.55rem;
        font-size: 1.42rem;
        margin-right: .7rem;
      }

      .animal-ui-icon-aqua { background: rgba(88, 183, 218, .32); }
      .animal-ui-icon-green { background: rgba(115, 199, 104, .32); }
      .animal-ui-icon-olive { background: rgba(141, 164, 88, .35); }
      .animal-ui-icon-rust { background: rgba(209, 126, 72, .34); }
      .animal-ui-icon-violet { background: rgba(184, 120, 219, .34); }
      .animal-ui-icon-red { background: rgba(219, 100, 83, .34); }
      .animal-ui-icon-cream { background: rgba(234, 210, 160, .34); }
      .animal-ui-icon-neutral { background: rgba(160, 176, 150, .26); }

      .inventory-slot .icon-thumb {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.65rem;
        line-height: 1;
      }

      .animal-enhanced-row {
        display: flex;
        align-items: center;
        gap: .15rem;
      }

      .animal-enhanced-row .animal-row-copy {
        min-width: 0;
        flex: 1;
      }

      .animal-enhanced-row .meta-title,
      .animal-enhanced-row .meta-sub {
        overflow-wrap: anywhere;
      }

      .mini-portrait.animal-mini-portrait {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        line-height: 1;
        background: rgba(130, 160, 120, .26);
        border: 1px solid rgba(255,255,255,.16);
      }

      .nearby-card.animal-nearby-card,
      .party-management-card.animal-party-card,
      .compact-card.animal-compact-card {
        position: relative;
      }
    `;

    document.head.appendChild(style);
  }

  function getCardText(card) {
    if (!card) return "";
    return card.textContent || "";
  }

  function getCardSpecies(card) {
    if (!card) return "";

    if (card.dataset.speciesId) return card.dataset.speciesId;

    const text = getCardText(card);
    return findSpeciesIdFromText(text) || "";
  }

  function shouldDecorateAsAnimal(card) {
    if (!card) return false;

    const text = normalizeText(getCardText(card));
    if (!text) return false;

    if (card.dataset.animalIconDecorated === "true") return false;

    if (findSpeciesIdFromText(text)) return true;

    return (
      text.includes("capturable") ||
      text.includes("capture") ||
      text.includes("creature") ||
      text.includes("companion") ||
      text.includes("habitat") ||
      text.includes("cryo")
    );
  }

  function decorateCard(card, options = {}) {
    if (!card || card.dataset.animalIconDecorated === "true") return;

    const speciesId = options.speciesId || getCardSpecies(card);
    const text = getCardText(card);
    const title = card.querySelector(".meta-title");
    const sub = card.querySelector(".meta-sub");

    if (!speciesId && !options.force) return;

    card.dataset.animalIconDecorated = "true";
    if (speciesId) card.dataset.speciesId = speciesId;

    const row = document.createElement("div");
    row.className = "animal-enhanced-row";

    const iconNode = createIconNode(speciesId, text, options.large ? "animal-ui-icon-large" : "");
    const copy = document.createElement("div");
    copy.className = "animal-row-copy";

    if (title) {
      copy.appendChild(title.cloneNode(true));
      title.remove();
    }

    if (sub) {
      copy.appendChild(sub.cloneNode(true));
      sub.remove();
    }

    if (!copy.children.length) {
      const fallbackTitle = document.createElement("div");
      fallbackTitle.className = "meta-title";
      fallbackTitle.textContent = text.trim() || "Creature";
      copy.appendChild(fallbackTitle);
    }

    row.append(iconNode, copy);
    card.prepend(row);

    if (options.cardClass) card.classList.add(options.cardClass);
  }

  function decorateNearbyCards() {
    qsa("#nearbyList .nearby-card").forEach((card) => {
      if (!shouldDecorateAsAnimal(card)) return;

      const speciesId = getCardSpecies(card);
      if (!speciesId) return;

      decorateCard(card, {
        speciesId,
        cardClass: "animal-nearby-card"
      });
    });
  }

  function decoratePartyCards() {
    qsa("#partyMemberList .party-management-card").forEach((card) => {
      if (!shouldDecorateAsAnimal(card)) return;

      const speciesId = getCardSpecies(card);

      if (!speciesId) {
        const text = normalizeText(getCardText(card));
        if (text.includes("ranger") || text.includes("conservationist")) return;
      }

      decorateCard(card, {
        speciesId,
        cardClass: "animal-party-card",
        force: Boolean(speciesId)
      });
    });
  }

  function decorateHabitatOccupantCards() {
    qsa("#partyMemberDetail .compact-card").forEach((card) => {
      if (!shouldDecorateAsAnimal(card)) return;

      const speciesId = getCardSpecies(card);
      if (!speciesId) return;

      decorateCard(card, {
        speciesId,
        cardClass: "animal-compact-card"
      });
    });
  }

  function decorateMiniParty() {
    const host = byId("partyRosterMini");
    if (!host) return;

    const party = S?.getParty?.() || {};
    const active = toArray(party.active);

    const rows = Array.from(host.children);
    rows.forEach((row, index) => {
      if (!row || row.dataset.animalMiniDecorated === "true") return;

      const portrait = row.querySelector(".mini-portrait");
      if (!portrait) return;

      if (index === 0) {
        portrait.textContent = "🧢";
        portrait.classList.add("animal-mini-portrait");
        row.dataset.animalMiniDecorated = "true";
        return;
      }

      const companion = active[index - 1];
      const speciesId = getSpeciesFromPartyMember(companion) || findSpeciesIdFromText(row.textContent || "");
      if (!speciesId) return;

      portrait.textContent = getAnimalIcon(speciesId, row.textContent || "");
      portrait.classList.add("animal-mini-portrait", `animal-ui-icon-${getAnimalIconBg(speciesId, row.textContent || "")}`);
      row.dataset.animalMiniDecorated = "true";
    });
  }

  function decoratePartyDetailHeader() {
    const detail = byId("partyMemberDetail");
    if (!detail || detail.dataset.detailIconDecorated === "true") return;

    const h3 = detail.querySelector("h3");
    if (!h3) return;

    const text = detail.textContent || "";
    const speciesId = findSpeciesIdFromText(text);
    if (!speciesId) return;

    detail.dataset.detailIconDecorated = "true";

    const row = document.createElement("div");
    row.className = "animal-enhanced-row";
    const icon = createIconNode(speciesId, text, "animal-ui-icon-large");

    const copy = document.createElement("div");
    copy.className = "animal-row-copy";
    copy.appendChild(h3.cloneNode(true));
    h3.remove();

    row.append(icon, copy);
    detail.prepend(row);
  }

  function decorateSelectOptions() {
    qsa("select option").forEach((option) => {
      if (option.dataset.animalOptionDecorated === "true") return;

      const speciesId = findSpeciesIdFromText(option.textContent || "");
      if (!speciesId) return;

      const icon = getAnimalIcon(speciesId, option.textContent || "");
      if (option.textContent.trim().startsWith(icon)) return;

      option.textContent = `${icon} ${option.textContent}`;
      option.dataset.animalOptionDecorated = "true";
    });
  }

  function decorateNearbyActionPrompt() {
    const title = byId("interactionTitle");
    if (!title || title.dataset.animalPromptDecorated === "true") return;

    const text = `${title.textContent || ""} ${byId("interactionBody")?.textContent || ""}`;
    const speciesId = findSpeciesIdFromText(text);
    if (!speciesId) return;

    title.dataset.animalPromptDecorated = "true";
    title.textContent = `${getAnimalIcon(speciesId, text)} ${title.textContent}`;
  }

  function clearVolatileDetailFlags() {
    const detail = byId("partyMemberDetail");
    if (detail) {
      const h3 = detail.querySelector("h3");
      if (h3) detail.dataset.detailIconDecorated = "false";
    }

    const title = byId("interactionTitle");
    if (title && !findSpeciesIdFromText(title.textContent || "")) {
      title.dataset.animalPromptDecorated = "false";
    }
  }

  function decorateInventorySlots() {
    qsa(".inventory-slot").forEach((slot) => {
      if (!slot || slot.dataset.itemIconDecorated === "true") return;
      const itemId = slot.dataset.itemId || "";
      const label = slot.dataset.itemName || slot.textContent || "";
      const thumb = slot.querySelector(".icon-thumb");
      if (!thumb) return;
      thumb.textContent = getItemIcon(itemId, label);
      thumb.dataset.itemIcon = itemId;
      slot.dataset.itemIconDecorated = "true";
    });
  }

  function decorateAll() {
    ensureIconStyles();

    clearVolatileDetailFlags();
    decorateMiniParty();
    decorateNearbyCards();
    decoratePartyCards();
    decorateHabitatOccupantCards();
    decoratePartyDetailHeader();
    decorateSelectOptions();
    decorateNearbyActionPrompt();
    decorateInventorySlots();

    state.lastPassAt = Date.now();
  }

  function scheduleDecorate() {
    if (state.renderTimer) return;

    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      decorateAll();
    }, 40);
  }

  function bindMutationObserver() {
    if (state.observer) return;

    state.observer = new MutationObserver((mutations) => {
      const shouldRun = mutations.some((mutation) => {
        if (mutation.type !== "childList") return false;

        return Array.from(mutation.addedNodes).some((node) => {
          if (node.nodeType !== 1) return false;
          const elNode = node;

          return (
            elNode.matches?.(".card, .nearby-card, .party-management-card, .mini-portrait, option, .inventory-slot") ||
            elNode.querySelector?.(".card, .nearby-card, .party-management-card, .mini-portrait, option, .inventory-slot")
          );
        });
      });

      if (shouldRun) scheduleDecorate();
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function bindEventBus() {
    if (!U?.eventBus?.on) return;

    [
      "ui:initialized",
      "party:changed",
      "base:changed",
      "boat:changed",
      "world:poiResolved",
      "world:playerMoved",
      "data:bucketChanged",
      "ui:modalOpened",
      "modal:opened"
    ].forEach((eventName) => {
      U.eventBus.on(eventName, scheduleDecorate);
    });
  }

  function init() {
    if (state.initialized) return true;

    ensureIconStyles();
    bindMutationObserver();
    bindEventBus();
    scheduleDecorate();

    state.initialized = true;
    window.GL_UI_ICONS = API;

    if (U?.eventBus?.emit) {
      U.eventBus.emit("uiIcons:initialized");
    }

    return true;
  }

  const API = {
    init,
    decorateAll,
    scheduleDecorate,
    getAnimalIcon,
    getAnimalIconBg,
    findSpeciesIdFromText,
    createIconNode,
    getItemIcon
  };

  window.GL_UI_ICONS = API;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return Object.freeze(API);
})();