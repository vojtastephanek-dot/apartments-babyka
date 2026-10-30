(function () {
  const B = window.Babyka, C = B.C;
  const $ = (s) => document.querySelector(s);

  let busy = {};             // { roomId: [[arrival, departure], ...] }
  let room = C.rooms[0].id;
  let monthOffset = 0;
  let sel = { a: null, d: null };
  let lastPay = null;        // údaje pro překreslení platby při změně jazyka
  const today = B.iso(new Date());

  // ---- Apartmány -------------------------------------------------------
  function renderRooms() {
    $("#room-grid").innerHTML = C.rooms.map((r, i) => `
      <article class="room-card reveal in">
        <div class="room-media">
          ${r.image ? `<img src="${r.image}" alt="${B.roomName(r)}" loading="lazy">`
                    : `<div class="placeholder"><span>${r.size} m²</span></div>`}
          <span class="badge">${r.size} ${B.t("rooms.size")} · ${r.maxGuests} ${B.t("rooms.guests").replace("max. ", "")}</span>
        </div>
        <div class="room-body">
          <h3>${B.roomName(r)}</h3>
          <p>${r.desc[B.lang] || r.desc.cs}</p>
          <div class="room-meta">
            <div class="price"><small>${B.t("rooms.from")}</small> ${B.money(r.pricePerNight)} <small>/ ${B.t("rooms.night")}</small></div>
            <a class="btn" href="#rezervace" data-pick="${r.id}" style="padding:11px 20px">${B.t("nav.book")}</a>
          </div>
        </div>
      </article>`).join("");
    document.querySelectorAll("[data-pick]").forEach((a) =>
      a.addEventListener("click", () => setRoom(a.dataset.pick))
    );
  }

  function renderTabs() {
    $("#room-tabs").innerHTML = C.rooms.map((r) =>
      `<button type="button" data-room="${r.id}" class="${r.id === room ? "active" : ""}">${B.roomName(r)}</button>`
    ).join("");
    $("#room-tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setRoom(b.dataset.room)));
    $("#f-room").innerHTML = C.rooms.map((r) =>
      `<option value="${r.id}" ${r.id === room ? "selected" : ""}>${B.roomName(r)} (${r.size} m², max. ${r.maxGuests})</option>`
    ).join("");
  }

  function setRoom(id) {
    room = id;
    renderTabs();
    renderCalendar();
    updateSummary();
  }

  // ---- Kalendář --------------------------------------------------------
  // Noc je obsazená, pokud spadá do [příjezd, odjezd) některé rezervace.
  function isBusyNight(day) {
    return (busy[room] || []).some(([a, d]) => day >= a && day < d);
  }
  function rangeFree(a, d) {
    return !(busy[room] || []).some(([ba, bd]) => a < bd && ba < d);
  }

  function monthHtml(y, m) {
    const first = new Date(y, m, 1);
    const title = first.toLocaleDateString(B.lang === "cs" ? "cs-CZ" : B.lang === "de" ? "de-DE" : "en-GB", { month: "long", year: "numeric" });
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // pondělí první
    const dows = [...Array(7)].map((_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(B.lang === "cs" ? "cs-CZ" : B.lang, { weekday: "short" })
    );
    let h = `<div class="cal-month"><h4>${title}</h4><div class="cal-grid">`;
    h += dows.map((d) => `<div class="dow">${d}</div>`).join("");
    h += "<div></div>".repeat(lead);
    for (let d = 1; d <= days; d++) {
      const day = B.iso(new Date(y, m, d));
      const past = day < today;
      const b = isBusyNight(day);
      const cls = ["cal-day"];
      if (b) cls.push("busy");
      if (day === today) cls.push("today");
      if (day === sel.a || day === sel.d) cls.push("sel");
      else if (sel.a && sel.d && day > sel.a && day < sel.d) cls.push("in-range");
      // obsazený den může být odjezdovým dnem (odjezd ráno, příjezd odpoledne)
      const disabled = past || (b && !(sel.a && !sel.d && day > sel.a));
      h += `<button type="button" class="${cls.join(" ")}" data-day="${day}" ${disabled ? "disabled" : ""}>${d}</button>`;
    }
    return h + "</div></div>";
  }

  function renderCalendar() {
    const now = new Date();
    const m1 = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const m2 = new Date(m1.getFullYear(), m1.getMonth() + 1, 1);
    $("#calendar").innerHTML = `
      <div class="cal-head">
        <button type="button" id="cal-prev" ${monthOffset <= 0 ? "disabled" : ""} aria-label="‹">‹</button>
        <button type="button" id="cal-next" aria-label="›">›</button>
      </div>
      <div class="cal-months">${monthHtml(m1.getFullYear(), m1.getMonth())}${monthHtml(m2.getFullYear(), m2.getMonth())}</div>`;
    $("#cal-prev").onclick = () => { monthOffset--; renderCalendar(); };
    $("#cal-next").onclick = () => { monthOffset++; renderCalendar(); };
    $("#calendar").querySelectorAll(".cal-day:not(:disabled)").forEach((b) =>
      b.addEventListener("click", () => pickDay(b.dataset.day))
    );
  }

  function pickDay(day) {
    if (!sel.a || sel.d || day <= sel.a) {
      sel = { a: day, d: null };
    } else if (rangeFree(sel.a, day)) {
      sel.d = day;
    } else {
      sel = { a: day, d: null };
    }
    $("#f-arrival").value = sel.a || "";
    $("#f-departure").value = sel.d || "";
    renderCalendar();
    updateSummary();
  }

  // ---- Formulář --------------------------------------------------------
  function validate(showErr) {
    const a = $("#f-arrival").value, d = $("#f-departure").value;
    const adults = +$("#f-adults").value || 0, children = +$("#f-children").value || 0;
    const r = C.rooms.find((x) => x.id === room);
    let err = "";
    if (!a || !d || d <= a || a < today) err = B.t("err.dates");
    else if (B.nightsBetween(a, d) < C.minNights) err = B.t("err.minNights", { n: C.minNights });
    else if (adults + children > r.maxGuests || adults < 1) err = B.t("err.guests", { n: r.maxGuests });
    else if (!rangeFree(a, d)) err = B.t("err.busy");
    const box = $("#book-err");
    box.textContent = err;
    box.classList.toggle("hidden", !(err && showErr));
    return err;
  }

  function updateSummary() {
    const a = $("#f-arrival").value, d = $("#f-departure").value;
    const box = $("#summary");
    const err = validate(!!(a && d));
    if (err) { box.classList.add("hidden"); return; }
    const p = B.price(room, a, d, +$("#f-adults").value);
    box.innerHTML = `<h4>${B.t("book.summary")}</h4><dl>
      <dt>${B.fmtDate(a)} – ${B.fmtDate(d)}</dt><dd>${p.nights} ${B.t("book.nights")}</dd>
      <dt>${B.t("book.accommodation")}</dt><dd>${B.money(p.accommodation)}</dd>
      ${p.cityTax ? `<dt>${B.t("book.citytax")}</dt><dd>${B.money(p.cityTax)}</dd>` : ""}
      <dt class="total">${B.t("book.total")}</dt><dd class="total">${B.money(p.total)}</dd>
      ${C.depositPercent < 100 ? `<dt class="deposit">${B.t("book.deposit")} (${C.depositPercent} %)</dt><dd class="deposit">${B.money(p.deposit)}</dd>` : ""}
    </dl>`;
    box.classList.remove("hidden");
  }

  function syncFromInputs() {
    room = $("#f-room").value;
    sel = { a: $("#f-arrival").value || null, d: $("#f-departure").value || null };
    renderTabs();
    renderCalendar();
    updateSummary();
  }

  async function submit(e) {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries(new FormData(f).entries());
    if (data.website) return; // spambot
    const err = validate(true);
    if (err) return;
    if (!f.checkValidity()) {
      $("#book-err").textContent = B.t("err.required");
      $("#book-err").classList.remove("hidden");
      f.reportValidity();
      return;
    }
    const btn = $("#book-submit");
    btn.disabled = true;
    btn.textContent = B.t("book.sending");
    try {
      const res = await B.api("reserve", {
        room: data.room, arrival: data.arrival, departure: data.departure,
        adults: +data.adults, children: +data.children || 0,
        name: data.name, email: data.email, phone: data.phone, note: data.note,
      });
      if (!res.ok) {
        $("#book-err").textContent = B.t(res.error === "busy" ? "err.busy" : "err.generic");
        $("#book-err").classList.remove("hidden");
        if (res.error === "busy") loadAvailability();
        return;
      }
      f.classList.add("hidden");
      lastPay = { id: res.id, vs: res.vs, amount: res.amount, due: res.due };
      window.BabykaPay.render($("#pay"), lastPay);
      $("#pay").classList.remove("hidden");
      $("#book-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (ex) {
      console.error(ex);
      $("#book-err").textContent = B.t("err.generic");
      $("#book-err").classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = B.t("book.submit");
    }
  }

  async function loadAvailability() {
    try {
      const res = await B.api("availability");
      busy = res.busy || {};
    } catch (e) {
      console.error(e);
    }
    renderCalendar();
    updateSummary();
  }

  function init() {
    B.initChrome();
    renderTabs();
    $("#f-arrival").min = today;
    $("#f-departure").min = today;
    ["#f-room", "#f-arrival", "#f-departure"].forEach((s) => $(s).addEventListener("change", syncFromInputs));
    ["#f-adults", "#f-children"].forEach((s) => $(s).addEventListener("input", updateSummary));
    $("#book-form").addEventListener("submit", submit);
    document.addEventListener("langchange", () => { renderRooms(); renderTabs(); renderCalendar(); updateSummary();
      if (lastPay) window.BabykaPay.render($("#pay"), lastPay);
    });
    renderRooms();
    loadAvailability();

    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: .15 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  init();
})();
