window.GrabLabUtils = (() => {
  const CFG = window.GrabLabConfig;

  const LOG_PREFIX = `[${CFG?.APP?.title || "GrabLab"}]`;

  function log(...args) {
    if (!CFG?.APP?.debug) return;
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function error(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  function noop() {}

  function now() {
    return Date.now();
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round(value, decimals = 0) {
    const p = 10 ** decimals;
    return Math.round(value * p) / p;
  }

  function floor(value, decimals = 0) {
    const p = 10 ** decimals;
    return Math.floor(value * p) / p;
  }

  function ceil(value, decimals = 0) {
    const p = 10 ** decimals;
    return Math.ceil(value * p) / p;
  }

  function rand(min = 0, max = 1) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min = 0, max = 1) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  function randBool(chance = 0.5) {
    return Math.random() < chance;
  }

  function pick(arr = []) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[randInt(0, arr.length - 1)];
  }

  function pickWeighted(list = [], weightKey = "weight") {
    if (!Array.isArray(list) || list.length === 0) return null;

    const total = list.reduce((sum, item) => sum + Math.max(0, Number(item?.[weightKey] ?? 0)), 0);
    if (total <= 0) return pick(list);

    let roll = Math.random() * total;

    for (const item of list) {
      roll -= Math.max(0, Number(item?.[weightKey] ?? 0));
      if (roll <= 0) return item;
    }

    return list[list.length - 1] || null;
  }

  function shuffle(input = []) {
    const arr = Array.isArray(input) ? [...input] : [];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function chance(percent = 0) {
    return Math.random() * 100 < percent;
  }

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function slugify(value = "") {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function titleCase(value = "") {
    return String(value)
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function deepMerge(target, source) {
    const base = isObject(target) ? deepClone(target) : {};

    if (!isObject(source)) return base;

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = base[key];

      if (Array.isArray(sourceValue)) {
        base[key] = deepClone(sourceValue);
      } else if (isObject(sourceValue)) {
        base[key] = deepMerge(isObject(targetValue) ? targetValue : {}, sourceValue);
      } else {
        base[key] = sourceValue;
      }
    }

    return base;
  }

  function safeJsonParse(text, fallback = null) {
    try {
      return JSON.parse(text);
    } catch (err) {
      warn("safeJsonParse failed:", err);
      return fallback;
    }
  }

  function safeStringify(value, fallback = "") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      warn("safeStringify failed:", err);
      return fallback;
    }
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      error("saveLocal failed:", key, err);
      return false;
    }
  }

  function loadLocal(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      error("loadLocal failed:", key, err);
      return fallback;
    }
  }

  function removeLocal(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      error("removeLocal failed:", key, err);
      return false;
    }
  }

  function hasLocal(key) {
    try {
      return localStorage.getItem(key) != null;
    } catch (err) {
      error("hasLocal failed:", key, err);
      return false;
    }
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function on(target, eventName, handler, options) {
    if (!target || !eventName || typeof handler !== "function") return noop;
    target.addEventListener(eventName, handler, options);
    return () => target.removeEventListener(eventName, handler, options);
  }

  function once(target, eventName, handler, options) {
    return on(target, eventName, handler, { ...(options || {}), once: true });
  }

  function createEl(tag = "div", options = {}) {
    const el = document.createElement(tag);

    if (options.id) el.id = options.id;
    if (options.className) el.className = options.className;
    if (options.text != null) el.textContent = String(options.text);
    if (options.html != null) el.innerHTML = String(options.html);

    if (options.attrs && isObject(options.attrs)) {
      for (const [key, value] of Object.entries(options.attrs)) {
        el.setAttribute(key, String(value));
      }
    }

    if (options.dataset && isObject(options.dataset)) {
      for (const [key, value] of Object.entries(options.dataset)) {
        el.dataset[key] = String(value);
      }
    }

    if (options.style && isObject(options.style)) {
      Object.assign(el.style, options.style);
    }

    return el;
  }

  function emptyEl(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function setText(el, text = "") {
    if (el) el.textContent = String(text);
  }

  function setHTML(el, html = "") {
    if (el) el.innerHTML = String(html);
  }

  function toggleClass(el, className, force) {
    if (!el || !className) return;
    el.classList.toggle(className, force);
  }

  function show(el, displayValue = "") {
    if (!el) return;
    el.classList.remove("hidden");
    if (displayValue) el.style.display = displayValue;
  }

  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
  }

  function attr(el, name, value) {
    if (!el) return null;
    if (value === undefined) return el.getAttribute(name);
    el.setAttribute(name, String(value));
    return value;
  }

  function data(el, key, value) {
    if (!el) return null;
    if (value === undefined) return el.dataset[key];
    el.dataset[key] = String(value);
    return value;
  }

  function formatNumber(value = 0) {
    return Number(value || 0).toLocaleString();
  }

  function formatPercent(value = 0, decimals = 0) {
    return `${round(value, decimals)}%`;
  }

  function formatCurrency(value = 0) {
    try {
      return new Intl.NumberFormat(CFG.LOCALIZATION.defaultLocale, {
        style: "currency",
        currency: CFG.LOCALIZATION.currencyCode,
        maximumFractionDigits: 0
      }).format(Number(value || 0));
    } catch {
      return `$${formatNumber(value)}`;
    }
  }

  function pad(num, size = 2) {
    return String(num).padStart(size, "0");
  }

  function formatClock(hour = 0, minute = 0) {
    const h = Number(hour) || 0;
    const m = Number(minute) || 0;
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${pad(m)} ${suffix}`;
  }

  function formatDurationMinutes(totalMinutes = 0) {
    const minutes = Math.max(0, Math.floor(totalMinutes));
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = minutes % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins || parts.length === 0) parts.push(`${mins}m`);
    return parts.join(" ");
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  function sumBy(arr = [], mapper = (x) => x) {
    return arr.reduce((sum, item, index) => sum + Number(mapper(item, index) || 0), 0);
  }

  function groupBy(arr = [], keyOrFn) {
    const map = {};
    const getter = typeof keyOrFn === "function" ? keyOrFn : (item) => item?.[keyOrFn];

    for (const item of arr) {
      const key = getter(item);
      const finalKey = key == null ? "undefined" : String(key);
      if (!map[finalKey]) map[finalKey] = [];
      map[finalKey].push(item);
    }

    return map;
  }

  function sortBy(arr = [], keyOrFn, direction = "asc") {
    const getter = typeof keyOrFn === "function" ? keyOrFn : (item) => item?.[keyOrFn];
    const dir = direction === "desc" ? -1 : 1;

    return [...arr].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }

      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function uniqueBy(arr = [], keyOrFn) {
    const getter = typeof keyOrFn === "function" ? keyOrFn : (item) => item?.[keyOrFn];
    const seen = new Set();
    const out = [];

    for (const item of arr) {
      const key = getter(item);
      const stamp = typeof key === "object" ? safeStringify(key) : String(key);
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      out.push(item);
    }

    return out;
  }

  function chunk(arr = [], size = 1) {
    if (!Array.isArray(arr) || size <= 0) return [];
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  function distance(a = { x: 0, y: 0 }, b = { x: 0, y: 0 }) {
    const dx = (Number(b.x) || 0) - (Number(a.x) || 0);
    const dy = (Number(b.y) || 0) - (Number(a.y) || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function manhattanDistance(a = { x: 0, y: 0 }, b = { x: 0, y: 0 }) {
    return Math.abs((Number(b.x) || 0) - (Number(a.x) || 0)) +
           Math.abs((Number(b.y) || 0) - (Number(a.y) || 0));
  }

  function withinRange(a, b, range = 1) {
    return distance(a, b) <= range;
  }

  function normalizePoint(x = 0, y = 0) {
    return { x: Number(x) || 0, y: Number(y) || 0 };
  }

  function getPointerPos(evt, element) {
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const clientX = evt?.touches?.[0]?.clientX ?? evt?.changedTouches?.[0]?.clientX ?? evt?.clientX ?? 0;
    const clientY = evt?.touches?.[0]?.clientY ?? evt?.changedTouches?.[0]?.clientY ?? evt?.clientY ?? 0;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = createEl("a", {
      attrs: {
        href: url,
        download: filename
      }
    });

    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No file provided."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${path} (${response.status})`);
    }
    return response.json();
  }

  function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function debounce(fn, delay = 150) {
    let timeoutId = null;
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function throttle(fn, limit = 150) {
    let waiting = false;
    let lastArgs = null;

    return function throttled(...args) {
      if (waiting) {
        lastArgs = args;
        return;
      }

      fn.apply(this, args);
      waiting = true;

      setTimeout(() => {
        waiting = false;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    };
  }

  function makeEventBus() {
    const listeners = new Map();

    return {
      on(eventName, handler) {
        if (!listeners.has(eventName)) listeners.set(eventName, new Set());
        listeners.get(eventName).add(handler);
        return () => listeners.get(eventName)?.delete(handler);
      },

      emit(eventName, payload) {
        const handlers = listeners.get(eventName);
        if (!handlers) return;
        handlers.forEach((handler) => {
          try {
            handler(payload);
          } catch (err) {
            error(`Event handler error for "${eventName}":`, err);
          }
        });
      },

      clear(eventName) {
        if (eventName) listeners.delete(eventName);
        else listeners.clear();
      }
    };
  }

  function ensureArrayProp(obj, key) {
    if (!obj[key] || !Array.isArray(obj[key])) obj[key] = [];
    return obj[key];
  }

  function addToStackedInventory(list = [], itemId, quantity = 1, extra = {}) {
    if (!itemId || quantity <= 0) return list;
    const arr = Array.isArray(list) ? list : [];
    const existing = arr.find((entry) => entry.itemId === itemId && !entry.uniqueId);

    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Number(quantity || 0);
      return arr;
    }

    arr.push({
      itemId,
      quantity: Number(quantity || 0),
      ...deepClone(extra)
    });

    return arr;
  }

  function removeFromStackedInventory(list = [], itemId, quantity = 1) {
    if (!Array.isArray(list) || !itemId || quantity <= 0) return false;

    const entry = list.find((it) => it.itemId === itemId);
    if (!entry) return false;

    entry.quantity = Number(entry.quantity || 0) - Number(quantity || 0);

    if (entry.quantity <= 0) {
      const index = list.indexOf(entry);
      if (index >= 0) list.splice(index, 1);
    }

    return true;
  }

  function getItemQuantity(list = [], itemId) {
    if (!Array.isArray(list) || !itemId) return 0;
    return list
      .filter((it) => it.itemId === itemId)
      .reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  }

  function hasItemQuantity(list = [], itemId, quantity = 1) {
    return getItemQuantity(list, itemId) >= quantity;
  }

  function pluralize(word = "", count = 1, pluralForm = null) {
    return count === 1 ? word : (pluralForm || `${word}s`);
  }

  function formatItemQuantity(name = "Item", qty = 1, pluralForm = null) {
    return `${formatNumber(qty)} ${pluralize(name, qty, pluralForm)}`;
  }

  function sanitizeSaveData(data) {
    if (!isObject(data)) return null;
    return deepClone(data);
  }

  const eventBus = makeEventBus();

  const API = {
    log,
    warn,
    error,
    noop,
    now,
    isoNow,
    clamp,
    lerp,
    round,
    floor,
    ceil,
    rand,
    randInt,
    randBool,
    pick,
    pickWeighted,
    shuffle,
    chance,
    uid,
    slugify,
    titleCase,
    deepClone,
    isObject,
    deepMerge,
    safeJsonParse,
    safeStringify,
    saveLocal,
    loadLocal,
    removeLocal,
    hasLocal,
    qs,
    qsa,
    byId,
    on,
    once,
    createEl,
    emptyEl,
    setText,
    setHTML,
    toggleClass,
    show,
    hide,
    attr,
    data,
    formatNumber,
    formatPercent,
    formatCurrency,
    pad,
    formatClock,
    formatDurationMinutes,
    toArray,
    sumBy,
    groupBy,
    sortBy,
    uniqueBy,
    chunk,
    distance,
    manhattanDistance,
    withinRange,
    normalizePoint,
    getPointerPos,
    downloadTextFile,
    readFileAsText,
    fetchJson,
    wait,
    debounce,
    throttle,
    makeEventBus,
    ensureArrayProp,
    addToStackedInventory,
    removeFromStackedInventory,
    getItemQuantity,
    hasItemQuantity,
    pluralize,
    formatItemQuantity,
    sanitizeSaveData,
    eventBus
  };

  window.GL_UTILS = API;

  return Object.freeze(API);
})();