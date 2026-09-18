/**
 * Scene — stylized 3D cartographic tabletop model.
 * Clean, low-poly academic visualization with earthy palette and bright daylight.
 *
 * Palette:
 *   Café Noir #4C3D19 | Kombu Green #354024 | Moss Green #889063
 *   Tan #CFBB99 | Bone #E5D7C4
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneOptions {
  container: HTMLElement;
  backgroundColor?: number;
  enableGrid?: boolean;
}

// ── Earthy Cartographic Palette ──────────────────────────────────────────────
export const C = {
  BONE:         0xe5d7c4,
  TAN:          0xcfbb99,
  MOSS:         0x889063,
  MOSS_LIGHT:   0x9ca876,
  MOSS_DARK:    0x637243,
  KOMBU:        0x354024,
  CAFE_NOIR:    0x4c3d19,
  SKY_WARM:     0xeae4d8,   // bright warm parchment sky
  PLINTH_BASE:  0xc8b89a,   // tabletop model base plinth
  PLINTH_RIM:   0x4c3d19,   // dark wooden/Café Noir outer frame
  TERRAIN_TAN:  0xd4c6a9,   // primary low-poly tan ground
  TERRAIN_MOSS: 0x869162,   // regional moss patch
  WATER:        0x54736f,   // muted natural blue-green water
  WATER_DEEP:   0x44615d,   // reservoir deep tone
};

export class VisualizationScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public container: HTMLElement;

  private hillsGroup: THREE.Group = new THREE.Group();
  private animationFrameId: number | null = null;
  private renderCallbacks: Array<(delta: number) => void> = [];
  private timer: THREE.Timer = new THREE.Timer();

  constructor(options: SceneOptions) {
    this.container = options.container;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.SKY_WARM);
    // Very gentle distance fog matching bright parchment sky
    this.scene.fog = new THREE.Fog(C.SKY_WARM, 400, 850);

    // 2. Camera — elevated ~54° isometric vantage with full network overview
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1200);
    this.camera.position.set(0, 195, 140);

    // 3. Renderer — clean, high-performance, crisp PCF soft shadows
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 500;
    this.controls.target.set(0, 0, 5);
    this.controls.update();

    this.setupLighting();

    if (options.enableGrid !== false) {
      this.setupStylizedTerrain();
    }

    this.scene.add(this.hillsGroup);

    window.addEventListener('resize', this.onWindowResize);
    this.animate();
  }

  // ── Bright Daylight Lighting ───────────────────────────────────────────────
  private setupLighting(): void {
    // 1. Moderate warm ambient daylight
    const ambient = new THREE.AmbientLight(0xf6efe2, 0.52);
    this.scene.add(ambient);

    // 2. Hemisphere light: bright warm sky above, soft tan-moss earth bounce
    const hemi = new THREE.HemisphereLight(0xfcf8ee, 0xd0c4ab, 0.95);
    hemi.position.set(0, 150, 0);
    this.scene.add(hemi);

    // 3. Primary Sun — warm daylight directional for crisp building & hill shadows
    const sun = new THREE.DirectionalLight(0xfffaed, 1.8);
    sun.position.set(90, 150, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -190;
    sun.shadow.camera.right = 190;
    sun.shadow.camera.top = 190;
    sun.shadow.camera.bottom = -190;
    sun.shadow.bias = -0.0003;
    sun.shadow.radius = 2.0;
    this.scene.add(sun);

    // 4. Soft fill light from northwest to avoid pitch-black shadow crevices
    const fill = new THREE.DirectionalLight(0xe8dfce, 0.35);
    fill.position.set(-80, 85, -60);
    this.scene.add(fill);
  }

  // ── Stylized Low-Poly Cartographic Terrain ──────────────────────────────────
  private setupStylizedTerrain(): void {
    // 1. Architectural tabletop model base / plinth
    const plinthGeo = new THREE.BoxGeometry(370, 5, 350);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: C.PLINTH_BASE,
      roughness: 0.95,
      metalness: 0.0,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -2.6;
    plinth.receiveShadow = true;
    this.scene.add(plinth);

    // 1b. Crisp dark wooden / Café Noir outer exhibition rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: C.PLINTH_RIM,
      roughness: 0.9,
      metalness: 0.0,
    });
    // Create outer border frame
    const rimW = 372;
    const rimD = 352;
    const rimThick = 2.5;
    const rimH = 0.5;

    const createRimSegment = (w: number, d: number, px: number, pz: number) => {
      const geo = new THREE.BoxGeometry(w, rimH, d);
      const m = new THREE.Mesh(geo, rimMat);
      m.position.set(px, 0.05, pz);
      m.receiveShadow = true;
      this.scene.add(m);
    };

    createRimSegment(rimW, rimThick, 0, rimD / 2);
    createRimSegment(rimW, rimThick, 0, -rimD / 2);
    createRimSegment(rimThick, rimD, -rimW / 2, 0);
    createRimSegment(rimThick, rimD, rimW / 2, 0);

    // 2. Low-poly faceted base terrain plane with vertex colors & flat shading
    // 28x26 subdivisions converted to non-indexed gives crisp per-triangle facets!
    let plane = new THREE.PlaneGeometry(360, 340, 28, 26);
    plane.rotateX(-Math.PI / 2);
    const nonIndexed = plane.toNonIndexed();

    const pos = nonIndexed.attributes.position;
    const colorAttr = new Float32Array(pos.count * 3);

    // Palette color objects
    const colTanBase  = new THREE.Color(0xd2c4a7); // Tan
    const colTanWarm  = new THREE.Color(0xdad0b8); // Lighter tan/bone
    const colMoss     = new THREE.Color(0x849060); // Muted moss green
    const colMossDark = new THREE.Color(0x6e7a4b); // Forest moss green
    const colValley   = new THREE.Color(0xc6b595); // River valley tan

    // Process each triangle (3 vertices) together to ensure uniform facet colors
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;

      // Stylized stepped polygonal elevation
      const plateau = -cx * 0.007; // Western Deccan plateau slightly higher
      const wave = Math.sin(cx * 0.024) * Math.cos(cz * 0.026) * 1.1;
      const stepped = Math.floor((plateau + wave) * 2.2) * 0.4;

      // Apply uniform height to all 3 vertices of this triangle
      pos.setY(i,     stepped - 0.2);
      pos.setY(i + 1, stepped - 0.2);
      pos.setY(i + 2, stepped - 0.2);

      // Determine regional facet color
      let facetCol = colTanBase;

      // Northern forest tract (Adilabad / Nirmal / Asifabad)
      if (cz < -55 && cx > -80 && cx < 60) {
        facetCol = (i % 6 === 0) ? colMossDark : colMoss;
      }
      // Eastern Godavari/Khammam green basin
      else if (cx > 40 && cz > -40 && cz < 65) {
        facetCol = (i % 6 === 0) ? colMoss : colMossDark;
      }
      // Western agricultural plateau (Sangareddy / Medak)
      else if (cx < -40 && cz > -10 && cz < 60) {
        facetCol = (i % 9 === 0) ? colMoss : colTanWarm;
      }
      // River valley depressions
      else if (Math.abs(cz - (-85 + cx * 0.5)) < 15 || Math.abs(cz - 88) < 12) {
        facetCol = colValley;
      } else {
        facetCol = (i % 6 === 0) ? colTanWarm : colTanBase;
      }

      for (let v = 0; v < 3; v++) {
        colorAttr[(i + v) * 3]     = facetCol.r;
        colorAttr[(i + v) * 3 + 1] = facetCol.g;
        colorAttr[(i + v) * 3 + 2] = facetCol.b;
      }
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
    nonIndexed.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
    });
    const terrain = new THREE.Mesh(nonIndexed, terrainMat);
    terrain.position.y = 0;
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // 3. Simplified flat water bodies (clean geometric ribbons & reservoirs)
    this.setupWaterBodies();

    // 4. Initial default perimeter hills
    this.populateDefaultHills();
  }

  // ── Flat Cartographic Water Bodies ─────────────────────────────────────────
  private setupWaterBodies(): void {
    const waterMat = new THREE.MeshStandardMaterial({
      color: C.WATER,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });

    // 1. Godavari River Corridor (North-East natural diagonal ribbon)
    const godavariShape = new THREE.Shape();
    godavariShape.moveTo(-90, -100);
    godavariShape.lineTo(-15, -92);
    godavariShape.lineTo(35, -62);
    godavariShape.lineTo(82, -22);
    godavariShape.lineTo(140, 15);
    godavariShape.lineTo(144, 21);
    godavariShape.lineTo(84, -15);
    godavariShape.lineTo(33, -55);
    godavariShape.lineTo(-15, -85);
    godavariShape.lineTo(-90, -93);
    godavariShape.closePath();

    const godavariGeo = new THREE.ShapeGeometry(godavariShape);
    godavariGeo.rotateX(Math.PI / 2);
    const godavari = new THREE.Mesh(godavariGeo, waterMat);
    godavari.position.y = 0.03;
    godavari.receiveShadow = true;
    this.scene.add(godavari);

    // 2. Krishna River Corridor / Nagarjuna Sagar (Southern boundary)
    const krishnaShape = new THREE.Shape();
    krishnaShape.moveTo(-115, 88);
    krishnaShape.lineTo(-50, 96);
    krishnaShape.lineTo(0, 90);
    krishnaShape.lineTo(65, 82);
    krishnaShape.lineTo(125, 88);
    krishnaShape.lineTo(125, 95);
    krishnaShape.lineTo(65, 89);
    krishnaShape.lineTo(0, 97);
    krishnaShape.lineTo(-50, 103);
    krishnaShape.lineTo(-115, 95);
    krishnaShape.closePath();

    const krishnaGeo = new THREE.ShapeGeometry(krishnaShape);
    krishnaGeo.rotateX(Math.PI / 2);
    const krishna = new THREE.Mesh(krishnaGeo, waterMat);
    krishna.position.y = 0.03;
    krishna.receiveShadow = true;
    this.scene.add(krishna);

    // 3. Simplified Reservoirs (Sri Ram Sagar, Nizam Sagar, Hussain Sagar)
    const reservoirs: Array<{ x: number; z: number; r: number }> = [
      { x: -50, z: -88, r: 5.5 }, // Sri Ram Sagar
      { x: -90, z: -40, r: 4.2 }, // Nizam Sagar
      { x: 30,  z: 85,  r: 6.8 }, // Nagarjuna Sagar reservoir
      { x: -48, z: 30,  r: 2.2 }, // Hussain Sagar (Hyd central)
      { x: 82,  z: -5,  r: 4.8 }, // Kinnerasani / Palair
    ];

    for (const res of reservoirs) {
      // 7-sided low-poly flat polygon
      const resGeo = new THREE.CircleGeometry(res.r, 7);
      resGeo.rotateX(-Math.PI / 2);
      const resMesh = new THREE.Mesh(resGeo, waterMat);
      resMesh.position.set(res.x, 0.04, res.z);
      resMesh.receiveShadow = true;
      this.scene.add(resMesh);
    }
  }

  // ── Stylized Faceted 3D Hills ─────────────────────────────────────────────
  private populateDefaultHills(): void {
    const defaultClusters = [
      // Northern Satmala Range (perimeter)
      { cx: -50, cz: -132, count: 5, radius: 4.5, height: 6.8 },
      { cx: 15,  cz: -128, count: 4, radius: 4.0, height: 6.0 },
      { cx: 60,  cz: -118, count: 4, radius: 3.8, height: 5.5 },
      // Eastern Ghats fringe (Bhadrachalam east)
      { cx: 140, cz: -15,  count: 6, radius: 5.0, height: 7.5 },
      { cx: 145, cz: 30,   count: 5, radius: 4.5, height: 6.5 },
      { cx: 138, cz: 65,   count: 4, radius: 4.0, height: 5.8 },
      // Ananthagiri hills (West periphery)
      { cx: -132, cz: 38,  count: 5, radius: 4.8, height: 6.5 },
      { cx: -136, cz: -15, count: 4, radius: 4.0, height: 5.2 },
      { cx: -128, cz: -72, count: 4, radius: 3.8, height: 5.4 },
      // Southern Nallamala fringe (South periphery)
      { cx: -30, cz: 128,  count: 5, radius: 4.8, height: 7.2 },
      { cx: 45,  cz: 122,  count: 5, radius: 4.2, height: 6.2 },
      { cx: 90,  cz: 112,  count: 4, radius: 3.8, height: 5.6 },
    ];

    const hillColors = [C.MOSS_DARK, C.MOSS, C.MOSS_LIGHT, 0x586638];

    for (const cluster of defaultClusters) {
      for (let i = 0; i < cluster.count; i++) {
        const ang = (i / cluster.count) * Math.PI * 2 + 0.3;
        const dist = (i % 2 === 0 ? 0.6 : 1.2) * cluster.radius;
        const hx = cluster.cx + Math.cos(ang) * dist;
        const hz = cluster.cz + Math.sin(ang) * dist;

        const hR = cluster.radius * (0.75 + (i % 3) * 0.15);
        const hH = cluster.height * (0.8 + (i % 2) * 0.3);

        const hillGeo = new THREE.ConeGeometry(hR, hH, 6);
        const col = hillColors[(i + cluster.count) % hillColors.length];
        const hillMat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.95,
          metalness: 0.0,
          flatShading: true,
        });

        const hill = new THREE.Mesh(hillGeo, hillMat);
        hill.position.set(hx, hH / 2, hz);
        hill.rotation.y = i * 1.1;
        hill.castShadow = true;
        hill.receiveShadow = true;
        this.hillsGroup.add(hill);
      }
    }
  }

  /**
   * Refines hill placement once all hub coordinates are available,
   * guaranteeing no hill clips into a warehouse or road node.
   */
  public populateHillsAvoidingHubs(hubs: Array<{ x: number; z: number }>): void {
    this.hillsGroup.clear();

    const clusterSpawns = [
      // Northern Satmala Range
      { cx: -60, cz: -132, count: 5, r: 4.6, h: 6.8 },
      { cx: 5,   cz: -130, count: 5, r: 4.2, h: 6.2 },
      { cx: 55,  cz: -118, count: 4, r: 3.8, h: 5.6 },
      // Eastern Ghats fringe
      { cx: 135, cz: -22,  count: 6, r: 5.0, h: 7.5 },
      { cx: 148, cz: 22,   count: 6, r: 4.8, h: 7.0 },
      { cx: 138, cz: 62,   count: 5, r: 4.2, h: 6.0 },
      // Ananthagiri hills (West periphery)
      { cx: -132, cz: 35,  count: 6, r: 4.6, h: 6.6 },
      { cx: -136, cz: -18, count: 5, r: 4.0, h: 5.5 },
      { cx: -126, cz: -72, count: 4, r: 3.8, h: 5.2 },
      // Southern Nallamala fringe
      { cx: -32, cz: 126,  count: 6, r: 4.8, h: 7.2 },
      { cx: 42,  cz: 122,  count: 5, r: 4.2, h: 6.2 },
      { cx: 88,  cz: 112,  count: 4, r: 3.8, h: 5.6 },
      // Interior safe ridges positioned well clear of hubs
      { cx: -15, cz: -75,  count: 3, r: 3.0, h: 4.2 },
      { cx: 65,  cz: -50,  count: 3, r: 3.2, h: 4.6 },
      { cx: -18, cz: 65,   count: 3, r: 3.0, h: 4.0 },
      { cx: 62,  cz: 25,   count: 3, r: 3.2, h: 4.2 },
    ];

    const hillColors = [C.MOSS_DARK, C.MOSS, C.MOSS_LIGHT, 0x586638];

    for (const c of clusterSpawns) {
      for (let i = 0; i < c.count; i++) {
        const ang = (i / c.count) * Math.PI * 2 + 0.3;
        const dist = (i % 2 === 0 ? 0.6 : 1.2) * c.r;
        const hx = c.cx + Math.cos(ang) * dist;
        const hz = c.cz + Math.sin(ang) * dist;

        // Verify minimum 8.0 units clearance from all hubs
        const tooClose = hubs.some((h) => {
          const dx = h.x - hx;
          const dz = h.z - hz;
          return Math.sqrt(dx * dx + dz * dz) < 8.0;
        });

        if (tooClose) continue;

        const hR = c.r * (0.8 + (i % 3) * 0.15);
        const hH = c.h * (0.85 + (i % 2) * 0.3);

        const hillGeo = new THREE.ConeGeometry(hR, hH, 6);
        const col = hillColors[(i + c.count) % hillColors.length];
        const hillMat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.95,
          metalness: 0.0,
          flatShading: true,
        });

        const hill = new THREE.Mesh(hillGeo, hillMat);
        hill.position.set(hx, hH / 2, hz);
        hill.rotation.y = i * 1.05;
        hill.castShadow = true;
        hill.receiveShadow = true;
        this.hillsGroup.add(hill);
      }
    }
  }

  public onWindowResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public addRenderCallback(cb: (delta: number) => void): void {
    this.renderCallbacks.push(cb);
  }

  public removeRenderCallback(cb: (delta: number) => void): void {
    this.renderCallbacks = this.renderCallbacks.filter((c) => c !== cb);
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.timer.update();
    const delta = this.timer.getDelta();
    this.controls.update();
    for (const cb of this.renderCallbacks) cb(delta);
    this.renderer.render(this.scene, this.camera);
  };

  public resetCamera(): void {
    this.camera.position.set(0, 195, 140);
    this.controls.target.set(0, 0, 5);
    this.controls.update();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
  }
}
