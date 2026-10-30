/**
 * Apartments Babyka – backend v Google Apps Script.
 * Data se ukládají do Google tabulky, ke které je skript připojen
 * (Rozšíření → Apps Script). Postup nasazení viz README.md.
 */

// =================== NASTAVENÍ ===================
const CONFIG = {
  ownerEmail: "info@example.cz",           // kam chodí upozornění o rezervacích
  siteUrl: "https://www.example.cz/",      // adresa webu (se lomítkem na konci)
  name: "Apartments Babyka",
  accountLabel: "000000-0000000000/0000",
  iban: "CZ0000000000000000000000",
  currency: "CZK",
  depositPercent: 30,
  paymentDueDays: 3,
  cityTaxPerAdultNight: 0,
  minNights: 2,
  // Ceny a kapacity MUSÍ odpovídat assets/config.js – cena se počítá zde,
  // aby ji nešlo podvrhnout z prohlížeče.
  rooms: {
    "1": { name: "Apartmán Studio", maxGuests: 2, pricePerNight: 2300 },
    "2": { name: "Rodinný apartmán", maxGuests: 5, pricePerNight: 3900 },
  },
  // Booking.com extranet → Ceny a dostupnost → Synchronizace kalendářů → Exportovat
  bookingIcal: {
    "1": "",
    "2": "",
  },
};
// =================================================

const SHEET_RES = "Rezervace";
const SHEET_CI = "Check-in";
const RES_HEAD = ["ID", "Vytvořeno", "Stav", "Apartmán", "Příjezd", "Odjezd", "Dospělí", "Děti", "Jméno",
  "E-mail", "Telefon", "Poznámka", "Celkem", "Záloha", "VS", "Splatnost", "Jazyk", "Check-in"];
const CI_HEAD = ["Rezervace", "Zdroj", "Příjezd", "Odjezd", "Odesláno", "Čas příjezdu", "SPZ", "Poznámka", "Jméno", "Příjmení", "Datum narození",
  "Občanství", "Druh dokladu", "Číslo dokladu", "Ulice", "Obec", "PSČ", "Stát bydliště", "Číslo víza", "Účel pobytu",
  "Nahlášeno Ubyport"];
const STATUS = { NEW: "ČEKÁ NA PLATBU", PAID: "ZAPLACENO", CANCELLED: "STORNO" };

// ---------- Vstupní body webové aplikace ----------
function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();
  if (action === "availability") return json({ ok: true, busy: busyAll() });
  if (action === "ical") return ical(e.parameter.room);
  return json({ ok: false, error: "unknown" });
}

function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad" }); }
  try {
    if (p.action === "reserve") return json(reserve(p));
    if (p.action === "checkin") return json(checkin(p));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server" });
  }
  return json({ ok: false, error: "unknown" });
}

// ---------- Rezervace ----------
function reserve(p) {
  const room = CONFIG.rooms[p.room];
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!room || !isDate(p.arrival) || !isDate(p.departure) || p.departure <= p.arrival) return { ok: false, error: "bad" };
  if (p.arrival < isoDate(new Date())) return { ok: false, error: "bad" };
  const nights = daysBetween(p.arrival, p.departure);
  const adults = Math.max(1, parseInt(p.adults, 10) || 1);
  const children = Math.max(0, parseInt(p.children, 10) || 0);
  if (nights < CONFIG.minNights || adults + children > room.maxGuests) return { ok: false, error: "bad" };
  if (!p.name || !/^\S+@\S+\.\S+$/.test(p.email || "")) return { ok: false, error: "bad" };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    CacheService.getScriptCache().remove("booking_" + p.room); // čerstvá data z Bookingu
    const clash = busyFor(p.room).some(([a, d]) => p.arrival < d && a < p.departure);
    if (clash) return { ok: false, error: "busy" };

    const id = nextId();
    const accommodation = room.pricePerNight * nights;
    const total = accommodation + CONFIG.cityTaxPerAdultNight * adults * nights;
    const deposit = Math.round(total * CONFIG.depositPercent / 100);
    const due = new Date(); due.setDate(due.getDate() + CONFIG.paymentDueDays);
    const dueIso = isoDate(due);

    sheet(SHEET_RES, RES_HEAD).appendRow([
      id, new Date(), STATUS.NEW, p.room, p.arrival, p.departure, adults, children, clean(p.name),
      clean(p.email), clean(p.phone), clean(p.note), total, deposit, id, dueIso, p.lang || "cs", "",
    ]);
    SpreadsheetApp.flush();

    const r = { id, room: p.room, arrival: p.arrival, departure: p.departure, adults, children, name: p.name,
      email: p.email, phone: p.phone, note: p.note, total, deposit, due: dueIso, lang: p.lang || "cs" };
    try { mailGuestNew(r); mailOwnerNew(r); } catch (err) { console.error(err); }
    return { ok: true, id, vs: id, amount: deposit, total, due: dueIso };
  } finally {
    lock.releaseLock();
  }
}

