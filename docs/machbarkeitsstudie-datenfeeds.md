# Machbarkeitsstudie: Umstellung von MarktPuls auf echte Marktdaten-Feeds

*Stand: 08.07.2026 — recherchiert anhand der offiziellen Anbieter-Dokumentationen (Links jeweils angegeben).*

---

## Executive Summary

**Ja, das Projekt ist machbar — und zwar zu 0 €/Monat.** Der Kern der Lösung: **FRED API** (St. Louis Fed, kostenlos, API-Key gratis, 120 Req/min) deckt VIX, VIX3M, Kreditspreads, Zinsstruktur, 10J-Rendite, Nasdaq Composite, Dow Jones Utilities und sogar den S&P 500 (10 Jahre Historie) ab. Die **CBOE-CDN-Endpunkte** liefern kostenlos VIX-/VIX3M-Historie als CSV und tagesaktuelle Put/Call-Ratios als JSON. Für ETF-Proxys (SPY, RSP, GLD, TLT) reicht der Free-Tier von **Alpha Vantage** (25 Req/Tag — bei 24h-Cache mehr als genug) oder **Stooq** (kostenlose CSV-Downloads). Alle Abrufe laufen serverseitig über eine Vercel Serverless Function mit 24h-Cache und täglichem Cron. Lizenzseitig ist die Anzeige **abgeleiteter 0-100-Scores** (keine Rohkurse!) der sauberste Weg; bei Anzeige von Roh-Zeitreihen einzelner FRED-Serien ist Attribution nötig, bei copyright-geschützten Serien (VIX, S&P 500) im Zweifel nur der abgeleitete Score. Budget-Fallback, falls ein Anbieter wegbricht: **EODHD "All World"** für ~20 €/Monat.

---

## Übersichtstabelle: Datenbedarf → Quelle

| # | Datenbedarf | Empfohlene Primärquelle | Fallback / Proxy | Limit / Kosten | Risiko |
|---|---|---|---|---|---|
| 1 | S&P 500 täglich + ≥1 J. Historie (Momentum, MA50/200, 38-Wochen-Linie) | FRED `SP500` (10 J. Historie, täglich) | SPY via Alpha Vantage `TIME_SERIES_DAILY` oder Stooq `spy.us` | FRED: kostenlos, 120 Req/min; AV: 25 Req/Tag | Gering. FRED-`SP500`-Serie ist copyright-geschützt (Citation required) → nur abgeleitete Werte anzeigen |
| 2 | Marktbreite (A/D-Linie o. Proxy) | **Proxy: RSP/SPY-Verhältnis** aus EOD-ETF-Kursen (Alpha Vantage / Stooq) | % über MA aus eigenem Cache berechnet (nur SPY-basiert); echte NYSE-A/D-Daten sind frei praktisch nicht verfügbar | kostenlos (2 zusätzliche Symbole/Tag) | Mittel: Proxy ≠ echte A/D-Daten; methodisch aber etabliert (equal- vs. cap-weight) |
| 3 | VIX-Tagesschluss + Historie | CBOE CDN `VIX_History.csv` (ab 1990) **oder** FRED `VIXCLS` | Stooq `^vix` | kostenlos, kein Key (CBOE) | Gering. CBOE-CSV ist inoffiziell-stabil (seit Jahren gleiche URL); FRED als Redundanz |
| 4 | VIX-Termstruktur (VIX vs. VIX3M) | CBOE CDN `VIX3M_History.csv` (ab 2009) + VIX; **oder** FRED `VIXCLS` / `VXVCLS` | ETF-Proxy VIXY/VXZ-Verhältnis (Kurs-API) — ungenauer wegen Rollkosten | kostenlos | Gering–mittel: VIX/VIX3M-Ratio ist ein guter Standard-Proxy für die Futures-Kurve; echte Futures-Daten wären teuer |
| 5 | Put/Call-Ratio (CBOE) | CBOE CDN JSON `…/market_statistics/daily/YYYY-MM-DD_daily_options` (Total-, Equity-, Index-Ratio) | 10/20-Tage-Glättung aus selbst akkumuliertem Tages-Cache; alternativ VIX-basierter Sentiment-Ersatz | kostenlos, kein Key | **Mittel–hoch**: inoffizieller Endpunkt, lange freie Historie nicht mehr verfügbar → Historie selbst aufbauen |
| 6 | Kreditspreads (High-Yield OAS) | FRED `BAMLH0A0HYM2` | FRED `BAMLC0A0CM` (IG OAS) | kostenlos, API-Key nötig | Gering. ICE-BofA-Serie copyright-geschützt → Attribution, ideal nur als Score |
| 7 | Safe-Haven-Flüsse (Gold, Treasuries, USD, Yen) | ETF-Proxys GLD, TLT via Alpha Vantage/Stooq; USD: FRED `DTWEXBGS`; Yen: FRED `DEXJPUS` | Twelve Data Free (800 Req/Tag) | kostenlos | Gering |
| 8 | Makro-Wochensignale (Zinsstruktur, 10J, Nasdaq, DJ Utilities) | FRED: `T10Y2Y`, `DGS10`, `NASDAQCOM`, `DJUA` | Stooq `^ndq`, `^dju` | kostenlos | Gering. `NASDAQCOM`/`DJUA` copyright-geschützt → abgeleitete Werte + Zitat |

