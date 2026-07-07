# MarktPuls — Produkt-Roadmap

Ziel: Aus dem Prototyp mit Demo-Daten ein echtes, öffentlich nutzbares Produkt machen —
ein tägliches Sentiment- & Frühwarn-Dashboard für den US-Aktienmarkt.

Leitplanken für alle Stufen:

- **EOD statt Realtime.** Tagesdaten reichen für die Produktidee (Frühwarnung, kein Trading-Terminal).
- **Kein Anlageberatungs-Anspruch.** Disclaimer bleibt prominent; Formulierungen bleiben deskriptiv.
- **Mobile first.** Die 440-px-Ansicht ist die Referenz; Desktop ist die Erweiterung.

## Stufe 1 — PWA-Grundlagen & Deployment ✅ *(erledigt)*

- [x] PWA-Manifest + App-Icons (192/512/maskable/apple-touch)
- [x] Vercel-Vorbereitung (`vercel.json`, SPA-Rewrite), Build grün
- [x] Public GitHub-Repo, sauberes Git-Setup
- [x] Responsives Desktop-Layout (Zweispalten-Grid ≥ 900 px), Template-CSS bereinigt
- [ ] **Rest:** Projekt bei Vercel importieren und erste öffentliche URL live schalten *(manuell, ~15 min)*

## Stufe 2 — Echte Datenfeeds (EOD)

> Grundlage: [Machbarkeitsstudie Datenfeeds](machbarkeitsstudie-datenfeeds.md).
> Ergebnis: **machbar für 0 €/Monat** mit FRED (Hauptquelle, 1 Gratis-Key), CBOE-CDN
> (VIX-Historie + Put/Call, keyless) und Alpha Vantage Free (ETF-Proxys, 1 Gratis-Key).
> Paid-Fallback, falls ein Anbieter wegbricht: EODHD „All World" ~20 €/Monat.

- [ ] API-Keys besorgen (FRED, Alpha Vantage) und als Vercel-Env-Variablen hinterlegen
- [ ] `api/cron/refresh` (Vercel Cron, ~23:30 UTC nach US-Schluss): alle Serien holen —
      FRED (SP500, VIXCLS, VXVCLS, HY-OAS, T10Y2Y, DGS10, NASDAQCOM, DJUA, USD, Yen),
      CBOE-CDN (VIX/VIX3M-CSV, Put/Call-Tages-JSON), Alpha Vantage (SPY, RSP, GLD, TLT)
      — mit Retry und Fallback-Kette pro Indikator
- [ ] Scores **serverseitig** berechnen (MA50/200, Momentum, RSP/SPY-Breite-Proxy,
      VIX/VIX3M-Ratio, geglättete Put/Call-Ratio, Perzentil-Normierung → 0–100)
      und EIN kompaktes JSON in den Cache schreiben (Vercel KV/Blob, TTL 24 h + stale-while-revalidate)
- [ ] `api/marketdata` (Read-Function): Frontend erhält **nur abgeleitete Scores**,
      nie Rohkurse — das minimiert das Lizenzrisiko (FRED-Drittserien sind copyright-geschützt)
- [ ] Put/Call-Historie per einmaligem Backfill-Skript aus den CBOE-Tages-JSONs aufbauen
      und täglich fortschreiben; Composite muss **ohne** Put/Call rechenbar bleiben (größtes Feed-Risiko)
- [ ] Attribution in den Footer: „Data: FRED® (St. Louis Fed), Cboe, Alpha Vantage" (FRED verlangt Zitat)
- [ ] Umschalter „Live-Daten / Demo-Szenarien" — die drei Lern-Szenarien bleiben als Feature erhalten
- [ ] Fehlerbild definiert: „Stand: [Datum]"-Badge bei stale Daten statt leerer Charts
- [ ] Proxy-Transparenz im UI: Tooltip erklärt, dass Marktbreite (RSP/SPY) und Termstruktur
      (VIX/VIX3M statt Futures-Kurve) Näherungen sind

