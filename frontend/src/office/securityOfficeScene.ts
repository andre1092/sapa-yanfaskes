import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type StationId = 'code' | 'deps' | 'production' | 'privacy' | 'logs' | 'ceo';
export interface StationState { id: StationId; label: string; worst: Severity | 'clear' | 'idle'; count: number }

const SEVERITY_COLOR: Record<StationState['worst'], number> = {
  critical: 0xd92d20, high: 0xf79009, medium: 0xeaaa08, low: 0x2e90fa, info: 0x2e90fa, clear: 0x12b76a, idle: 0x98a2b3,
};
// Pusat tiap meja (x, z) dan arah depannya (radian, 0 = +z), sama dengan Station_* di
// automation/office_models/build_office_models.py. Agen berdiri di depan meja, menghadapnya.
const LAYOUT: Record<StationId, [number, number, number]> = {
  code: [-5, 1.8, Math.PI / 2], privacy: [-3.4, -4.35, 0], production: [-0.6, -1, 0],
  ceo: [1.6, -4.3, 0], deps: [4.5, -1.6, 0], logs: [1.2, 3.2, 0],
};
const PATROL: StationId[] = ['production', 'code', 'privacy', 'ceo', 'deps', 'logs'];
// Agen menghadap meja yang diperiksanya, kecuali di Pos Pantau Produksi: ia berdiri menghadap ruangan seperti di konsep.
const agentFacing = (id: StationId) => LAYOUT[id][2] + (id === 'production' ? 0 : Math.PI);
const MODELS = ['room', 'agent', ...(Object.keys(LAYOUT) as StationId[]).map(id => `station-${id}`)];

export interface SecurityOffice {
  update(states: StationState[]): void;
  setActive(id: StationId | null): void;
  setBusy(busy: boolean): void;
  dispose(): void;
}

