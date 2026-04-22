window.GrabLabAudio = (() => {
  const CFG = window.GrabLabConfig;
  const U = window.GrabLabUtils;
  const S = window.GrabLabState;
  const SAVE = window.GrabLabSaveLoad;

  const state = {
    initialized: false,
    unlocked: false,
    currentMusicTrack: null,
    currentAmbientTrack: null,
    currentMusicCategory: "music",
    currentAmbientCategory: "ambient",
    queuedMusicTrack: null,
    queuedAmbientTrack: null,
    fadeDurationMs: 500,
    library: {
      music: {},
      ambient: {},
      sfx: {}
    }
  };

  function getEls() {
    return {
      bgm: U.byId("bgmMain"),
      ambient: U.byId("ambientMain"),
      sfx: U.byId("sfxMain")
    };
  }

  function getSettings() {
    return S.getSettings();
  }

  function isMuted() {
    return Boolean(getSettings()?.masterMuted);
  }

  function getVolume(type = "music") {
    const settings = getSettings();
    if (type === "music") return Number(settings?.musicVolume ?? CFG.AUDIO.defaultMusicVolume);
    if (type === "ambient") return Number(settings?.ambientVolume ?? CFG.AUDIO.defaultAmbientVolume);
    return Number(settings?.sfxVolume ?? CFG.AUDIO.defaultSfxVolume);
  }

  function normalizeVolume(value, fallback = 1) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return U.clamp(num, 0, 1);
  }

  function buildTrackPath(filename, category = "music") {
    if (!filename) return "";
    if (/^(https?:)?\/\//i.test(filename) || filename.startsWith("assets/")) return filename;

    if (category === "music") return `${CFG.PATHS.music}${filename}`;
    if (category === "ambient") return `${CFG.PATHS.ambient}${filename}`;
    return `${CFG.PATHS.sfx}${filename}`;
  }

  function buildLibraryMap(entries = [], defaultCategory = "sfx") {
    const out = {};
    if (!Array.isArray(entries)) return out;

    for (const entry of entries) {
      if (!entry?.id) continue;
      out[entry.id] = {
        id: entry.id,
        label: entry.label || entry.name || U.titleCase(entry.id),
        file: entry.file || entry.filename || "",
        category: entry.category || defaultCategory,
        volume: normalizeVolume(entry.volume, 1),
        loop: Boolean(entry.loop),
        allowMissing: entry.allowMissing !== false
      };
    }

    return out;
  }

  function rebuildLibrary() {
    const audioData = S.getData()?.audio || {};

    state.library.music = {
      main_theme: {
        id: "main_theme",
        label: "Main Theme",
        file: CFG.AUDIO.musicTrackMainMenu,
        category: "music",
        volume: 1,
        loop: true,
        allowMissing: true
      },
      exploration: {
        id: "exploration",
        label: "Exploration Loop",
        file: CFG.AUDIO.musicTrackExploration,
        category: "music",
        volume: 1,
        loop: true,
        allowMissing: true
      },
      combat: {
        id: "combat",
        label: "Combat Loop",
        file: CFG.AUDIO.musicTrackCombat,
        category: "music",
        volume: 1,
        loop: true,
        allowMissing: true
      },
      ...buildLibraryMap(audioData.music || [], "music")
    };

    state.library.ambient = {
      field_station_ambient: {
        id: "field_station_ambient",
        label: "Field Station Ambient",
        file: CFG.AUDIO.ambientTrackBase,
        category: "ambient",
        volume: 1,
        loop: true,
        allowMissing: true
      },
      river_ambient: {
        id: "river_ambient",
        label: "River Ambient",
        file: CFG.AUDIO.ambientTrackRiver,
        category: "ambient",
        volume: 1,
        loop: true,
        allowMissing: true
      },
      ...buildLibraryMap(audioData.ambient || [], "ambient")
    };

    state.library.sfx = {
      ui_confirm: {
        id: "ui_confirm",
        label: "UI Confirm",
        file: CFG.AUDIO.sfxConfirm,
        category: "sfx",
        volume: 1,
        loop: false,
        allowMissing: true
      },
      ui_cancel: {
        id: "ui_cancel",
        label: "UI Cancel",
        file: CFG.AUDIO.sfxCancel,
        category: "sfx",
        volume: 1,
        loop: false,
        allowMissing: true
      },
      ui_hover: {
        id: "ui_hover",
        label: "UI Hover",
        file: CFG.AUDIO.sfxHover,
        category: "sfx",
        volume: 1,
        loop: false,
        allowMissing: true
      },
      ui_error: {
        id: "ui_error",
        label: "UI Error",
        file: CFG.AUDIO.sfxError,
        category: "sfx",
        volume: 1,
        loop: false,
        allowMissing: true
      },
      ...buildLibraryMap(audioData.sfx || [], "sfx")
    };

    U.eventBus.emit("audio:libraryRebuilt", U.deepClone(state.library));
    return state.library;
  }

  function getTrack(id, category = null) {
    if (!id) return null;

    if (category) {
      return state.library?.[category]?.[id] || null;
    }

    return (
      state.library.music?.[id] ||
      state.library.ambient?.[id] ||
      state.library.sfx?.[id] ||
      null
    );
  }

  function applyBaseVolumes() {
    const { bgm, ambient, sfx } = getEls();
    if (!bgm || !ambient || !sfx) return;

    const muted = isMuted();
    bgm.muted = muted;
    ambient.muted = muted;
    sfx.muted = muted;

    bgm.volume = muted ? 0 : normalizeVolume(getVolume("music"));
    ambient.volume = muted ? 0 : normalizeVolume(getVolume("ambient"));
    sfx.volume = muted ? 0 : normalizeVolume(getVolume("sfx"));
  }

  async function safePlay(el) {
    if (!el) return false;

    try {
      await el.play();
      return true;
    } catch (err) {
      U.warn("Audio play blocked or failed:", err?.message || err);
      return false;
    }
  }

  function stopEl(el) {
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch (err) {
      U.warn("stopEl failed:", err);
    }
  }

  function pauseEl(el) {
    if (!el) return;
    try {
      el.pause();
    } catch (err) {
      U.warn("pauseEl failed:", err);
    }
  }

  function fadeVolume(el, targetVolume = 0, durationMs = 400) {
    return new Promise((resolve) => {
      if (!el) {
        resolve(false);
        return;
      }

      const startVolume = Number(el.volume || 0);
      const endVolume = U.clamp(Number(targetVolume || 0), 0, 1);
      const startAt = U.now();
      const duration = Math.max(1, Number(durationMs || 1));

      function step() {
        const elapsed = U.now() - startAt;
        const t = U.clamp(elapsed / duration, 0, 1);
        el.volume = U.lerp(startVolume, endVolume, t);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve(true);
        }
      }

      step();
    });
  }

  async function swapLoop(el, track, baseVolumeType = "music") {
    if (!el) return false;

    const muted = isMuted();
    const baseVolume = muted ? 0 : getVolume(baseVolumeType);
    const targetVolume = U.clamp(baseVolume * normalizeVolume(track?.volume, 1), 0, 1);

    try {
      await fadeVolume(el, 0, state.fadeDurationMs / 2);
      el.pause();
      el.currentTime = 0;

      if (!track?.file) {
        el.removeAttribute("src");
        el.load();
        return false;
      }

      el.src = buildTrackPath(track.file, track.category);
      el.loop = Boolean(track.loop);
      el.volume = 0;
      el.load();

      const played = await safePlay(el);
      if (!played) return false;

      await fadeVolume(el, targetVolume, state.fadeDurationMs);
      return true;
    } catch (err) {
      U.warn("swapLoop failed:", err);
      return false;
    }
  }

  function unlockAudio() {
    if (state.unlocked) return true;
    state.unlocked = true;
    U.eventBus.emit("audio:unlocked");
    return true;
  }

  function bindUnlockHandlers() {
    const unlockOnce = () => {
      unlockAudio();
      document.removeEventListener("pointerdown", unlockOnce);
      document.removeEventListener("keydown", unlockOnce);
      document.removeEventListener("touchstart", unlockOnce);
    };

    document.addEventListener("pointerdown", unlockOnce, { passive: true });
    document.addEventListener("keydown", unlockOnce);
    document.addEventListener("touchstart", unlockOnce, { passive: true });
  }

  async function playMusic(trackId = "exploration") {
    const track = getTrack(trackId, "music");
    const { bgm } = getEls();

    if (!track || !bgm) return false;

    state.currentMusicTrack = track.id;
    state.currentMusicCategory = "music";

    const ok = await swapLoop(bgm, track, "music");
    U.eventBus.emit("audio:musicChanged", {
      trackId: track.id,
      ok
    });
    return ok;
  }

  async function playAmbient(trackId = "field_station_ambient") {
    const track = getTrack(trackId, "ambient");
    const { ambient } = getEls();

    if (!track || !ambient) return false;

    state.currentAmbientTrack = track.id;
    state.currentAmbientCategory = "ambient";

    const ok = await swapLoop(ambient, track, "ambient");
    U.eventBus.emit("audio:ambientChanged", {
      trackId: track.id,
      ok
    });
    return ok;
  }

  async function stopMusic(fade = true) {
    const { bgm } = getEls();
    if (!bgm) return false;

    if (fade) {
      await fadeVolume(bgm, 0, state.fadeDurationMs / 2);
    }

    stopEl(bgm);
    state.currentMusicTrack = null;
    U.eventBus.emit("audio:musicStopped");
    return true;
  }

  async function stopAmbient(fade = true) {
    const { ambient } = getEls();
    if (!ambient) return false;

    if (fade) {
      await fadeVolume(ambient, 0, state.fadeDurationMs / 2);
    }

    stopEl(ambient);
    state.currentAmbientTrack = null;
    U.eventBus.emit("audio:ambientStopped");
    return true;
  }

  function stopAll() {
    const { bgm, ambient, sfx } = getEls();
    stopEl(bgm);
    stopEl(ambient);
    stopEl(sfx);
    state.currentMusicTrack = null;
    state.currentAmbientTrack = null;
    U.eventBus.emit("audio:allStopped");
    return true;
  }

  async function playSfx(trackId = "ui_confirm", options = {}) {
    const track = getTrack(trackId, "sfx");
    const { sfx } = getEls();
    if (!track || !sfx) return false;

    const muted = isMuted();
    const baseVolume = muted ? 0 : getVolume("sfx");
    const targetVolume = U.clamp(
      normalizeVolume(options.volumeMultiplier ?? 1, 1) *
      baseVolume *
      normalizeVolume(track.volume, 1),
      0,
      1
    );

    try {
      sfx.pause();
      sfx.currentTime = 0;
      sfx.loop = false;
      sfx.src = buildTrackPath(track.file, "sfx");
      sfx.volume = targetVolume;
      sfx.load();

      const ok = await safePlay(sfx);
      U.eventBus.emit("audio:sfxPlayed", { trackId, ok });
      return ok;
    } catch (err) {
      U.warn("playSfx failed:", err);
      return false;
    }
  }

  function setMasterMuted(value = true) {
    const muted = Boolean(value);
    S.updateSettings({ masterMuted: muted });
    applyBaseVolumes();
    SAVE.saveSettings();
    U.eventBus.emit("audio:mutedChanged", muted);
    return muted;
  }

  function toggleMute() {
    return setMasterMuted(!isMuted());
  }

  function setMusicVolume(value) {
    const volume = normalizeVolume(value, CFG.AUDIO.defaultMusicVolume);
    S.updateSettings({ musicVolume: volume });
    applyBaseVolumes();
    SAVE.saveSettings();
    U.eventBus.emit("audio:musicVolumeChanged", volume);
    return volume;
  }

  function setAmbientVolume(value) {
    const volume = normalizeVolume(value, CFG.AUDIO.defaultAmbientVolume);
    S.updateSettings({ ambientVolume: volume });
    applyBaseVolumes();
    SAVE.saveSettings();
    U.eventBus.emit("audio:ambientVolumeChanged", volume);
    return volume;
  }

  function setSfxVolume(value) {
    const volume = normalizeVolume(value, CFG.AUDIO.defaultSfxVolume);
    S.updateSettings({ sfxVolume: volume });
    applyBaseVolumes();
    SAVE.saveSettings();
    U.eventBus.emit("audio:sfxVolumeChanged", volume);
    return volume;
  }

  function pauseAll() {
    const { bgm, ambient, sfx } = getEls();
    pauseEl(bgm);
    pauseEl(ambient);
    pauseEl(sfx);
    U.eventBus.emit("audio:pausedAll");
    return true;
  }

  async function resumeLoops() {
    const { bgm, ambient } = getEls();
    let ok = true;

    if (bgm?.src && state.currentMusicTrack) {
      ok = (await safePlay(bgm)) && ok;
    }

    if (ambient?.src && state.currentAmbientTrack) {
      ok = (await safePlay(ambient)) && ok;
    }

    U.eventBus.emit("audio:resumedLoops", ok);
    return ok;
  }

  function preloadTrack(trackId, category = null) {
    const track = getTrack(trackId, category);
    if (!track?.file) return false;

    const audio = new Audio();
    audio.src = buildTrackPath(track.file, track.category);
    audio.preload = "auto";

    return true;
  }

  function preloadCoreTracks() {
    preloadTrack("main_theme", "music");
    preloadTrack("exploration", "music");
    preloadTrack("combat", "music");
    preloadTrack("field_station_ambient", "ambient");
    preloadTrack("river_ambient", "ambient");
    preloadTrack("ui_confirm", "sfx");
    preloadTrack("ui_cancel", "sfx");
    preloadTrack("ui_hover", "sfx");
    preloadTrack("ui_error", "sfx");
  }

  function hookSettingEvents() {
    U.eventBus.on("settings:changed", () => {
      applyBaseVolumes();
    });
  }

  function hookVisibilityEvents() {
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) {
        pauseAll();
      } else {
        await resumeLoops();
      }
    });
  }

  function hookGameAudioEvents() {
    U.eventBus.on("combat:started", async () => {
      await playMusic("combat");
    });

    U.eventBus.on("combat:ended", async () => {
      await playMusic("exploration");
    });

    U.eventBus.on("screen:changed", async (screenId) => {
      if (screenId === "boot") {
        await playMusic("main_theme");
        await playAmbient("field_station_ambient");
      } else if (screenId === "game") {
        await playMusic("exploration");
        await playAmbient("field_station_ambient");
      } else if (screenId === "combat") {
        await playMusic("combat");
      }
    });
  }

  function getAudioState() {
    return U.deepClone(state);
  }

  async function init() {
    if (state.initialized) {
      applyBaseVolumes();
      return true;
    }

    rebuildLibrary();
    applyBaseVolumes();
    preloadCoreTracks();
    bindUnlockHandlers();
    hookSettingEvents();
    hookVisibilityEvents();
    hookGameAudioEvents();

    state.initialized = true;
    U.eventBus.emit("audio:initialized", getAudioState());
    return true;
  }

  const API = {
    init,
    rebuildLibrary,
    getTrack,
    getAudioState,
    unlockAudio,
    isMuted,
    getVolume,

    playMusic,
    playAmbient,
    stopMusic,
    stopAmbient,
    stopAll,

    playSfx,

    pauseAll,
    resumeLoops,

    setMasterMuted,
    toggleMute,
    setMusicVolume,
    setAmbientVolume,
    setSfxVolume,

    preloadTrack,
    preloadCoreTracks,
    applyBaseVolumes
  };

  window.GL_AUDIO = API;

  return Object.freeze(API);
})();