**Definition of Done:** Dashboard zeigt beim Öffnen den echten gestrigen Marktzustand; kein API-Key und keine Rohkurse im Client; Ausfall einer Quelle bricht die Seite nicht. Aufwand laut Studie: ~2–4 Entwicklungstage, keine Datenbank nötig.

## Stufe 3 — Vertrauen & Betrieb

- [ ] Service Worker: Offline-Fähigkeit (letzter Datenstand + App-Shell), Fonts selbst hosten
      (derzeit Google-Fonts-`@import` — render-blockierend und offline-untauglich)
- [ ] Tests für die Kernlogik: Score-Berechnung, Signalregeln, Normalisierung, Cross-Erkennung
      (Vitest; die Rechenfunktionen dafür aus `marktpuls.jsx` in Module extrahieren)
- [ ] Monitoring: Cron-Fehlschläge und Feed-Ausfälle melden (z. B. E-Mail/Webhook)
- [ ] Datenqualitäts-Checks: Plausibilitätsgrenzen je Serie (VIX 5–100 …), sonst letzter guter Wert
- [ ] Rechtliches für DE-Publikum: Impressum, Datenschutzerklärung, präzisierter Disclaimer

**Definition of Done:** Ein Feed-Ausfall wird gemeldet, bevor ihn ein Nutzer bemerkt; die Rechenlogik ist durch Tests abgesichert; die Seite ist rechtlich sauber betreibbar.

## Stufe 4 — Produkt-Features

- [ ] **Historien-Ansicht:** Zeitreise-Scrubber auf echte Historie erweitern (1–2 Jahre),
      inkl. „Was hätten die Signale gezeigt?" an markanten Daten
- [ ] **Signal-Journal:** Log vergangener Signalwechsel (wann sprang was auf Rot/Grün)
      — das Kernargument für die Glaubwürdigkeit des Produkts
- [ ] **Push-Benachrichtigungen** (Web Push über den Service Worker aus Stufe 3):
      „Neues Frühwarnsignal aktiv" als Opt-in — der Haupt-Wiederkehr-Anker
- [ ] Erklärseiten je Komponente (Methodik transparent machen, auch SEO-relevant)
- [ ] Teilen-Funktion: Tageszustand als Bild/Link

**Definition of Done:** Es gibt einen Grund, täglich (Push) und wöchentlich (Journal) zurückzukommen.

## Stufe 5 — Reichweite & ggf. Monetarisierung

- [ ] Eigene Domain, Open-Graph-Bilder, Landing-/Erklärseite
- [ ] Anonyme Nutzungsmetriken (datenschutzkonform, z. B. selbst gehostetes Umami/Plausible)
- [ ] Optional, erst bei Traktion: Konten + Premium-Stufe
      (z. B. E-Mail-Report, mehr Historie, weitere Märkte) — vorher nicht bauen
- [ ] Optional: weitere Märkte (DAX/Europa) als zweites Dashboard-Profil

## Technische Schulden (laufend, kein eigener Meilenstein)

- `marktpuls.jsx` (750+ Zeilen) in Module aufteilen: Daten/Logik/UI trennen — spätestens in Stufe 3 nötig
- Recharts-Bundle (~546 kB JS) per Code-Splitting/Lazy-Loading verkleinern
- TypeScript-Migration erwägen, sobald die Datenlogik echt wird (Stufe 2/3)
- `src/assets/hero.png` klären: verwenden oder entfernen

## Reihenfolge-Begründung

Stufe 2 vor allem anderen: Ohne echte Daten ist alles Weitere Kosmetik.
Stufe 3 vor Stufe 4: Push-Benachrichtigungen und Journal sind wertlos, wenn Feeds unbemerkt
ausfallen können — Vertrauen ist bei einem Frühwarnsystem das Produkt.
Monetarisierung bewusst zuletzt: erst beweisen, dass Leute wiederkommen.
