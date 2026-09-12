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
    label: 'Carousel projector', number: '04', type: 'Create · Present', title: 'PowerPoint Studio',
    copy: 'Turn a topic into an editable deck with curated layouts and AI-assisted copy.',
    href: '/ppt/', camera: [5.6, 3.2, 5.5], target: [3.55, 1.35, 0.8],
  },
};
stops.home = { label: 'Mac Pro', number: '05', type: 'Home Server · Owner only', title: 'Home Server', copy: 'Open the private server dashboard. Access is restricted to Feifan.', href: 'https://home.feifan.dev', camera: [8.5, 2.8, 3.8], target: [5.8, 1.1, -.45] };
const tourOrder = ['overview', 'seerr', 'jellyfin', 'discounts', 'ppt', 'home'];
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
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const camera = new THREE.PerspectiveCamera(43, 1, 0.3, 60);
  camera.position.fromArray(stops.overview.camera);
  const cameraTarget = new THREE.Vector3().fromArray(stops.overview.target);
  const desiredPosition = camera.position.clone();
  const desiredTarget = cameraTarget.clone();
  const basePosition = camera.position.clone();
  const baseTarget = cameraTarget.clone();

  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .05, ...options });
  const box = (size, position, material, parent = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = false; parent.add(mesh); return mesh;
  };
  const markInteractive = (group, stop) => group.traverse((child) => { if (child.isMesh) child.userData.stop = stop; });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), standard(0x8b7055, { roughness: .9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true; scene.add(floor);
  box([20, 7, .22], [0, 3.5, -4.25], standard(0x31584d));
  box([.22, 7, 16], [-7.2, 3.5, 1.8], standard(0x284c42));
  box([20, .16, .28], [0, .1, -4.05], standard(0xb5966e));

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 4.6), standard(0x9b513f, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(.3, .04, .65); rug.receiveShadow = true; scene.add(rug);
  for (let i = -4; i <= 4; i += 1) box([.025, .012, 4.2], [i * .82 + .3, .06, .65], standard(0xd8a26f), scene);

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
    context.fillStyle = colors.foreground || '#f3f0e7'; context.font = '500 48px system-ui'; context.fillText(lines[1], 320, 190);
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

  // Kodak-style carousel projector: low body, horizontal slide tray, front lens.
  const projector = new THREE.Group(); projector.position.set(3.45, 0, .8); scene.add(projector);
  box([2.8, .16, 2.1], [0, .9, 0], standard(0x885d3c), projector);
  for (const x of [-1.15, 1.15]) for (const z of [-.8, .8]) box([.12, .9, .12], [x, .45, z], standard(0x553c2f), projector);
  const housing = standard(0x56646d, { roughness: .4, metalness: .25 });
  box([2.05, .52, 1.85], [0, 1.36, 0], housing, projector);
  box([2.07, .08, 1.87], [0, 1.06, 0], standard(0x303b42), projector);
  const tray = new THREE.Group(); tray.position.set(0, 1.7, -.06); projector.add(tray);
  const trayBlack = standard(0x161b1d);
  function annulus(outer, inner, height, material, parent) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 80 });
    const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; parent.add(mesh); return mesh;
  }
  annulus(.91, .38, .13, trayBlack, tray);
  const clear = standard(0xdce9ed, { transparent: true, opacity: .24, metalness: .15, roughness: .2, depthWrite: false });
  annulus(.91, .88, .34, clear, tray).position.y = .14;
  annulus(.42, .39, .34, clear, tray).position.y = .14;
  for (let i = 0; i < 80; i++) {
    const angle = i * Math.PI / 40;
    const slot = box([.45, .29, .009], [Math.cos(angle) * .65, .29, Math.sin(angle) * .65], standard(0xc5d1d3, { roughness: .45 }), tray);
    slot.rotation.y = -angle;
  }
  // Separate clear cover from the slots; fixed order avoids transparency sorting flicker.
  const lid = annulus(.92, .39, .018, clear, tray); lid.position.y = .48;
  tray.traverse((object) => { if (object.isMesh) { object.castShadow = false; if (object.material.transparent) object.renderOrder = 2; } });
  box([.73, .57, .06], [-.58, 1.28, .95], standard(0x151a1d), projector);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(.25, .27, .16, 40), trayBlack); lens.rotation.x = Math.PI / 2; lens.position.set(-.58, 1.27, 1.02); projector.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(.21, 40), standard(0x10242a, { metalness: .85, roughness: .08 })); glass.position.set(-.58, 1.27, 1.11); projector.add(glass);
  box([1.05, .12, .1], [.43, 1.18, 1.0], trayBlack, projector);
  for (const x of [-.05, .9]) box([.08, .17, .08], [x, 1.25, 1.0], trayBlack, projector);
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 768; labelCanvas.height = 90;
  const labelContext = labelCanvas.getContext('2d'); labelContext.fillStyle = '#56646d'; labelContext.fillRect(0,0,768,90); labelContext.fillStyle = '#f5f5ef'; labelContext.font = '32px system-ui'; labelContext.fillText('Kodak CAROUSEL S-AV 2010', 12, 55);
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  box([1.13, .15, .015], [.35, 1.49, .946], standard(0xffffff, { map: labelTexture }), projector);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .14, 24), trayBlack); knob.rotation.z = Math.PI / 2; knob.position.set(-1.08,1.24,.62); projector.add(knob);
  markInteractive(projector, 'ppt');

  // Aluminum tower with handles, feet, and perforated front grille.
  const mac = new THREE.Group(); mac.position.set(5.8, 0, -.45); scene.add(mac);
  const aluminum = standard(0xbfc6c7, { metalness: .65, roughness: .35 });
  box([.95, 1.9, 1.3], [0, 1.13, 0], aluminum, mac);
  for (const x of [-.37, .37]) {
    box([.09, .24, 1.05], [x, .14, 0], aluminum, mac);
    box([.09, .1, .85], [x, 2.27, 0], aluminum, mac);
    for (const z of [-.38, .38]) box([.09, .2, .09], [x, 2.17, z], aluminum, mac);
  }
  box([.83, 1.72, .025], [0, 1.1, .665], standard(0x7c898d), mac);
  const holeGeometry = new THREE.CircleGeometry(.043, 8);
  const holeMaterial = standard(0x253333);
  for (let row = 0; row < 17; row++) for (let col = 0; col < 7; col++) {
    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.position.set(-.33 + col * .105 + (row % 2) * .035, .32 + row * .096, .683); mac.add(hole);
  }
  box([.04, .025, .025], [.3, 1.97, .68], standard(0xbfe5c9, { emissive: 0x90cba7, emissiveIntensity: .5 }), mac);
  markInteractive(mac, 'home');

  const lamp = new THREE.Group(); lamp.position.set(-3.5, 0, 2.6); scene.add(lamp);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 3.4, 12), standard(0xc8ad72, { metalness: .55 })); lampPole.position.y = 1.7; lamp.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(.42, .72, .75, 24, 1, true), standard(0xe5c98a, { side: THREE.DoubleSide, emissive: 0xb98242, emissiveIntensity: .25 })); lampShade.position.y = 3.35; lamp.add(lampShade);
  const lampLight = new THREE.PointLight(0xffd39a, 28, 9, 1.8); lampLight.position.set(-3.5, 3.15, 2.4); lampLight.castShadow = false; scene.add(lampLight);
  scene.add(new THREE.HemisphereLight(0xbad9d0, 0x5d4230, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffead0, 3.1); keyLight.position.set(2, 7, 5); keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -10; keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 8; keyLight.shadow.camera.bottom = -8;
  keyLight.shadow.camera.near = .5; keyLight.shadow.camera.far = 30;
  keyLight.shadow.bias = -.0004; keyLight.shadow.normalBias = .035;
  keyLight.shadow.camera.updateProjectionMatrix(); scene.add(keyLight);

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