// Číslo rezervace = variabilní symbol: RR + pořadí (např. 260007)
function nextId() {
  const props = PropertiesService.getScriptProperties();
  const yy = String(new Date().getFullYear()).slice(-2);
  const key = "seq_" + yy;
  const n = (parseInt(props.getProperty(key), 10) || 0) + 1;
  props.setProperty(key, String(n));
  return yy + String(n).padStart(4, "0");
}

// ---------- Check-in ----------
function checkin(p) {
  const source = p.source === "booking" ? "Booking.com" : "Web";
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!Array.isArray(p.guests) || !p.guests.length || p.guests.length > 10) return { ok: false, error: "bad" };

  let id, arrival, departure, resRow = -1;
  const sh = sheet(SHEET_RES, RES_HEAD);
  if (source === "Web") {
    id = String(p.reservation || "").trim();
    const rows = sh.getDataRange().getValues();
    resRow = rows.findIndex((r, i) => i > 0 && String(r[0]) === id);
    if (resRow < 0) return { ok: false, error: "notfound" };
    arrival = asIso(rows[resRow][4]);
    departure = asIso(rows[resRow][5]);
  } else {
    // Rezervace z Bookingu v tabulce nemáme – číslo (10 číslic) a termín zadává host
    id = String(p.reservation || "").replace(/\D/g, "");
    arrival = p.arrival; departure = p.departure;
    if (!/^\d{8,12}$/.test(id) || !isDate(arrival) || !isDate(departure) || departure <= arrival) return { ok: false, error: "bad" };
  }

  const ci = sheet(SHEET_CI, CI_HEAD);
  const now = new Date();
  p.guests.forEach((g) => {
    ci.appendRow([id, source, arrival, departure, now, clean(p.arrivalTime), clean(p.car), clean(p.note),
      clean(g.firstName), clean(g.lastName), clean(g.birthDate), clean(g.nationality), clean(g.docType),
      clean(g.docNumber), clean(g.street), clean(g.city), clean(g.zip), clean(g.country), clean(g.visa),
      clean(g.purpose), g.nationality === "CZ" ? "nehlásí se" : "NE"]);
  });
  if (resRow > 0) sh.getRange(resRow + 1, RES_HEAD.indexOf("Check-in") + 1).setValue("ANO " + Utilities.formatDate(now, "Europe/Prague", "d.M. HH:mm"));

  const foreign = p.guests.filter((g) => g.nationality !== "CZ").length;
  try {
    MailApp.sendEmail({
      to: CONFIG.ownerEmail,
      subject: `Check-in ${id} (${source}): ${p.guests.length} os.${foreign ? `, ${foreign}× cizinec → nahlásit do 3 prac. dnů (Ubyport)` : ""}`,
      htmlBody: `Rezervace <b>${esc(id)}</b> (${source}), ${arrival} → ${departure}, příjezd cca ${esc(p.arrivalTime)}.<br>` +
        p.guests.map((g) => `${esc(g.firstName)} ${esc(g.lastName)} (${esc(g.nationality)})`).join("<br>") +
        (p.note ? `<br><br>Poznámka: ${esc(p.note)}` : "") + `<br><br>Detaily v listu „${SHEET_CI}“.`,
    });
  } catch (err) { console.error(err); }
  return { ok: true };
}

// ---------- Obsazenost ----------
function busyAll() {
  const out = {};
  Object.keys(CONFIG.rooms).forEach((id) => (out[id] = busyFor(id)));
  return out;
}

function busyFor(roomId) {
  return ownBusy(roomId).concat(bookingBusy(roomId));
}

function ownBusy(roomId) {
  const rows = sheet(SHEET_RES, RES_HEAD).getDataRange().getValues().slice(1);
  return rows
    .filter((r) => String(r[3]) === String(roomId) && r[2] !== STATUS.CANCELLED)
    .map((r) => [asIso(r[4]), asIso(r[5])]);
}

