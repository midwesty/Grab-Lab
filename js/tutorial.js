window.GrabLabTutorial = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const UI = window.GrabLabUI;
  const M = window.GrabLabModal;

  const state = {
    initialized: false,
    currentIndex: 0,
    steps: [],
    progress: {}
  };

  function getTutorialData() {
    return U.toArray(S.getData()?.tutorials);
  }

  function getFallbackSteps() {
    return [
      {
        id: "welcome",
        title: "Welcome to Grab Lab",
        body: "You are a conservationist stationed at the last relatively safe outpost in a fungal-ravaged wilderness. Your job is to survive, gather resources, breed helpful wildlife, and push the mold back one miserable patch at a time.",
        objectiveType: "view_only",
        hint: "Read through the tutorial and explore the field station."
      },
      {
        id: "move",
        title: "Move Around",
        body: "Tap or click the world to move to a nearby tile. On mobile, hold on the world for a right-click style context action.",
        objectiveType: "move_count",
        requiredCount: 1,
        hint: "Tap a nearby tile on the world or the minimap."
      },
      {
        id: "inventory",
        title: "Check Your Gear",
        body: "Open your inventory to inspect your starting supplies. You can use, equip, transfer, and sort items there.",
        objectiveType: "open_modal",
        targetModal: "inventoryModal",
        hint: "Open Inventory from the sidebar or press I."
      },
      {
        id: "fishing",
        title: "Try Fishing",
        body: "Fishing is one of your main survival tools. Cast a line, use bait when you have it, and check passive lines regularly.",
        objectiveType: "log_contains",
        logNeedle: "Cast line",
        hint: "Use the Cast Line button or open the Fishing panel."
      },
      {
        id: "crafting",
        title: "Craft Something",
        body: "Use your resources to craft field supplies, bait, additives, and survival tools.",
        objectiveType: "modal_and_action",
        targetModal: "craftModal",
        logNeedle: "Crafted",
        hint: "Open Crafting and craft one simple recipe."
      },
      {
        id: "companions",
        title: "Build Your Wildlife Team",
        body: "Captured animals can become companions, breeders, research subjects, or conservation release candidates.",
        objectiveType: "open_modal",
        targetModal: "partyModal",
        hint: "Open Party to inspect your roster."
      },
      {
        id: "breeding",
        title: "Breeding Lab",
        body: "Breeding combines traits, mutations, and additives to create useful offspring. Cross-species breeding comes later unless unlocked.",
        objectiveType: "open_modal",
        targetModal: "breedingModal",
        hint: "Open the Breeding Lab and inspect the parent selection panels."
      },
      {
        id: "map",
        title: "Map and Expansion",
        body: "Use the world map to inspect revealed areas, track cleared land, and unlock future fast travel nodes.",
        objectiveType: "open_modal",
        targetModal: "mapModal",
        hint: "Open the map and select a tile."
      },
      {
        id: "admin",
        title: "Admin Tools",
        body: "This prototype includes admin and cheat tools to help you test progression, combat, crafting, and world states quickly.",
        objectiveType: "open_modal",
        targetModal: "adminModal",
        hint: "Open the Admin panel and inspect the quick tools."
      },
      {
        id: "done",
        title: "You’re Ready",
        body: "That covers the basics. Explore, fish, build, breed strange wildlife, and start taking the world back from the fungus.",
        objectiveType: "view_only",
        hint: "You can reopen this tutorial anytime from the HUD."
      }
    ];
  }

  function seedFallbackTutorialsIfNeeded() {
    const tutorials = getTutorialData();
    if (tutorials.length > 0) return false;

    S.replaceDataBucket("tutorials", getFallbackSteps());
    return true;
  }

  function getSteps() {
    return state.steps.length ? state.steps : getTutorialData();
  }

  function getCurrentStep() {
    const steps = getSteps();
    return steps[state.currentIndex] || null;
  }

  function getTutorialProgress() {
    const flags = S.getFlags();
    if (!U.isObject(flags.tutorialProgress)) {
      flags.tutorialProgress = {};
      S.setFlag("tutorialProgress", flags.tutorialProgress);
    }
    return flags.tutorialProgress;
  }

  function saveProgress(progress) {
    S.setFlag("tutorialProgress", progress);
    return progress;
  }

  function isStepComplete(stepId) {
    const progress = getTutorialProgress();
    return Boolean(progress?.[stepId]?.completed);
  }

  function markStepComplete(stepId) {
    if (!stepId) return false;

    const progress = getTutorialProgress();
    if (!U.isObject(progress[stepId])) {
      progress[stepId] = {};
    }

    progress[stepId].completed = true;
    progress[stepId].completedAt = U.isoNow();
    saveProgress(progress);

    S.logActivity(`Tutorial step completed: ${U.titleCase(stepId)}.`, "success");
    S.addToast(`Tutorial: ${U.titleCase(stepId)} complete`, "success");

    if (allRequiredStepsComplete()) {
      S.setFlag("tutorialCompleted", true);
    }

    renderTutorialPanel();
    return true;
  }

  function setStepMetric(stepId, key, value) {
    if (!stepId || !key) return null;

    const progress = getTutorialProgress();
    if (!U.isObject(progress[stepId])) {
      progress[stepId] = {};
    }

    progress[stepId][key] = value;
    saveProgress(progress);
    return value;
  }

  function incrementStepMetric(stepId, key, amount = 1) {
    const progress = getTutorialProgress();
    if (!U.isObject(progress[stepId])) {
      progress[stepId] = {};
    }

    const next = Number(progress[stepId][key] || 0) + Number(amount || 0);
    progress[stepId][key] = next;
    saveProgress(progress);
    return next;
  }

  function allRequiredStepsComplete() {
    const steps = getSteps().filter((step) => step.id !== "done");
    return steps.every((step) => isStepComplete(step.id));
  }

  function evaluateStep(step) {
    if (!step) return false;
    if (isStepComplete(step.id)) return true;

    const progress = getTutorialProgress();
    const stepProgress = progress?.[step.id] || {};

    switch (step.objectiveType) {
      case "view_only":
        return false;

      case "move_count": {
        const count = Number(stepProgress.moveCount || 0);
        if (count >= Number(step.requiredCount || 1)) {
          markStepComplete(step.id);
          return true;
        }
        return false;
      }

      case "open_modal": {
        const opened = Boolean(stepProgress.openedModal);
        if (opened) {
          markStepComplete(step.id);
          return true;
        }
        return false;
      }

      case "log_contains": {
        const activity = U.toArray(S.getRuntime()?.ui?.activityLog);
        const needle = String(step.logNeedle || "").toLowerCase();
        const found = activity.some((entry) =>
          String(entry?.message || "").toLowerCase().includes(needle)
        );
        if (found) {
          markStepComplete(step.id);
          return true;
        }
        return false;
      }

      case "modal_and_action": {
        const opened = Boolean(stepProgress.openedModal);
        const activity = U.toArray(S.getRuntime()?.ui?.activityLog);
        const needle = String(step.logNeedle || "").toLowerCase();
        const found = activity.some((entry) =>
          String(entry?.message || "").toLowerCase().includes(needle)
        );
        if (opened && found) {
          markStepComplete(step.id);
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  function evaluateAllSteps() {
    getSteps().forEach((step) => evaluateStep(step));
  }

  function stepStatusLabel(step) {
    if (!step) return "Unknown";
    if (isStepComplete(step.id)) return "Complete";
    if (step.id === getCurrentStep()?.id) return "Active";
    return "Pending";
  }

  function goToStep(index) {
    const steps = getSteps();
    const safe = U.clamp(Number(index || 0), 0, Math.max(0, steps.length - 1));
    state.currentIndex = safe;
    renderTutorialPanel();
    return getCurrentStep();
  }

  function nextStep() {
    const next = Math.min(state.currentIndex + 1, getSteps().length - 1);
    return goToStep(next);
  }

  function prevStep() {
    const prev = Math.max(state.currentIndex - 1, 0);
    return goToStep(prev);
  }

  function jumpToFirstIncomplete() {
    const steps = getSteps();
    const idx = steps.findIndex((step) => !isStepComplete(step.id));
    if (idx >= 0) {
      return goToStep(idx);
    }
    return goToStep(steps.length - 1);
  }

  function startTutorial(forceOpen = true) {
    state.currentIndex = 0;
    evaluateAllSteps();
    jumpToFirstIncomplete();

    if (forceOpen) {
      M.openModal("tutorialModal");
    }

    renderTutorialPanel();
    return true;
  }

  function replayTutorial() {
    const progress = getTutorialProgress();
    Object.keys(progress).forEach((key) => {
      delete progress[key];
    });
    saveProgress(progress);
    S.setFlag("tutorialCompleted", false);
    startTutorial(true);
    return true;
  }

  function completeCurrentStepManually() {
    const step = getCurrentStep();
    if (!step) return false;

    markStepComplete(step.id);
    if (state.currentIndex < getSteps().length - 1) {
      nextStep();
    }
    return true;
  }

  function htmlEscape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderTutorialPanel() {
    const host = U.byId("tutorialContent");
    if (!host) return;

    const steps = getSteps();
    const step = getCurrentStep();

    if (!step) {
      host.innerHTML = `<p>No tutorial steps available.</p>`;
      return;
    }

    const progress = getTutorialProgress();
    const stepProgress = progress?.[step.id] || {};
    const status = stepStatusLabel(step);

    const sideList = steps.map((entry, idx) => `
      <button
        class="${idx === state.currentIndex ? "primary-btn" : "ghost-btn"} tutorial-jump-btn"
        data-step-index="${idx}"
        style="width:100%;text-align:left;"
      >
        ${htmlEscape(entry.title)} — ${htmlEscape(stepStatusLabel(entry))}
      </button>
    `).join("");

    let objectiveHtml = "";
    if (step.objectiveType === "move_count") {
      objectiveHtml = `<p><strong>Progress:</strong> ${htmlEscape(String(stepProgress.moveCount || 0))}/${htmlEscape(String(step.requiredCount || 1))}</p>`;
    } else if (step.objectiveType === "open_modal") {
      objectiveHtml = `<p><strong>Progress:</strong> ${stepProgress.openedModal ? "Opened" : "Not opened yet"}</p>`;
    } else if (step.objectiveType === "log_contains" || step.objectiveType === "modal_and_action") {
      objectiveHtml = `<p><strong>Progress:</strong> ${htmlEscape(step.logNeedle || "Action")} pending</p>`;
    }

    host.innerHTML = `
      <div class="split-layout">
        <div class="card-list">${sideList}</div>
        <div class="detail-panel">
          <h3>${htmlEscape(step.title)}</h3>
          <p><strong>Status:</strong> ${htmlEscape(status)}</p>
          <p>${htmlEscape(step.body || "")}</p>
          ${objectiveHtml}
          <p><strong>Hint:</strong> ${htmlEscape(step.hint || "Explore the game.")}</p>

          <div class="admin-console-actions">
            <button id="btnTutorialMarkDone" class="secondary-btn">Mark Step Complete</button>
            <button id="btnTutorialReplay" class="ghost-btn">Replay Tutorial</button>
            <button id="btnTutorialJumpIncomplete" class="ghost-btn">Jump to First Incomplete</button>
          </div>
        </div>
      </div>
    `;

    U.qsa(".tutorial-jump-btn", host).forEach((btn) => {
      U.on(btn, "click", () => {
        goToStep(Number(btn.dataset.stepIndex || 0));
      });
    });

    const btnMark = U.byId("btnTutorialMarkDone");
    const btnReplay = U.byId("btnTutorialReplay");
    const btnJump = U.byId("btnTutorialJumpIncomplete");

    if (btnMark) {
      U.on(btnMark, "click", () => {
        completeCurrentStepManually();
      });
    }

    if (btnReplay) {
      U.on(btnReplay, "click", () => {
        replayTutorial();
      });
    }

    if (btnJump) {
      U.on(btnJump, "click", () => {
        jumpToFirstIncomplete();
      });
    }
  }

  function bindButtons() {
    const prev = U.byId("btnTutorialPrev");
    const next = U.byId("btnTutorialNext");

    if (prev) {
      U.on(prev, "click", () => {
        prevStep();
      });
    }

    if (next) {
      U.on(next, "click", () => {
        nextStep();
      });
    }
  }

  function bindProgressEvents() {
    U.eventBus.on("world:playerMoved", () => {
      const current = getCurrentStep();
      if (current?.objectiveType === "move_count") {
        incrementStepMetric(current.id, "moveCount", 1);
        evaluateStep(current);
        renderTutorialPanel();
      } else {
        const moveStep = getSteps().find((step) => step.objectiveType === "move_count" && !isStepComplete(step.id));
        if (moveStep) {
          incrementStepMetric(moveStep.id, "moveCount", 1);
          evaluateStep(moveStep);
        }
      }
    });

    U.eventBus.on("modal:opened", (modalId) => {
      const steps = getSteps().filter((step) => step.targetModal === modalId && !isStepComplete(step.id));
      steps.forEach((step) => {
        setStepMetric(step.id, "openedModal", true);
        evaluateStep(step);
      });

      if (modalId === "tutorialModal") {
        renderTutorialPanel();
      }
    });

    U.eventBus.on("ui:activityLogged", () => {
      evaluateAllSteps();
      if (S.isModalOpen("tutorialModal")) {
        renderTutorialPanel();
      }
    });

    U.eventBus.on("screen:changed", () => {
      evaluateAllSteps();
    });
  }

  function maybeAutoStartTutorial() {
    if (!CFG.TUTORIAL.enabled || !CFG.TUTORIAL.autoStartOnNewGame) return false;
    if (S.getFlag("tutorialCompleted", false)) return false;
    if (S.getCurrentScreen() !== "game") return false;

    startTutorial(true);
    return true;
  }

  function init() {
    if (state.initialized) return true;

    seedFallbackTutorialsIfNeeded();
    state.steps = getTutorialData();
    bindButtons();
    bindProgressEvents();
    evaluateAllSteps();
    renderTutorialPanel();

    state.initialized = true;
    U.eventBus.emit("tutorial:initialized");
    return true;
  }

  const API = {
    init,
    getTutorialData,
    getFallbackSteps,
    seedFallbackTutorialsIfNeeded,
    getSteps,
    getCurrentStep,
    getTutorialProgress,
    saveProgress,
    isStepComplete,
    markStepComplete,
    setStepMetric,
    incrementStepMetric,
    allRequiredStepsComplete,
    evaluateStep,
    evaluateAllSteps,
    stepStatusLabel,
    goToStep,
    nextStep,
    prevStep,
    jumpToFirstIncomplete,
    startTutorial,
    replayTutorial,
    completeCurrentStepManually,
    renderTutorialPanel,
    maybeAutoStartTutorial
  };

  window.GL_TUTORIAL = API;

  return Object.freeze(API);
})();