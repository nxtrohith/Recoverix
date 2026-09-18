/**
 * Main application entrypoint mounting the Three.js visualization dashboard.
 */

import * as THREE from 'three';
import { VisualizationScene } from './visualization/scene';
import { GraphRenderer } from './visualization/graphRenderer';
import { TruckRenderer } from './visualization/truckRenderer';
import { SimulationAnimationController } from './visualization/animation';
import { GraphData, SimEvent, HubNode } from './visualization/types';

// DOM elements
const appContainer = document.getElementById('app') as HTMLElement;
const playPauseBtn = document.getElementById('playPauseBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const timeSlider = document.getElementById('timeSlider') as HTMLInputElement;
const simTimeDisplay = document.getElementById('simTimeDisplay') as HTMLElement;
const activeTrucksDisplay = document.getElementById('activeTrucksDisplay') as HTMLElement;
const speedButtons = document.querySelectorAll<HTMLButtonElement>('.speed-btn');
const eventLogContainer = document.getElementById('eventLog') as HTMLElement;
const hubTooltip = document.getElementById('hubTooltip') as HTMLElement;
const resetCameraBtn = document.getElementById('resetCameraBtn') as HTMLButtonElement;

async function bootstrap() {
  // 1. Initialize Three.js scene
  const vizScene = new VisualizationScene({
    container: appContainer,
    enableGrid: true,
  });

  // 2. Initialize Renderers
  const graphRenderer = new GraphRenderer({
    scene: vizScene.scene,
    scale: 75.0,
  });

  const truckRenderer = new TruckRenderer(vizScene.scene);

  // 3. Initialize Animation Controller
  const animController = new SimulationAnimationController({
    graphRenderer,
    truckRenderer,
    onTimeUpdate: (time, maxTime) => {
      simTimeDisplay.textContent = `T + ${time.toFixed(1)} min`;
      timeSlider.max = String(maxTime);
      timeSlider.value = String(time);
    },
    onStatusChange: (isPlaying) => {
      playPauseBtn.innerHTML = isPlaying
        ? '<span class="icon">⏸</span> Pause'
        : '<span class="icon">▶</span> Play';
      playPauseBtn.classList.toggle('is-playing', isPlaying);
    },
    onActiveTrucksChange: (count) => {
      activeTrucksDisplay.textContent = String(count);
    },
    onEventFired: (event: SimEvent) => {
      appendEventToLog(event);
    },
  });

  // Connect animation tick to Three.js render loop
  vizScene.addRenderCallback((delta) => {
    animController.update(delta);
  });

  // 4. Fetch Graph Data and Sample Events
  try {
    const [graphRes, eventsRes] = await Promise.all([
      fetch('/telangana_graph.json'),
      fetch('/sample_simulation_events.json'),
    ]);

    const graphData: GraphData = await graphRes.json();
    const simEvents: SimEvent[] = await eventsRes.json();

    // Render 3D network
    graphRenderer.renderGraph(graphData);

    // Refine hill placement avoiding all 91 hub positions
    const hubCoords: Array<{ x: number; z: number }> = [];
    for (const pos of graphRenderer.getAllNodePositions().values()) {
      hubCoords.push({ x: pos.x, z: pos.z });
    }
    vizScene.populateHillsAvoidingHubs(hubCoords);

    // Feed SimPy events
    animController.loadEvents(simEvents);

    const totalNodesEl = document.getElementById('totalNodesDisplay');
    const totalEdgesEl = document.getElementById('totalEdgesDisplay');
    if (totalNodesEl) totalNodesEl.textContent = String(graphData.nodes.length);
    if (totalEdgesEl) totalEdgesEl.textContent = String(graphData.edges.length);

    console.log(
      `Loaded ${graphData.nodes.length} hubs, ${graphData.edges.length} edges, ${simEvents.length} events.`
    );
  } catch (err) {
    console.error('Failed to load initial graph or simulation data:', err);
  }

  // 5. Wire UI controls
  playPauseBtn.addEventListener('click', () => {
    if (animController.isPlaying) {
      animController.pause();
    } else {
      animController.play();
    }
  });

  resetBtn.addEventListener('click', () => {
    animController.reset();
    clearEventLog();
  });

  timeSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    animController.seek(val);
  });

  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      speedButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const speed = parseFloat(btn.dataset.speed || '10');
      animController.setSpeed(speed);
    });
  });

  if (resetCameraBtn) {
    resetCameraBtn.addEventListener('click', () => {
      vizScene.resetCamera();
    });
  }

  // Raycasting for hub hover
  setupRaycasting(vizScene, graphRenderer);
}