function bookingBusy(roomId) {
  const url = CONFIG.bookingIcal[roomId];
  if (!url) return [];
  const cache = CacheService.getScriptCache();
  const hit = cache.get("booking_" + roomId);
  if (hit) return JSON.parse(hit);
  let ranges = [];
  try {
    const text = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    ranges = parseIcal(text);
    cache.put("booking_" + roomId, JSON.stringify(ranges), 600); // 10 min
  } catch (err) { console.error(err); }
  return ranges;
}

function parseIcal(text) {
  const out = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  unfolded.split("BEGIN:VEVENT").slice(1).forEach((ev) => {
    const s = (ev.match(/DTSTART[^:]*:(\d{8})/) || [])[1];
    const e = (ev.match(/DTEND[^:]*:(\d{8})/) || [])[1];
    if (s && e) out.push([fmt8(s), fmt8(e)]);
  });
  return out;
}

// Kalendář našich přímých rezervací pro import do Bookingu
function ical(roomId) {
  const stamp = Utilities.formatDate(new Date(), "UTC", "yyyyMMdd'T'HHmmss'Z'");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apartments Babyka//CS", "CALSCALE:GREGORIAN"];
  sheet(SHEET_RES, RES_HEAD).getDataRange().getValues().slice(1)
    .filter((r) => String(r[3]) === String(roomId) && r[2] !== STATUS.CANCELLED)
    .forEach((r) => {
      lines.push("BEGIN:VEVENT", "UID:babyka-" + r[0] + "@" + CONFIG.siteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
        "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + asIso(r[4]).replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + asIso(r[5]).replace(/-/g, ""), "SUMMARY:Blokováno (přímá rezervace)", "END:VEVENT");
    });
  lines.push("END:VCALENDAR");
  return ContentService.createTextOutput(lines.join("\r\n")).setMimeType(ContentService.MimeType.ICAL);
}

// ---------- E-maily ----------
const MAIL = {
  cs: { subj: "Rezervace {id} – platební údaje", hi: "Dobrý den", thanks: "děkujeme za rezervaci v Apartments Babyka.",
    term: "Termín", room: "Apartmán", total: "Cena celkem", pay: "K úhradě (záloha)", acc: "Účet", vs: "Variabilní symbol",
    due: "Splatnost", qr: "Zobrazit QR kód pro platbu", ci: "Vyplnit online check-in", after: "Rezervace bude potvrzena po připsání platby." },
  en: { subj: "Booking {id} – payment details", hi: "Hello", thanks: "thank you for booking with Apartments Babyka.",
    term: "Dates", room: "Apartment", total: "Total price", pay: "To pay (deposit)", acc: "Account", vs: "Reference / variable symbol",
    due: "Due date", qr: "Show payment QR code", ci: "Complete online check-in", after: "Your booking will be confirmed once the payment arrives." },
  de: { subj: "Buchung {id} – Zahlungsdetails", hi: "Guten Tag", thanks: "vielen Dank für Ihre Buchung bei Apartments Babyka.",
    term: "Zeitraum", room: "Apartment", total: "Gesamtpreis", pay: "Zu zahlen (Anzahlung)", acc: "Konto", vs: "Verwendungszweck / VS",
    due: "Fällig bis", qr: "QR-Code für die Zahlung anzeigen", ci: "Online-Check-in ausfüllen", after: "Die Buchung wird nach Zahlungseingang bestätigt." },
};

function mailGuestNew(r) {
  const L = MAIL[r.lang] || MAIL.en;
  const payUrl = `${CONFIG.siteUrl}platba.html?r=${r.id}&vs=${r.id}&am=${r.deposit}&due=${r.due}&lang=${r.lang}`;
  const ciUrl = `${CONFIG.siteUrl}checkin.html?r=${r.id}&lang=${r.lang}`;
  const btn = (href, label, bg) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;margin:6px 6px 0 0">${label}</a>`;
  MailApp.sendEmail({
    to: r.email,
    replyTo: CONFIG.ownerEmail,
    name: CONFIG.name,
    subject: L.subj.replace("{id}", r.id),
    htmlBody: `<div style="font-family:Georgia,serif;color:#2a211c;max-width:560px">
      <h2 style="font-weight:normal">${L.hi} ${esc(r.name)},</h2><p>${L.thanks}</p>
      <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
        ${row(L.room, CONFIG.rooms[r.room].name)}${row(L.term, r.arrival + " → " + r.departure)}
        ${row(L.total, money(r.total))}${row(L.pay, "<b>" + money(r.deposit) + "</b>")}
        ${row(L.acc, CONFIG.accountLabel + "<br>IBAN " + CONFIG.iban)}${row(L.vs, "<b>" + r.id + "</b>")}${row(L.due, r.due)}
      </table>
      <p>${btn(payUrl, L.qr, "#a23e2b")}${btn(ciUrl, L.ci, "#2d5753")}</p>
      <p style="font-family:Arial,sans-serif;font-size:13px;color:#6e6058">${L.after}</p></div>`,
  });
}

function mailOwnerNew(r) {
  MailApp.sendEmail({
    to: CONFIG.ownerEmail,
    replyTo: r.email,
    subject: `Nová rezervace ${r.id}: ${CONFIG.rooms[r.room].name}, ${r.arrival} → ${r.departure}`,
    htmlBody: `<b>${esc(r.name)}</b> (${esc(r.email)}, ${esc(r.phone)})<br>${r.adults} dosp. + ${r.children} dětí<br>` +
      `Celkem ${money(r.total)}, záloha ${money(r.deposit)}, VS ${r.id}, splatnost ${r.due}<br>` +
      (r.note ? `Poznámka: ${esc(r.note)}<br>` : "") +
      `<br>Nezapomeňte termín zablokovat i na Bookingu, pokud nemáte zapnutou synchronizaci kalendáře.`,
  });
}

// ---------- Menu v tabulce ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Babyka")
    .addItem("Označit vybranou rezervaci jako ZAPLACENO", "markPaid")
    .addItem("Stornovat vybranou rezervaci", "markCancelled")
    .addToUi();
}

