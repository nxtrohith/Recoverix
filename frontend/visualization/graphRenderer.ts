/**
 * Renders graph nodes (warehouses/hubs) and edges (inter-hub logistics routes)
 * in 3D using Three.js based on NetworkX graph topology.
 */

import * as THREE from 'three';
import { GraphData, HubNode, RouteEdge } from './types';

export interface GraphRendererOptions {
  scene: THREE.Scene;
  scale?: number;
  onNodeHover?: (node: HubNode | null, mouseEvent?: MouseEvent) => void;
  onNodeClick?: (node: HubNode) => void;
}

export class GraphRenderer {
  private scene: THREE.Scene;
  private scale: number;
  private nodePositions = new Map<string, THREE.Vector3>();
  private nodeDataMap = new Map<string, HubNode>();
  private nodeMeshMap = new Map<string, THREE.Group>();

  private nodesGroup = new THREE.Group();
  private edgesGroup = new THREE.Group();
  private labelsGroup = new THREE.Group();

  public centerLat: number = 17.8;
  public centerLon: number = 79.2;

  private onNodeHover?: (node: HubNode | null, mouseEvent?: MouseEvent) => void;
  private onNodeClick?: (node: HubNode) => void;

  constructor(options: GraphRendererOptions) {
    this.scene = options.scene;
    this.scale = options.scale ?? 65.0;
    this.onNodeHover = options.onNodeHover;
    this.onNodeClick = options.onNodeClick;

    this.scene.add(this.edgesGroup);
    this.scene.add(this.nodesGroup);
    this.scene.add(this.labelsGroup);
  }

  /**
   * Convert latitude and longitude to centered local 3D coordinates (X, Z).
   * Telangana: Lat ~16° to 20° N, Lon ~77° to 81° E.
   */
  public projectCoordinates(lat: number, lon: number): { x: number; z: number } {
    const latRad = (this.centerLat * Math.PI) / 180;
    const x = (lon - this.centerLon) * Math.cos(latRad) * this.scale;
    const z = -(lat - this.centerLat) * this.scale; // -Z points North
    return { x, z };
  }

  /**
   * Render the full NetworkX graph.
   */
  public renderGraph(data: GraphData): void {
    this.clear();

    const validNodes = data.nodes.filter(
      (n) => n.latitude != null && n.longitude != null
    );

    if (validNodes.length > 0) {
      // Auto-compute geographic center
      const avgLat =
        validNodes.reduce((sum, n) => sum + Number(n.latitude), 0) / validNodes.length;
      const avgLon =
        validNodes.reduce((sum, n) => sum + Number(n.longitude), 0) / validNodes.length;
      this.centerLat = avgLat;
      this.centerLon = avgLon;
    }

    // 1. Calculate positions and render nodes
    for (const node of validNodes) {
      const { x, z } = this.projectCoordinates(
        Number(node.latitude),
        Number(node.longitude)
      );
      const position = new THREE.Vector3(x, 0, z);

      node.x = x;
      node.y = 0;
      node.z = z;

      this.nodePositions.set(node.id, position);
      this.nodeDataMap.set(node.id, node);

      const nodeMesh = this.createWarehouseMesh(node, position);
      this.nodesGroup.add(nodeMesh);
      this.nodeMeshMap.set(node.id, nodeMesh);

      // Create text label
      const label = this.createNodeLabel(node, position);
      this.labelsGroup.add(label);
    }

    // 2. Render routes / edges between connected hubs
    this.renderEdges(data.edges);
  }

  private createWarehouseMesh(node: HubNode, pos: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(pos);

    const isMajor =
      node.id.toLowerCase().includes('hyderabad') ||
      node.hub_type?.toLowerCase().includes('dc') ||
      node.id.toLowerCase().includes('karimnagar');

    const baseRadius = isMajor ? 1.6 : 1.1;
    const height = isMajor ? 3.0 : 1.8;

    // 1. Foundation base ring
    const baseGeo = new THREE.CylinderGeometry(baseRadius * 1.3, baseRadius * 1.4, 0.4, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.3,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.2;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 2. Warehouse structure (octagonal cylinder)
    const buildingGeo = new THREE.CylinderGeometry(baseRadius, baseRadius, height, 8);
    const buildingMat = new THREE.MeshStandardMaterial({
      color: isMajor ? 0x0369a1 : 0x0f172a,
      roughness: 0.3,
      metalness: 0.7,
      emissive: isMajor ? 0x0284c7 : 0x000000,
      emissiveIntensity: isMajor ? 0.35 : 0.0,
    });
    const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
    buildingMesh.position.y = height / 2 + 0.4;
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    group.add(buildingMesh);

    // 3. Emissive beacon on roof
    const beaconGeo = new THREE.SphereGeometry(isMajor ? 0.65 : 0.45, 12, 12);
    const beaconColor = isMajor ? 0x38bdf8 : 0x22d3ee;
    const beaconMat = new THREE.MeshBasicMaterial({
      color: beaconColor,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = height + 0.6;
    group.add(beacon);

    // Subtle pulsing halo ring on major hubs
    if (isMajor) {
      const ringGeo = new THREE.RingGeometry(baseRadius * 1.6, baseRadius * 1.9, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);
    }

    // Attach metadata for raycasting / inspector
    group.userData = { node };
    return group;
  }

  private createNodeLabel(node: HubNode, pos: THREE.Vector3): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Clean label text (e.g. City name or short hub name)
    const displayName = node.city || node.facility_code || node.id.split('_')[0];

    // Background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);

    const isMajor = node.id.toLowerCase().includes('hyderabad');
    sprite.position.set(pos.x, (isMajor ? 5.5 : 4.2), pos.z);
    sprite.scale.set(7.5, 1.875, 1);

    return sprite;
  }

  private renderEdges(edges: RouteEdge[]): void {
    const linePositions: number[] = [];
    const colors: number[] = [];

    const baseColor = new THREE.Color(0x0284c7);
    const altColor = new THREE.Color(0x38bdf8);

    for (const edge of edges) {
      const srcPos = this.nodePositions.get(edge.source);
      const dstPos = this.nodePositions.get(edge.destination);

      if (!srcPos || !dstPos) continue;

      // Slight elevation arc to prevent z-fighting with the ground plane
      const numSegments = 12;
      for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        const x = THREE.MathUtils.lerp(srcPos.x, dstPos.x, t);
        const z = THREE.MathUtils.lerp(srcPos.z, dstPos.z, t);
        // Gentle parabolic curve peaking in the middle
        const y = 0.2 + Math.sin(t * Math.PI) * 1.5;

        linePositions.push(x, y, z);
        const color = t < 0.5 ? baseColor : altColor;
        colors.push(color.r, color.g, color.b);

        if (i > 0 && i < numSegments) {
          // Add segment duplicate for continuous GL_LINES
          linePositions.push(x, y, z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      linewidth: 1.5,
    });

    const lines = new THREE.LineSegments(geometry, material);
    this.edgesGroup.add(lines);
  }

  public getNodePosition(nodeId: string): THREE.Vector3 | null {
    const pos = this.nodePositions.get(nodeId);
    return pos ? pos.clone() : null;
  }

  public getNodeData(nodeId: string): HubNode | undefined {
    return this.nodeDataMap.get(nodeId);
  }

  public getAllNodePositions(): Map<string, THREE.Vector3> {
    return this.nodePositions;
  }

  public clear(): void {
    this.nodesGroup.clear();
    this.edgesGroup.clear();
    this.labelsGroup.clear();
    this.nodePositions.clear();
    this.nodeDataMap.clear();
    this.nodeMeshMap.clear();
  }
}
