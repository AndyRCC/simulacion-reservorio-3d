# Caudalímetro en la descarga de un reservorio con bajada a 45° (3D)

*[English](README.md) · Español*

Simulación 3D en dos casos, seleccionables en la página:

- **Caso 1 (Fase 1):** por qué un caudalímetro electromagnético instalado en la salida
  horizontal de un reservorio, antes de una bajada pronunciada, no mide bien.
- **Caso 2 (Fase 2):** el mismo sensor en un **cuello de cisne**, que lo mantiene siempre
  lleno y mide correctamente.

Enlaces directos: `#caso1` y `#caso2` al final de la URL.

**Ver en línea:** https://andyrcc.github.io/simulacion-reservorio-3d/

## Cómo abrirla

- **Sin instalar nada:** ejecuta `py build.py` y abre con doble clic
  `dist/simulacion_fase1_3d.html` (~20 MB, todo embebido: Three.js, cielo HDRI y
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

Geometría: DN80 a DN400 seleccionable (bridas EN 1092-1 PN16, largo del caudalímetro
según ISO 13359), 4 m horizontales, caudalímetro a 2 m de la salida, codo de radio largo
(2D, mínimo 0.35 m). Constantes en `js/hydraulics.js` (`GEOM`, `DN_TABLE`).
`test-hidraulica.html` imprime una tabla de verificación de la física.

## Equipo modelado

Caudalímetro electromagnético **ISOMAG**: sensor bridado **MS2500** (cuerpo verde, liner
PTFE, caja de bornes) con convertidor a baterías **MV145** en montaje compacto (tapa
ahumada abatible, display con caudal, totalizador y tendencia, teclas, tapa de baterías y
prensaestopas). Modelo 3D propio hecho a partir de las fotos del fabricante; la carcasa del
sensor lleva una ventana de corte para ver el agua.

## Archivos

- `js/hydraulics.js` — física 1D y tabla de DN · `js/sensor.js` — modelo del caudalímetro
- `js/flowmeter.js` — modelo 3D MS2500 + MV145 · `js/pipeline.js` — tubería, bridas, apoyos, cámara
- `js/scene.js` — renderer PBR, HDRI con sol orientado, materiales, reservorio
- `js/terrain.js` — relieve y mezcla pasto/suelo/grava · `js/branding.js` — placa y letrero con el logo
- `js/water.js` — agua, espuma, burbujas, aire · `js/ui.js` — gráficos 2D y LCD · `js/main.js` — integración

## Créditos

- Three.js r160 (MIT) — `vendor/`
- De Poly Haven (CC0): cielo HDRI *kloofendal_38d_partly_cloudy_puresky*; texturas
  *preconcrete_wall_001*, *gravel_ground_01*, *leafy_grass* y *excavated_soil_wall*
- Mapa normal de agua: ejemplos de three.js (MIT)
- ISOMAG, MS2500 y MV145 son marcas/modelos de ISOIL Industria; se representan solo como
  referencia del equipo instalado.

## Caso 2: cuello de cisne

Salida → codo hacia abajo → **tramo bajo con el sensor** (5D rectos aguas arriba, 3D aguas
abajo) → montante → **cresta** con **ventosa / rompe-vacío** → codo θ → bajada.

- La clave del sensor queda ≥ 0.25 m bajo el fondo de la cresta: el tramo bajo no puede
  vaciarse y va **siempre lleno, a presión**.
- El control crítico pasa a la cresta; el aire que entra por la descarga solo llega hasta
  ella y la ventosa lo evacúa (y evita el sifonamiento).
- Modelo: pozo libre aguas arriba, tramo a presión con Manning + K = 0.25 por codo,
  profundidad crítica en el quiebre de la cresta y perfil S2 en la bajada.
- Costo: pérdida de carga adicional; con el mismo nivel pasa entre 10 y 25 % menos caudal
  (la página lo muestra para cada DN y nivel).
