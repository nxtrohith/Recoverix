/**
 * Renders graph nodes (stylized warehouses) and edges (physical transportation roads).
 * Visual language: 3D academic geographic logistics model (physical miniature style).
 *
 * Palette — Café Noir #4C3D19 | Kombu Green #354024 | Moss Green #889063
 *            Tan #CFBB99 | Bone #E5D7C4
 */

import * as THREE from 'three';
import { GraphData, HubNode, RouteEdge } from './types';

// ── Palette constants ────────────────────────────────────────────────────────
const P = {
  BONE:         0xe5d7c4,
  TAN:          0xcfbb99,
  MOSS:         0x889063,
  MOSS_LIGHT:   0x9ca876,
  KOMBU:        0x354024,
  CAFE_NOIR:    0x4c3d19,

  // Physical roads
  ROAD_PRIMARY: 0x645d54,  // medium warm gray
  ROAD_SEC:     0x847a6e,  // lighter muted gray
  ROAD_ACTIVE:  0x1971c2,  // eye-catching vibrant blue for active transit routes

  // Hub buildings — foundation and loading docks
  SLAB:         0xd4c6a9,  // foundation plinth
  DOCK:         0x2b1b1b,  // loading dock dark bay
};

export interface WarehouseStyle {
  roofColor: number;
  wallColor: number;
  pinColor: number;
}

// 8 distinct, beautiful shades of red for rich architectural variety
const WAREHOUSE_STYLES: WarehouseStyle[] = [
  // 1. Classic Crimson: bold crimson roof on crisp cream wall
  { roofColor: 0xd32f2f, wallColor: 0xf5eedf, pinColor: 0xd32f2f },
  // 2. Deep Maroon: intense dark ruby roof on warm brick wall
  { roofColor: 0x881b1b, wallColor: 0xb73a3a, pinColor: 0x881b1b },
  // 3. Vivid Vermilion: bright poppy vermilion roof on soft bone wall
  { roofColor: 0xef5350, wallColor: 0xeee4d2, pinColor: 0xef5350 },
  // 4. Terracotta Rust: warm burnt-orange red roof on terracotta wall
  { roofColor: 0xc0392b, wallColor: 0xc9584a, pinColor: 0xc0392b },
  // 5. Cardinal Scarlet: bright cardinal red roof on light parchment wall
  { roofColor: 0xe53935, wallColor: 0xf2e8da, pinColor: 0xe53935 },
  // 6. Rich Carmine: deep carmine red roof on rich wine-red wall
  { roofColor: 0x9b1b30, wallColor: 0xb53549, pinColor: 0x9b1b30 },
  // 7. Warm Cinnabar: cinnabar roof on warm tan-cream wall
  { roofColor: 0xd84315, wallColor: 0xede0cb, pinColor: 0xd84315 },
  // 8. Ruby Red: intense ruby roof on ruby-washed wall
  { roofColor: 0xc2185b, wallColor: 0xd24874, pinColor: 0xc2185b },
];

export interface GraphRendererOptions {
  scene: THREE.Scene;
  scale?: number;
  onNodeHover?: (node: HubNode | null, mouseEvent?: MouseEvent) => void;
  onNodeClick?: (node: HubNode) => void;
}

interface EdgeEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  defaultColor: number;
}

export class GraphRenderer {
  private scene: THREE.Scene;
  private scale: number;
  private nodePositions = new Map<string, THREE.Vector3>();
  private nodeDataMap   = new Map<string, HubNode>();
  private nodeMeshMap   = new Map<string, THREE.Group>();

  private nodesGroup  = new THREE.Group();
  private edgesGroup  = new THREE.Group();
  private labelsGroup = new THREE.Group();

  // Map to track road meshes for active route highlighting
  private edgeMap = new Map<string, EdgeEntry>();

  public centerLat = 17.8;
  public centerLon = 79.2;

