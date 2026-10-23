const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const SIDES = [4, 6, 8, 10, 12, 20];
const MAX_DICE = 14;

const state = {
  pool: { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 1 },
  modifier: 0,
  rolling: false,
  sound: false,
  history: loadHistory(),
};

const elements = {
  canvas: document.querySelector("#diceCanvas"),
  tabletop: document.querySelector("#tabletop"),
  dicePool: document.querySelector("#dicePool"),
  modifier: document.querySelector("#modifier"),
  poolFormula: document.querySelector("#poolFormula"),
  rollButton: document.querySelector("#rollButton"),
  resetPool: document.querySelector("#resetPool"),
  resultCard: document.querySelector("#resultCard"),
  resultTitle: document.querySelector("#resultTitle"),
  resultTotal: document.querySelector("#resultTotal"),
  resultFormula: document.querySelector("#resultFormula"),
  resultValues: document.querySelector("#resultValues"),
  closeResult: document.querySelector("#closeResult"),
  sceneHint: document.querySelector("#sceneHint"),
  fallbackMessage: document.querySelector("#fallbackMessage"),
  renderStatus: document.querySelector("#renderStatus"),
  historyList: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory"),
  rollCount: document.querySelector("#rollCount"),
  bestRoll: document.querySelector("#bestRoll"),
  soundToggle: document.querySelector("#soundToggle"),
};

function normalizeHistoryItem(item) {
  if (!item || !Number.isFinite(Number(item.total))) return null;
  const parsedDate = new Date(item.timestamp);
  const timestamp = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  if (Array.isArray(item.pools)) {
    const pools = item.pools
      .map((pool) => ({
        sides: Number(pool.sides),
        count: Number(pool.count),
        rolls: Array.isArray(pool.rolls) ? pool.rolls.map(Number).filter(Number.isFinite) : [],
      }))
      .filter((pool) => SIDES.includes(pool.sides) && pool.count > 0);
    if (!pools.length) return null;
    return {
      id: Number(item.id) || Date.now(),
      pools,
      total: Number(item.total),
      modifier: Number(item.modifier) || 0,
      timestamp,
      critical: Boolean(item.critical),
    };
  }
  if (SIDES.includes(Number(item.sides))) {
    const rolls = Array.isArray(item.rolls) ? item.rolls.map(Number).filter(Number.isFinite) : [];
    return {
      id: Number(item.id) || Date.now(),
      pools: [{ sides: Number(item.sides), count: Number(item.quantity) || rolls.length || 1, rolls }],
      modifier: Number(item.modifier) || 0,
      total: Number(item.total),
      timestamp,
      critical: Boolean(item.critical),
    };
  }
  return null;
}

function loadHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem("vp-dice-history"));
    return Array.isArray(stored) ? stored.map(normalizeHistoryItem).filter(Boolean).slice(0, 15) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem("vp-dice-history", JSON.stringify(state.history));
}

function randomDie(sides) {
  const range = 0x100000000;
  const limit = range - (range % sides);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return (values[0] % sides) + 1;
}

