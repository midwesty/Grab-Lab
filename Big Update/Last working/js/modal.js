window.GrabLabModal = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const A = window.GrabLabAudio;

  const state = {
    initialized: false,
    zCounter: CFG.UI.defaultModalZIndex,
    overlayEl: null,
    modals: new Map(),
    drag: {
      active: false,
      modalId: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      originLeft: 0,
      originTop: 0,
      moved: false
    }
  };

  function getModalElements() {
    return U.qsa(".modal-window");
  }

  function getOverlayEl() {
    if (state.overlayEl) return state.overlayEl;

    const host = U.byId("modalHost") || document.body;
    const overlay = U.createEl("div", {
      id: "modalBackdrop",
      className: "modal-backdrop hidden"
    });

    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: String(CFG.UI.defaultModalZIndex - 1),
      background: "rgba(5, 8, 6, 0.45)",
      backdropFilter: "blur(4px)",
      pointerEvents: "auto"
    });

    host.appendChild(overlay);
    state.overlayEl = overlay;
    return overlay;
  }

  function getModalId(modalEl) {
    if (!modalEl) return null;
    return modalEl.id || modalEl.dataset.modal || null;
  }

  function rememberModal(modalEl) {
    const modalId = getModalId(modalEl);
    if (!modalEl || !modalId) return null;

    if (!state.modals.has(modalId)) {
      state.modals.set(modalId, {
        el: modalEl,
        id: modalId,
        isOpen: false,
        lastLeft: null,
        lastTop: null,
        zIndex: CFG.UI.defaultModalZIndex
      });
    }

    return state.modals.get(modalId);
  }

  function getModal(modalId) {
    if (!modalId) return null;
    if (state.modals.has(modalId)) return state.modals.get(modalId);

    const el =
      U.byId(modalId) ||
      U.qs(`.modal-window[data-modal="${modalId}"]`);

    if (!el) return null;
    return rememberModal(el);
  }

  function getOpenModalIds() {
    return [...state.modals.values()]
      .filter((entry) => entry.isOpen)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      .map((entry) => entry.id);
  }

  function hasOpenModals() {
    return getOpenModalIds().length > 0;
  }

  function syncOverlay() {
    const overlay = getOverlayEl();
    if (!overlay) return;

    if (hasOpenModals()) {
      U.show(overlay, "block");
      const topModal = getTopModal();
      const z = Math.max(CFG.UI.defaultModalZIndex - 1, (topModal?.zIndex || CFG.UI.defaultModalZIndex) - 1);
      overlay.style.zIndex = String(z);
    } else {
      U.hide(overlay);
    }
  }

  function clampModalToViewport(modalEl) {
    if (!modalEl) return;

    const rect = modalEl.getBoundingClientRect();
    const margin = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = rect.left;
    let top = rect.top;

    if (rect.width >= viewportW - margin * 2) {
      left = margin;
    } else {
      left = U.clamp(left, margin, viewportW - rect.width - margin);
    }

    if (rect.height >= viewportH - margin * 2) {
      top = margin;
    } else {
      top = U.clamp(top, margin, viewportH - rect.height - margin);
    }

    modalEl.style.left = `${left}px`;
    modalEl.style.top = `${top}px`;
    modalEl.style.transform = "none";
  }

  function centerModal(modalEl) {
    if (!modalEl) return;

    modalEl.style.left = "50%";
    modalEl.style.top = "7%";
    modalEl.style.transform = "translateX(-50%)";

    if (window.innerWidth <= CFG.UI.mobileBreakpoint) {
      modalEl.style.left = "0.5rem";
      modalEl.style.top = "0.5rem";
      modalEl.style.transform = "none";
      modalEl.style.width = "calc(100vw - 1rem)";
    } else {
      modalEl.style.width = "";
    }
  }

  function bringToFront(modalId) {
    const modal = getModal(modalId);
    if (!modal?.el) return null;

    state.zCounter += 1;
    modal.zIndex = state.zCounter;
    modal.el.style.zIndex = String(modal.zIndex);

    syncOverlay();
    U.eventBus.emit("modal:focused", modal.id);
    return modal;
  }

  function getTopModal() {
    const open = [...state.modals.values()]
      .filter((entry) => entry.isOpen)
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    return open[0] || null;
  }

  function openModal(modalId, options = {}) {
    const modal = getModal(modalId);
    if (!modal?.el) return false;

    const el = modal.el;
    modal.isOpen = true;

    U.show(el, "block");

    if (options.center !== false || modal.lastLeft == null || modal.lastTop == null) {
      centerModal(el);
      requestAnimationFrame(() => {
        clampModalToViewport(el);
      });
    } else {
      el.style.left = `${modal.lastLeft}px`;
      el.style.top = `${modal.lastTop}px`;
      el.style.transform = "none";
      clampModalToViewport(el);
    }

    bringToFront(modal.id);
    S.openModal(modal.id);
    syncOverlay();

    if (options.playSound !== false) {
      A.playSfx("ui_confirm").catch?.(() => {});
    }

    U.eventBus.emit("ui:modalOpened", modal.id);
    return true;
  }

  function closeModal(modalId, options = {}) {
    const modal = getModal(modalId);
    if (!modal?.el) return false;

    const el = modal.el;
    const rect = el.getBoundingClientRect();

    modal.lastLeft = rect.left;
    modal.lastTop = rect.top;
    modal.isOpen = false;

    U.hide(el);
    S.closeModal(modal.id);
    syncOverlay();

    if (options.playSound !== false) {
      A.playSfx("ui_cancel").catch?.(() => {});
    }

    U.eventBus.emit("ui:modalClosed", modal.id);
    return true;
  }

  function toggleModal(modalId, options = {}) {
    const modal = getModal(modalId);
    if (!modal?.el) return false;

    if (modal.isOpen) {
      return closeModal(modal.id, options);
    }

    return openModal(modal.id, options);
  }

  function closeTopModal() {
    const top = getTopModal();
    if (!top) return false;
    return closeModal(top.id);
  }

  function closeAllModals(options = {}) {
    const ids = getOpenModalIds().reverse();
    ids.forEach((id) => closeModal(id, { ...options, playSound: false }));

    if (options.playSound !== false && ids.length) {
      A.playSfx("ui_cancel").catch?.(() => {});
    }

    S.closeAllModals();
    syncOverlay();
    return true;
  }

  function saveModalPosition(modalEl) {
    const modal = getModal(getModalId(modalEl));
    if (!modal?.el) return;

    const rect = modal.el.getBoundingClientRect();
    modal.lastLeft = rect.left;
    modal.lastTop = rect.top;
  }

  function pointerStartDrag(evt, modalEl, handleEl) {
    if (!modalEl || !handleEl) return;
    if (window.innerWidth <= CFG.UI.mobileBreakpoint) return;

    const target = evt.target;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("textarea") ||
      target.closest("label")
    ) {
      return;
    }

    const modalId = getModalId(modalEl);
    if (!modalId) return;

    const rect = modalEl.getBoundingClientRect();
    const pointerX = evt.clientX ?? evt.touches?.[0]?.clientX ?? 0;
    const pointerY = evt.clientY ?? evt.touches?.[0]?.clientY ?? 0;

    state.drag.active = true;
    state.drag.modalId = modalId;
    state.drag.pointerId = evt.pointerId ?? null;
    state.drag.startX = pointerX;
    state.drag.startY = pointerY;
    state.drag.originLeft = rect.left;
    state.drag.originTop = rect.top;
    state.drag.moved = false;

    bringToFront(modalId);

    modalEl.style.left = `${rect.left}px`;
    modalEl.style.top = `${rect.top}px`;
    modalEl.style.transform = "none";

    S.updateRuntime({
      ui: {
        draggingModalId: modalId
      }
    });

    if (typeof handleEl.setPointerCapture === "function" && evt.pointerId != null) {
      try {
        handleEl.setPointerCapture(evt.pointerId);
      } catch (err) {
        U.warn("setPointerCapture failed:", err);
      }
    }

    evt.preventDefault();
  }

  function pointerMoveDrag(evt) {
    if (!state.drag.active) return;

    const modal = getModal(state.drag.modalId);
    if (!modal?.el) return;

    const pointerX = evt.clientX ?? evt.touches?.[0]?.clientX ?? 0;
    const pointerY = evt.clientY ?? evt.touches?.[0]?.clientY ?? 0;

    const dx = pointerX - state.drag.startX;
    const dy = pointerY - state.drag.startY;

    if (!state.drag.moved) {
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance < CFG.UI.dragThresholdPx) return;
      state.drag.moved = true;
    }

    modal.el.style.left = `${state.drag.originLeft + dx}px`;
    modal.el.style.top = `${state.drag.originTop + dy}px`;
    modal.el.style.transform = "none";

    clampModalToViewport(modal.el);
    evt.preventDefault();
  }

  function pointerEndDrag(evt, handleEl) {
    if (!state.drag.active) return;

    const modal = getModal(state.drag.modalId);
    if (modal?.el) {
      clampModalToViewport(modal.el);
      saveModalPosition(modal.el);
    }

    if (typeof handleEl?.releasePointerCapture === "function" && evt?.pointerId != null) {
      try {
        handleEl.releasePointerCapture(evt.pointerId);
      } catch (err) {
        U.warn("releasePointerCapture failed:", err);
      }
    }

    state.drag.active = false;
    state.drag.modalId = null;
    state.drag.pointerId = null;
    state.drag.moved = false;

    S.updateRuntime({
      ui: {
        draggingModalId: null
      }
    });
  }

  function bindModal(modalEl) {
    const entry = rememberModal(modalEl);
    if (!entry?.el) return;

    const handle = modalEl.querySelector(".drag-handle") || modalEl.querySelector(".modal-header");
    const closeButtons = U.qsa("[data-close-modal]", modalEl);

    U.on(modalEl, "pointerdown", () => {
      bringToFront(entry.id);
    });

    if (handle) {
      U.on(handle, "pointerdown", (evt) => pointerStartDrag(evt, modalEl, handle));
      U.on(handle, "pointermove", pointerMoveDrag);
      U.on(handle, "pointerup", (evt) => pointerEndDrag(evt, handle));
      U.on(handle, "pointercancel", (evt) => pointerEndDrag(evt, handle));
    }

    closeButtons.forEach((btn) => {
      U.on(btn, "click", (evt) => {
        evt.preventDefault();
        const targetId = btn.dataset.closeModal || entry.id;
        closeModal(targetId);
      });
    });

    U.hide(modalEl);
  }

  function bindOverlay() {
    const overlay = getOverlayEl();
    if (!overlay) return;

    U.on(overlay, "click", () => {
      closeTopModal();
    });
  }

  function bindEscapeKey() {
    U.on(document, "keydown", (evt) => {
      if (evt.key !== "Escape") return;
      if (closeTopModal()) {
        evt.preventDefault();
      }
    });
  }

  function bindWindowResize() {
    U.on(window, "resize", U.throttle(() => {
      state.modals.forEach((entry) => {
        if (!entry.isOpen || !entry.el) return;
        if (window.innerWidth <= CFG.UI.mobileBreakpoint) {
          centerModal(entry.el);
        }
        clampModalToViewport(entry.el);
        saveModalPosition(entry.el);
      });
      syncOverlay();
    }, 60));
  }

  function wireDefaultTriggers() {
    const triggerMap = {
      btnOpenSettings: "settingsModal",
      btnOpenCredits: "creditsModal",
      btnInventory: "inventoryModal",
      btnParty: "partyModal",
      btnMap: "mapModal",
      btnBoat: "boatModal",
      btnBase: "baseModal",
      btnCraft: "craftModal",
      btnDNA: "dnaModal",
      btnBreed: "breedingModal",
      btnFish: "fishingModal",
      btnJournal: "journalModal",
      btnTutorial: "tutorialModal",
      btnAdmin: "adminModal",
      btnLoadGame: "saveLoadModal"
    };

    Object.entries(triggerMap).forEach(([btnId, modalId]) => {
      const btn = U.byId(btnId);
      if (!btn) return;

      U.on(btn, "click", (evt) => {
        evt.preventDefault();
        openModal(modalId);
      });
    });
  }

  function init() {
    if (state.initialized) return true;

    getModalElements().forEach(bindModal);
    bindOverlay();
    bindEscapeKey();
    bindWindowResize();
    wireDefaultTriggers();

    state.initialized = true;
    U.eventBus.emit("modal:initialized");
    return true;
  }

  const API = {
    init,
    getModal,
    getTopModal,
    getOpenModalIds,
    hasOpenModals,
    openModal,
    closeModal,
    toggleModal,
    closeTopModal,
    closeAllModals,
    bringToFront,
    centerModal,
    clampModalToViewport,
    saveModalPosition
  };

  window.GL_MODAL = API;

  return Object.freeze(API);
})();