export function createSecurityOffice(host: HTMLElement, options: {
  dark: boolean; reducedMotion: boolean; onSelect(id: StationId): void; onAgent(): void; onLabels(labels: { id: StationId; x: number; y: number }[]): void;
}): SecurityOffice {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(14, 14, 14);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, options.dark ? 0x1d2939 : 0xd0d5dd, options.dark ? 1.2 : 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, options.dark ? 1.4 : 2);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  // Model GLB bertepi bulat menerima bayangannya sendiri; bias mencegah garis-garis (shadow acne).
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  scene.add(sun);

  const stations = new Map<StationId, { group: THREE.Group; screens: THREE.MeshStandardMaterial[]; lamp: THREE.PointLight; ring: THREE.Mesh }>();
  const pickables: THREE.Object3D[] = [];
  for (const id of Object.keys(LAYOUT) as StationId[]) {
    const [x, z] = LAYOUT[id];
    // Model meja sudah berada di posisi akhirnya; hanya cincin dan lampu yang diletakkan di sini.
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0x98a2b3, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z); group.add(ring);
    const lamp = new THREE.PointLight(0x98a2b3, 0, 4); lamp.position.set(x, 1.8, z); group.add(lamp);
    pickables.push(group);
    stations.set(id, { group, screens: [], lamp, ring });
    scene.add(group);
  }

  // Karyawan AI; badannya diayun saat berjalan, modelnya dimuat bersama perabot.
  const agent = new THREE.Group();
  const body = new THREE.Group();
  agent.add(body);
  scene.add(agent);
  pickables.push(agent);
  const standPoint = (id: StationId) => {
    const [x, z, facing] = LAYOUT[id];
    return new THREE.Vector3(x + Math.sin(facing) * 1.25, 0, z + Math.cos(facing) * 1.25);
  };
  agent.position.copy(standPoint(PATROL[0]));
  agent.rotation.y = agentFacing(PATROL[0]);

  let lastStates: StationState[] = [];
  const applyStates = () => {
    for (const state of lastStates) {
      const station = stations.get(state.id);
      if (!station) continue;
      const color = SEVERITY_COLOR[state.worst];
      for (const screen of station.screens) { screen.color.setHex(color); screen.emissive.setHex(color); }
      station.lamp.color.setHex(color);
      station.lamp.intensity = state.worst === 'idle' ? 0 : state.worst === 'clear' ? 0.8 : 3;
      const ring = station.ring.material as THREE.MeshBasicMaterial;
      ring.color.setHex(color);
      station.ring.userData.on = state.worst === 'critical' || state.worst === 'high';
      ring.opacity = options.reducedMotion && station.ring.userData.on ? 0.6 : ring.opacity;
    }
    needsRender = true;
  };

  // Model GLB dibuat di Blender mengikuti konsep (automation/office_models); layar bermaterial
  // "Screen" diwarnai per meja sesuai temuan terburuknya.
  let disposed = false;
  const loader = new GLTFLoader();
  Promise.all(MODELS.map(name => loader.loadAsync(`/office/${name}.glb`).then(gltf => gltf.scene)))
    .then(([room, agentModel, ...stationModels]) => {
      if (disposed) return;
      room.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = child.receiveShadow = true; });
      scene.add(room);
      [...stations.values()].forEach((station, index) => station.group.add(stationModels[index]));
      for (const [id, station] of stations) station.group.traverse(child => {
        child.userData.station = id;
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = child.receiveShadow = child !== station.ring;
        if (child.material.name === 'Screen') { child.material = child.material.clone(); station.screens.push(child.material); }
      });
      agentModel.traverse(child => { child.userData.agent = true; if (child instanceof THREE.Mesh) child.castShadow = true; });
      body.add(agentModel);
      applyStates();
    })
    .catch(error => console.error('Model kantor keamanan gagal dimuat', error));

  let active: StationId | null = null;
  let busy = false;
  let target = 0;
  let pause = 0;
  let frame = 0;
  let needsRender = true;
  const clock = new THREE.Clock();

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Ruangan isometrik selebar ±8 unit dan setinggi ±5,6 unit; pilih sisi yang membatasi.
    const halfWidth = Math.max(8.6, 5.9 * aspect);
    Object.assign(camera, { left: -halfWidth, right: halfWidth, top: halfWidth / aspect, bottom: -halfWidth / aspect });
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const emitLabels = () => {
    const rect = renderer.domElement.getBoundingClientRect();
    options.onLabels((Object.keys(LAYOUT) as StationId[]).map(id => {
      const point = new THREE.Vector3(LAYOUT[id][0], id === 'production' ? 2.9 : 2.3, LAYOUT[id][1]).project(camera);
      return { id, x: (point.x + 1) / 2 * rect.width, y: (1 - point.y) / 2 * rect.height };
    }));
  };

  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!options.reducedMotion) {
      const station = active ?? PATROL[target];
      const goal = standPoint(station);
      const step = goal.clone().sub(agent.position);
      if (step.length() > 0.05) {
        agent.position.add(step.clampLength(0, dt * 2.4));
        agent.rotation.y = Math.atan2(step.x, step.z);
        body.position.y = Math.abs(Math.sin(t * 9)) * 0.06;
      } else {
        agent.rotation.y = agentFacing(station);
        // Sibuk memeriksa atau memperbaiki: badan bergetar kecil seperti mengetik di meja.
        body.position.y = busy ? 0.02 + Math.abs(Math.sin(t * 18)) * 0.03 : 0;
        pause += dt;
        if (!active && pause > 1.8) { pause = 0; target = (target + 1) % PATROL.length; }
      }
      for (const { ring } of stations.values()) (ring.material as THREE.MeshBasicMaterial).opacity = ring.userData.on ? 0.55 + Math.sin(t * 3) * 0.3 : 0;
      needsRender = true;
    }
    if (needsRender) { renderer.render(scene, camera); emitLabels(); needsRender = false; }
  };
  tick();

  const raycaster = new THREE.Raycaster();
  const onClick = (event: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    if (hit?.object.userData.agent) options.onAgent();
    else if (hit?.object.userData.station) options.onSelect(hit.object.userData.station);
  };
  renderer.domElement.addEventListener('click', onClick);

  return {
    update(states) {
      lastStates = states;
      applyStates();
    },
    setActive(id) {
      active = id;
      if (options.reducedMotion) {
        agent.position.copy(standPoint(id ?? 'production'));
        agent.rotation.y = agentFacing(id ?? 'production');
      }
      needsRender = true;
    },
    setBusy(value) {
      busy = value;
      needsRender = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
