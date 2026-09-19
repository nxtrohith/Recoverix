import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  HoveredEntity,
  LocationNode,
  Route,
  TelanganaEdge,
  TelanganaNode,
  Vehicle,
} from '../types';
import { computeConvexHull, createProjection, getHubColor } from '../utils/projection';

interface ThreeCanvasProps {
  nodes: TelanganaNode[];
  edges: TelanganaEdge[];
  locations: LocationNode[];
  routes: Route[];
  vehicles: Vehicle[];
  geojson: any;
  simulatedNow: number;
  topHubNames: Set<string>;
  onHover: (entity: HoveredEntity | null) => void;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  nodes,
  edges,
  locations,
  routes,
  vehicles,
  geojson,
  simulatedNow,
  topHubNames,
  onHover,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Dynamic mesh references for simulation updates
  const trucksGroupRef = useRef<THREE.Group | null>(null);
  const activeRoutesGroupRef = useRef<THREE.Group | null>(null);
  const interactiveObjectsRef = useRef<THREE.Object3D[]>([]);

  // Keep latest props in ref for animation frame and event handlers
  const propsRef = useRef({
    simulatedNow,
    routes,
    vehicles,
    locations,
    nodes,
    topHubNames,
    onHover,
  });
  propsRef.current = {
    simulatedNow,
    routes,
    vehicles,
    locations,
    nodes,
    topHubNames,
    onHover,
  };

  // Build lookup maps
  const locById = React.useMemo(() => {
    const map = new Map<string, LocationNode>();
    locations.forEach((l) => map.set(l._id, l));
    return map;
  }, [locations]);

  const locByName = React.useMemo(() => {
    const map = new Map<string, LocationNode>();
    locations.forEach((l) => map.set(l.name, l));
    return map;
  }, [locations]);

  const routeById = React.useMemo(() => {
    const map = new Map<string, Route>();
    routes.forEach((r) => map.set(r._id, r));
    return map;
  }, [routes]);