  private onNodeHover?: (node: HubNode | null, mouseEvent?: MouseEvent) => void;
  private onNodeClick?: (node: HubNode) => void;

  constructor(options: GraphRendererOptions) {
    this.scene   = options.scene;
    this.scale   = options.scale ?? 75.0;
    this.onNodeHover = options.onNodeHover;
    this.onNodeClick = options.onNodeClick;

    this.scene.add(this.edgesGroup);
    this.scene.add(this.nodesGroup);
    this.scene.add(this.labelsGroup);
  }

  /** Lat/lon → centred local X/Z coordinates */
  public projectCoordinates(lat: number, lon: number): { x: number; z: number } {
    const latRad = (this.centerLat * Math.PI) / 180;
    const x = (lon - this.centerLon) * Math.cos(latRad) * this.scale;
    const z = -(lat - this.centerLat) * this.scale;
    return { x, z };
  }

  public renderGraph(data: GraphData): void {
    this.clear();

    const valid = data.nodes.filter((n) => n.latitude != null && n.longitude != null);

    if (valid.length > 0) {
      this.centerLat = valid.reduce((s, n) => s + Number(n.latitude),  0) / valid.length;
      this.centerLon = valid.reduce((s, n) => s + Number(n.longitude), 0) / valid.length;
    }

    // First compute spatial positions
    for (const node of valid) {
      const { x, z } = this.projectCoordinates(Number(node.latitude), Number(node.longitude));
      const pos = new THREE.Vector3(x, 0, z);
      node.x = x; node.y = 0; node.z = z;
      this.nodePositions.set(node.id, pos);
      this.nodeDataMap.set(node.id, node);
    }

    // Stagger tracker for dense city nodes (like Hyderabad cluster)
    const clusterTracker = new Map<string, number>();
    let itemIdx = 0;

    for (const node of valid) {
      const pos = this.nodePositions.get(node.id)!;

      const style = WAREHOUSE_STYLES[itemIdx % WAREHOUSE_STYLES.length];
      itemIdx++;

      const mesh = this.createWarehouseMesh(node, pos, style);
      this.nodesGroup.add(mesh);
      this.nodeMeshMap.set(node.id, mesh);

      // Stagger index for label to avoid visual overlap in dense hubs
      const cellKey = `${Math.round(pos.x / 4)}_${Math.round(pos.z / 4)}`;
      const staggerIdx = clusterTracker.get(cellKey) || 0;
      clusterTracker.set(cellKey, staggerIdx + 1);

      const label = this.createNodeLabel(node, pos, style, staggerIdx);
      this.labelsGroup.add(label);
    }

    this.renderEdges(data.edges);
  }

