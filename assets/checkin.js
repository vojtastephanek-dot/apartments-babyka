(function () {
  const B = window.Babyka, C = B.C;
  const $ = (s) => document.querySelector(s);

  // ISO 3166-1 alpha-2; názvy států dodá prohlížeč v jazyce stránky
  const COUNTRIES = ("CZ SK DE AT PL HU GB IE FR NL BE LU CH IT ES PT DK SE NO FI IS EE LV LT SI HR RS BA ME MK AL GR BG RO MD UA BY RU TR CY MT LI MC SM AD " +
    "US CA MX BR AR CL CO PE UY VE AU NZ JP KR CN TW HK SG MY TH VN PH ID IN PK BD LK NP IL AE SA QA KW JO LB EG MA TN DZ ZA NG KE ET GH " +
    "KZ UZ GE AM AZ KG TJ TM MN IR IQ SY AF OM BH YE LY SD CU DO JM PA CR GT HN SV NI BO PY EC CM SN CI TZ UG ZW ZM AO MZ MG MU").split(" ");
  // EU/EHP + Švýcarsko – víza se nevyžadují
  const EEA = "AT BE BG HR CY DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH".split(" ");

  let count = 0;

  function countryOptions(selected) {
    const dn = new Intl.DisplayNames([B.lang], { type: "region" });
    const list = COUNTRIES.map((c) => [c, dn.of(c)]);
    const top = list.slice(0, 4);
    const rest = list.slice(4).sort((a, b) => a[1].localeCompare(b[1], B.lang));
    return [...top, ["", "──────────"], ...rest].map(([c, n]) =>
      `<option value="${c}" ${c === selected ? "selected" : ""} ${c ? "" : "disabled"}>${n}</option>`
    ).join("");
  }

  function guestHtml(i) {
    const f = (name, key, attrs = "") =>
      `<label><span>${B.t(key)}</span><input name="g${i}_${name}" ${attrs}></label>`;
    return `
      <header><h3>${B.t("ci.guest")} ${i + 1}</h3>
        ${i > 0 ? `<button type="button" class="link-btn" data-remove>${B.t("ci.remove")}</button>` : ""}</header>
      <div class="row">${f("firstName", "ci.firstName", 'required autocomplete="given-name"')}${f("lastName", "ci.lastName", 'required autocomplete="family-name"')}</div>
      <div class="row">
        ${f("birthDate", "ci.birthDate", 'type="date" required')}
        <label><span>${B.t("ci.nationality")}</span><select name="g${i}_nationality" data-nat required>${countryOptions("CZ")}</select></label>
      </div>
      <div class="row">
        <label><span>${B.t("ci.docType")}</span><select name="g${i}_docType">
          <option value="ID">${B.t("ci.doc.id")}</option><option value="PASSPORT">${B.t("ci.doc.passport")}</option><option value="OTHER">${B.t("ci.doc.other")}</option>
        </select></label>
        ${f("docNumber", "ci.docNumber", "required")}
      </div>
      ${f("street", "ci.street", 'required autocomplete="address-line1"')}
      <div class="row three">
        ${f("city", "ci.city", 'required autocomplete="address-level2"')}
        ${f("zip", "ci.zip", 'autocomplete="postal-code"')}
        <label><span>${B.t("ci.country")}</span><select name="g${i}_country" required>${countryOptions("CZ")}</select></label>
      </div>
      <div class="foreign hidden">
        <h4>${B.t("ci.foreignTitle")}</h4>
        <div class="row">
          ${f("visa", "ci.visa")}
          <label><span>${B.t("ci.purpose")}</span><select name="g${i}_purpose">
            <option value="TOURISM">${B.t("ci.purpose.tourism")}</option><option value="BUSINESS">${B.t("ci.purpose.business")}</option><option value="OTHER">${B.t("ci.purpose.other")}</option>
          </select></label>
        </div>
      </div>`;
  }

  function addGuest() {
    const card = document.createElement("div");
    card.className = "guest-card";
    card.innerHTML = guestHtml(count++);
    $("#guests").appendChild(card);
    const nat = card.querySelector("[data-nat]");
    const visa = card.querySelector('[name$="_visa"]');
    const toggle = () => {
      const foreign = nat.value !== "CZ";
      card.querySelector(".foreign").classList.toggle("hidden", !foreign);
      // pro občany mimo EU/EHP je vhodné vyžadovat i číslo víza – ale ne každý vízum potřebuje
      visa.closest("label").style.display = EEA.includes(nat.value) ? "none" : "";
      // doklad: cizinci mimo EU zpravidla jen pas
      if (foreign && !EEA.includes(nat.value)) card.querySelector('[name$="_docType"]').value = "PASSPORT";
    };
    nat.addEventListener("change", () => {
      card.querySelector('[name$="_country"]').value = nat.value;
      toggle();
    });
    const rm = card.querySelector("[data-remove]");
    if (rm) rm.addEventListener("click", () => card.remove());
  }

  function collect(form) {
    const fd = new FormData(form);
    const guests = [];
    document.querySelectorAll(".guest-card").forEach((card) => {
      const g = {};
      card.querySelectorAll("[name]").forEach((el) => {
        g[el.name.replace(/^g\d+_/, "")] = el.value.trim();
      });
      if (g.nationality === "CZ") { delete g.visa; delete g.purpose; }
      guests.push(g);
    });
    return {
      reservation: fd.get("reservation").trim(),
      arrivalTime: fd.get("arrivalTime"),
      car: fd.get("car"),
      note: fd.get("note"),
      guests,
    };
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const err = $("#ci-err");
    if (form.querySelector('[name="website"]').value) return;
    if (!form.checkValidity()) {
      err.textContent = B.t("err.required");
      err.classList.remove("hidden");
      form.reportValidity();
      return;
    }
    err.classList.add("hidden");
    const btn = $("#ci-submit");
    btn.disabled = true;
    btn.textContent = B.t("book.sending");
    try {
      const res = await B.api("checkin", collect(form));
      if (!res.ok) {
        err.textContent = B.t(res.error === "notfound" ? "ci.notFound" : "err.generic");
        err.classList.remove("hidden");
        return;
      }
      form.classList.add("hidden");
      $("#ci-done").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (ex) {
      console.error(ex);
      err.textContent = B.t("err.generic");
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = B.t("ci.submit");
    }
  }

  function rebuildGuests() {
    // při změně jazyka znovu vykreslit (data se zachovají)
    const saved = [...document.querySelectorAll(".guest-card")].map((card) =>
      [...card.querySelectorAll("[name]")].map((el) => [el.name.replace(/^g\d+_/, ""), el.value])
    );
    $("#guests").innerHTML = "";
    count = 0;
    saved.forEach((fields) => {
      addGuest();
      const card = $("#guests").lastElementChild;
      const fill = () => fields.forEach(([k, v]) => { card.querySelector(`[name$="_${k}"]`).value = v; });
      fill();
      card.querySelector("[data-nat]").dispatchEvent(new Event("change"));
      fill();
    });
  }

  B.initChrome();
  const r = new URLSearchParams(location.search).get("r");
  if (r) $("#f-reservation").value = r;
  addGuest();
  $("#add-guest").addEventListener("click", addGuest);
  $("#ci-form").addEventListener("submit", submit);
  document.addEventListener("langchange", rebuildGuests);
})();
