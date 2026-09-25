# RepoRadar V3 — A24 Cinematic Disc Experience Rebuild

A high-fidelity, interactive 3D WebGL web experience inspired by [a24.raviklaassens.com](https://a24.raviklaassens.com/), treating daily GitHub technology scouting as a prestigious film archive.

---

## 🎨 Visual Philosophy & Metaphor

Instead of a generic SaaS dashboard, each trending repository is rendered as a **physical, limited-edition vinyl record / celluloid film canister**:

| Film Metaphor | RepoRadar Metric | Expression |
| :--- | :--- | :--- |
| **Film Canister / Disc** | Repository Record | Physical vinyl record with phonograph micro-grooves and center archival label |
| **Festival Laurel** | LLM-as-Judge Verdict | `★ OFFICIAL SELECTION` (Fit), `★ UNDER REVIEW` (Maybe), `★ ARCHIVED / PASS` (Not Fit) |
| **Film Sensitivity (ISO)** | GitHub Star Magnitude | `ISO 25` (0–50★), `ISO 100` (200–2k★), `ISO 400` (2k–10k★), `ISO 1600` (50k+★) |
| **Film Gauge / Format** | Primary Language | `35mm Color Neg` (TypeScript), `16mm Reversal` (Python), `65mm IMAX` (C++) |
| **Exposure Compensation** | Model Confidence | `+1 EV` (High Certainty), `±0 EV` (Balanced Read), `-1 EV` (Low Confidence) |

---

## 📐 Architecture & Key Improvements over Initial POC

1. **Golden Two-Zone Cinema Split (58% / 42%)**:
   - **Left Stage (58%)**: Dedicated 3D Turntable viewport. The active disc is always centered in this stage. Adjacent discs cascade backwards in 3D perspective ($z: -55$, $rotY: \pm 28^\circ$) and are strictly constrained so they **never cross into or occlude the right docket**.
   - **Right Stage (42%)**: Uninterrupted, high-contrast editorial docket displaying the festival laurels, serif headlines, LLM-as-judge critical rationale, specs grid, and GitHub CTA.
2. **True Vinyl 3D Geometry**:
   - Replaced flat translucent cards with authentic, lustrous jet-black vinyl records (`#0c0d0f`) with radial phonograph micro-grooves, specular key light reflections, brass spindle bushings, and vintage circular rim typography.
   - Fixed all coplanar Z-fighting on angled neighbor discs using hardware `polygonOffset`.
3. **Tactile Interaction**:
   - Direct click / tap on neighbor discs to bring them to center via GPU raycasting.
   - Mouse drag / flick with physical rotational inertia.
   - Smooth track scrubber with A24 crimson active pill.
   - Keyboard navigation (`←` / `→` or `A` / `D`).
   - Theme toggle: Invert between warm celluloid paper (`#f3f2ee`) and deep obsidian (`#111313`).

---

## 🚀 How to View

The experience is completely self-contained with zero external build steps:

1. Open `ui/index.html` directly in your browser:
   ```bash
   open ui/index.html
   ```
2. Or serve locally with any static web server:
   ```bash
   npx serve ui
   # or
   python3 -m http.server 8000 --directory ui
   ```