function signed(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function totalDice() {
  return SIDES.reduce((total, sides) => total + state.pool[sides], 0);
}

function poolParts(pool = state.pool) {
  return SIDES.filter((sides) => pool[sides] > 0).map((sides) => `${pool[sides]}D${sides}`);
}

function poolFormula(pool = state.pool, modifier = state.modifier) {
  const parts = poolParts(pool);
  if (modifier) parts.push(signed(modifier));
  return parts.length ? parts.join(" + ").replace("+ -", "− ") : "Sin dados";
}

function updateControls({ refreshScene = true } = {}) {
  document.querySelectorAll(".die-control").forEach((control) => {
    const sides = Number(control.dataset.sides);
    control.querySelector("output").textContent = state.pool[sides];
    control.classList.toggle("active", state.pool[sides] > 0);
  });
  elements.modifier.textContent = signed(state.modifier);
  elements.poolFormula.textContent = poolFormula();
  elements.rollButton.disabled = state.rolling || totalDice() === 0;
  if (refreshScene && engine.ready && !state.rolling) engine.preview(expandPool(false));
}

function adjustDie(sides, delta) {
  const current = state.pool[sides];
  if (delta > 0 && totalDice() >= MAX_DICE) {
    elements.sceneHint.innerHTML = `<span aria-hidden="true">✦</span> Máximo ${MAX_DICE} dados por tirada`;
    return;
  }
  state.pool[sides] = Math.max(0, Math.min(10, current + delta));
  elements.resultCard.hidden = true;
  elements.sceneHint.innerHTML = '<span aria-hidden="true">✦</span> Reserva actualizada';
  updateControls();
}

function expandPool(withResults) {
  const dice = [];
  SIDES.forEach((sides) => {
    for (let index = 0; index < state.pool[sides]; index += 1) {
      dice.push({ sides, result: withResults ? randomDie(sides) : sides });
    }
  });
  return dice;
}

function playRollSound() {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  [0, .08, .14, .21, .3].forEach((delay, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index % 2 ? "triangle" : "sine";
    oscillator.frequency.value = 95 + index * 27 + Math.random() * 20;
    gain.gain.setValueAtTime(.04, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + delay + .1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + .11);
  });
  setTimeout(() => context.close(), 850);
}

function finishRoll(dice, pools, total, formula, isCritical, isFumble) {
  state.rolling = false;
  elements.rollButton.disabled = false;
  elements.resultTitle.textContent = isCritical ? "¡Crítico!" : isFumble ? "Pifia arcana" : "Resultado";
  elements.resultTotal.textContent = total;
  elements.resultFormula.textContent = formula;
  elements.resultValues.innerHTML = dice.map((die) => `<span><i>D${die.sides}</i><b>${die.result}</b></span>`).join("");
  elements.resultCard.hidden = false;
  elements.resultCard.classList.toggle("critical", isCritical);
  elements.resultCard.classList.toggle("fumble", isFumble);
  elements.sceneHint.innerHTML = '<span aria-hidden="true">✦</span> Los dados han hablado';

  state.history.unshift({
    id: Date.now(),
    pools,
    modifier: state.modifier,
    total,
    formula,
    dice: dice.map((die) => ({ sides: die.sides, result: die.result })),
    timestamp: new Date().toISOString(),
    critical: isCritical,
  });
  state.history = state.history.slice(0, 15);
  saveHistory();
  renderHistory();
}

function roll() {
  if (state.rolling || totalDice() === 0) return;
  state.rolling = true;
  elements.rollButton.disabled = true;
  elements.resultCard.hidden = true;
  elements.sceneHint.innerHTML = '<span aria-hidden="true">✦</span> Lanzando…';
  playRollSound();

  const dice = expandPool(true);
  const pools = SIDES.filter((sides) => state.pool[sides] > 0).map((sides) => ({
    sides,
    count: state.pool[sides],
    rolls: dice.filter((die) => die.sides === sides).map((die) => die.result),
  }));
  const subtotal = dice.reduce((sum, die) => sum + die.result, 0);
  const total = subtotal + state.modifier;
  const formula = poolFormula();
  const d20Rolls = dice.filter((die) => die.sides === 20).map((die) => die.result);
  const isCritical = d20Rolls.includes(20);
  const isFumble = d20Rolls.length > 0 && d20Rolls.every((value) => value === 1);
  const complete = () => finishRoll(dice, pools, total, formula, isCritical, isFumble);

  if (engine.ready) engine.roll(dice, complete);
  else setTimeout(complete, 700);
}

function itemFormula(item) {
  const parts = item.pools.map((pool) => `${pool.count}D${pool.sides}`);
  if (item.modifier) parts.push(signed(item.modifier));
  return parts.join(" + ").replace("+ -", "− ");
}

function itemDetails(item) {
  return item.pools.map((pool) => `D${pool.sides}: ${pool.rolls.join(", ")}`).join(" · ");
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function isToday(timestamp) {
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `
      <div class="empty-history">
        <i aria-hidden="true">?</i>
        <strong>Aún no hay tiradas</strong>
        <p>Construye una reserva y lanza los dados para comenzar tu crónica.</p>
      </div>`;
  } else {
    elements.historyList.innerHTML = state.history.map((item) => `
      <article class="history-item${item.critical ? " critical" : ""}">
        <div class="history-meta">
          <span class="history-formula" title="${itemFormula(item)}">${itemFormula(item)}</span>
          <time datetime="${item.timestamp}">${formatTime(item.timestamp)}</time>
        </div>
        <div class="history-result">
          <span title="${itemDetails(item)}">${item.pools.reduce((sum, pool) => sum + pool.count, 0)} dados</span>
          <strong>${item.total}</strong>
        </div>
      </article>`).join("");
  }
  const today = state.history.filter((item) => isToday(item.timestamp));
  elements.rollCount.textContent = today.length;
  elements.bestRoll.textContent = today.length ? Math.max(...today.map((item) => item.total)) : "—";
}

const engine = {
  ready: false,
  THREE: null,
  scene: null,
  camera: null,
  renderer: null,
  dice: [],
  rolling: false,
  rollStartedAt: 0,
  onComplete: null,
  clock: null,
  resizeObserver: null,
  faceMaterialCache: new Map(),
  showingResult: false,

  geometryFor(sides) {
    const THREE = this.THREE;
    if (sides === 4) return new THREE.TetrahedronGeometry(1.04, 0);
    if (sides === 6) return new THREE.BoxGeometry(1.62, 1.62, 1.62, 1, 1, 1);
    if (sides === 8) return new THREE.OctahedronGeometry(1.16, 0);
    if (sides === 10) {
      const geometry = new THREE.SphereGeometry(1.16, 5, 2);
      geometry.scale(1, 1.22, 1);
      return geometry;
    }
    if (sides === 12) return new THREE.DodecahedronGeometry(1.12, 0);
    return new THREE.IcosahedronGeometry(1.18, 0);
  },

  faceMaterial(value, highlighted = false) {
    const THREE = this.THREE;
    const materialKey = `${value}:${highlighted ? "result" : "face"}`;
    if (this.faceMaterialCache.has(materialKey)) return this.faceMaterialCache.get(materialKey);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, 256, 256);
    if (highlighted) {
      const glow = context.createRadialGradient(128, 128, 22, 128, 128, 112);
      glow.addColorStop(0, "rgba(255, 215, 122, .34)");
      glow.addColorStop(.62, "rgba(151, 65, 255, .3)");
      glow.addColorStop(1, "rgba(74, 20, 145, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, 256, 256);
      context.beginPath();
      context.arc(128, 128, 93, 0, Math.PI * 2);
      context.strokeStyle = "rgba(255, 224, 150, .78)";
      context.lineWidth = 6;
      context.stroke();
    }
    context.shadowColor = highlighted ? "rgba(255, 206, 101, .9)" : "rgba(15, 0, 40, .95)";
    context.shadowBlur = highlighted ? 22 : 15;
    context.lineWidth = 7;
    context.strokeStyle = "rgba(35, 8, 70, .7)";
    context.fillStyle = highlighted ? "#ffe7a3" : "#fff9ff";
    context.font = `700 ${String(value).length > 1 ? 108 : 138}px Inter, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.strokeText(String(value), 128, 132);
    context.fillText(String(value), 128, 132);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: .05,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.userData.sharedFaceLabel = true;
    this.faceMaterialCache.set(materialKey, material);
    return material;
  },

  geometryFaces(geometry) {
    const THREE = this.THREE;
    const workingGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = workingGeometry.getAttribute("position");
    const groupedFaces = new Map();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeOne = new THREE.Vector3();
    const edgeTwo = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();

    for (let index = 0; index < position.count; index += 3) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      c.fromBufferAttribute(position, index + 2);
      edgeOne.subVectors(b, a);
      edgeTwo.subVectors(c, a);
      normal.crossVectors(edgeOne, edgeTwo).normalize();
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (normal.dot(center) < 0) normal.negate();
      const planeDistance = normal.dot(center);
      const rounded = (value) => (Math.abs(value) < .005 ? "0.00" : value.toFixed(2));
      const key = `${rounded(normal.x)}:${rounded(normal.y)}:${rounded(normal.z)}:${rounded(planeDistance)}`;
      if (!groupedFaces.has(key)) groupedFaces.set(key, { normal: normal.clone(), vertices: new Map() });
      const face = groupedFaces.get(key);
      [a, b, c].forEach((vertex) => {
        const vertexKey = `${vertex.x.toFixed(4)}:${vertex.y.toFixed(4)}:${vertex.z.toFixed(4)}`;
        if (!face.vertices.has(vertexKey)) face.vertices.set(vertexKey, vertex.clone());
      });
    }

    const faces = [...groupedFaces.values()].map((face) => {
      const faceCenter = new THREE.Vector3();
      face.vertices.forEach((vertex) => faceCenter.add(vertex));
      faceCenter.multiplyScalar(1 / face.vertices.size);
      return { normal: face.normal, center: faceCenter };
    });
    if (workingGeometry !== geometry) workingGeometry.dispose();
    return faces;
  },

  createFaceLabels(geometry, sides, result) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const labelSizes = { 4: .57, 6: .72, 8: .54, 10: .48, 12: .43, 20: .38 };
    const size = labelSizes[sides];
    const numbers = [result, ...Array.from({ length: sides }, (_, index) => index + 1).filter((value) => value !== result)];
    const outward = new THREE.Vector3(0, 0, 1);
    const detectedFaces = this.geometryFaces(geometry);
    const faces = detectedFaces.slice(0, sides);
    if (faces.length !== sides) console.warn(`D${sides}: se detectaron ${faces.length} de ${sides} caras`);

    faces.forEach((face, index) => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        this.faceMaterial(numbers[index], index === 0),
      );
      plane.position.copy(face.center).addScaledVector(face.normal, .045);
      plane.quaternion.setFromUnitVectors(outward, face.normal);
      plane.renderOrder = 6;
      group.add(plane);
    });
    group.userData.resultNormal = faces[0]?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
    group.userData.faceCount = faces.length;
    return group;
  },

  makeDie(die, index, count) {
    const THREE = this.THREE;
    const scale = count <= 4 ? 1.04 : count <= 8 ? .86 : .7;
    const group = new THREE.Group();
    const geometry = this.geometryFor(die.sides);
    const hues = { 4: 0x8e42f5, 6: 0x7332e8, 8: 0x9b3ff2, 10: 0x6129ca, 12: 0x8237e6, 20: 0x7029d8 };
    const material = new THREE.MeshPhysicalMaterial({
      color: hues[die.sides],
      emissive: 0x170331,
      emissiveIntensity: .42,
      metalness: .34,
      roughness: .18,
      clearcoat: .9,
      clearcoatRoughness: .18,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 18),
      new THREE.LineBasicMaterial({ color: 0xd7b0ff, transparent: true, opacity: .38 }),
    );
    const faceLabels = this.createFaceLabels(geometry, die.sides, die.result);
    group.add(mesh, edges, faceLabels);
    group.scale.setScalar(scale);
    group.userData = {
      index,
      sides: die.sides,
      result: die.result,
      radius: 1.05 * scale,
      velocity: new THREE.Vector3(),
      angular: new THREE.Vector3(),
      target: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      resultNormal: faceLabels.userData.resultNormal.clone(),
      idlePhase: Math.random() * Math.PI * 2,
    };
    return group;
  },

  targetPositions(count) {
    const THREE = this.THREE;
    const columns = Math.ceil(Math.sqrt(count * 1.5));
    const rows = Math.ceil(count / columns);
    const spacingX = count > 8 ? 2.05 : 2.45;
    const spacingZ = count > 8 ? 1.85 : 2.2;
    return Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return new THREE.Vector3(
        (column - (Math.min(columns, count) - 1) / 2) * spacingX + (Math.random() - .5) * .38,
        -1.7,
        (row - (rows - 1) / 2) * spacingZ + (Math.random() - .5) * .35,
      );
    });
  },

  clearDice() {
    this.dice.forEach((group) => {
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (!object.material?.userData?.sharedFaceLabel) {
          if (object.material?.map) object.material.map.dispose();
          object.material?.dispose?.();
        }
      });
      this.scene.remove(group);
    });
    this.dice = [];
  },

  preview(dice) {
    if (!this.ready || this.rolling) return;
    this.showingResult = false;
    this.clearDice();
    const visibleDice = dice.length ? dice : [{ sides: 20, result: 20 }];
    const targets = this.targetPositions(visibleDice.length);
    visibleDice.forEach((die, index) => {
      const group = this.makeDie(die, index, visibleDice.length);
      const target = targets[index];
      target.y = -2.68 + group.userData.radius;
      group.position.copy(target);
      group.rotation.set(Math.random() * .55, Math.random() * Math.PI, Math.random() * .45);
      group.userData.target.copy(target);
      this.scene.add(group);
      this.dice.push(group);
    });
  },

  roll(dice, onComplete) {
    this.clearDice();
    const targets = this.targetPositions(dice.length);
    dice.forEach((die, index) => {
      const group = this.makeDie(die, index, dice.length);
      group.position.set((Math.random() - .5) * 9, 5.5 + Math.random() * 6, -2 + Math.random() * 4);
      group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.userData.velocity.set((Math.random() - .5) * 6, -1 - Math.random() * 3, (Math.random() - .5) * 4);
      group.userData.angular.set(5 + Math.random() * 7, 5 + Math.random() * 8, 4 + Math.random() * 7);
      group.userData.target.copy(targets[index]);
      group.userData.target.y = -2.68 + group.userData.radius;
      this.setResultOrientation(group);
      this.scene.add(group);
      this.dice.push(group);
    });
    this.rolling = true;
    this.showingResult = true;
    this.rollStartedAt = performance.now();
    this.onComplete = onComplete;
  },

  setResultOrientation(group) {
    const THREE = this.THREE;
    const directionToCamera = this.camera.position.clone().sub(group.userData.target).normalize();
    const alignResult = new THREE.Quaternion().setFromUnitVectors(
      group.userData.resultNormal.clone().normalize(),
      directionToCamera,
    );
    const subtleTurn = new THREE.Quaternion().setFromAxisAngle(directionToCamera, (Math.random() - .5) * .22);
    group.userData.targetQuaternion.copy(subtleTurn.multiply(alignResult));
  },

  resize() {
    if (!this.renderer) return;
    const width = Math.max(1, elements.tabletop.clientWidth);
    const height = Math.max(1, elements.tabletop.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 48 : 39;
    this.camera.position.set(0, width < 600 ? 7.8 : 6.8, width < 600 ? 14.5 : 12.5);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, -1.0, 0);
  },

  animate() {
    if (!this.ready) return;
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), .034);
    const elapsed = (performance.now() - this.rollStartedAt) / 1000;

    this.dice.forEach((group, index) => {
      const data = group.userData;
      if (this.rolling && elapsed < 1.7) {
        data.velocity.y -= 13.5 * dt;
        group.position.addScaledVector(data.velocity, dt);
        group.rotation.x += data.angular.x * dt;
        group.rotation.y += data.angular.y * dt;
        group.rotation.z += data.angular.z * dt;
        const floor = -2.68 + data.radius;
        if (group.position.y < floor) {
          group.position.y = floor;
          data.velocity.y = Math.abs(data.velocity.y) * .42;
          data.velocity.x *= .76;
          data.velocity.z *= .76;
          data.angular.multiplyScalar(.83);
        }
        if (Math.abs(group.position.x) > 6.4) {
          group.position.x = Math.sign(group.position.x) * 6.4;
          data.velocity.x *= -.55;
        }
        if (Math.abs(group.position.z) > 4.3) {
          group.position.z = Math.sign(group.position.z) * 4.3;
          data.velocity.z *= -.55;
        }
      } else if (this.rolling) {
        const settle = Math.min(1, dt * 3.8);
        group.position.lerp(data.target, settle);
        group.quaternion.slerp(data.targetQuaternion, Math.min(1, dt * 3.5));
      } else {
        if (this.showingResult) {
          group.position.y = data.target.y;
          group.quaternion.slerp(data.targetQuaternion, Math.min(1, dt * 4.5));
        } else {
          group.position.y = data.target.y + Math.sin(performance.now() * .00075 + data.idlePhase) * .035;
          group.rotation.y += dt * (.12 + (index % 3) * .025);
        }
      }
    });

    if (this.rolling && elapsed > 2.65) {
      this.rolling = false;
      const callback = this.onComplete;
      this.onComplete = null;
      callback?.();
    }
    this.renderer.render(this.scene, this.camera);
  },
};

async function init3D() {
  try {
    const THREE = await import(THREE_URL);
    engine.THREE = THREE;
    engine.scene = new THREE.Scene();
    engine.camera = new THREE.PerspectiveCamera(39, 1, .1, 100);
    engine.renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    engine.renderer.shadowMap.enabled = true;
    engine.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    engine.renderer.outputColorSpace = THREE.SRGBColorSpace;
    engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    engine.renderer.toneMappingExposure = 1.18;
    engine.clock = new THREE.Clock();

    engine.scene.add(new THREE.HemisphereLight(0x8c9dff, 0x090511, 1.55));
    const keyLight = new THREE.DirectionalLight(0xd6c4ff, 3.8);
    keyLight.position.set(-5, 9, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    engine.scene.add(keyLight);
    const violetLight = new THREE.PointLight(0x9b3cff, 18, 22, 2);
    violetLight.position.set(5, 3, 4);
    engine.scene.add(violetLight);
    const blueLight = new THREE.PointLight(0x345dff, 10, 18, 2);
    blueLight.position.set(-6, 1, -2);
    engine.scene.add(blueLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 22),
      new THREE.MeshPhysicalMaterial({ color: 0x111b32, roughness: .84, metalness: .12, transparent: true, opacity: .72 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.72;
    floor.receiveShadow = true;
    engine.scene.add(floor);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, .012, 4, 96),
      new THREE.MeshBasicMaterial({ color: 0x7531cb, transparent: true, opacity: .34 }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -2.66;
    engine.scene.add(halo);

    engine.ready = true;
    engine.resizeObserver = new ResizeObserver(() => engine.resize());
    engine.resizeObserver.observe(elements.tabletop);
    engine.resize();
    engine.preview(expandPool(false));
    engine.animate();
    elements.renderStatus.classList.add("ready");
    elements.renderStatus.innerHTML = "<i></i> WebGL activo";
  } catch (error) {
    console.error("No se pudo iniciar la escena 3D", error);
    elements.renderStatus.classList.add("error");
    elements.renderStatus.innerHTML = "<i></i> Modo compatible";
    elements.fallbackMessage.hidden = false;
  }
}

elements.dicePool.addEventListener("click", (event) => {
  const control = event.target.closest(".die-control");
  if (!control || state.rolling) return;
  const sides = Number(control.dataset.sides);
  const stepButton = event.target.closest("[data-delta]");
  if (stepButton) adjustDie(sides, Number(stepButton.dataset.delta));
  else if (event.target.closest(".die-select") && state.pool[sides] === 0) adjustDie(sides, 1);
});

document.querySelectorAll("[data-modifier]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.rolling) return;
    state.modifier = Math.max(-30, Math.min(30, state.modifier + Number(button.dataset.modifier)));
    updateControls({ refreshScene: false });
  });
});

elements.resetPool.addEventListener("click", () => {
  if (state.rolling) return;
  SIDES.forEach((sides) => { state.pool[sides] = 0; });
  state.modifier = 0;
  elements.resultCard.hidden = true;
  elements.sceneHint.innerHTML = '<span aria-hidden="true">✦</span> Añade al menos un dado';
  updateControls();
});

elements.rollButton.addEventListener("click", roll);
elements.closeResult.addEventListener("click", () => { elements.resultCard.hidden = true; });
elements.clearHistory.addEventListener("click", () => {
  state.history = [];
  saveHistory();
  renderHistory();
});

elements.soundToggle.addEventListener("click", () => {
  state.sound = !state.sound;
  elements.soundToggle.setAttribute("aria-pressed", String(state.sound));
  elements.soundToggle.setAttribute("aria-label", state.sound ? "Desactivar sonido" : "Activar sonido");
});

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && !["BUTTON", "INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    roll();
  }
});

updateControls({ refreshScene: false });
renderHistory();
init3D();
