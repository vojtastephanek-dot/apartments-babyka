// Zobrazení platebních údajů + QR Platba. Použito po odeslání rezervace
// i na stránce platba.html (odkaz z potvrzovacího e-mailu).
window.BabykaPay = {
  render(el, { id, vs, amount, due }) {
    const B = window.Babyka, C = B.C;
    const qr = B.qrSvg(B.spayd({ amount, vs, message: C.name + " " + id }));
    const checkinUrl = "checkin.html?r=" + encodeURIComponent(id) + "&lang=" + B.lang;
    el.innerHTML = `
      <div class="kicker">${B.t("pay.reservation")} ${id}</div>
      <h3>${B.t("pay.title")}</h3>
      <p style="color:var(--muted)">${B.t("pay.text")}</p>
      <div class="pay" style="margin:26px 0 30px">
        <div class="qr-frame">${qr}</div>
        <div>
          <dl>
            <dt>${B.t("pay.amount")}</dt><dd class="big">${B.money(amount)}</dd>
            <dt>${B.t("pay.account")}</dt><dd>${C.accountLabel}</dd>
            <dt>${B.t("pay.vs")}</dt><dd>${vs}</dd>
            <dt>${B.t("pay.iban")}</dt><dd style="word-break:break-all">${C.iban.replace(/(.{4})/g, "$1 ").trim()}</dd>
            ${due ? `<dt>${B.t("pay.due")}</dt><dd>${B.fmtDate(due)}</dd>` : ""}
          </dl>
          <p style="font-size:.85rem;color:var(--muted);margin:0">${B.t("pay.abroad")}</p>
        </div>
      </div>
      <div class="msg ok">${B.t("pay.checkin")}</div>
      <a class="btn block" href="${checkinUrl}">${B.t("pay.checkinBtn")}</a>
      <p style="font-size:.85rem;color:var(--muted);text-align:center;margin:14px 0 0">${B.t("pay.emailSent")}</p>`;
  },
};
