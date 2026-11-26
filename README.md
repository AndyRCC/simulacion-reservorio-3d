# Flowmeter at a reservoir outlet with a 45° drop (3D)

*English · [Español](README.es.md)*

A 3D simulation with two cases you can switch between on the page:

- **Case 1 (Phase 1):** why an electromagnetic flowmeter installed on the horizontal outlet
  of a reservoir, just before a steep drop, does not measure correctly.
- **Case 2 (Phase 2):** the same sensor in a **gooseneck**, which keeps it always full so it
  measures correctly.

Direct links: add `#caso1` or `#caso2` to the end of the URL.

**Live:** https://andyrcc.github.io/simulacion-reservorio-3d/ (the interface is in Spanish)

## How to open it

- **Without installing anything:** run `py build.py` and double-click
  `dist/simulacion_fase1_3d.html` (~20 MB, everything embedded: Three.js, HDRI sky and
  textures; works offline).
- **Development version** (code split into `js/`): serve the folder and open `index.html`.

  ```powershell
  py -m http.server 8765
  ```

  Then open http://localhost:8765/index.html. After editing `js/`, run `py build.py` to
  regenerate the single HTML file.

## What it computes (real 1D hydraulics, not hand-drawn curves)

| Situation | Model |
|---|---|
| Low level (inlet not submerged) | Subcritical **H2** backwater curve from critical depth at the grade break at the elbow (Manning + specific energy) |
| High level (submerged sharp-edged inlet) | **Vena contracta** (Cc = 0.62) → **supercritical H3** jet; air enters through the outlet and the pipe never pressurizes (culvert "type 5" flow) |
| Drop | Supercritical **S2** profile with pressure y·cos φ |
| Flow rate | The smaller of outlet control (H2/pressure + entrance loss Ke = 0.5) and inlet control (orifice) |
| Flowmeter | Q_ind = v · A_full → **over-reading** ≈ A_full / A_wetted, with noise; erratic signal if the electrodes (at 3 and 9 o'clock) are in air; zero output if empty-pipe detection (EPD) is active |

Geometry: selectable DN80 to DN400 (EN 1092-1 PN16 flanges, flowmeter length per
ISO 13359), 4 m horizontal run, flowmeter 2 m from the outlet, long-radius elbow (2D,
minimum 0.35 m). Constants are in `js/hydraulics.js` (`GEOM`, `DN_TABLE`).
`test-hidraulica.html` prints a table that checks the physics.

## Modeled equipment

**ISOMAG** electromagnetic flowmeter: **MS2500** flanged sensor (green body, PTFE liner,
terminal box) with an **MV145** battery-powered converter in compact mount (smoked hinged
cover, display with flow rate, totalizer and trend, keys, battery cover and cable glands).
The 3D model is my own, built from the manufacturer's photos; the sensor housing has a
cutaway window so you can see the water.

## Files

- `js/hydraulics.js` — 1D physics and DN table · `js/sensor.js` — flowmeter model
- `js/flowmeter.js` — MS2500 + MV145 3D model · `js/pipeline.js` — pipe, flanges, supports, camera
- `js/scene.js` — PBR renderer, HDRI with an oriented sun, materials, reservoir
- `js/terrain.js` — terrain relief and grass/soil/gravel blending · `js/branding.js` — plate and sign with the logo
- `js/water.js` — water, foam, bubbles, air · `js/ui.js` — 2D charts and LCD · `js/main.js` — puts it all together

## Credits

- Three.js r160 (MIT) — `vendor/`
- From Poly Haven (CC0): HDRI sky *kloofendal_38d_partly_cloudy_puresky*; textures
  *preconcrete_wall_001*, *gravel_ground_01*, *leafy_grass* and *excavated_soil_wall*
- Water normal map: three.js examples (MIT)
- ISOMAG, MS2500 and MV145 are brands/models of ISOIL Industria; they appear only as a
  reference for the installed equipment.

## Case 2: gooseneck

Outlet → elbow down → **low section with the sensor** (5D straight upstream, 3D
downstream) → riser → **crest** with an **air valve / vacuum breaker** → θ elbow → drop.

- The crown of the sensor section sits at least 0.25 m below the invert at the crest: the
  low section cannot drain and runs **always full, under pressure**.
- Critical control moves to the crest; air that enters through the outlet only gets as far
  as the crest, where the air valve releases it (and prevents siphoning).
- Model: free-surface reservoir upstream, pressurized section with Manning + K = 0.25 per
  elbow, critical depth at the crest break and an S2 profile on the drop.
- Cost: extra head loss; at the same level, 10–25% less flow gets through (the page shows
  it for each DN and level).
