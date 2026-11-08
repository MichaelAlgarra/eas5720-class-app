(function () {
  "use strict";

  const CFG = window.LOG_CONFIG || {};
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Local testing talks to test/mock-server.js; anything else needs the deployed Apps Script URL.
  const API = LOCAL && !CFG.API_URL ? "/api" : CFG.API_URL;

  const KEY = { code: "wwm.code", who: "wwm.who", pending: "wwm.pending", cache: "wwm.cache" };
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: still works for this visit */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };

  const FIELDS = {
    music: [["worked", "Worked"], ["didnt", "Didn't help"], ["not_tried", "Didn't try"]],
    memory_box: [["worked", "Worked"], ["didnt", "Didn't help"], ["not_tried", "Didn't try"]],
    voice: [["worked", "Worked"], ["didnt", "Didn't help"], ["not_tried", "Didn't try"]],
    mood: [["calm", "Calm"], ["okay", "Okay"], ["restless", "Restless"], ["upset", "Upset"]],
    meals: [["all", "All"], ["some", "Some"], ["little", "A little"], ["none", "None"]],
    nap: [["yes", "Yes"], ["no", "No"]],
  };
  const LABEL = { music: "Songs", memory_box: "Memory box", voice: "Warm voice", mood: "Mood", meals: "Ate", nap: "Nap" };
  const BAD = new Set(["didnt", "restless", "upset", "none"]);

  const $ = (s) => document.querySelector(s);
  const views = ["code", "who", "home", "add"];
  function show(name) {
    views.forEach((v) => { $("#view-" + v).hidden = v !== name; });
    $("#who-chip").hidden = !(name === "home" || name === "add");
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === "class") n.className = v; else n.setAttribute(k, v); });
    if (text != null) n.textContent = text; // never innerHTML: entries are typed by people
    return n;
  }

  // ---------------------------------------------------------------- backend
  async function call(action, extra) {
    if (!API) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
    // text/plain keeps this a "simple" request, so the Apps Script endpoint needs no CORS preflight.
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action, code: store.get(KEY.code, "") }, extra)),
      redirect: "follow",
    });
    if (!res.ok) throw Object.assign(new Error("http_" + res.status), { code: "network" });
    const data = await res.json();
    if (!data.ok) throw Object.assign(new Error(data.error || "error"), { code: data.error || "error" });
    return data;
  }

  // ---------------------------------------------------------------- passcode + who
  async function checkCode(code) {
    store.set(KEY.code, code);
    try { await load(); return true; }
    catch (e) {
      if (e.code === "bad_code") store.del(KEY.code);
      throw e;
    }
  }

  function renderWho() {
    const box = $("#who-buttons"); box.replaceChildren();
    (CFG.PEOPLE || []).forEach((name) => {
      const b = el("button", { type: "button", class: "big" }, name);
      b.addEventListener("click", () => setWho(name));
      box.append(b);
    });
  }
  function setWho(name) {
    store.set(KEY.who, name);
    $("#who-chip").textContent = name + " ▾";
    show("home"); load().catch(() => {});
  }

  // ---------------------------------------------------------------- home
  async function load() {
    const status = $("#feed-status");
    status.textContent = "Loading…";
    try {
      const data = await call("list");
      store.set(KEY.cache, { entries: data.entries, tips: data.tips, at: Date.now() });
      render(data.entries, data.tips);
      status.textContent = data.entries.length ? "" : "No entries yet.";
      flushPending();
      return data;
    } catch (e) {
      const cached = store.get(KEY.cache, null);
      if (cached) render(cached.entries, cached.tips);
      status.textContent = e.code === "not_configured" ? "Not connected to the family sheet yet."
        : cached ? "Offline. Showing what this phone saw last." : "Couldn't reach the family sheet.";
      throw e;
    }
  }

  function render(entries, tips) {
    const tl = $("#tips"); tl.replaceChildren();
    (tips || []).forEach((t) => {
      const li = el("li", null, t.title);
      if (t.how) li.append(el("span", null, t.how));
      tl.append(li);
    });

    const feed = $("#feed"); feed.replaceChildren();
    const pending = store.get(KEY.pending, []).map((p) => Object.assign({ pending: true, saved_at: p.created_at }, p));
    pending.concat(entries || []).forEach((e) => {
      const li = el("li");
      const head = el("div", { class: "entry-head" });
      head.append(el("b", null, e.who), el("span", null, e.pending ? "not sent yet" : when(e.saved_at)));
      li.append(head);
      const tags = el("ul", { class: "tags" });
      Object.keys(FIELDS).forEach((k) => {
        if (!e[k]) return;
        const opt = FIELDS[k].find((o) => o[0] === e[k]);
        tags.append(el("li", { class: BAD.has(e[k]) ? "bad" : "" }, LABEL[k] + ": " + (opt ? opt[1] : e[k])));
      });
      if (tags.children.length) li.append(tags);
      if (e.avoid) li.append(el("p", { class: "entry-text avoid" }, e.avoid));
      if (e.notes) li.append(el("p", { class: "entry-text" }, e.notes));
      feed.append(li);
    });
    renderPendingNotice();
  }

  function when(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  // ---------------------------------------------------------------- entries (saved on the phone first, then sent)
  function buildForm() {
    document.querySelectorAll("#entry-form fieldset").forEach((fs) => {
      const key = fs.dataset.field;
      const wrap = el("div", { class: "choices" });
      FIELDS[key].forEach(([val, text]) => {
        const lab = el("label");
        const input = el("input", { type: "radio", name: key, value: val });
        // Tapping a selected choice again clears it, so "skip" is always possible.
        input.addEventListener("click", () => {
          if (input.dataset.was === "1") { input.checked = false; input.dataset.was = "0"; }
          else { fs.querySelectorAll("input").forEach((i) => { i.dataset.was = "0"; }); input.dataset.was = "1"; }
        });
        lab.append(input, el("span", null, text));
        wrap.append(lab);
      });
      fs.append(wrap);
    });
  }

  function readForm(form) {
    const fd = new FormData(form);
    const entry = { id: newId(), who: store.get(KEY.who, ""), created_at: new Date().toISOString() };
    Object.keys(FIELDS).forEach((k) => { entry[k] = fd.get(k) || ""; });
    entry.avoid = String(fd.get("avoid") || "").trim();
    entry.notes = String(fd.get("notes") || "").trim();
    return entry;
  }
  function isEmpty(e) { return !Object.keys(FIELDS).some((k) => e[k]) && !e.avoid && !e.notes; }
  function newId() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  let flushing = false;
  async function flushPending() {
    if (flushing) return;
    flushing = true;
    try {
      let queue = store.get(KEY.pending, []);
      while (queue.length) {
        try { await call("add", { entry: queue[0] }); }
        catch (e) {
          // A rejected entry (not a network problem) would block the queue forever; drop it and say so.
          if (e.code !== "network" && e.code !== "not_configured" && e.code !== "bad_code") {
            toast("One entry couldn't be saved (" + e.code + ").");
          } else break;
        }
        queue = store.get(KEY.pending, []).filter((p) => p.id !== queue[0].id);
        store.set(KEY.pending, queue);
      }
    } finally {
      flushing = false;
      renderPendingNotice();
    }
  }
  function renderPendingNotice() {
    const n = store.get(KEY.pending, []).length;
    const box = $("#pending");
    box.hidden = !n;
    box.textContent = n === 1 ? "1 entry is saved on this phone and will send when you're back online."
      : n + " entries are saved on this phone and will send when you're back online.";
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    buildForm(); renderWho();

    $("#code-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = $("#code-error"); err.hidden = true;
      const btn = ev.submitter; if (btn) btn.disabled = true;
      try {
        await checkCode($("#code-input").value.trim());
        show(store.get(KEY.who, "") ? "home" : "who");
        if (store.get(KEY.who, "")) setWho(store.get(KEY.who));
      } catch (e) {
        err.textContent = e.code === "bad_code" ? "That code didn't work."
          : e.code === "passcode_not_set" ? "The family sheet still needs its code set up."
          : e.code === "not_configured" ? "This app isn't connected to the family sheet yet."
          : "Couldn't reach the family sheet. Check your connection.";
        err.hidden = false;
      } finally { if (btn) btn.disabled = false; }
    });

    $("#who-other").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = $("#who-other-input").value.trim();
      if (name) setWho(name.slice(0, 40));
    });
    $("#who-chip").addEventListener("click", () => show("who"));
    $("#add-btn").addEventListener("click", () => { $("#entry-form").reset(); show("add"); });
    $("#cancel-btn").addEventListener("click", () => show("home"));
    $("#refresh-btn").addEventListener("click", () => { flushPending().then(() => load()).catch(() => {}); });

    $("#entry-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const entry = readForm(ev.target);
      if (isEmpty(entry)) { toast("Tap at least one thing, or write a note."); return; }
      store.set(KEY.pending, store.get(KEY.pending, []).concat([entry]));
      show("home");
      render((store.get(KEY.cache, {}) || {}).entries || [], (store.get(KEY.cache, {}) || {}).tips || []);
      toast("Saved. Thanks!");
      flushPending().then(() => load()).catch(() => {});
    });
    window.addEventListener("online", () => { flushPending().then(() => load()).catch(() => {}); });

    const who = store.get(KEY.who, "");
    if (!store.get(KEY.code, "")) show("code");
    else if (!who) show("who");
    else setWho(who);
  }

  init();
})();
