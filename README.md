# 🌌 Celestial Orrery + Planetarium

Ein interaktives 3D-Sonnensystem mit echten Kepler-Orbitalmechaniken und einem Planetarium-Modus für den persönlichen Geburtshimmel.

![Solar System Orrery](https://img.shields.io/badge/React-18.2-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.160-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

### Sonnensystem-Ansicht (Orrery)
- **Echte Kepler-Mechanik** — Newton-Raphson Solver für die Kepler-Gleichung
- **J2000.0 Orbitaldaten** — Alle 8 Planeten + Pluto mit NASA JPL Daten
- **6 Orbitalelemente** — Halbachse, Exzentrizität, Inklination, Ω, ω, M₀
- **Logarithmische Skalierung** — Realistische Abstände bei guter Sichtbarkeit
- **Echtzeit-Simulation** — 7 Geschwindigkeitsstufen (1× bis 1 Jahr/Sekunde)
- **Datums-Navigation** — Springe zu jedem beliebigen Datum

### Planetarium-Ansicht
- **~100 hellste Sterne** — Yale Bright Star Catalog Daten
- **Sternbild-Linien** — Orion, Großer Bär, Kassiopeia, Skorpion, etc.
- **Deutsche Sternbild-Namen** — Automatische Labels am Himmel
- **Planeten am Nachthimmel** — Zeigt wo Venus, Mars, Jupiter etc. stehen
- **Beliebige Koordinaten** — Jeder Punkt auf der Erde
- **Realistischer Horizont** — Abendrot im Westen, Morgengrauen im Osten
- **Hover-Tooltips** — Stern-Infos mit Name, Helligkeit, Position

### Geburts-Sternenhimmel
- Geburtsdaten eingeben (Datum, Uhrzeit, Ort)
- Cinematischer Zoom vom Sonnensystem zur Erde
- Persönlicher Himmel zum Zeitpunkt der Geburt

## 🚀 Installation

```bash
# Repository klonen
git clone https://github.com/DYAI2025/3DSolarSystem_animation.git
cd 3DSolarSystem_animation

# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000) im Browser.

## 📁 Projektstruktur

```
3DSolarSystem_animation/
├── app/
│   ├── page.tsx          # Next.js Hauptseite
│   ├── layout.tsx        # App Layout
│   └── globals.css       # Globale Styles
├── components/
│   └── CelestialOrrery.tsx   # Hauptkomponente
├── package.json
└── README.md
```

## 🔬 Astronomische Präzision

### Kepler-Gleichung
```
M = E - e·sin(E)
```
Wird iterativ mit Newton-Raphson gelöst (Toleranz: 10⁻⁸)

### Koordinatentransformation
```
Äquatorial (RA/Dec) → Horizontal (Azimut/Altitude)

Sternzeit = GMST + Längengrad
Stundenwinkel = Sternzeit - Rektaszension
Altitude = arcsin(sin(Lat)·sin(Dec) + cos(Lat)·cos(Dec)·cos(HA))
```

### Orbitaldaten (J2000.0 Epoch)
| Planet | a (AU) | e | i (°) | Periode (Tage) |
|--------|--------|---|-------|----------------|
| Merkur | 0.387 | 0.206 | 7.0 | 87.97 |
| Venus | 0.723 | 0.007 | 3.4 | 224.7 |
| Erde | 1.000 | 0.017 | 0.0 | 365.25 |
| Mars | 1.524 | 0.093 | 1.9 | 686.98 |
| Jupiter | 5.203 | 0.048 | 1.3 | 4332.59 |
| Saturn | 9.537 | 0.054 | 2.5 | 10759.22 |
| Uranus | 19.19 | 0.047 | 0.8 | 30688.5 |
| Neptun | 30.07 | 0.009 | 1.8 | 60182.0 |

## 🎨 UI Design

- **Glassmorphism** — Backdrop-blur Panels mit Gold-Akzenten
- **Farbpalette** — #D4AF37 (Gold), #4A90D9 (Erde), #CD5C5C (Mars)
- **Typography** — SF Mono, ultra-thin (font-weight: 300)
- **Animations** — Smooth camera transitions

## 🛠 Tech Stack

- **React 18** — UI Framework
- **Three.js** — 3D WebGL Rendering
- **Next.js 14** — React Framework
- **TypeScript** — Type Safety

## 📜 Lizenz

MIT License — Frei für persönliche und kommerzielle Nutzung.

## 🙏 Credits

- Orbitaldaten: NASA JPL Horizons
- Sternenkatalog: Yale Bright Star Catalog
- Sternbild-Linien: IAU Konstellationen

---

*Gebaut mit ❤️ für Astronomie und Astrologie*
