# MarktPuls

Sentiment- & Frühwarnsystem-Dashboard (Prototyp, Demo-Daten): Composite-Score aus
sieben gewichteten Markt-Internals, regelbasierte Frühwarnsignale und ein
Zeitreise-Scrubber zum Durchspielen historischer Marktphasen.

Gebaut mit **React 19**, **Vite** und **Recharts**. Installierbar als PWA
(Manifest + App-Icons vorhanden).

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server mit HMR
npm run build     # Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen
npm run lint      # ESLint
```

## Deployment (Vercel)

Das Projekt ist für Vercel vorbereitet ([vercel.json](vercel.json) mit
SPA-Rewrite). Deployment per Vercel-Dashboard („Import Git Repository" →
dieses Repo, Framework-Preset **Vite**) oder per CLI:

```bash
npm i -g vercel
vercel            # Preview-Deployment
vercel --prod     # Produktion
```

## Roadmap

- [x] **Stufe 1:** PWA-Manifest + App-Icon, Vercel-Deployment vorbereitet
- [ ] Weitere Stufen folgen
