/**
 * Scene setup and management for the Three.js logistics visualizer.
 * Provides a dark, professional high-tech logistics dashboard aesthetic.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneOptions {
  container: HTMLElement;
  backgroundColor?: number;
  enableGrid?: boolean;
}

export class VisualizationScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public container: HTMLElement;

  private animationFrameId: number | null = null;
  private renderCallbacks: Array<(delta: number) => void> = [];
  private clock: THREE.Clock = new THREE.Clock();

  constructor(options: SceneOptions) {
    this.container = options.container;

    // 1. Scene
    this.scene = new THREE.Scene();
    const bgColor = options.backgroundColor ?? 0x080c16;
    this.scene.background = new THREE.Color(bgColor);
    this.scene.fog = new THREE.FogExp2(bgColor, 0.0035);

    // 2. Camera
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1500);
    // Elevated perspective looking down on the Telangana region
    this.camera.position.set(0, 110, 110);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera going below ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 450;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // 5. Lighting
    this.setupLighting();

    // 6. Ground & Grid
    if (options.enableGrid !== false) {
      this.setupGroundGrid();
    }

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize);

    // 8. Start render loop
    this.animate();
  }

  private setupLighting(): void {
    // Soft ambient illumination for dark theme
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.65);
    this.scene.add(ambientLight);

    // Hemisphere light for natural sky/ground gradient
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.45);
    hemiLight.position.set(0, 100, 0);
    this.scene.add(hemiLight);

    // Key directional light with soft shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(60, 120, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Secondary cyan rim light for logistics cyberpunk depth
    const rimLight = new THREE.DirectionalLight(0x0284c7, 0.6);
    rimLight.position.set(-80, 40, -60);
    this.scene.add(rimLight);
  }

  private setupGroundGrid(): void {
    // Subtle dark circular grid
    const grid = new THREE.GridHelper(300, 60, 0x0284c7, 0x1e293b);
    grid.position.y = -0.1;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    this.scene.add(grid);

    // Dark backdrop plane to receive shadows
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070b14,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  public onWindowResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public addRenderCallback(cb: (delta: number) => void): void {
    this.renderCallbacks.push(cb);
  }

  public removeRenderCallback(cb: (delta: number) => void): void {
    this.renderCallbacks = this.renderCallbacks.filter((c) => c !== cb);
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    this.controls.update();

    for (const cb of this.renderCallbacks) {
      cb(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  public resetCamera(): void {
    this.camera.position.set(0, 110, 110);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
