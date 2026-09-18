/**
 * Renders stylized miniature 3D trucks on the logistics map.
 * Visual language: physical miniature model with matte earthy materials and soft shadows.
 *
 * Palette:
 *   Café Noir #4C3D19 | Kombu Green #354024 | Moss Green #889063
 *   Tan #CFBB99 | Bone #E5D7C4
 */

import * as THREE from 'three';
import { TruckState } from './types';

// Eye-catching vibrant logistics blue container colors
const TRUCK_ACTIVE_COLORS = [
  0x1c7ed6,  // brilliant cobalt blue (primary)
  0x1971c2,  // vibrant royal logistics blue
  0x228be6,  // electric logistics blue
  0x1864ab,  // rich deep navy blue
  0x0c8599,  // bright cyan-blue
];

const CAB_COLOR     = 0xf0f3f6;  // Crisp off-white cab (contrasts cleanly with blue)
const WHEEL_COLOR   = 0x1f2429;  // Matte dark charcoal
const WINDSHIELD_COL= 0x4dabf7;  // Crisp sky blue windshield

// Status colors — eye-catching blue for active, bright amber for delay
const STATUS_COLORS: Record<string, number> = {
  MOVING:    0x1c7ed6,  // eye-catching brilliant blue
  IDLE:      0x0c8599,  // clean teal-blue
  DELAYED:   0xf76707,  // vibrant alert orange
  DELIVERED: 0x1864ab,  // deep navy blue
};