  const edgeTripCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    edges.forEach((e) => {
      counts.set(e.source_name, (counts.get(e.source_name) || 0) + (e.trip_count || 0));
      counts.set(e.destination_name, (counts.get(e.destination_name) || 0) + (e.trip_count || 0));
    });
    return counts;
  }, [edges]);

  // Initial Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2A3655');
    scene.fog = new THREE.FogExp2('#2A3655', 0.006);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 500);
    camera.position.set(0, 68, 56);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.05; // Stay above ground plane
    controls.minDistance = 15;
    controls.maxDistance = 160;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight('#B0C4DE', 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight('#FFFFFF', 1.2);
    dirLight1.position.set(30, 60, 40);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight('#4FB6A6', 0.5);
    dirLight2.position.set(-40, 30, -30);
    scene.add(dirLight2);

    // Subtle background grid floor
    const grid = new THREE.GridHelper(130, 26, 0x1F2A44, 0x121A2C);
    grid.position.y = -0.15;
    scene.add(grid);

    // Group containers
    const boundaryGroup = new THREE.Group();
    scene.add(boundaryGroup);

    const routesGroup = new THREE.Group();
    scene.add(routesGroup);

    const activeRoutesGroup = new THREE.Group();
    scene.add(activeRoutesGroup);
    activeRoutesGroupRef.current = activeRoutesGroup;

    const hubsGroup = new THREE.Group();
    scene.add(hubsGroup);

    const trucksGroup = new THREE.Group();
    scene.add(trucksGroup);
    trucksGroupRef.current = trucksGroup;

    // Projection calculation
    const { project } = createProjection(nodes);

    // 1. RENDER TELANGANA MAP BASE SILHOUETTE
    let boundaryRendered = false;

    if (geojson && geojson.features && geojson.features.length > 0) {
      try {
        const districtMaterial = new THREE.MeshStandardMaterial({
          color: 0x3d4a73,
          roughness: 0.85,
          metalness: 0.15,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        const borderMaterial = new THREE.LineBasicMaterial({
          color: 0x7b8cbd,
          linewidth: 1,
          transparent: true,
          opacity: 0.98,
        });

        geojson.features.forEach((feature: any) => {
          const geom = feature.geometry;
          if (!geom) return;

          const renderPolygon = (coords: number[][]) => {
            if (coords.length < 3) return;
            const shape = new THREE.Shape();
            const [p0x, p0z] = project(coords[0][1], coords[0][0]);
            shape.moveTo(p0x, p0z);

            const borderPoints: THREE.Vector3[] = [new THREE.Vector3(p0x, 0.04, p0z)];

            for (let i = 1; i < coords.length; i++) {
              const [px, pz] = project(coords[i][1], coords[i][0]);
              shape.lineTo(px, pz);
              borderPoints.push(new THREE.Vector3(px, 0.04, pz));
            }

            // Mesh
            const shapeGeom = new THREE.ShapeGeometry(shape);
            shapeGeom.rotateX(Math.PI / 2); // Map (x, z) shape to (x, 0, z) 3D ground plane
            const mesh = new THREE.Mesh(shapeGeom, districtMaterial);
            mesh.receiveShadow = true;
            boundaryGroup.add(mesh);

            // Outline
            const lineGeom = new THREE.BufferGeometry().setFromPoints(borderPoints);
            const line = new THREE.Line(lineGeom, borderMaterial);
            boundaryGroup.add(line);
          };

          if (geom.type === 'Polygon') {
            renderPolygon(geom.coordinates[0]);
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((polyCoords: number[][][]) => {
              renderPolygon(polyCoords[0]);
            });
          }
        });

        boundaryRendered = true;
      } catch (err) {
        console.error('Failed to render GeoJSON boundary:', err);
      }
    }

    // Fallback: convex hull of the 91 hub coordinates
    if (!boundaryRendered && nodes.length > 0) {
      const projectedNodes: Array<[number, number]> = nodes.map((n) => project(n.latitude, n.longitude));
      const hull = computeConvexHull(projectedNodes);

      const shape = new THREE.Shape();
      const borderPoints: THREE.Vector3[] = [];
      hull.forEach(([x, z], idx) => {
        if (idx === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
        borderPoints.push(new THREE.Vector3(x, 0.04, z));
      });
      borderPoints.push(new THREE.Vector3(hull[0][0], 0.04, hull[0][1]));

      const shapeGeom = new THREE.ShapeGeometry(shape);
      shapeGeom.rotateX(Math.PI / 2);
      const fallbackMesh = new THREE.Mesh(
        shapeGeom,
        new THREE.MeshStandardMaterial({ color: 0x3d4a73, roughness: 0.85, metalness: 0.15 })
      );
      fallbackMesh.receiveShadow = true;
      boundaryGroup.add(fallbackMesh);

      const borderLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(borderPoints),
        new THREE.LineBasicMaterial({ color: 0x7b8cbd, linewidth: 2 })
      );
      boundaryGroup.add(borderLine);
    }

    // 2. RENDER 91 HUBS
    const hubObjects: THREE.Object3D[] = [];

    // Geometries reused
    const normalHubGeom = new THREE.CylinderGeometry(0.38, 0.52, 0.8, 8);
    const topHubGeom = new THREE.CylinderGeometry(0.7, 0.9, 1.4, 12);
    const primaryHubGeom = new THREE.CylinderGeometry(1.0, 1.3, 2.0, 16);

    nodes.forEach((node) => {
      const [x, z] = project(node.latitude, node.longitude);
      const colorHex = getHubColor(node.hub_type);
      const isTop5 = topHubNames.has(node.hub_name);
      const isPrimary = node.hub_name.includes('Shamshbd_H');
      const tripCount = edgeTripCounts.get(node.hub_name) || 0;

      const geom = isPrimary ? primaryHubGeom : isTop5 ? topHubGeom : normalHubGeom;
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.6,
        emissive: colorHex,
        emissiveIntensity: isPrimary ? 0.45 : isTop5 ? 0.3 : 0.12,
      });

      const hubMesh = new THREE.Mesh(geom, mat);
      const hubHeight = isPrimary ? 1.0 : isTop5 ? 0.7 : 0.4;
      hubMesh.position.set(x, hubHeight, z);
      hubMesh.castShadow = true;
      hubMesh.receiveShadow = true;

      // Base ring for prominent hubs
      if (isPrimary || isTop5) {
        const ringGeom = new THREE.RingGeometry(isPrimary ? 1.5 : 1.0, isPrimary ? 1.9 : 1.3, 24);
        ringGeom.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isPrimary ? 0.6 : 0.4,
        });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.position.set(x, 0.06, z);
        hubsGroup.add(ringMesh);
      }

      hubMesh.userData = {
        kind: 'hub',
        hubData: {
          name: node.hub_name,
          city: node.city,
          hubType: node.hub_type,
          tripCount,
        },
      };

      hubsGroup.add(hubMesh);
      hubObjects.push(hubMesh);
    });

    // 3. RENDER 143 NETWORK LEGS (Idle Routes)
    const idleLinePoints: THREE.Vector3[] = [];

    edges.forEach((edge) => {
      const srcNode = locByName.get(edge.source_name);
      const dstNode = locByName.get(edge.destination_name);
      if (!srcNode || !dstNode) return;

      const [x1, z1] = project(srcNode.coordinates.latitude, srcNode.coordinates.longitude);
      const [x2, z2] = project(dstNode.coordinates.latitude, dstNode.coordinates.longitude);

      idleLinePoints.push(new THREE.Vector3(x1, 0.12, z1));
      idleLinePoints.push(new THREE.Vector3(x2, 0.12, z2));
    });

    if (idleLinePoints.length > 0) {
      const idleGeom = new THREE.BufferGeometry().setFromPoints(idleLinePoints);
      const idleMat = new THREE.LineBasicMaterial({
        color: 0x2e3a59,
        transparent: true,
        opacity: 0.42,
      });
      const idleLines = new THREE.LineSegments(idleGeom, idleMat);
      routesGroup.add(idleLines);
    }

    // Set interactive objects (Hubs)
    interactiveObjectsRef.current = [...hubObjects];

    // Raycasting for hover tooltip
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Raycast against hubs and active trucks
      const interactables = [...interactiveObjectsRef.current];
      if (trucksGroupRef.current) {
        interactables.push(...trucksGroupRef.current.children);
      }

      const intersects = raycaster.intersectObjects(interactables, true);

      if (intersects.length > 0) {
        // Find top valid entity
        let hitObject: THREE.Object3D | null = intersects[0].object;
        while (hitObject && !hitObject.userData?.kind && hitObject.parent) {
          hitObject = hitObject.parent;
        }

        if (hitObject && hitObject.userData?.kind) {
          container.style.cursor = 'pointer';
          const { kind, hubData, truckData } = hitObject.userData;
          propsRef.current.onHover({
            kind,
            screenX: e.clientX,
            screenY: e.clientY,
            hubData,
            truckData,
          });
          return;
        }
      }

      container.style.cursor = 'default';
      propsRef.current.onHover(null);
    };

    const handlePointerLeave = () => {
      container.style.cursor = 'default';
      propsRef.current.onHover(null);
    };

    container.addEventListener('mousemove', handlePointerMove);
    container.addEventListener('mouseleave', handlePointerLeave);

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Animation render loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const now = performance.now();

      controls.update();

      // Subtle pulse animation for Shamshabad primary hub ring
      const pulse = 1 + Math.sin(now * 0.003) * 0.12;
      hubsGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) {
          child.scale.set(pulse, pulse, pulse);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handlePointerMove);
      container.removeEventListener('mouseleave', handlePointerLeave);
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [nodes, edges, geojson, topHubNames]);

  // 4. DYNAMIC SIMULATION UPDATE: TRUCKS & ACTIVE ROUTE HIGHLIGHTS
  useEffect(() => {
    const trucksGroup = trucksGroupRef.current;
    const activeRoutesGroup = activeRoutesGroupRef.current;
    if (!trucksGroup || !activeRoutesGroup || nodes.length === 0) return;

    // Clear previous dynamic meshes
    while (trucksGroup.children.length > 0) {
      const child = trucksGroup.children[0];
      trucksGroup.remove(child);
    }
    while (activeRoutesGroup.children.length > 0) {
      const child = activeRoutesGroup.children[0];
      activeRoutesGroup.remove(child);
    }

    const { project } = createProjection(nodes);

    // In-transit vehicles matching currentRoute
    const inTransitVehicles = vehicles.filter((v) => v.status === 'in_transit' && v.currentRoute);

    // Unique active route points for glowing line highlight
    const activeLinePoints: THREE.Vector3[] = [];
    const movingLinePoints: THREE.Vector3[] = [];

    // Reusable truck geometry: sleek pointed box / wedge
    const truckBodyGeom = new THREE.BoxGeometry(0.7, 0.45, 1.1);
    const truckCabGeom = new THREE.BoxGeometry(0.65, 0.55, 0.5);
    const truckMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b4a,
      emissive: 0xff4b2b,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.7,
    });

    inTransitVehicles.forEach((vehicle) => {
      const route = routeById.get(vehicle.currentRoute!);
      if (!route) return;

      const originLoc = locById.get(route.origin);
      const destLoc = locById.get(route.destination);
      if (!originLoc || !destLoc) return;

      const [xOrig, zOrig] = project(originLoc.coordinates.latitude, originLoc.coordinates.longitude);
      const [xDest, zDest] = project(destLoc.coordinates.latitude, destLoc.coordinates.longitude);

      const depTime = new Date(route.scheduledDeparture).getTime();
      const arrTime = new Date(route.scheduledArrival).getTime();
      const duration = arrTime - depTime;

      const progress = duration > 0 ? (simulatedNow - depTime) / duration : 0;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const isCurrentlyMoving = simulatedNow >= depTime && simulatedNow <= arrTime;

      // Add to route highlight
      if (isCurrentlyMoving) {
        movingLinePoints.push(new THREE.Vector3(xOrig, 0.16, zOrig));
        movingLinePoints.push(new THREE.Vector3(xDest, 0.16, zDest));
      } else {
        activeLinePoints.push(new THREE.Vector3(xOrig, 0.14, zOrig));
        activeLinePoints.push(new THREE.Vector3(xDest, 0.14, zDest));
      }

      // Truck position lerp
      const currX = xOrig + (xDest - xOrig) * clampedProgress;
      const currZ = zOrig + (zDest - zOrig) * clampedProgress;
      // Lifted well above the tallest hub marker (primary hub top = 2.0 world units,
      // scaled truck bottom = currY - ~0.39) so a parked truck never visually merges
      // with the hub cylinder beneath it, at any hub tier.
      const currY = 2.8;

      // Rotation heading along route
      const headingAngle = Math.atan2(xDest - xOrig, zDest - zOrig);

      // Create truck 3D composite group
      const truckGroup = new THREE.Group();
      truckGroup.position.set(currX, currY, currZ);
      truckGroup.rotation.y = headingAngle;
      truckGroup.scale.setScalar(1.75);

      // Truck chassis
      const bodyMesh = new THREE.Mesh(truckBodyGeom, truckMaterial);
      bodyMesh.castShadow = true;
      truckGroup.add(bodyMesh);

      // Truck cab
      const cabMesh = new THREE.Mesh(truckCabGeom, truckMaterial);
      cabMesh.position.set(0, 0.15, 0.35);
      cabMesh.castShadow = true;
      truckGroup.add(cabMesh);

      // Small glowing light if moving
      if (isCurrentlyMoving) {
        const beaconGeom = new THREE.SphereGeometry(0.16, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfff275 });
        const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
        beaconMesh.position.set(0, 0.55, 0.35);
        truckGroup.add(beaconMesh);
      }

      truckGroup.userData = {
        kind: 'truck',
        truckData: {
          vehicleNumber: vehicle.vehicleNumber,
          type: vehicle.type,
          originName: originLoc.name.replace(/ \(Telangana\)/, ''),
          destinationName: destLoc.name.replace(/ \(Telangana\)/, ''),
          progressPercent: Math.round(clampedProgress * 100),
          status: isCurrentlyMoving ? 'In Transit (Moving)' : clampedProgress === 0 ? 'Scheduled (At Origin)' : 'Arrived (At Destination)',
        },
      };

      trucksGroup.add(truckGroup);
    });

    // Render assigned active routes (#4FB6A6, slightly thicker/brighter)
    if (activeLinePoints.length > 0) {
      const activeGeom = new THREE.BufferGeometry().setFromPoints(activeLinePoints);
      const activeMat = new THREE.LineBasicMaterial({
        color: 0x4fb6a6,
        transparent: true,
        opacity: 0.55,
      });
      activeRoutesGroup.add(new THREE.LineSegments(activeGeom, activeMat));
    }

    // Render routes with currently moving trucks in bright glowing accent
    if (movingLinePoints.length > 0) {
      const movingGeom = new THREE.BufferGeometry().setFromPoints(movingLinePoints);
      const movingMat = new THREE.LineBasicMaterial({
        color: 0x5ce6cf,
        transparent: true,
        opacity: 0.95,
      });
      activeRoutesGroup.add(new THREE.LineSegments(movingGeom, movingMat));
    }
  }, [simulatedNow, vehicles, routes, nodes, locById, routeById]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
};
