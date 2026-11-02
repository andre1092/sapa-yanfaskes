import * as THREE from 'three';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type StationId = 'code' | 'deps' | 'production' | 'privacy' | 'logs' | 'ceo';
export interface StationState { id: StationId; label: string; worst: Severity | 'clear' | 'idle'; count: number }

const SEVERITY_COLOR: Record<StationState['worst'], number> = {
  critical: 0xd92d20, high: 0xf79009, medium: 0xeaaa08, low: 0x2e90fa, info: 0x2e90fa, clear: 0x12b76a, idle: 0x98a2b3,
};
// Posisi meja di lantai kantor (x, z); agen berjalan berurutan mengunjunginya.
const LAYOUT: Record<StationId, [number, number]> = {
  code: [-4.5, -3], deps: [0, -3.6], production: [4.5, -3], privacy: [-4.5, 2.2], logs: [4.5, 2.2], ceo: [0, 3.4],
};
const PATROL: StationId[] = ['code', 'deps', 'production', 'logs', 'privacy', 'ceo'];

export interface SecurityOffice {
  update(states: StationState[]): void;
  setActive(id: StationId | null): void;
  dispose(): void;
}

export function createSecurityOffice(host: HTMLElement, options: {
  dark: boolean; reducedMotion: boolean; onSelect(id: StationId): void; onLabels(labels: { id: StationId; x: number; y: number }[]): void;
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
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  scene.add(sun);

  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const box = (w: number, h: number, d: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Lantai kotak-kotak dan dua dinding belakang, warna hijau-biru SAPA.
  const floor = new THREE.Group();
  for (let x = -6; x < 6; x++) for (let z = -5; z < 5; z++) {
    const tile = box(1, 0.2, 1, mat((x + z) % 2 === 0 ? (options.dark ? 0x22303f : 0xe4f3ee) : (options.dark ? 0x1b2633 : 0xd5ece4)));
    tile.position.set(x + 0.5, -0.1, z + 0.5);
    floor.add(tile);
  }
  scene.add(floor);
  const wallMat = mat(options.dark ? 0x173a5e : 0x1e5f8e);
  const wallBack = box(12, 3, 0.3, wallMat); wallBack.position.set(0, 1.5, -5.15); scene.add(wallBack);
  const wallSide = box(0.3, 3, 10, wallMat); wallSide.position.set(-6.15, 1.5, 0); scene.add(wallSide);
  const stripe = box(12, 0.25, 0.32, mat(0x0f9d58)); stripe.position.set(0, 2.2, -5.14); scene.add(stripe);

  const stations = new Map<StationId, { group: THREE.Group; screen: THREE.MeshStandardMaterial; lamp: THREE.PointLight; ring: THREE.Mesh }>();
  const pickables: THREE.Object3D[] = [];
  const deskMat = mat(options.dark ? 0x475467 : 0xf2f4f7);
  for (const id of Object.keys(LAYOUT) as StationId[]) {
    const [x, z] = LAYOUT[id];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.station = id;
    const desk = box(2.2, 0.15, 1.1, deskMat); desk.position.y = 0.85; group.add(desk);
    for (const [lx, lz] of [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]]) {
      const leg = box(0.1, 0.8, 0.1, mat(0x667085)); leg.position.set(lx, 0.4, lz); group.add(leg);
    }
    const screen = mat(0x98a2b3, { emissive: 0x98a2b3, emissiveIntensity: 0.6 });
    const monitor = box(1.2, 0.75, 0.08, screen); monitor.position.set(0, 1.4, -0.3); group.add(monitor);
    const stand = box(0.1, 0.3, 0.1, mat(0x344054)); stand.position.set(0, 1.05, -0.3); group.add(stand);
    if (id === 'deps') for (let i = 0; i < 3; i++) {
      const rack = box(0.7, 1.9, 0.7, mat(0x101828, { emissive: 0x0f9d58, emissiveIntensity: 0.15 })); rack.position.set(-1.9 + i * 1.9 + (i === 1 ? 0 : 0), 0.95, -1.2); group.add(rack);
    }
    if (id === 'ceo') { const chair = box(0.7, 1.2, 0.15, mat(0x0f9d58)); chair.position.set(0, 0.9, 0.9); group.add(chair); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0x98a2b3, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; group.add(ring);
    const lamp = new THREE.PointLight(0x98a2b3, 0, 4); lamp.position.set(0, 1.8, 0.2); group.add(lamp);
    group.traverse(child => { child.userData.station = id; });
    pickables.push(group);
    stations.set(id, { group, screen, lamp, ring });
    scene.add(group);
  }

  // Karyawan AI: badan, kepala dan lencana perisai.
  const agent = new THREE.Group();
  const body = box(0.55, 0.8, 0.35, mat(0x1e5f8e)); body.position.y = 0.65; agent.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), mat(0xf2c9a0)); head.position.y = 1.32; head.castShadow = true; agent.add(head);
  const visor = box(0.4, 0.1, 0.05, mat(0x0f9d58, { emissive: 0x0f9d58, emissiveIntensity: 1 })); visor.position.set(0, 1.36, 0.25); agent.add(visor);
  const badge = box(0.16, 0.2, 0.04, mat(0xfdb022, { emissive: 0xfdb022, emissiveIntensity: 0.5 })); badge.position.set(0.12, 0.85, 0.19); agent.add(badge);
  scene.add(agent);
  const standPoint = (id: StationId) => new THREE.Vector3(LAYOUT[id][0], 0, LAYOUT[id][1] + 1.25);
  agent.position.copy(standPoint(PATROL[0]));

  let active: StationId | null = null;
  let target = 1;
  let pause = 0;
  let frame = 0;
  let needsRender = true;
  const clock = new THREE.Clock();

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Lantai isometrik selebar ±8 unit dan setinggi ±6 unit; pilih sisi yang membatasi.
    const halfWidth = Math.max(8.6, 6.4 * aspect);
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
      const point = new THREE.Vector3(LAYOUT[id][0], 2.3, LAYOUT[id][1]).project(camera);
      return { id, x: (point.x + 1) / 2 * rect.width, y: (1 - point.y) / 2 * rect.height };
    }));
  };

  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!options.reducedMotion) {
      const goal = standPoint(active ?? PATROL[target]);
      const step = goal.clone().sub(agent.position);
      if (step.length() > 0.05) {
        agent.position.add(step.clampLength(0, dt * 2.4));
        agent.rotation.y = Math.atan2(step.x, step.z);
        body.position.y = 0.65 + Math.abs(Math.sin(t * 9)) * 0.06;
      } else {
        agent.rotation.y = Math.PI;
        body.position.y = 0.65;
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
    if (hit?.object.userData.station) options.onSelect(hit.object.userData.station);
  };
  renderer.domElement.addEventListener('click', onClick);

  return {
    update(states) {
      for (const state of states) {
        const station = stations.get(state.id);
        if (!station) continue;
        const color = SEVERITY_COLOR[state.worst];
        station.screen.color.setHex(color);
        station.screen.emissive.setHex(color);
        station.lamp.color.setHex(color);
        station.lamp.intensity = state.worst === 'idle' ? 0 : state.worst === 'clear' ? 0.8 : 3;
        const ring = station.ring.material as THREE.MeshBasicMaterial;
        ring.color.setHex(color);
        station.ring.userData.on = state.worst === 'critical' || state.worst === 'high';
        ring.opacity = options.reducedMotion && station.ring.userData.on ? 0.6 : ring.opacity;
      }
      needsRender = true;
    },
    setActive(id) {
      active = id;
      if (options.reducedMotion) agent.position.copy(standPoint(id ?? 'ceo'));
      needsRender = true;
    },
    dispose() {
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
