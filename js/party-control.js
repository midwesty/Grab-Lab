window.GrabLabPartyControl = (() => {
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;

  const state = {
    initialized: false,
    renderTimer: null
  };

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getControlledAvatarId() {
    return S.getRuntime()?.activeAvatarId || "player";
  }

  function getActiveCompanions() {
    return U.toArray(S.getParty()?.active);
  }

  function getControlledAvatar() {
    const id = getControlledAvatarId();
    if (id === "player") {
      return {
        id: "player",
        name: S.getPlayer()?.name || "Ranger",
        type: "player",
        traits: U.toArray(S.getPlayer()?.traits),
        mutations: U.toArray(S.getPlayer()?.mutations)
      };
    }

    return getActiveCompanions().find((entry) => entry.id === id) || null;
  }

  function setControlledAvatar(avatarId = "player") {
    const safeId = avatarId || "player";
    const player = S.getPlayer();
    const companion = getActiveCompanions().find((entry) => entry.id === safeId);

    if (safeId !== "player" && !companion) {
      S.addToast("Only active party members can be controlled.", "warning");
      return false;
    }

    S.updateRuntime({ activeAvatarId: safeId });

    const label = safeId === "player" ? (player?.name || "Ranger") : (companion?.name || "Companion");
    S.addToast(`Now controlling ${label}.`, "success");
    S.logActivity(`Control switched to ${label}. Movement traits now come from that party member.`, "info");
    window.GL_WORLD?.recenterCameraOnPlayer?.();
    window.GL_WORLD?.drawWorld?.();
    window.GL_INPUT?.drawMiniMap?.();
    scheduleRender();
    return true;
  }

  function getTraitSummary(entry) {
    const traits = U.toArray(entry?.traits);
    const mutations = U.toArray(entry?.mutations);
    const all = [...traits, ...mutations].filter(Boolean);
    if (!all.length) return "No traversal traits";
    return all.slice(0, 6).map((id) => U.titleCase(id)).join(", ");
  }

  function renderControlPanel() {
    const modal = U.byId("partyModal");
    const body = modal?.querySelector?.(".modal-body");
    if (!modal || modal.classList.contains("hidden") || !body) return;

    let panel = U.byId("partyControlPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "partyControlPanel";
      panel.className = "card party-control-panel";
      body.prepend(panel);
    }

    const currentId = getControlledAvatarId();
    const player = S.getPlayer();
    const entries = [
      {
        id: "player",
        name: player?.name || "Ranger",
        sub: "Conservationist",
        traits: U.toArray(player?.traits),
        mutations: U.toArray(player?.mutations)
      },
      ...getActiveCompanions().map((comp) => ({
        id: comp.id,
        name: comp.name || "Companion",
        sub: `${U.titleCase(comp.speciesId || "creature")} • Lv ${comp.level || 1}`,
        traits: U.toArray(comp.traits),
        mutations: U.toArray(comp.mutations)
      }))
    ];

    panel.innerHTML = `
      <div class="meta-title">Controlled Character</div>
      <div class="meta-sub">Choose who you are currently moving as. Terrain access checks that party member's traits.</div>
      <div class="party-control-grid">
        ${entries.map((entry) => `
          <button class="${entry.id === currentId ? "primary-btn" : "ghost-btn"} party-control-btn" data-avatar-id="${htmlEscape(entry.id)}">
            <strong>${entry.id === currentId ? "▶ " : ""}${htmlEscape(entry.name)}</strong>
            <span>${htmlEscape(entry.sub || "")}</span>
            <small>${htmlEscape(getTraitSummary(entry))}</small>
          </button>
        `).join("")}
      </div>
    `;

    panel.querySelectorAll(".party-control-btn").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        setControlledAvatar(btn.dataset.avatarId || "player");
      });
    });
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(renderControlPanel, 80);
  }

  function bindEvents() {
    U.eventBus.on("modal:opened", (modalId) => {
      if (modalId === "partyModal") scheduleRender();
    });
    U.eventBus.on("party:changed", scheduleRender);
    U.eventBus.on("runtime:changed", scheduleRender);
  }

  function init() {
    if (state.initialized) return true;
    bindEvents();
    scheduleRender();
    state.initialized = true;
    return true;
  }

  const API = {
    init,
    getControlledAvatarId,
    getControlledAvatar,
    setControlledAvatar,
    renderControlPanel
  };

  window.GL_PARTY_CONTROL = API;
  init();
  return Object.freeze(API);
})();
