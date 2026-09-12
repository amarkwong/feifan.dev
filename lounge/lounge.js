import * as THREE from './vendor/three.module.js';

const canvas = document.querySelector('#lounge-canvas');
const intro = document.querySelector('#intro');
const serviceCard = document.querySelector('#service-card');
const statusPanel = document.querySelector('#scene-status');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stops = {
  overview: {
    label: 'Overview', number: 'Room', title: 'Feifan’s Lounge',
    copy: 'Drag to look around, scroll to zoom, or select an object.',
    camera: [8.8, 5.6, 11.5], target: [0, 1.7, -0.8],
  },
  seerr: {
    label: 'DVD cabinet', number: '01', type: 'Browse · Request', title: 'Seerr',
    copy: 'Browse the shelves, then request a film or series for the shared library.',
    href: 'https://seerr.feifan.dev', camera: [-6.2, 3.1, 3.4], target: [-4.25, 1.9, -2.5],
  },
  jellyfin: {
    label: 'Television', number: '02', type: 'Watch · Continue', title: 'Jellyfin',
    copy: 'Settle into the sofa and open the shared film and television library.',
    href: 'https://jellyfin.feifan.dev', camera: [0.4, 3.2, 4.8], target: [0, 2.05, -3.72],
  },
  discounts: {
    label: 'Pin board', number: '03', type: 'Save · Compare', title: 'Discount Tracker',
    copy: 'See the gift-card offers pinned up today and find the ones worth using.',
    href: 'https://discounts.feifan.dev', camera: [6.35, 3.15, 2.4], target: [4.45, 2.25, -3.62],
  },
  ppt: {
    label: 'Slide carousel', number: '04', type: 'Create · Present', title: 'PowerPoint Studio',
    copy: 'Turn a topic into an editable deck with curated layouts and AI-assisted copy.',
    href: '/ppt/', camera: [5.6, 3.2, 5.5], target: [3.55, 1.35, 0.8],
  },
};
const tourOrder = ['overview', 'seerr', 'jellyfin', 'discounts', 'ppt'];
let currentStop = 'overview';
let renderer;

