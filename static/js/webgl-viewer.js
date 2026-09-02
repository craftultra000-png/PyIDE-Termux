const THREE = globalThis.THREE;

const DEFAULT_SCENE = {
  type: 'box',
  size: 2,
  color: '#4f8cff',
  autoRotate: true,
};

function normalizeScene(input) {
  const source = input && typeof input === 'object' ? input : {};
  const type = ['box', 'sphere', 'torus'].includes(source.type) ? source.type : DEFAULT_SCENE.type;
  const size = Math.min(20, Math.max(0.2, Number(source.size) || DEFAULT_SCENE.size));
  const color = typeof source.color === 'string' ? source.color : DEFAULT_SCENE.color;
  return {
    type,
    size,
    color,
    autoRotate: source.autoRotate !== false,
    background: typeof source.background === 'string' ? source.background : '#0d1722',
  };
}

function createGeometry(scene) {
  if (scene.type === 'sphere') return new THREE.SphereGeometry(scene.size * 0.58, 32, 20);
  if (scene.type === 'torus') return new THREE.TorusGeometry(scene.size * 0.48, scene.size * 0.16, 18, 48);
  return new THREE.BoxGeometry(scene.size, scene.size, scene.size);
}

export function createWebGLViewer(container, input) {
  if (!THREE) throw new Error('Three.js is unavailable');
  const sceneData = normalizeScene(input);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneData.background);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(3.4, 2.4, 4.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'webgl-canvas';
  renderer.domElement.setAttribute('aria-label', 'Interactive WebGL scene');
  container.replaceChildren(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xeaf2fb, 0x182633, 2.1);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(4, 5, 6);
  scene.add(key);
  const mesh = new THREE.Mesh(
    createGeometry(sceneData),
    new THREE.MeshStandardMaterial({ color: sceneData.color, roughness: 0.34, metalness: 0.12 }),
  );
  scene.add(mesh);

  let distance = 5.9;
  let yaw = 0.55;
  let pitch = 0.28;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let raf = 0;
  let disposed = false;

  const updateCamera = () => {
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
    camera.position.set(
      distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      distance * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(0, 0, 0);
  };

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(180, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const onPointerDown = event => {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    renderer.domElement.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = event => {
    if (!dragging) return;
    yaw -= (event.clientX - previousX) * 0.012;
    pitch += (event.clientY - previousY) * 0.012;
    previousX = event.clientX;
    previousY = event.clientY;
    updateCamera();
  };
  const onPointerUp = event => {
    dragging = false;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
  };
  const onWheel = event => {
    event.preventDefault();
    distance = Math.max(2.2, Math.min(12, distance + event.deltaY * 0.006));
    updateCamera();
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  updateCamera();
  resize();

  const animate = () => {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    if (sceneData.autoRotate && !dragging) mesh.rotation.y += 0.008;
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerUp);
    renderer.domElement.removeEventListener('wheel', onWheel);
    mesh.geometry.dispose();
    mesh.material.dispose();
    renderer.dispose();
    container.replaceChildren();
  };
}

export function parseWebGLScene(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : DEFAULT_SCENE;
  } catch {
    return DEFAULT_SCENE;
  }
}