export class TruckRenderer {
  private scene: THREE.Scene;
  private trucksGroup  = new THREE.Group();
  private truckMeshes  = new Map<string, THREE.Group>();
  private labelSprites = new Map<string, THREE.Sprite>();
  private colorIndex   = new Map<string, number>();
  private counter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.trucksGroup);
  }

  public updateTruck(state: TruckState): void {
    let mesh = this.truckMeshes.get(state.truck_id);

    if (!mesh) {
      const idx = this.counter % TRUCK_ACTIVE_COLORS.length;
      this.colorIndex.set(state.truck_id, idx);
      this.counter++;
      mesh = this.createTruckMesh(state, TRUCK_ACTIVE_COLORS[idx]);
      this.trucksGroup.add(mesh);
      this.truckMeshes.set(state.truck_id, mesh);
    }

    // Position truck so tires sit precisely on the road tube surface (road tube radius = 0.25)
    // The truck body is centered at X=0, sitting directly over the road trackline
    mesh.position.set(state.position.x, state.position.y + 0.25, state.position.z);
    mesh.rotation.y = state.rotationY;
    this.updateStatusAppearance(mesh, state);
    this.updateLabel(state, mesh.position);
  }

  private createTruckMesh(state: TruckState, containerColor: number): THREE.Group {
    const group = new THREE.Group();

    // 1. Oval contact shadow beneath truck
    const shadowGeo = new THREE.CircleGeometry(2.0, 14);
    shadowGeo.rotateX(-Math.PI / 2);
    shadowGeo.scale(1.05, 1, 1.85);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1f1912,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.position.y = 0.02;
    group.add(contactShadow);

    // 2. Chassis base slab (matte dark charcoal) — enlarged
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x241e17,
      roughness: 0.95,
      metalness: 0.0,
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.24, 3.9), chassisMat);
    chassis.position.set(0, 0.44, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // 3. Cargo container in eye-catching blue — enlarged, perfectly centered on X
    const boxMat = new THREE.MeshStandardMaterial({
      color: containerColor,
      roughness: 0.90,
      metalness: 0.0,
    });
    const containerH = 1.65;
    const container = new THREE.Mesh(new THREE.BoxGeometry(2.05, containerH, 2.6), boxMat);
    container.position.set(0, 0.44 + containerH / 2, -0.6);
    container.castShadow = true;
    container.receiveShadow = true;
    container.name = 'container';
    group.add(container);

    // 4. Cab — crisp off-white for high contrast against blue container
    const cabMat = new THREE.MeshStandardMaterial({
      color: CAB_COLOR,
      roughness: 0.90,
      metalness: 0.0,
    });
    const cabH = 1.4;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, cabH, 1.25), cabMat);
    cab.position.set(0, 0.44 + cabH / 2, 1.25);
    cab.castShadow = true;
    cab.receiveShadow = true;
    group.add(cab);

    // 5. Windshield — crisp sky blue
    const wsMat = new THREE.MeshStandardMaterial({
      color: WINDSHIELD_COL,
      roughness: 0.85,
      metalness: 0.0,
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.52, 0.08), wsMat);
    windshield.position.set(0, 0.44 + 0.9, 1.88);
    group.add(windshield);

    // 6. Wheels — 4 chunky matte cylinders with radius 0.40 (tires touch y = 0)
    const wheelMat = new THREE.MeshStandardMaterial({
      color: WHEEL_COLOR,
      roughness: 0.95,
      metalness: 0.0,
    });
    const wheelR = 0.40;
    const wheelW = 0.32;
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 10);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelCoords: [number, number, number][] = [
      [-1.08, wheelR, 1.25],   // front left
      [1.08,  wheelR, 1.25],   // front right
      [-1.08, wheelR, -1.25],  // rear left
      [1.08,  wheelR, -1.25],  // rear right
    ];

    for (const [x, y, z] of wheelCoords) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, y, z);
      w.castShadow = true;
      group.add(w);
    }

    group.userData = { truckId: state.truck_id };
    return group;
  }

  private updateStatusAppearance(mesh: THREE.Group, state: TruckState): void {
    const container = mesh.getObjectByName('container') as THREE.Mesh | undefined;
    const color = STATUS_COLORS[state.status] ?? STATUS_COLORS.MOVING;

    if (container?.material instanceof THREE.MeshStandardMaterial) {
      container.material.color.setHex(color);
    }
  }

  // ── Cartographic Annotation Label for Trucks ───────────────────────────────
  private updateLabel(state: TruckState, pos: THREE.Vector3): void {
    let sprite = this.labelSprites.get(state.truck_id);

    if (!sprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 72;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      sprite = new THREE.Sprite(mat);
      sprite.scale.set(6.8, 1.9, 1);
      this.trucksGroup.add(sprite);
      this.labelSprites.set(state.truck_id, sprite);
    }

    const mat = sprite.material as THREE.SpriteMaterial;
    const tex = mat.map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 72);

    // Bone background pill with soft drop shadow
    ctx.fillStyle = 'rgba(229, 215, 196, 0.96)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 56, 8);
    ctx.fill();

    // Left status indicator stripe
    const stripeColors: Record<string, string> = {
      MOVING:    '#1c7ed6', // vibrant blue
      DELAYED:   '#f76707', // vibrant alert orange
      IDLE:      '#0c8599', // teal blue
      DELIVERED: '#1864ab', // deep navy blue
    };
    ctx.fillStyle = stripeColors[state.status] ?? '#1c7ed6';
    ctx.beginPath();
    ctx.roundRect(8, 8, 6, 56, [8, 0, 0, 8]);
    ctx.fill();

    // Subtle Café Noir border
    ctx.strokeStyle = 'rgba(76, 61, 25, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(8.6, 8.6, 238.8, 54.8);

    // Truck ID
    ctx.font = 'bold 18px "Source Serif 4", Georgia, serif';
    ctx.fillStyle = '#4c3d19';
    ctx.textAlign = 'left';
    ctx.fillText(state.truck_id, 22, 31);

    // Status / Shipment
    ctx.font = '500 12px "Source Sans 3", -apple-system, sans-serif';
    ctx.fillStyle = '#7a6a48';
    const sub = state.shipment_id ? `${state.status} · ${state.shipment_id}` : state.status;
    ctx.fillText(sub, 22, 51);

    tex.needsUpdate = true;
    sprite.position.set(pos.x, pos.y + 4.2, pos.z);
  }

  public removeTruck(truckId: string): void {
    const m = this.truckMeshes.get(truckId);
    if (m) { this.trucksGroup.remove(m); this.truckMeshes.delete(truckId); }
    const s = this.labelSprites.get(truckId);
    if (s) { this.trucksGroup.remove(s); this.labelSprites.delete(truckId); }
  }

  public clear(): void {
    this.trucksGroup.clear();
    this.truckMeshes.clear();
    this.labelSprites.clear();
  }
}