**Gesamtkosten der empfohlenen Lösung: 0 €/Monat** (2 kostenlose API-Keys: FRED, Alpha Vantage). Optionaler Paid-Fallback: EODHD All World ~20 €/Monat.

---

## Anbieter im Detail

### FRED API (Federal Reserve Bank of St. Louis) — ⭐ Hauptquelle

- **Kosten/Key:** Kostenlos; alphanumerischer API-Key nach Registrierung erforderlich. Rate-Limit **120 Requests/Minute**.
- **API-Form:** REST, JSON/XML (`/fred/series/observations?series_id=…`), volle Historie pro Serie.
- **Relevante Serien:** `SP500` (S&P 500, täglich, 10 Jahre), `VIXCLS` (VIX-Close ab 1990), `VXVCLS` (CBOE 3-Monats-Vol = VIX3M), `BAMLH0A0HYM2` (HY OAS), `T10Y2Y`, `DGS10`, `NASDAQCOM` (ab 1971), `DJUA` (Dow Jones Utilities), `DTWEXBGS` (USD-Index), `DEXJPUS` (Yen).
- **Lizenz:** Nutzung mit **Attribution** erlaubt; Weiterverbreitung *proprietärer Dritt-Daten* (dazu zählen die von Cboe/S&P/Nasdaq gelieferten, als „Copyrighted: Citation Required" markierten Serien wie `VIXCLS`, `SP500`, `NASDAQCOM`, `DJUA`) **für kommerzielle Zwecke nur mit Erlaubnis des Rechteinhabers**. Öffentlich-rechtliche Serien („Public Domain: Citation requested", z. B. Treasury-Zinsen) sind unkritisch. **Konsequenz für MarktPuls:** abgeleitete 0-100-Scores anzeigen (substanziell transformiert, keine Redistribution der Rohserie) + Quellenzitat; Roh-Charts der copyright-geschützten Serien vermeiden.
- **Quellen:** [FRED API Terms of Use](https://fred.stlouisfed.org/docs/api/terms_of_use.html) · [FRED API Docs](https://fred.stlouisfed.org/docs/api/fred/) · [VIXCLS](https://fred.stlouisfed.org/series/VIXCLS) · [VXVCLS](https://fred.stlouisfed.org/series/VXVCLS) · [NASDAQCOM](https://fred.stlouisfed.org/series/NASDAQCOM) · [DJUA](https://fred.stlouisfed.org/series/DJUA) · [CBOE-Release auf FRED](https://fred.stlouisfed.org/release?rid=200)

### CBOE (freie CDN-Daten) — ⭐ für VIX-Historie & Put/Call

- **VIX-Historie:** `https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv` — CSV `DATE,OPEN,HIGH,LOW,CLOSE` **ab 02.01.1990** (verifiziert am 08.07.2026; frühe Jahre nur Close). Analog `VIX3M_History.csv` **ab 18.09.2009** (verifiziert).
- **Put/Call-Ratios:** `https://cdn.cboe.com/data/us/options/market_statistics/daily/YYYY-MM-DD_daily_options` liefert **JSON mit Total-, Equity-, Index- und produktspezifischen Put/Call-Ratios** plus Volumen/Open-Interest (für 06.07.2026 verifiziert). HTML-Ansicht: [Cboe Daily Market Statistics](https://www.cboe.com/us/options/market_statistics/daily/).
- **Historie Put/Call:** Die früher frei verfügbaren langen Ratio-Archive gibt es nicht mehr als einfachen Download; historische Detaildaten nur kostenpflichtig über Cboe DataShop. Die Tages-JSONs liegen aber rückwirkend (mind. mehrere Jahre) auf dem CDN → Historie per einmaligem Backfill-Skript aufbaubar.
- **Lizenz:** Kein API-Vertrag; die Daten werden „for the convenience of site visitors" bereitgestellt, Nutzung unterliegt den allgemeinen Website-Terms. **Grauzone** — kein garantierter SLA, Endpunkte können sich ändern. Für abgeleitete Scores mit Tagesabruf + Cache pragmatisch vertretbar, aber als Risiko führen.
- **Quellen:** [Daily Market Statistics](https://www.cboe.com/us/options/market_statistics/daily/) · [Historical Data / DataShop-Verweis](https://www.cboe.com/us/options/market_statistics/historical_data/) · [VIX Historical Data](https://www.cboe.com/tradable_products/vix/vix_historical_data/)

### Alpha Vantage — für ETF-Proxys (SPY, RSP, GLD, TLT)

- **Free Tier:** **25 Requests/Tag** (Standard-Limit laut Premium-Seite). `TIME_SERIES_DAILY` für US-Aktien/ETFs inkl. 20+ Jahre Historie ist im Free Tier enthalten; echte Indizes (^GSPC, ^VIX) **nicht** — daher nur ETF-Proxys nutzen.
- **Paid:** ab 49,99 $/Monat (75 Req/min) — für MarktPuls unnötig.
- **Lizenz:** Keine expliziten Display-/Redistribution-Klauseln auf der Pricing-Seite; ToS für kommerzielles Re-Display der Rohdaten unklar → abgeleitete Werte bevorzugen.
- **Passung:** Bei 24h-Cache braucht MarktPuls ~4-6 Requests/Tag (SPY, RSP, GLD, TLT, ggf. VIXY/VXZ) → Free Tier reicht komfortabel.
- **Quelle:** [Alpha Vantage Premium/Limits](https://www.alphavantage.co/premium/) · [API-Doku](https://www.alphavantage.co/documentation/)

### Stooq — kostenlose CSV-Downloads (Fallback)

- **Form:** Undokumentierte, aber seit Jahren stabile CSV-Endpunkte, z. B. `https://stooq.com/q/d/l/?s=spy.us&i=d` (volle Tageshistorie), auch Indizes (`^spx`, `^vix`, `^ndq`, `^dju`). Kein Key.
- **Limits:** Ungenannte tägliche Quote („Exceeded the daily hits limit" bei zu vielen Abrufen); ein Abruf/Symbol/Tag ist unkritisch. Direkter Server-Abruf aus der Vercel-Function kann je nach IP-Reputation geblockt werden (bei unserem Testabruf kam eine leere Antwort zurück — vorab aus der Ziel-Infrastruktur testen!).
- **Lizenz:** Keine formale API-Lizenz → Grauzone, nur als Fallback/Redundanz einplanen.
- **Quellen:** [Stooq Free Market Data](https://stooq.com/db/) · [QuantStart-Einführung](https://www.quantstart.com/articles/an-introduction-to-stooq-pricing-data/) · [Erfahrungen zum Daily-Limit (PP-Forum)](https://forum.portfolio-performance.info/t/historical-data-good-source-for-csv-imports-stooq/37973)

### Yahoo Finance (inoffiziell) — nicht empfohlen

- Kein offizielles API; `yfinance` & Co. nutzen interne Endpunkte. Yahoos ToS untersagen automatisierten Zugriff ohne Erlaubnis; Daten sind „personal use only". Yahoo ändert Endpunkte/Auth regelmäßig und blockt Server-IPs (Vercel-Rechenzentrums-IPs besonders betroffen). Für eine **öffentliche, produktive App ungeeignet** — rechtlich wie technisch.
- **Quellen:** [yfinance-Disclaimer (GitHub)](https://github.com/ranaroussi/yfinance) · [AlgoTrading101-Guide](https://algotrading101.com/learn/yahoo-finance-api-guide/) · [Scrapfly-Analyse zu Blocking/ToS](https://scrapfly.io/blog/posts/guide-to-yahoo-finance-api)

### Tiingo — technisch gut, lizenzrechtlich ungeeignet

- **Free:** 1.000 Req/Tag, 50/h, 500 Symbole/Monat, EOD-Historie 30+ Jahre. **Power: 30 $/Monat.**
- **Aber:** Beide Tiers sind explizit **„Internal use"**: „you may only use the data for your own personal use and you may not display or share the data with another person or organization." Auch der Power-Plan erlaubt kein öffentliches Display → für MarktPuls (öffentliche App) **ausgeschlossen**, sofern keine gesonderte kommerzielle Lizenz verhandelt wird.
- **Quelle:** [Tiingo Pricing](https://www.tiingo.com/pricing)

### Twelve Data

- **Free („Basic"):** 8 Credits/min, **800/Tag**; US-Aktien/ETFs enthalten. Indizes und erweiterte Märkte in höheren Plänen; Pro 229 $/Monat mit „internal display"-Klassifizierung — externe Display-Rechte erst in teuren Tiers. Als kostenloser ETF-Fallback brauchbar, für Roh-Display lizenzrechtlich heikel.
- **Quelle:** [Twelve Data Pricing](https://twelvedata.com/pricing)

### Polygon.io → jetzt „Massive"

- Polygon.io wurde zu **massive.com** umbenannt (APIs laufen weiter). **Free Tier: 5 Calls/min, nur EOD, ~2 Jahre Historie** — Aktien/ETFs ok. **Indizes (S&P 500, VIX) sind ein separates, kostenpflichtiges Produkt** mit eigener Preisleiter → für Index-Daten im Budget nicht attraktiv. Free-ETF-Daten als Fallback möglich.
- **Quellen:** [Rebrand-Ankündigung](https://massive.com/blog/polygon-is-now-massive) · [Indices-Produkt](https://polygon.io/indices) · [Pricing](https://massive.com/pricing)

### Finnhub

- **Free:** 60 Calls/min, Realtime-US-Quotes, Fundamentals. **Aber:** Candles/OHLC-Historie ist im Free Tier stark eingeschränkt (403 auf `/stock/candle` für Free-Keys ist verbreitet dokumentiert); Indizes nicht frei. Für MarktPuls kein Mehrwert gegenüber Alpha Vantage.
- **Quellen:** [Finnhub Pricing](https://finnhub.io/pricing) · [Rate-Limit-Doku](https://finnhub.io/docs/api/rate-limit)

### EODHD — bester Paid-Fallback

- **Free:** nur 20 Calls/Tag mit eingeschränkten Daten. **„All World": 19,99 €/Monat** — 100.000 Calls/Tag, EOD für Aktien/ETFs/Indizes weltweit, US-Historie teils bis in die 1970er. Damit ließe sich das gesamte Kurs-Datenspektrum (inkl. Indizes) aus einer Hand abdecken — **einzige Option unter 50 €/Monat mit Index-EOD per Vertrag**. Redistribution-Rechte für Rohdaten sind auch hier nicht pauschal enthalten (Daten-API-Anbieter, keine Display-Lizenz ausgewiesen) → gleiche „abgeleitete Werte"-Strategie.
- **Quelle:** [EODHD Pricing](https://eodhd.com/pricing)

### Nasdaq Data Link (ehem. Quandl)

- Freies WIKI-EOD-Dataset seit 2018 eingestellt (Daten enden März 2018). Es bleiben ~40 freie (überwiegend Makro-)Datasets; Rate-Limit mit Key 50.000 Calls/Tag. Für die MarktPuls-Bedarfe bringt es nichts, was FRED nicht besser abdeckt.
- **Quellen:** [WIKI-Einstellung (Help Center)](https://help.data.nasdaq.com/article/506-why-does-wiki-prices-only-go-up-to-march-2018) · [Rate Limits](https://docs.data.nasdaq.com/docs/rate-limits-1)

---

## Empfohlene Architektur

**Quellen-Mix (alles kostenlos):**

1. **FRED** (1 Key): `SP500`, `VIXCLS`, `VXVCLS`, `BAMLH0A0HYM2`, `T10Y2Y`, `DGS10`, `NASDAQCOM`, `DJUA`, `DTWEXBGS`, `DEXJPUS` → ~10 Requests/Tag.
2. **CBOE CDN** (kein Key): `VIX_History.csv` + `VIX3M_History.csv` (Termstruktur-Redundanz zu FRED) und das Tages-JSON der Put/Call-Ratios → 3 Requests/Tag.
3. **Alpha Vantage** (1 Key): SPY, RSP, GLD, TLT (`TIME_SERIES_DAILY`, `outputsize=full` nur beim Backfill) → 4 Requests/Tag von 25 erlaubten. Stooq als getesteter Zweitweg.

**Vercel-Umsetzung:**

```
/api/marketdata  (Vercel Serverless Function, Node.js)
  ├─ liest aggregiertes Tages-JSON aus Cache (Vercel KV/Upstash Redis oder Blob)
  └─ Response-Header: Cache-Control: s-maxage=86400, stale-while-revalidate=3600

/api/cron/refresh  (per vercel.json "crons", z. B. 23:30 UTC nach US-Schluss)
  ├─ holt alle Serien (FRED, CBOE, Alpha Vantage) sequenziell mit Retry
  ├─ berechnet serverseitig: MA50/MA200, 125-Tage-Momentum, 38-Wochen-Linie,
  │   RSP/SPY-Ratio-Trend, VIX/VIX3M-Ratio, geglättete Put/Call-Ratio (10-Tage),
  │   Perzentil-Normierung → 0-100-Teilscores → gewichteter Composite
  ├─ hängt die neue Put/Call-Tageszeile an die selbst geführte Historie an (Backfill einmalig)
  └─ schreibt EIN kompaktes JSON (Scores + Sparkline-Reihen) in den Cache
```

- Das Frontend erhält **nur die abgeleiteten Scores und normierten Verlaufsreihen**, keine Rohkurse → minimiert Lizenzrisiko über alle Quellen hinweg.
- API-Keys als Vercel Environment Variables; niemals im Client.
- Footer/Impressum: Attribution „Data: FRED® (Federal Reserve Bank of St. Louis), Cboe, Alpha Vantage" — FRED verlangt Zitat.
- Fallback-Kette pro Indikator (z. B. VIX: CBOE-CSV → FRED `VIXCLS` → letzter Cache-Stand mit „Stand: …"-Badge), damit ein ausgefallener Anbieter nie das Dashboard leert.

**Aufwandsschätzung:** 1 Cron-Function + 1 Read-Function + Backfill-Skript; keine Datenbank nötig (KV reicht), ~2-4 Entwicklungstage.

---

## Risiken & offene Punkte

1. **Put/Call-Verfügbarkeit (größtes Einzelrisiko):** Der CBOE-JSON-Endpunkt ist inoffiziell und ohne Zusage. Cboe hat freie historische Archive bereits zurückgefahren (Verweis auf kostenpflichtigen [DataShop](https://www.cboe.com/us/options/market_statistics/historical_data/)). Mitigation: Historie selbst akkumulieren, Indikator degradierbar gestalten (Composite ohne Put/Call rechenbar), Alternativ-Signal (VIX-Perzentil) vorhalten.
2. **Lizenz-Grauzone „abgeleitete Werte":** Die Annahme, dass 0-100-Scores als substanziell transformierte, nicht rückrechenbare Derivate kein „Redistribution" der Rohdaten darstellen, ist branchenüblich, aber von keinem der Anbieter (FRED-Drittserien, Alpha Vantage, CBOE) schriftlich bestätigt. Bei Kommerzialisierung (Werbung/Bezahlmodell) rechtliche Prüfung bzw. Anfrage an Cboe/S&P DJI empfohlen. Roh-Charts von `SP500`, `VIXCLS`, `NASDAQCOM`, `DJUA` öffentlich anzuzeigen wäre klar über der Linie ([FRED Terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html)).
3. **Yahoo Finance bewusst ausgeschlossen:** ToS-Verstoß + IP-Blocking von Rechenzentrums-IPs; als „unsichtbarer Fallback" verlockend, aber für eine öffentliche App nicht tragfähig ([yfinance-Disclaimer](https://github.com/ranaroussi/yfinance)).
4. **Stooq-Serverzugriff ungeklärt:** Unser Testabruf von `stooq.com/q/d/l/` lieferte eine leere Antwort (möglicherweise IP-basiertes Blocking). Vor Einplanung als Fallback aus einer echten Vercel-Function testen.
5. **Marktbreite nur als Proxy:** Echte NYSE-Advance/Decline-Daten sind frei nicht seriös verfügbar. RSP/SPY ist ein akzeptierter, aber nicht identischer Ersatz — im UI-Tooltip transparent machen.
6. **VIX-Termstruktur vereinfacht:** VIX/VIX3M-Spot-Ratio statt echter Futures-Kurve; ETF-Proxys (VIXY/VXZ) sind wegen Rollverlusten schlechter. Für ein Sentiment-Dashboard ausreichend, für Handelssignale nicht.
7. **FRED-Publikationsverzug:** Einige Serien (z. B. ICE-BofA-OAS, `SP500`) erscheinen mit ~1 Tag Verzug; der Cron sollte tolerant gegenüber fehlenden jüngsten Datenpunkten sein (letzten verfügbaren Wert verwenden, Datum anzeigen).
8. **Anbieter-Drift:** Polygon→Massive-Rebrand und die Alpha-Vantage-Limit-Senkung (500→25/Tag in den letzten Jahren) zeigen: Free-Tiers ändern sich. Budget-Reserve: EODHD All World (~20 €/Monat) deckt notfalls alle Kursdaten inkl. Indizes ab und bleibt unter dem 50-€-Limit.
