// =============================================================================
// branding.js — Identidad LabProjects en la escena: placa institucional en el
// muro de salida del reservorio y letrero de obra junto al camino de acceso.
// =============================================================================
import * as THREE from 'three';
import { GEOM } from './hydraulics.js';
import { heightAt } from './terrain.js';
import { ASSETS } from './assets.js';

export const SIGN = { x: -6.6, z: 3.1, yaw: -0.2 };      // letrero de obra

// Panel blanco con el logo, línea roja y textos
function panelTexture(lines, onReady) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    const bg = g.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eef1f4');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const lw = 800, lh = lw * img.height / img.width;
    g.drawImage(img, (c.width - lw) / 2, 34, lw, lh);
    g.fillStyle = '#e30613'; g.fillRect(112, 34 + lh + 22, c.width - 224, 6);
    g.fillStyle = '#2f353b'; g.textAlign = 'center';
    g.font = '700 44px Inter, Arial, sans-serif'; g.fillText(lines[0], c.width / 2, 34 + lh + 86);
    g.fillStyle = '#6a737c'; g.font = '500 32px Inter, Arial, sans-serif'; g.fillText(lines[1], c.width / 2, 34 + lh + 132);
    tex.needsUpdate = true;
    onReady && onReady();
  };
  img.src = ASSETS.logo;
  return tex;
}

export function buildBranding(stage, tp) {
  const { M, scene } = stage;
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.85, roughness: 0.35 });
  const boltG = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12);

  // ---- Placa en el muro de salida (mira hacia +x, sobre el pase de la tubería)
  const W1 = 1.55, H1 = W1 * 384 / 1024;
  const plaque = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W1 + 0.05, H1 + 0.05, 0.02), alu);
  frame.castShadow = true; frame.receiveShadow = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W1, H1),
    new THREE.MeshStandardMaterial({ map: panelTexture(['Medición de caudal · Salida de reservorio', 'Estudio de instalación del caudalímetro']), roughness: 0.4, metalness: 0.05 }));
  face.position.z = 0.0105; face.receiveShadow = true;
  plaque.add(frame, face);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b = new THREE.Mesh(boltG, alu); b.rotation.x = Math.PI / 2;
    b.position.set(sx * (W1 / 2 - 0.04), sy * (H1 / 2 - 0.04), 0.014); plaque.add(b);
  }
  plaque.rotation.y = Math.PI / 2;
  plaque.position.set(GEOM.wallT + 0.011, GEOM.floorY + GEOM.resH - 0.62, 0);
  g.add(plaque);

  // ---- Letrero de obra sobre dos postes galvanizados ------------------------
  const W2 = 1.9, H2 = W2 * 384 / 1024, y0 = heightAt(tp, SIGN.x, SIGN.z);
  const sign = new THREE.Group();
  const postG = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 14);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postG, M.galv); p.position.set(sx * (W2 / 2 - 0.15), 1.1, -0.03); p.castShadow = true; sign.add(p);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.04, H2 + 0.04, 0.025), alu);
  back.position.set(0, 1.85, 0); back.castShadow = true; sign.add(back);
  const face2 = new THREE.Mesh(new THREE.PlaneGeometry(W2, H2),
    new THREE.MeshStandardMaterial({ map: panelTexture(['Sistema de monitoreo de caudal', 'Reservorio · Línea de aducción']), color: 0xd4d4d4, roughness: 0.5 }));
  face2.position.set(0, 1.85, 0.0135); sign.add(face2);
  sign.position.set(SIGN.x, y0 - 0.15, SIGN.z);
  sign.rotation.y = SIGN.yaw;
  g.add(sign);

  scene.add(g);
  return g;
}
