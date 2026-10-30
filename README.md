# Apartments Babyka – web s rezervacemi a online check-inem

Statický web (HTML/CSS/JS) + **Google Apps Script** jako zdarma „backend“.
Data se ukládají do vaší Google tabulky, e-maily se posílají z vašeho Gmailu.

**Co umí**
- 3 jazyky (CZ / EN / DE), přepínač v hlavičce, automatická volba podle prohlížeče
- kalendář obsazenosti pro oba apartmány (vlastní rezervace + **Booking.com přes iCal**)
- rezervační formulář s výpočtem ceny, zálohy a poplatku z pobytu
- **QR Platba** (standard ČBA, funguje ve všech českých bankách) + IBAN pro zahraničí
- potvrzovací e-mail hostovi (odkaz na QR platbu a check-in) a upozornění vám
- **online check-in** pro všechny hosty: údaje do evidence ubytovaných, u cizinců navíc
  údaje pro hlášení přes Ubyport (číslo víza jen pro státy mimo EU/EHP)
- menu v tabulce: „Označit jako ZAPLACENO“ (pošle hostovi potvrzení) a „Stornovat“
- export vašich přímých rezervací jako iCal → Booking si termíny zablokuje sám

## Struktura

```
index.html        hlavní stránka (apartmány, kalendář, rezervace)
checkin.html      online check-in
platba.html       QR platba (odkaz z e-mailu)
gdpr.html         vzor zásad ochrany osobních údajů – NUTNO DOPLNIT
assets/config.js  ← VEŠKERÉ NASTAVENÍ WEBU (ceny, účet, kontakty, texty apartmánů)
assets/i18n.js    překlady
apps-script/Code.gs  backend pro Google Apps Script
```

## Nasazení krok za krokem

### 1. Google tabulka + skript
1. Vytvořte novou Google tabulku (např. „Babyka – rezervace“).
2. **Rozšíření → Apps Script**, smažte obsah a vložte celý `apps-script/Code.gs`.
3. Nahoře v `CONFIG` vyplňte e-mail, adresu webu, účet/IBAN, ceny a kapacity
   (musí odpovídat `assets/config.js`).
4. **Nasadit → Nové nasazení → Webová aplikace**
   - Spustit jako: **Já**
   - Kdo má přístup: **Kdokoli**
5. Povolte oprávnění (tabulka, e-mail, externí URL) a zkopírujte URL končící `/exec`.

### 2. Web
1. V `assets/config.js` vložte URL do `scriptUrl` a doplňte účet, kontakty, ceny, fotky
   (fotky dejte do složky `img/` a do `image: "img/apartman1.jpg"`).
2. Nahrajte složku na hosting. Zdarma např. **GitHub Pages**, **Netlify** nebo **Cloudflare Pages**;
   případně na běžný český webhosting (Wedos, Forpsi…) přes FTP. Žádné PHP ani databáze není potřeba.
3. Napojte vlastní doménu (např. `babyka-apartments.cz`).

### 3. Propojení s Bookingem (obousměrně přes iCal)
- **Booking → web:** extranet Booking.com → *Ceny a dostupnost → Synchronizace kalendářů →
  Exportovat kalendář*. Odkaz pro každý apartmán vložte do `CONFIG.bookingIcal` v Code.gs.
- **Web → Booking:** v téže sekci zvolte *Importovat kalendář* a vložte
  `VAŠE_URL/exec?action=ical&room=1` (a `room=2` pro druhý apartmán).
- ⚠️ iCal se synchronizuje se zpožděním (Booking stahuje zhruba po hodinách, web drží cache 10 min).
  Riziko dvojité rezervace je malé, ale nulové není. Booking také nemusí přijmout URL
  s přesměrováním (Apps Script přesměrovává) – pokud import selže, je třeba malý proxy
  (např. Cloudflare Worker), rádi doplníme.

### 4. Doporučené
- V Apps Scriptu: *Spouštěče → Přidat* → funkce `expireUnpaid`, denně → automaticky
  stornuje nezaplacené rezervace po splatnosti.
- Doplňte a nechte zkontrolovat `gdpr.html` a obchodní/storno podmínky.

## Legislativa (stav k 10/2026 – ověřte)
- **Evidence ubytovaných / domovní kniha** a **hlášení cizinců Policii ČR do 3 pracovních dnů**
  (zákon č. 326/1999 Sb., § 100–102) – hlášení se podává přes **Ubyport**; týká se všech cizinců vč. občanů EU.
  Formulář sbírá potřebné údaje, samotné odeslání do Ubyportu děláte vy (list „Check-in“, sloupec „Nahlášeno Ubyport“).
- **Poplatek z pobytu** (zákon č. 565/1990 Sb.) – sazbu dle vyhlášky Českého Krumlova nastavte v `cityTaxPerAdultNight`.
  Evidenční údaje se uchovávají 6 let.
- **eTurista** (nový jednotný systém, má nahradit Ubyport) zatím **není spuštěn**; termín se posouvá
  (MMR mluví o 2027, návrh novely o 1. 1. 2028). Až se spustí, bude potřeba upravit export.

## Lokální náhled
```bash
python3 -m http.server 8000
```
Pak otevřete http://localhost:8000. Bez `scriptUrl` běží web v **DEMO režimu**
(rezervace se ukládají jen do prohlížeče).