  // ── Stylized 3D Warehouse Architecture ───────────────────────────────────────
  private createWarehouseMesh(
    node: HubNode,
    pos: THREE.Vector3,
    style: WarehouseStyle
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(pos);

    const isMajor =
      node.id.toLowerCase().includes('hyderabad') ||
      node.hub_type?.toLowerCase().includes('dc') ||
      node.id.toLowerCase().includes('karimnagar') ||
      node.id.toLowerCase().includes('warangal');

    const w  = isMajor ? 3.4 : 2.1;
    const d  = isMajor ? 4.0 : 2.5;
    const wH = isMajor ? 2.3 : 1.5;

    // 1. Contact shadow disc beneath building
    const shadowGeo = new THREE.CircleGeometry(Math.max(w, d) * 0.85, 14);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x241c12,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.position.y = 0.02;
    group.add(contactShadow);

    // 2. Foundation slab (Tan/Bone concrete plinth)
    const slabMat = new THREE.MeshStandardMaterial({
      color: P.SLAB,
      roughness: 0.95,
      metalness: 0.0,
    });
    const slabH = 0.16;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, slabH, d + 0.6), slabMat);
    slab.position.y = slabH / 2;
    slab.receiveShadow = true;
    group.add(slab);

    // 3. Warehouse main building block
    const wallMat = new THREE.MeshStandardMaterial({
      color: style.wallColor,
      roughness: 0.92,
      metalness: 0.0,
    });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wH, d), wallMat);
    walls.position.y = slabH + wH / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    walls.name = 'walls';
    group.add(walls);

    // 4. Stylized sloped/gabled roof
    const roofMat = new THREE.MeshStandardMaterial({
      color: style.roofColor,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
    });

    // Base roof overhanging slab
    const roofBaseH = 0.2;
    const roofBase = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.35, roofBaseH, d + 0.35),
      roofMat
    );
    roofBase.position.y = slabH + wH + roofBaseH / 2;
    roofBase.castShadow = true;
    roofBase.receiveShadow = true;
    group.add(roofBase);

    // Sloped ridge crest (gable roof block)
    const crestH = isMajor ? 0.65 : 0.45;
    const crestGeo = new THREE.CylinderGeometry(0.1, (w + 0.3) / 2, crestH, 4);
    crestGeo.rotateY(Math.PI / 4);
    const crest = new THREE.Mesh(crestGeo, roofMat);
    crest.position.y = slabH + wH + roofBaseH + crestH / 2;
    crest.scale.set(1, 1, (d + 0.3) / (w + 0.3));
    crest.castShadow = true;
    crest.receiveShadow = true;
    group.add(crest);

    // 5. Loading dock bay on the front face (clean dark recessed portal)
    const dockMat = new THREE.MeshStandardMaterial({
      color: P.DOCK,
      roughness: 0.95,
      metalness: 0.0,
    });
    const dockW = w * 0.45;
    const dockH = wH * 0.42;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(dockW, dockH, 0.15), dockMat);
    dock.position.set(0, slabH + dockH / 2, d / 2 + 0.04);
    group.add(dock);

    // 6. Anchor Pin: vertical marker stem physically attaching label to roof
    const pinH = isMajor ? 2.2 : 1.6;
    const pinMat = new THREE.MeshStandardMaterial({
      color: style.pinColor,
      roughness: 0.8,
    });
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, pinH, 6), pinMat);
    pin.position.y = slabH + wH + roofBaseH + crestH + pinH / 2;
    group.add(pin);

    group.userData = { node };
    return group;
  }

  // ── Clean Cartographic Annotation Label ────────────────────────────────────
  private createNodeLabel(
    node: HubNode,
    pos: THREE.Vector3,
    style: WarehouseStyle,
    staggerIdx: number = 0
  ): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width  = 260;
    canvas.height = 60;
    const ctx = canvas.getContext('2d')!;

    const isMajor =
      node.id.toLowerCase().includes('hyderabad') ||
      node.hub_type?.toLowerCase().includes('dc');

    let displayName = node.city || node.facility_code || node.id.split('_')[0];
    if (staggerIdx > 0 && node.facility_code) {
      displayName = `${node.facility_code}`;
    }

    // Bone background pill with soft drop shadow
    ctx.shadowColor = 'rgba(76, 61, 25, 0.20)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;

    ctx.fillStyle = 'rgba(229, 215, 196, 0.96)'; // Bone
    ctx.beginPath();
    ctx.roundRect(6, 6, 248, 48, 7);
    ctx.fill();

    // Reset shadow for crisp border & typography
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Subtle red-accented border
    ctx.strokeStyle = 'rgba(198, 40, 40, 0.38)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Eye-catching red decorative left dot
    ctx.fillStyle = isMajor ? '#c62828' : style.pinColor;
    ctx.beginPath();
    ctx.arc(20, 30, isMajor ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Clean academic serif text
    ctx.font = `${isMajor ? '700' : '600'} ${isMajor ? 18 : 16}px "Source Serif 4", Georgia, serif`;
    ctx.fillStyle = '#4c3d19'; // Café Noir
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, 32, 30);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);

    // Radial fan-out for dense clusters (e.g. Hyderabad sub-DCs)
    let offsetX = 0;
    let offsetZ = 0;
    if (staggerIdx > 0) {
      const angle = (staggerIdx - 1) * 0.9 - 0.4;
      const radius = 3.8 + staggerIdx * 1.6;
      offsetX = Math.cos(angle) * radius;
      offsetZ = Math.sin(angle) * radius * 0.7;
    }

    const labelY = (isMajor ? 5.8 : 4.4) + (staggerIdx * 0.6);
    sprite.position.set(pos.x + offsetX, labelY, pos.z + offsetZ);
    sprite.scale.set(isMajor ? 6.2 : 4.8, isMajor ? 1.4 : 1.1, 1);
    return sprite;
  }

  // ── Physical Transportation Roads ──────────────────────────────────────────
  private renderEdges(edges: RouteEdge[]): void {
    this.edgeMap.clear();

    for (const edge of edges) {
      const src = this.nodePositions.get(edge.source);
      const dst = this.nodePositions.get(edge.destination);
      if (!src || !dst) continue;

      const dist = src.distanceTo(dst);

      // Primary roads: connected to major hubs or long inter-city links
      const isPrimary =
        edge.source.toLowerCase().includes('hyderabad') ||
        edge.destination.toLowerCase().includes('hyderabad') ||
        edge.source.toLowerCase().includes('karimnagar') ||
        edge.destination.toLowerCase().includes('karimnagar') ||
        edge.source.toLowerCase().includes('warangal') ||
        edge.destination.toLowerCase().includes('warangal') ||
        dist > 28;

      const roadColor = isPrimary ? P.ROAD_PRIMARY : P.ROAD_SEC;
      const roadRadius = isPrimary ? 0.25 : 0.18;

      // Gentle vertical arch: sits at y ~ 0.14 above terrain, rises slightly mid-span
      const mid = new THREE.Vector3(
        (src.x + dst.x) / 2,
        0.14 + Math.min(dist * 0.008, 0.45),
        (src.z + dst.z) / 2
      );

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(src.x, 0.12, src.z),
        mid,
        new THREE.Vector3(dst.x, 0.12, dst.z)
      );

      // 6 radial segments gives a clean physical faceted road profile
      const tube = new THREE.TubeGeometry(curve, 8, roadRadius, 6, false);
      const mat = new THREE.MeshStandardMaterial({
        color: roadColor,
        roughness: 0.94,
        metalness: 0.0,
      });

      const road = new THREE.Mesh(tube, mat);
      road.castShadow = true;
      road.receiveShadow = true;
      this.edgesGroup.add(road);

      const entry: EdgeEntry = { mesh: road, material: mat, defaultColor: roadColor };
      this.edgeMap.set(`${edge.source}->${edge.destination}`, entry);
      this.edgeMap.set(`${edge.destination}->${edge.source}`, entry);
    }
  }

  /**
   * Highlights active physical roads in Kombu Green when trucks traverse them.
   */
  public setActiveEdges(activeEdgeKeys: Set<string>): void {
    for (const [key, entry] of this.edgeMap.entries()) {
      if (activeEdgeKeys.has(key)) {
        entry.material.color.setHex(P.ROAD_ACTIVE);
      } else {
        entry.material.color.setHex(entry.defaultColor);
      }
    }
  }

  // ── Public Accessors ───────────────────────────────────────────────────────
  public getNodePosition(id: string): THREE.Vector3 | null {
    return this.nodePositions.get(id)?.clone() ?? null;
  }

  public getNodeData(id: string): HubNode | undefined {
    return this.nodeDataMap.get(id);
  }

  public getAllNodePositions(): Map<string, THREE.Vector3> {
    return this.nodePositions;
  }

  public clear(): void {
    this.nodesGroup.clear();
    this.edgesGroup.clear();
    this.labelsGroup.clear();
    this.edgeMap.clear();
    this.nodePositions.clear();
    this.nodeDataMap.clear();
    this.nodeMeshMap.clear();
  }
}