function showFallback() {
  document.querySelector('#webgl-message').hidden = false;
  canvas.hidden = true;
  document.querySelector('.hotspot-list').hidden = true;
  document.querySelector('.tour-controls').hidden = true;
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (error) {
  console.warn('[Lounge] WebGL unavailable', error);
  showFallback();
}

if (renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x112b25, 0.032);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  camera.position.fromArray(stops.overview.camera);
  const cameraTarget = new THREE.Vector3().fromArray(stops.overview.target);
  const desiredPosition = camera.position.clone();
  const desiredTarget = cameraTarget.clone();
  const basePosition = camera.position.clone();
  const baseTarget = cameraTarget.clone();

  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .05, ...options });
  const box = (size, position, material, parent = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const markInteractive = (group, stop) => group.traverse((child) => { if (child.isMesh) child.userData.stop = stop; });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), standard(0x8b7055, { roughness: .9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true; scene.add(floor);
  box([20, 7, .22], [0, 3.5, -4.25], standard(0x31584d));
  box([.22, 7, 16], [-7.2, 3.5, 1.8], standard(0x284c42));
  box([20, .16, .28], [0, .1, -4.05], standard(0xb5966e));

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 4.6), standard(0x9b513f, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(.3, .015, .65); rug.receiveShadow = true; scene.add(rug);
  for (let i = -4; i <= 4; i += 1) box([.025, .012, 4.2], [i * .82 + .3, .03, .65], standard(0xd8a26f), scene);

  const windowGroup = new THREE.Group(); windowGroup.position.set(-1.8, 3.35, -4.05); scene.add(windowGroup);
  box([3.2, 2.45, .14], [0, 0, 0], standard(0x172b2b), windowGroup);
  box([2.82, 2.08, .16], [0, 0, .1], standard(0xe1a26e, { emissive: 0xb55a45, emissiveIntensity: .42 }), windowGroup);
  box([.12, 2.1, .2], [0, 0, .22], standard(0x25463d), windowGroup);
  box([2.85, .12, .2], [0, 0, .22], standard(0x25463d), windowGroup);
  const windowLight = new THREE.RectAreaLight(0xffb37f, 4.5, 4, 3); windowLight.position.set(-1.8, 3.3, -3.7); windowLight.lookAt(0, 1, 1); scene.add(windowLight);

  const sofa = new THREE.Group(); sofa.position.set(-.2, 0, 2.25); scene.add(sofa);
  box([5.1, .7, 1.45], [0, .62, 0], standard(0xa9b693), sofa);
  box([5.1, 1.35, .48], [0, 1.15, .57], standard(0xc7cfb5), sofa);
  box([.45, .95, 1.55], [-2.55, .83, 0], standard(0x879d79), sofa); box([.45, .95, 1.55], [2.55, .83, 0], standard(0x879d79), sofa);
  box([2.2, .48, 1.25], [-1.15, 1.05, -.05], standard(0xb7c3a3), sofa); box([2.2, .48, 1.25], [1.15, 1.05, -.05], standard(0xb7c3a3), sofa);
  box([.7, .7, .22], [-1.45, 1.65, .78], standard(0xc9785c), sofa); box([.75, .6, .22], [1.55, 1.58, .78], standard(0xd7b66f), sofa);

  const cabinet = new THREE.Group(); cabinet.position.set(-4.7, 0, -2.65); scene.add(cabinet);
  box([2.45, 4.2, .82], [0, 2.1, 0], standard(0x704b32), cabinet);
  box([2.15, 3.82, .86], [0, 2.12, .08], standard(0x193a32), cabinet);
  const dvdColors = [0xd8795b, 0xe1bd78, 0x7b9b8b, 0xc9d5bd, 0x9c6b75, 0xd8a26f];
  for (let shelf = 0; shelf < 5; shelf += 1) {
    box([2.18, .12, 1], [0, .55 + shelf * .77, .1], standard(0x8a6040), cabinet);
    for (let item = 0; item < 8; item += 1) {
      const height = .42 + ((item + shelf) % 3) * .08;
      box([.17, height, .72], [-.86 + item * .245, .83 + shelf * .77, .2], standard(dvdColors[(item + shelf) % dvdColors.length]), cabinet);
    }
  }
  markInteractive(cabinet, 'seerr');

  function textTexture(lines, colors = {}) {
    const board = document.createElement('canvas'); board.width = 640; board.height = 360;
    const context = board.getContext('2d'); context.fillStyle = colors.background || '#142c28'; context.fillRect(0, 0, board.width, board.height);
    context.textAlign = 'center'; context.fillStyle = colors.accent || '#e1bd78'; context.font = '700 28px system-ui'; context.fillText(lines[0], 320, 115);
    context.fillStyle = colors.foreground || '#f3f0e7'; context.font = '52px Georgia'; context.fillText(lines[1], 320, 190);
    if (lines[2]) { context.fillStyle = colors.muted || '#aabbb2'; context.font = '24px system-ui'; context.fillText(lines[2], 320, 240); }
    const texture = new THREE.CanvasTexture(board); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  const tv = new THREE.Group(); tv.position.set(.45, 0, -3.73); scene.add(tv);
  box([4.5, .55, 1.05], [0, .45, .12], standard(0x553c2f), tv);
  box([3.8, 2.45, .35], [0, 2.15, 0], standard(0x101917, { metalness: .35 }), tv);
  const tvScreen = box([3.48, 2.12, .09], [0, 2.15, .205], standard(0xffffff, { map: textTexture(['THE SHARED LIBRARY', 'Jellyfin', 'Press play to continue']), emissive: 0x315870, emissiveIntensity: .3 }), tv);
  tvScreen.material.map.colorSpace = THREE.SRGBColorSpace;
  box([.08, .5, .08], [-1.05, .8, .12], standard(0x202a27), tv); box([.08, .5, .08], [1.05, .8, .12], standard(0x202a27), tv);
  markInteractive(tv, 'jellyfin');

  const pinboard = new THREE.Group(); pinboard.position.set(4.65, 2.4, -3.9); scene.add(pinboard);
  box([3.05, 2.5, .18], [0, 0, 0], standard(0x744d32), pinboard);
  box([2.72, 2.18, .2], [0, 0, .1], standard(0xb98255, { roughness: 1 }), pinboard);
  const cardData = [
    [-.82, .48, .05, 0xecd36f], [.15, .62, -.05, 0xd8795b], [.82, .3, .06, 0x91b6a0],
    [-.58, -.5, -.04, 0xf1eee2], [.45, -.48, .04, 0xd9b1b5], [1.0, -.55, -.07, 0xc5d1aa],
  ];
  cardData.forEach(([x, y, rotation, color], index) => {
    const giftCard = box([.72, .46, .035], [x, y, .225], standard(color), pinboard); giftCard.rotation.z = rotation;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), standard(index % 2 ? 0xe8bd55 : 0x8d3245)); pin.position.set(x, y + .18, .27); pinboard.add(pin);
  });
  markInteractive(pinboard, 'discounts');

  const carousel = new THREE.Group(); carousel.position.set(3.45, 0, .8); scene.add(carousel);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.85, .32, 48), standard(0x9a704c, { metalness: .2 })); base.position.y = .18; base.castShadow = true; carousel.add(base);
  const carouselSpin = new THREE.Group(); carouselSpin.position.y = .42; carousel.add(carouselSpin);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 2.7, 16), standard(0xd3b66f, { metalness: .65 })); pole.position.y = 1.25; carouselSpin.add(pole);
  const slideMaterials = [
    textTexture(['LAYOUT 01', 'Clear ideas', 'An editable slide deck'], { background: '#f3f0e7', foreground: '#203d36', accent: '#56715e', muted: '#66776f' }),
    textTexture(['LAYOUT 02', 'Tell the story', 'Designed to be changed'], { background: '#7e2838', foreground: '#fff8ef', accent: '#e1bd78', muted: '#edd9d0' }),
    textTexture(['LAYOUT 03', 'Make it yours', 'AI-assisted content'], { background: '#203d36', foreground: '#fffdf8', accent: '#e1bd78', muted: '#dfe7da' }),
    textTexture(['LAYOUT 04', 'Present well', 'Download as PowerPoint'], { background: '#d8a06c', foreground: '#203d36', accent: '#7e2838', muted: '#4f625a' }),
  ];
  slideMaterials.forEach((texture, index) => {
    const angle = index * Math.PI / 2;
    const slide = box([1.75, 1.02, .07], [Math.cos(angle) * 1.15, 1.55, Math.sin(angle) * 1.15], standard(0xffffff, { map: texture }), carouselSpin);
    slide.rotation.y = -angle + Math.PI / 2;
  });
  markInteractive(carousel, 'ppt');

  const lamp = new THREE.Group(); lamp.position.set(6, 0, 2.6); scene.add(lamp);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 3.4, 12), standard(0xc8ad72, { metalness: .55 })); lampPole.position.y = 1.7; lamp.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(.42, .72, .75, 24, 1, true), standard(0xe5c98a, { side: THREE.DoubleSide, emissive: 0xb98242, emissiveIntensity: .25 })); lampShade.position.y = 3.35; lamp.add(lampShade);
  const lampLight = new THREE.PointLight(0xffd39a, 28, 9, 1.8); lampLight.position.set(6, 3.15, 2.4); lampLight.castShadow = true; scene.add(lampLight);
  scene.add(new THREE.HemisphereLight(0xbad9d0, 0x5d4230, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffead0, 3.1); keyLight.position.set(2, 7, 5); keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024); scene.add(keyLight);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart = null;
  let dragDistance = 0;
  let yawOffset = 0;
  let pitchOffset = 0;
  let zoomFactor = 1;
  let lastTime = performance.now();

  function updateInterface(stopKey, showCard = stopKey !== 'overview') {
    const stop = stops[stopKey]; currentStop = stopKey;
    document.querySelector('#status-number').textContent = stop.number;
    document.querySelector('#status-title').textContent = stop.title;
    document.querySelector('#status-copy').textContent = stop.copy;
    document.querySelector('#tour-position').textContent = stop.label;
    statusPanel.classList.toggle('is-visible', stopKey !== 'overview');
    intro.classList.toggle('is-hidden', stopKey !== 'overview');
    document.querySelectorAll('[data-stop]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.stop === stopKey)));
    if (showCard && stop.href) {
      document.querySelector('#card-type').textContent = stop.type;
      document.querySelector('#card-title').textContent = stop.title;
      document.querySelector('#card-copy').textContent = stop.copy;
      document.querySelector('#card-link').href = stop.href;
      serviceCard.hidden = false;
    } else {
      serviceCard.hidden = true;
    }
  }

  function goTo(stopKey, showCard = stopKey !== 'overview') {
    const stop = stops[stopKey];
    basePosition.fromArray(stop.camera); baseTarget.fromArray(stop.target);
    desiredPosition.copy(basePosition); desiredTarget.copy(baseTarget);
    yawOffset = 0; pitchOffset = 0; zoomFactor = 1;
    updateInterface(stopKey, showCard);
  }

  function stepTour(direction) {
    const currentIndex = tourOrder.indexOf(currentStop);
    goTo(tourOrder[(currentIndex + direction + tourOrder.length) % tourOrder.length]);
  }

  document.querySelector('#start-tour').addEventListener('click', () => goTo('seerr'));
  document.querySelector('#tour-next').addEventListener('click', () => stepTour(1));
  document.querySelector('#tour-previous').addEventListener('click', () => stepTour(-1));
  document.querySelector('#card-close').addEventListener('click', () => { serviceCard.hidden = true; canvas.focus(); });
  document.querySelectorAll('[data-stop]').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.stop)));

  canvas.addEventListener('pointerdown', (event) => { pointerStart = { x: event.clientX, y: event.clientY }; dragDistance = 0; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerStart || !canvas.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - pointerStart.x; const dy = event.clientY - pointerStart.y;
    dragDistance += Math.hypot(dx, dy);
    yawOffset = THREE.MathUtils.clamp(yawOffset - dx * .003, -.5, .5);
    pitchOffset = THREE.MathUtils.clamp(pitchOffset + dy * .002, -.2, .24);
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    canvas.releasePointerCapture(event.pointerId); pointerStart = null;
    if (dragDistance > 5) return;
    const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, true).find((result) => result.object.userData.stop);
    if (hit) goTo(hit.object.userData.stop);
  });
  canvas.addEventListener('wheel', (event) => { zoomFactor = THREE.MathUtils.clamp(zoomFactor + event.deltaY * .0007, .72, 1.35); }, { passive: true });

  function resize() {
    const width = canvas.clientWidth; const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    }
  }

  function animate(time) {
    resize();
    const elapsed = Math.min((time - lastTime) / 1000, .1); lastTime = time;
    if (!reducedMotion) carouselSpin.rotation.y += elapsed * .25;
    const orbit = basePosition.clone().sub(baseTarget);
    orbit.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
    orbit.multiplyScalar(zoomFactor);
    const side = new THREE.Vector3().crossVectors(orbit, new THREE.Vector3(0, 1, 0)).normalize();
    orbit.applyAxisAngle(side, pitchOffset);
    desiredPosition.copy(baseTarget).add(orbit); desiredTarget.copy(baseTarget);
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-elapsed * 4.5);
    camera.position.lerp(desiredPosition, smoothing); cameraTarget.lerp(desiredTarget, smoothing);
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  updateInterface('overview', false);
  requestAnimationFrame(animate);
}
