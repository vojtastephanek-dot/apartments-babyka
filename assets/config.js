// ============================================================
//  NASTAVENÍ WEBU – upravte jen tento soubor
// ============================================================
window.BABYKA_CONFIG = {
  name: "Apartments Babyka",

  // URL webové aplikace Google Apps Script (viz README, krok 2).
  // Dokud je prázdné, web běží v DEMO režimu: rezervace se ukládají jen
  // do prohlížeče a nikam se neodesílají.
  scriptUrl: "",

  contact: {
    email: "info@example.cz",
    phone: "+420 000 000 000",
    // Adresa převzatá z veřejných zdrojů – ověřte
    address: "Široká 45, 381 01 Český Krumlov",
    mapUrl: "https://mapy.cz/zakladni?q=%C5%A0irok%C3%A1%2045%2C%20%C4%8Cesk%C3%BD%20Krumlov",
  },

  // Bankovní účet pro QR platbu – IBAN bez mezer
  iban: "CZ0000000000000000000000",
  accountLabel: "000000-0000000000/0000",

  currency: "CZK",
  // Kolik procent ceny se platí předem jako záloha (100 = celá částka)
  depositPercent: 30,
  // Za kolik dní od rezervace musí přijít platba
  paymentDueDays: 3,
  // Poplatek z pobytu za osobu 18+ a noc (dle vyhlášky obce, max. 50 Kč)
  cityTaxPerAdultNight: 0,

  checkInTime: "15:00",
  checkOutTime: "10:00",
  minNights: 2,

  // Velikosti a kapacity dle veřejných inzerátů (33 m² / 2 os., 71 m² / 5 os.)
  // – názvy, ceny, popisy a fotky doplňte. Fotky dejte do složky img/.
  rooms: [
    {
      id: "1",
      size: 33,
      maxGuests: 2,
      pricePerNight: 2300,
      image: "",
      name: { cs: "Apartmán Studio", en: "Studio Apartment", de: "Studio-Apartment" },
      desc: {
        cs: "Útulný apartmán pro dva s vlastní koupelnou a plně vybavenou kuchyní, pár kroků od náměstí.",
        en: "Cosy apartment for two with private bathroom and fully equipped kitchen, steps from the main square.",
        de: "Gemütliches Apartment für zwei mit eigenem Bad und voll ausgestatteter Küche, nur wenige Schritte vom Marktplatz.",
      },
    },
    {
      id: "2",
      size: 71,
      maxGuests: 5,
      pricePerNight: 3900,
      image: "",
      name: { cs: "Rodinný apartmán", en: "Family Apartment", de: "Familien-Apartment" },
      desc: {
        cs: "Prostorný apartmán až pro pět osob – ideální pro rodiny a přátele. Kuchyně, koupelna, obytná část.",
        en: "Spacious apartment for up to five – ideal for families and friends. Kitchen, bathroom, living area.",
        de: "Geräumiges Apartment für bis zu fünf Personen – ideal für Familien und Freunde. Küche, Bad, Wohnbereich.",
      },
    },
  ],
};