function markPaid() { setStatusOfSelected(STATUS.PAID, true); }
function markCancelled() { setStatusOfSelected(STATUS.CANCELLED, false); }

function setStatusOfSelected(status, notify) {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET_RES) return SpreadsheetApp.getUi().alert("Vyberte řádek v listu „" + SHEET_RES + "“.");
  const rowNo = sh.getActiveRange().getRow();
  if (rowNo < 2) return;
  const r = sh.getRange(rowNo, 1, 1, RES_HEAD.length).getValues()[0];
  sh.getRange(rowNo, 3).setValue(status);
  if (notify) {
    const lang = r[16] || "cs";
    const txt = {
      cs: ["Rezervace {id} potvrzena", "Platba dorazila, vaše rezervace je potvrzena. Těšíme se na vás!", "Online check-in"],
      en: ["Booking {id} confirmed", "We have received your payment, your booking is confirmed. Looking forward to seeing you!", "Online check-in"],
      de: ["Buchung {id} bestätigt", "Ihre Zahlung ist eingegangen, die Buchung ist bestätigt. Wir freuen uns auf Sie!", "Online-Check-in"],
    }[lang] || [];
    MailApp.sendEmail({
      to: r[9], replyTo: CONFIG.ownerEmail, name: CONFIG.name,
      subject: txt[0].replace("{id}", r[0]),
      htmlBody: `<p>${txt[1]}</p><p>${asIso(r[4])} → ${asIso(r[5])}</p>` +
        (r[17] ? "" : `<p><a href="${CONFIG.siteUrl}checkin.html?r=${r[0]}&lang=${lang}">${txt[2]}</a></p>`),
    });
  }
}

// Volitelně: časový spouštěč (1× denně) – zruší nezaplacené rezervace po splatnosti
function expireUnpaid() {
  const sh = sheet(SHEET_RES, RES_HEAD);
  const rows = sh.getDataRange().getValues();
  const today = isoDate(new Date());
  rows.forEach((r, i) => {
    if (i > 0 && r[2] === STATUS.NEW && asIso(r[15]) < today) sh.getRange(i + 1, 3).setValue(STATUS.CANCELLED);
  });
}

// ---------- Pomocné ----------
function sheet(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight("bold");
    // data zapisujeme jako text, aby je Tabulky nepřeváděly na jiné formáty
    sh.getRange("A:Z").setNumberFormat("@");
  }
  return sh;
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function isoDate(d) { return Utilities.formatDate(d, "Europe/Prague", "yyyy-MM-dd"); }
function asIso(v) { return v instanceof Date ? isoDate(v) : String(v).slice(0, 10); }
function fmt8(s) { return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8); }
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function money(n) { return Number(n).toLocaleString("cs-CZ") + " " + CONFIG.currency; }
function row(k, v) { return `<tr><td style="padding:4px 16px 4px 0;color:#6e6058">${k}</td><td style="padding:4px 0">${v}</td></tr>`; }
// ochrana proti vložení vzorců do tabulky a HTML do e-mailů
function clean(v) { v = String(v == null ? "" : v).slice(0, 500).trim(); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