function appendEventToLog(event: SimEvent): void {
  if (!eventLogContainer) return;

  // Map event types to earthy status classes and academic labels
  const typeMap: Record<string, { cls: string; label: string }> = {
    TRUCK_DEPARTURE:   { cls: '',                 label: 'DEPARTURE' },
    TRUCK_ARRIVAL:     { cls: 'status-idle',      label: 'ARRIVAL' },
    DELAY:             { cls: 'status-delayed',   label: 'DELAY' },
    SHIPMENT_DELIVERY: { cls: 'status-delivered', label: 'DELIVERED' },
    ERROR:             { cls: 'status-error',     label: 'ERROR' },
  };
  const meta = typeMap[event.type] ?? { cls: '', label: event.type };

  const item = document.createElement('div');
  item.className = `event-item ${meta.cls}`;

  const routeHtml = (event.from && event.to)
    ? `<div class="event-route">${event.from.split('_')[0]} → ${event.to.split('_')[0]}</div>`
    : '';
  const reasonHtml = event.reason
    ? `<div class="event-warning">⚠ ${event.reason}</div>`
    : '';

  item.innerHTML = `
    <div class="event-time-row">
      <span class="event-time">${event.time.toFixed(1)} min</span>
      <span class="event-type">${meta.label}</span>
    </div>
    <div class="event-truck-id">${event.truck_id}</div>
    ${routeHtml}
    ${reasonHtml}
  `;

  eventLogContainer.insertBefore(item, eventLogContainer.firstChild);

  // Keep last 30 events visible
  while (eventLogContainer.children.length > 30) {
    eventLogContainer.removeChild(eventLogContainer.lastChild!);
  }
}

function clearEventLog(): void {
  if (eventLogContainer) {
    eventLogContainer.innerHTML = '';
  }
}

function setupRaycasting(vizScene: VisualizationScene, graphRenderer: GraphRenderer): void {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, vizScene.camera);
    const intersects = raycaster.intersectObjects(vizScene.scene.children, true);

    let hoveredNode: HubNode | null = null;
    for (const hit of intersects) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData && cur.userData.node) {
          hoveredNode = cur.userData.node as HubNode;
          break;
        }
        cur = cur.parent;
      }
      if (hoveredNode) break;
    }

    if (hoveredNode && hubTooltip) {
      hubTooltip.style.display = 'block';
      hubTooltip.style.left = `${event.clientX + 14}px`;
      hubTooltip.style.top = `${event.clientY + 14}px`;
      hubTooltip.innerHTML = `
        <div class="tooltip-title">${hoveredNode.hub_name}</div>
        <div class="tooltip-row"><span class="tooltip-key">City</span><span class="tooltip-val">${hoveredNode.city || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-key">Facility</span><span class="tooltip-val">${hoveredNode.facility_code || 'N/A'}</span></div>
        <div class="tooltip-row"><span class="tooltip-key">Type</span><span class="tooltip-val">${hoveredNode.hub_type || 'Hub'}</span></div>
        <div class="tooltip-row"><span class="tooltip-key">Coords</span><span class="tooltip-val">${hoveredNode.latitude?.toFixed(4)}, ${hoveredNode.longitude?.toFixed(4)}</span></div>
      `;
    } else if (hubTooltip) {
      hubTooltip.style.display = 'none';
    }
  });
}

// Start application
window.addEventListener('DOMContentLoaded', bootstrap);
