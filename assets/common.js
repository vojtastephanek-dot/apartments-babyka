// Sdílené funkce: jazyk, překlady, komunikace s Apps Scriptem, QR platba.
(function () {
  const C = window.BABYKA_CONFIG;
  const DICT = window.BABYKA_I18N;
  const LANGS = ["cs", "en", "de"];

  function detectLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(q)) return q;
    try {
      const saved = localStorage.getItem("babyka-lang");
      if (LANGS.includes(saved)) return saved;
    } catch (e) {}
    const nav = (navigator.language || "cs").slice(0, 2);
    return LANGS.includes(nav) ? nav : "en";
  }

  let lang = detectLang();

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.cs[key] || key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }

  function applyI18n(root) {
    document.documentElement.lang = lang;
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
      el.innerHTML = t(el.dataset.i18n);
    });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll(".lang-switch button").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === lang);
    });
    document.dispatchEvent(new CustomEvent("langchange"));
  }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem("babyka-lang", l); } catch (e) {}
    applyI18n();
  }

  function money(n) {
    return new Intl.NumberFormat(lang === "cs" ? "cs-CZ" : lang === "de" ? "de-DE" : "en-GB", {
      style: "currency", currency: C.currency, maximumFractionDigits: 0,
    }).format(n);
  }

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang === "cs" ? "cs-CZ" : lang === "de" ? "de-DE" : "en-GB");
  }

  // ISO datum (YYYY-MM-DD) bez posunů časových pásem
  function iso(date) {
    const p = (n) => String(n).padStart(2, "0");
    return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate());
  }

  function nightsBetween(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  }

  function roomName(room) { return room.name[lang] || room.name.cs; }

  function price(roomId, arrival, departure, adults) {
    const room = C.rooms.find((r) => r.id === roomId);
    const nights = nightsBetween(arrival, departure);
    const accommodation = room.pricePerNight * nights;
    const cityTax = C.cityTaxPerAdultNight * adults * nights;
    const total = accommodation + cityTax;
    const deposit = Math.round((total * C.depositPercent) / 100);
    return { nights, accommodation, cityTax, total, deposit };
  }

  // ---- Komunikace s Google Apps Script --------------------------------
  // text/plain = „simple request“, prohlížeč neposílá CORS preflight,
  // který Apps Script neumí obsloužit.
  async function api(action, payload) {
    if (!C.scriptUrl) return demoApi(action, payload);
    if (action === "availability") {
      const r = await fetch(C.scriptUrl + "?action=availability");
      return r.json();
    }
    const r = await fetch(C.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action, lang }, payload)),
    });
    return r.json();
  }

  // DEMO režim: vše jen v localStorage tohoto prohlížeče
  function demoLoad() {
    try { return JSON.parse(localStorage.getItem("babyka-demo") || "[]"); } catch (e) { return []; }
  }
  function demoApi(action, p) {
    const list = demoLoad();
    if (action === "availability") {
      const busy = {};
      C.rooms.forEach((r) => (busy[r.id] = []));
      list.forEach((b) => busy[b.room].push([b.arrival, b.departure]));
      return Promise.resolve({ ok: true, demo: true, busy });
    }
    if (action === "reserve") {
      const clash = list.some((b) => b.room === p.room && p.arrival < b.departure && b.arrival < p.departure);
      if (clash) return Promise.resolve({ ok: false, error: "busy" });
      const id = String(Date.now()).slice(-8);
      const pr = price(p.room, p.arrival, p.departure, p.adults);
      list.push({ id, room: p.room, arrival: p.arrival, departure: p.departure, name: p.name });
      try { localStorage.setItem("babyka-demo", JSON.stringify(list)); } catch (e) {}
      const due = new Date(); due.setDate(due.getDate() + C.paymentDueDays);
      return Promise.resolve({ ok: true, demo: true, id, vs: id, amount: pr.deposit, total: pr.total, due: iso(due) });
    }
    if (action === "checkin") return Promise.resolve({ ok: true, demo: true });
    return Promise.resolve({ ok: false, error: "unknown" });
  }

  // ---- QR Platba (standard ČBA „SPAYD“) ---------------------------------
  function asciiSafe(s, max) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "-").replace(/\*/g, "").slice(0, max);
  }
  function spayd({ amount, vs, message }) {
    const parts = [
      "SPD*1.0",
      "ACC:" + C.iban.replace(/\s/g, ""),
      "AM:" + Number(amount).toFixed(2),
      "CC:" + C.currency,
      "X-VS:" + String(vs).replace(/\D/g, "").slice(0, 10),
      "MSG:" + asciiSafe(message || "", 60),
    ];
    return parts.join("*");
  }
  function qrSvg(text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }

  function initChrome() {
    document.querySelectorAll(".lang-switch button").forEach((b) =>
      b.addEventListener("click", () => setLang(b.dataset.lang))
    );
    document.querySelectorAll("[data-c]").forEach((el) => {
      const v = el.dataset.c.split(".").reduce((o, k) => o && o[k], C);
      if (el.tagName === "A" && el.dataset.href) el.href = el.dataset.href.replace("{}", String(v).replace(/\s/g, ""));
      el.textContent = v;
    });
    document.querySelectorAll(".map-link").forEach((a) => (a.href = C.contact.mapUrl));
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    if (!C.scriptUrl) {
      const bar = document.createElement("div");
      bar.className = "demo-bar";
      bar.dataset.i18n = "demo";
      document.body.prepend(bar);
    }
    const toggle = document.querySelector(".nav-toggle");
    if (toggle) toggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    document.querySelectorAll(".nav-links a").forEach((a) =>
      a.addEventListener("click", () => document.body.classList.remove("nav-open"))
    );
    applyI18n();
  }

  window.Babyka = {
    C, t, applyI18n, setLang, money, fmtDate, iso, nightsBetween, roomName, price, api, spayd, qrSvg, initChrome,
    get lang() { return lang; },
  };
})();
