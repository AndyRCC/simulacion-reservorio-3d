# Fase 1 — Descarga de reservorio con bajada a 45° (3D)

Simulación 3D de por qué un caudalímetro electromagnético instalado en la salida
horizontal de un reservorio, antes de una bajada pronunciada, no mide bien.

**Ver en línea:** https://andyrcc.github.io/simulacion-reservorio-3d/

## Cómo abrirla

- **Sin instalar nada:** ejecuta `py build.py` y abre con doble clic
  `dist/simulacion_fase1_3d.html` (~13 MB, todo embebido: Three.js, cielo HDRI y
  texturas; funciona sin internet).
- **Versión de desarrollo** (código separado en `js/`): sirve la carpeta y abre `index.html`.

  ```powershell
  py -m http.server 8765
  ```

  Luego abre http://localhost:8765/index.html. Después de editar `js/`, ejecuta
  `py build.py` para regenerar el HTML único.

## Qué calcula (hidráulica 1D real, no curvas a mano)

| Situación | Modelo |
|---|---|
| Nivel bajo (entrada no sumergida) | Remanso **H2** subcrítico desde la profundidad crítica en el quiebre al codo (Manning + energía específica) |
| Nivel alto (entrada sumergida, arista viva) | **Vena contracta** (Cc = 0.62) → chorro **supercrítico H3**; el aire entra por la descarga y la tubería no se presuriza (flujo “tipo 5” de alcantarillas) |
| Bajada | Perfil **S2** supercrítico con presión y·cos φ |
| Caudal | El menor entre control de salida (H2/presión + pérdida de entrada Ke = 0.5) y control de entrada (orificio) |
| Caudalímetro | Q_ind = v · A_llena → **sobre-lectura** ≈ A_llena / A_mojada con ruido; señal errática si los electrodos (3 y 9 en punto) quedan en aire; salida 0 si el EPD está activo |

Geometría: DN300, 4 m horizontales, sensor a 2 m de la salida, codo R = 0.6 m.
Constantes en `js/hydraulics.js` (`GEOM`). `test-hidraulica.html` imprime una tabla de
verificación de la física.

## Archivos

- `js/hydraulics.js` — física 1D · `js/sensor.js` — modelo del caudalímetro
- `js/scene.js` — renderer PBR, HDRI, materiales, reservorio · `js/terrain.js` — relieve
- `js/pipeline.js` — tubería, bridas, sensor, apoyos, cámara · `js/water.js` — agua, espuma, burbujas, aire
- `js/ui.js` — gráficos 2D · `js/main.js` — integración y controles

## Créditos

- Three.js r160 (MIT) — `vendor/`
- Cielo HDRI *kloofendal_48d_partly_cloudy_puresky*, texturas *preconcrete_wall_001* y
  *gravel_ground_01*: Poly Haven (CC0)
- Mapa normal de agua: ejemplos de three.js (MIT)

## Fase 2 (pendiente)

Cuello de cisne aguas abajo del sensor: con la física ya separada de la geometría, basta
añadir el tramo ascendente a `makePath` y un control hidráulico en su cresta.
