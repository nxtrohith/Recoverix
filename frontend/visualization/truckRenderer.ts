/**
 * Renders and updates 3D truck meshes moving across the logistics network.
 */

import * as THREE from 'three';
import { TruckState, TruckStatus } from './types';

export class TruckRenderer {
  private scene: THREE.Scene;
  private trucksGroup = new THREE.Group();
  private truckMeshes = new Map<string, THREE.Group>();
  private labelSprites = new Map<string, THREE.Sprite>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.trucksGroup);
  }

  /**
   * Add or update a truck mesh at the given position and orientation.
   */
  public updateTruck(state: TruckState): void {
    let mesh = this.truckMeshes.get(state.truck_id);

    if (!mesh) {
      mesh = this.createTruckMesh(state);
      this.trucksGroup.add(mesh);
      this.truckMeshes.set(state.truck_id, mesh);
    }

    // Update position
    mesh.position.set(state.position.x, state.position.y + 0.4, state.position.z);

    // Update rotation towards travel heading
    mesh.rotation.y = state.rotationY;

    // Update status appearance
    this.updateStatusAppearance(mesh, state);

    // Update or recreate label
    this.updateLabel(state, mesh.position);
  }

  private createTruckMesh(state: TruckState): THREE.Group {
    const group = new THREE.Group();

    // 1. Cargo container (rear)
    const containerGeo = new THREE.BoxGeometry(1.6, 1.4, 3.2);
    const containerMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.3,
      metalness: 0.6,
    });
    const container = new THREE.Mesh(containerGeo, containerMat);
    container.position.set(0, 0.9, -0.6);
    container.castShadow = true;
    container.receiveShadow = true;
    container.name = 'container';
    group.add(container);

    // 2. Tractor cab (front)
    const cabGeo = new THREE.BoxGeometry(1.5, 1.2, 1.4);
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.8,
    });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 0.8, 1.3);
    cab.castShadow = true;
    cab.receiveShadow = true;
    group.add(cab);

    // 3. Windshield (glass)
    const glassGeo = new THREE.BoxGeometry(1.3, 0.5, 0.1);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
    });
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.position.set(0, 1.1, 2.01);
    group.add(windshield);

    // 4. Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
    });
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      [-0.85, 0.35, 1.3],
      [0.85, 0.35, 1.3],
      [-0.85, 0.35, -0.5],
      [0.85, 0.35, -0.5],
      [-0.85, 0.35, -1.8],
      [0.85, 0.35, -1.8],
    ];

    for (const [ox, oy, oz] of wheelOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(ox, oy, oz);
      wheel.castShadow = true;
      group.add(wheel);
    }

    // 5. Headlights
    const headlightGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
    hlLeft.position.set(-0.5, 0.6, 2.05);
    group.add(hlLeft);

    const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
    hlRight.position.set(0.5, 0.6, 2.05);
    group.add(hlRight);

    // 6. Status beacon on roof
    const beaconGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 1.6, 1.3);
    beacon.name = 'beacon';
    group.add(beacon);

    group.userData = { truckId: state.truck_id };
    return group;
  }

  private updateStatusAppearance(mesh: THREE.Group, state: TruckState): void {
    const container = mesh.getObjectByName('container') as THREE.Mesh;
    const beacon = mesh.getObjectByName('beacon') as THREE.Mesh;

    let colorHex = 0x2563eb; // Moving: Blue/Cyan
    let beaconHex = 0x06b6d4;

    if (state.status === 'DELAYED') {
      colorHex = 0xd97706; // Amber
      beaconHex = 0xf59e0b;
    } else if (state.status === 'IDLE') {
      colorHex = 0x059669; // Green
      beaconHex = 0x10b981;
    } else if (state.status === 'DELIVERED') {
      colorHex = 0x7c3aed; // Purple
      beaconHex = 0xa78bfa;
    }

    if (container && container.material instanceof THREE.MeshStandardMaterial) {
      container.material.color.setHex(colorHex);
    }
    if (beacon && beacon.material instanceof THREE.MeshBasicMaterial) {
      beacon.material.color.setHex(beaconHex);
    }
  }

  private updateLabel(state: TruckState, pos: THREE.Vector3): void {
    let sprite = this.labelSprites.get(state.truck_id);

    if (!sprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 72;

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(6, 1.7, 1);
      this.trucksGroup.add(sprite);
      this.labelSprites.set(state.truck_id, sprite);
    }

    // Redraw label canvas
    const mat = sprite.material as THREE.SpriteMaterial;
    const texture = mat.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Status pill
    const isDelayed = state.status === 'DELAYED';
    ctx.fillStyle = isDelayed ? 'rgba(180, 83, 9, 0.85)' : 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 56, 12);
    ctx.fill();

    ctx.strokeStyle = isDelayed ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Text: Truck ID
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(state.truck_id, 128, 30);

    // Text: Status / Shipment
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = isDelayed ? '#fde68a' : '#94a3b8';
    const subText = state.shipment_id
      ? `${state.status} • ${state.shipment_id}`
      : `${state.status}`;
    ctx.fillText(subText, 128, 52);

    texture.needsUpdate = true;

    // Follow truck position slightly above
    sprite.position.set(pos.x, pos.y + 3.4, pos.z);
  }

  public removeTruck(truckId: string): void {
    const mesh = this.truckMeshes.get(truckId);
    if (mesh) {
      this.trucksGroup.remove(mesh);
      this.truckMeshes.delete(truckId);
    }

    const sprite = this.labelSprites.get(truckId);
    if (sprite) {
      this.trucksGroup.remove(sprite);
      this.labelSprites.delete(truckId);
    }
  }

  public clear(): void {
    this.trucksGroup.clear();
    this.truckMeshes.clear();
    this.labelSprites.clear();
  }
}
