window.GrabLabUIStability = (() => {
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;

  const state = {
    initialized: false,
    originalOn: null,
    wrappedHandlers: new WeakMap(),
    renderTimers: new Map(),
    lastRenderAt: new Map(),
    modalGraceUntil: 0,
    userInputGraceUntil: 0,
    lastOpenModalId: null
  };

  function now() {
    return Date.now();
  }

  function getUiApi() {
    return window.GL_UI || window.GrabLabUI || null;
  }

  function getModalApi() {
    return window.GL_MODAL || window.GrabLabModal || null;
  }

  function getOpenModalEls() {
    return Array.from(document.querySelectorAll(".modal-window:not(.hidden)"));
  }

  function hasOpenModal() {
    return getOpenModalEls().length > 0;
  }

  function getTopOpenModal() {
    const open = getOpenModalEls();
    if (!open.length) return null;

    return open.sort((a, b) => {
      const za = Number(getComputedStyle(a).zIndex || a.style.zIndex || 0);
      const zb = Number(getComputedStyle(b).zIndex || b.style.zIndex || 0);
      return zb - za;
    })[0] || null;
  }

  function getTopOpenModalId() {
    const modal = getTopOpenModal();
    return modal?.id || modal?.dataset?.modal || null;
  }

  function isInsideOpenModal(node) {
    if (!node) return false;
    return Boolean(node.closest?.(".modal-window:not(.hidden)"));
  }

  function isUserEditingModal() {
    const active = document.activeElement;
    if (!active || !isInsideOpenModal(active)) return false;

    const tag = String(active.tagName || "").toLowerCase();
    if (["input", "select", "textarea", "button"].includes(tag)) return true;
    if (active.isContentEditable) return true;

    return false;
  }

  function noteUserInteraction() {
    state.userInputGraceUntil = now() + 1200;
  }

  function noteModalInteraction() {
    state.modalGraceUntil = now() + 1600;
    noteUserInteraction();
  }

  function isInInteractionGrace() {
    const t = now();
    return t < state.userInputGraceUntil || t < state.modalGraceUntil || isUserEditingModal();
  }

  function deferRender(key, fn, delay = 80) {
    if (state.renderTimers.has(key)) {
      clearTimeout(state.renderTimers.get(key));
    }

    const timer = setTimeout(() => {
      state.renderTimers.delete(key);
      state.lastRenderAt.set(key, now());

      try {
        fn();
      } catch (err) {
        console.warn("[Grab Lab] Stable UI render failed:", key, err);
      }
    }, delay);

    state.renderTimers.set(key, timer);
  }

  function throttleRender(key, fn, minMs = 500) {
    const last = Number(state.lastRenderAt.get(key) || 0);
    const elapsed = now() - last;

    if (elapsed >= minMs) {
      state.lastRenderAt.set(key, now());

      try {
        fn();
      } catch (err) {
        console.warn("[Grab Lab] Stable UI render failed:", key, err);
      }

      return;
    }

    deferRender(key, fn, minMs - elapsed);
  }

  function safeRenderHud() {
    const ui = getUiApi();
    ui?.renderHud?.();
  }

  function safeRenderRightColumn() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderHud?.();
    ui.renderStatusEffects?.();
    ui.renderTrackedTasks?.();
    ui.renderPartyMini?.();
    ui.renderNearbyList?.();
    ui.renderActivityLog?.();
    ui.renderSidebarCollapseStates?.();

    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderWorldChanged() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderHud?.();
    ui.renderNearbyList?.();
    ui.renderActivityLog?.();

    const mapOpen = Boolean(document.querySelector("#mapModal:not(.hidden)"));
    if (mapOpen) {
      ui.renderMapModal?.();
    }

    ui.renderSidebarCollapseStates?.();
    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderPlayerChanged() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderHud?.();
    ui.renderStatusEffects?.();
    ui.renderPartyMini?.();

    const inventoryOpen = Boolean(document.querySelector("#inventoryModal:not(.hidden)"));
    const partyOpen = Boolean(document.querySelector("#partyModal:not(.hidden)"));

    if (!isInInteractionGrace()) {
      if (inventoryOpen) ui.renderInventoryModal?.();
      if (partyOpen) ui.renderPartyModal?.();
    }

    ui.renderSidebarCollapseStates?.();
    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderPartyChanged() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderPartyMini?.();

    const partyOpen = Boolean(document.querySelector("#partyModal:not(.hidden)"));
    const inventoryOpen = Boolean(document.querySelector("#inventoryModal:not(.hidden)"));

    if (!isInInteractionGrace()) {
      if (partyOpen) ui.renderPartyModal?.();
      if (inventoryOpen) ui.renderInventoryModal?.();
    }

    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderBaseChanged() {
    const ui = getUiApi();
    if (!ui) return;

    const baseOpen = Boolean(document.querySelector("#baseModal:not(.hidden)"));
    const buildOpen = Boolean(document.querySelector("#buildModal:not(.hidden)"));
    const trapsOpen = Boolean(document.querySelector("#trapsModal:not(.hidden)"));
    const partyOpen = Boolean(document.querySelector("#partyModal:not(.hidden)"));
    const dnaOpen = Boolean(document.querySelector("#dnaModal:not(.hidden)"));

    if (isInInteractionGrace()) {
      ui.renderPartyMini?.();
      ui.renderNearbyList?.();
      ui.renderSidebarCollapseStates?.();
      window.GL_UI_ICONS?.scheduleDecorate?.();
      return;
    }

    if (baseOpen) ui.renderBaseModal?.();
    if (buildOpen) ui.renderBuildModal?.();
    if (trapsOpen) ui.renderTrapsModal?.();
    if (partyOpen) ui.renderPartyModal?.();
    if (dnaOpen) ui.renderDnaModal?.();

    ui.renderPartyMini?.();
    ui.renderNearbyList?.();
    ui.renderSidebarCollapseStates?.();
    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderBoatChanged() {
    const ui = getUiApi();
    if (!ui) return;

    const boatOpen = Boolean(document.querySelector("#boatModal:not(.hidden)"));
    const buildOpen = Boolean(document.querySelector("#buildModal:not(.hidden)"));
    const partyOpen = Boolean(document.querySelector("#partyModal:not(.hidden)"));

    if (isInInteractionGrace()) {
      ui.renderPartyMini?.();
      ui.renderSidebarCollapseStates?.();
      window.GL_UI_ICONS?.scheduleDecorate?.();
      return;
    }

    if (boatOpen) ui.renderBoatModal?.();
    if (buildOpen) ui.renderBuildModal?.();
    if (partyOpen) ui.renderPartyModal?.();

    ui.renderPartyMini?.();
    ui.renderSidebarCollapseStates?.();
    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderInventoryChanged() {
    const ui = getUiApi();
    if (!ui) return;

    const inventoryOpen = Boolean(document.querySelector("#inventoryModal:not(.hidden)"));
    const craftOpen = Boolean(document.querySelector("#craftModal:not(.hidden)"));
    const buildOpen = Boolean(document.querySelector("#buildModal:not(.hidden)"));
    const trapsOpen = Boolean(document.querySelector("#trapsModal:not(.hidden)"));
    const baseOpen = Boolean(document.querySelector("#baseModal:not(.hidden)"));

    if (isInInteractionGrace()) {
      ui.renderHud?.();
      ui.renderSidebarCollapseStates?.();
      window.GL_UI_ICONS?.scheduleDecorate?.();
      return;
    }

    if (inventoryOpen) ui.renderInventoryModal?.();
    if (craftOpen) ui.renderCraftModal?.();
    if (buildOpen) ui.renderBuildModal?.();
    if (trapsOpen) ui.renderTrapsModal?.();
    if (baseOpen) ui.renderBaseModal?.();

    ui.renderHud?.();
    ui.renderSidebarCollapseStates?.();
    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function safeRenderQuestsChanged() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderTrackedTasks?.();

    const journalOpen = Boolean(document.querySelector("#journalModal:not(.hidden)"));
    if (journalOpen && !isInInteractionGrace()) {
      ui.renderJournalModal?.();
    }
  }

  function safeRenderPoiResolved() {
    const ui = getUiApi();
    if (!ui) return;

    ui.renderNearbyList?.();

    const mapOpen = Boolean(document.querySelector("#mapModal:not(.hidden)"));
    if (mapOpen) {
      ui.renderMapModal?.();
    }

    window.GL_UI_ICONS?.scheduleDecorate?.();
  }

  function handlerLooksLikeUiRender(eventName, handler) {
    const source = Function.prototype.toString.call(handler);
    const name = handler?.name || "";

    if (name === "renderEverything") return true;

    if (eventName === "base:changed" && source.includes("renderBaseModal") && source.includes("renderBuildModal")) return true;
    if (eventName === "boat:changed" && source.includes("renderBoatModal") && source.includes("renderBuildModal")) return true;
    if (eventName === "inventory:changed" && source.includes("renderInventoryModal") && source.includes("renderCraftModal")) return true;
    if (eventName === "party:changed" && source.includes("renderPartyMini") && source.includes("renderPartyModal")) return true;
    if (eventName === "quests:changed" && source.includes("renderTrackedTasks") && source.includes("renderJournalModal")) return true;
    if (eventName === "world:poiResolved" && source.includes("renderNearbyList") && source.includes("renderMapModal")) return true;

    return false;
  }

  function makeStableWrapper(eventName, handler) {
    if (!handlerLooksLikeUiRender(eventName, handler)) {
      return handler;
    }

    if (state.wrappedHandlers.has(handler)) {
      return state.wrappedHandlers.get(handler);
    }

    const wrapped = function stableUiEventHandler(payload) {
      switch (eventName) {
        case "player:changed":
          throttleRender("player:changed", safeRenderPlayerChanged, 350);
          break;

        case "world:changed":
          throttleRender("world:changed", safeRenderWorldChanged, 350);
          break;

        case "party:changed":
          throttleRender("party:changed", safeRenderPartyChanged, 350);
          break;

        case "base:changed":
          throttleRender("base:changed", safeRenderBaseChanged, 650);
          break;

        case "boat:changed":
          throttleRender("boat:changed", safeRenderBoatChanged, 650);
          break;

        case "inventory:changed":
          throttleRender("inventory:changed", safeRenderInventoryChanged, 450);
          break;

        case "quests:changed":
          throttleRender("quests:changed", safeRenderQuestsChanged, 450);
          break;

        case "world:poiResolved":
          throttleRender("world:poiResolved", safeRenderPoiResolved, 150);
          break;

        default:
          try {
            handler(payload);
          } catch (err) {
            console.warn("[Grab Lab] UI handler failed:", eventName, err);
          }
          break;
      }
    };

    state.wrappedHandlers.set(handler, wrapped);
    return wrapped;
  }

  function patchEventBusRegistration() {
    if (!U?.eventBus?.on || state.originalOn) return;

    state.originalOn = U.eventBus.on.bind(U.eventBus);

    U.eventBus.on = function stableEventBusOn(eventName, handler) {
      const wrapped = makeStableWrapper(eventName, handler);
      return state.originalOn(eventName, wrapped);
    };
  }

  function bindUserInteractionGuards() {
    document.addEventListener("pointerdown", (evt) => {
      noteUserInteraction();
      if (isInsideOpenModal(evt.target)) noteModalInteraction();
    }, true);

    document.addEventListener("click", (evt) => {
      noteUserInteraction();
      if (isInsideOpenModal(evt.target)) noteModalInteraction();
    }, true);

    document.addEventListener("input", (evt) => {
      noteUserInteraction();
      if (isInsideOpenModal(evt.target)) noteModalInteraction();
    }, true);

    document.addEventListener("change", (evt) => {
      noteUserInteraction();
      if (isInsideOpenModal(evt.target)) noteModalInteraction();
    }, true);

    document.addEventListener("focusin", (evt) => {
      if (isInsideOpenModal(evt.target)) noteModalInteraction();
    }, true);
  }

  function bindModalOpenTracking() {
    if (!U?.eventBus?.on) return;

    U.eventBus.on("modal:opened", (modalId) => {
      state.lastOpenModalId = modalId || getTopOpenModalId();
      state.modalGraceUntil = now() + 900;
    });

    U.eventBus.on("modal:closed", () => {
      state.modalGraceUntil = now() + 300;
    });
  }

  function addDebugFlag() {
    window.GL_UI_STABILITY_DEBUG = {
      state,
      getOpenModalEls,
      hasOpenModal,
      getTopOpenModalId,
      isUserEditingModal,
      isInInteractionGrace,
      safeRenderHud,
      safeRenderRightColumn,
      safeRenderBaseChanged,
      safeRenderInventoryChanged
    };
  }

  function init() {
    if (state.initialized) return true;

    patchEventBusRegistration();
    bindUserInteractionGuards();
    bindModalOpenTracking();
    addDebugFlag();

    state.initialized = true;
    return true;
  }

  const API = {
    init,
    hasOpenModal,
    getTopOpenModalId,
    isUserEditingModal,
    isInInteractionGrace,
    safeRenderHud,
    safeRenderRightColumn,
    safeRenderBaseChanged,
    safeRenderInventoryChanged
  };

  window.GL_UI_STABILITY = API;

  init();

  return Object.freeze(API);
})();