import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const SIZE = 4;
const START_TILES = 3;
const COLORS = new Map([
  [2, "#d9f2e8"],
  [4, "#c8e8ff"],
  [8, "#ffd166"],
  [16, "#f8961e"],
  [32, "#f3722c"],
  [64, "#ef476f"],
  [128, "#b8f35c"],
  [256, "#42d6a4"],
  [512, "#4cc9f0"],
  [1024, "#b5179e"],
  [2048, "#f7f7ff"]
]);

const canvas = document.querySelector("#scene");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const message = document.querySelector("#message");
const messageTitle = document.querySelector("#message-title");
const messageBody = document.querySelector("#message-body");

const state = {
  grid: createGrid(),
  score: 0,
  best: Number(localStorage.getItem("3d2048-best") || 0),
  moving: false
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const board = new THREE.Group();
const tileGroup = new THREE.Group();
scene.add(board, tileGroup);

const ambient = new THREE.HemisphereLight(0xffffff, 0x223344, 2.4);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(5, 8, 7);
scene.add(key);

const tileMeshes = new Map();
let animationId = 0;

initBoard();
newGame();
bindEvents();
resize();
animate();

function createGrid() {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0))
  );
}

function newGame() {
  state.grid = createGrid();
  state.score = 0;
  state.moving = false;
  message.hidden = true;
  for (let i = 0; i < START_TILES; i += 1) addRandomTile();
  updateStats();
  renderTiles(true);
}

function initBoard() {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x50606d, transparent: true, opacity: 0.72 });
  const box = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const edges = new THREE.EdgesGeometry(box);
  const wire = new THREE.LineSegments(edges, lineMaterial);
  wire.position.set(0, 0, 0);
  board.add(wire);

  const cellMaterial = new THREE.LineBasicMaterial({ color: 0x2d3844, transparent: true, opacity: 0.45 });
  for (let i = 1; i < SIZE; i += 1) {
    const offset = i - SIZE / 2;
    addPlaneGrid("x", offset, cellMaterial);
    addPlaneGrid("y", offset, cellMaterial);
    addPlaneGrid("z", offset, cellMaterial);
  }

  camera.position.set(5.6, 5.2, 6.8);
  camera.lookAt(0, 0, 0);
}

function addPlaneGrid(axis, offset, material) {
  const points = [];
  const min = -SIZE / 2;
  const max = SIZE / 2;
  if (axis === "x") {
    points.push(new THREE.Vector3(offset, min, min), new THREE.Vector3(offset, max, min));
    points.push(new THREE.Vector3(offset, min, max), new THREE.Vector3(offset, max, max));
    points.push(new THREE.Vector3(offset, min, min), new THREE.Vector3(offset, min, max));
    points.push(new THREE.Vector3(offset, max, min), new THREE.Vector3(offset, max, max));
  } else if (axis === "y") {
    points.push(new THREE.Vector3(min, offset, min), new THREE.Vector3(max, offset, min));
    points.push(new THREE.Vector3(min, offset, max), new THREE.Vector3(max, offset, max));
    points.push(new THREE.Vector3(min, offset, min), new THREE.Vector3(min, offset, max));
    points.push(new THREE.Vector3(max, offset, min), new THREE.Vector3(max, offset, max));
  } else {
    points.push(new THREE.Vector3(min, min, offset), new THREE.Vector3(max, min, offset));
    points.push(new THREE.Vector3(min, max, offset), new THREE.Vector3(max, max, offset));
    points.push(new THREE.Vector3(min, min, offset), new THREE.Vector3(min, max, offset));
    points.push(new THREE.Vector3(max, min, offset), new THREE.Vector3(max, max, offset));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  board.add(new THREE.LineSegments(geometry, material));
}

function bindEvents() {
  document.querySelectorAll("[data-dir]").forEach((button) => {
    button.addEventListener("click", () => move(button.dataset.dir));
  });
  document.querySelector("#new-game").addEventListener("click", newGame);
  document.querySelector("#undo-view").addEventListener("click", () => {
    camera.position.set(5.6, 5.2, 6.8);
    camera.lookAt(0, 0, 0);
  });
  addEventListener("keydown", (event) => {
    const keys = {
      ArrowUp: "y+",
      w: "y+",
      W: "y+",
      ArrowDown: "y-",
      s: "y-",
      S: "y-",
      ArrowLeft: "x-",
      a: "x-",
      A: "x-",
      ArrowRight: "x+",
      d: "x+",
      D: "x+",
      q: "z+",
      Q: "z+",
      e: "z-",
      E: "z-"
    };
    if (keys[event.key]) {
      event.preventDefault();
      move(keys[event.key]);
    }
  });
  addEventListener("resize", resize);
}

function move(direction) {
  if (state.moving) return;
  const result = slideGrid(state.grid, direction);
  if (!result.changed) {
    showNotice("Move blocked", "その方向には動かせません。");
    return;
  }
  state.grid = result.grid;
  state.score += result.score;
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("3d2048-best", String(state.best));
  addRandomTile();
  updateStats();
  message.hidden = true;
  renderTiles();
  if (!hasMove()) {
    showNotice("Game Over", "動かせる方向がなくなりました。");
  }
}

function slideGrid(grid, direction) {
  const next = createGrid();
  let changed = false;
  let score = 0;
  const lines = getLines(direction);

  for (const line of lines) {
    const values = line.map(([x, y, z]) => grid[x][y][z]).filter(Boolean);
    const merged = [];
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] === values[i + 1]) {
        const value = values[i] * 2;
        merged.push(value);
        score += value;
        i += 1;
      } else {
        merged.push(values[i]);
      }
    }
    while (merged.length < SIZE) merged.push(0);
    line.forEach(([x, y, z], index) => {
      next[x][y][z] = merged[index];
      if (next[x][y][z] !== grid[x][y][z]) changed = true;
    });
  }

  return { grid: next, changed, score };
}

function getLines(direction) {
  const lines = [];
  const ranges = {
    "x+": [range(SIZE - 1, -1), range(0, SIZE), range(0, SIZE), "x"],
    "x-": [range(0, SIZE), range(0, SIZE), range(0, SIZE), "x"],
    "y+": [range(0, SIZE), range(SIZE - 1, -1), range(0, SIZE), "y"],
    "y-": [range(0, SIZE), range(0, SIZE), range(0, SIZE), "y"],
    "z+": [range(0, SIZE), range(0, SIZE), range(SIZE - 1, -1), "z"],
    "z-": [range(0, SIZE), range(0, SIZE), range(0, SIZE), "z"]
  }[direction];
  const [xs, ys, zs, axis] = ranges;

  if (axis === "x") {
    for (const y of ys) for (const z of zs) lines.push(xs.map((x) => [x, y, z]));
  } else if (axis === "y") {
    for (const x of xs) for (const z of zs) lines.push(ys.map((y) => [x, y, z]));
  } else {
    for (const x of xs) for (const y of ys) lines.push(zs.map((z) => [x, y, z]));
  }
  return lines;
}

function range(start, end) {
  const step = start < end ? 1 : -1;
  const values = [];
  for (let value = start; value !== end; value += step) values.push(value);
  return values;
}

function addRandomTile() {
  const empty = [];
  forEachCell((x, y, z, value) => {
    if (!value) empty.push([x, y, z]);
  });
  if (!empty.length) return;
  const [x, y, z] = empty[Math.floor(Math.random() * empty.length)];
  state.grid[x][y][z] = Math.random() < 0.9 ? 2 : 4;
}

function hasMove() {
  for (const direction of ["x+", "x-", "y+", "y-", "z+", "z-"]) {
    if (slideGrid(state.grid, direction).changed) return true;
  }
  return false;
}

function forEachCell(callback) {
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      for (let z = 0; z < SIZE; z += 1) {
        callback(x, y, z, state.grid[x][y][z]);
      }
    }
  }
}

function renderTiles(immediate = false) {
  const seen = new Set();
  forEachCell((x, y, z, value) => {
    if (!value) return;
    const key = `${x}-${y}-${z}`;
    seen.add(key);
    let mesh = tileMeshes.get(key);
    if (!mesh) {
      mesh = makeTile(value);
      mesh.scale.setScalar(immediate ? 1 : 0.1);
      tileGroup.add(mesh);
      tileMeshes.set(key, mesh);
    }
    if (mesh.userData.value !== value) updateTileLabel(mesh, value);
    mesh.userData.value = value;
    mesh.material.color.set(COLORS.get(value) || "#ffffff");
    mesh.position.copy(cellToWorld(x, y, z));
  });

  for (const [key, mesh] of tileMeshes.entries()) {
    if (!seen.has(key)) {
      tileGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      disposeLabel(mesh.children[0]);
      tileMeshes.delete(key);
    }
  }
}

function makeTile(value) {
  const geometry = new THREE.BoxGeometry(0.78, 0.78, 0.78);
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.get(value) || "#ffffff",
    roughness: 0.42,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(makeLabel(value));
  return mesh;
}

function makeLabel(value) {
  const texture = new THREE.CanvasTexture(drawLabel(value));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.82, 0.36, 1);
  sprite.position.set(0, 0, 0.42);
  return sprite;
}

function updateTileLabel(mesh, value) {
  const oldLabel = mesh.children[0];
  disposeLabel(oldLabel);
  if (oldLabel) mesh.remove(oldLabel);
  mesh.add(makeLabel(value));
}

function disposeLabel(label) {
  if (!label) return;
  label.material.map.dispose();
  label.material.dispose();
}

function drawLabel(value) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = value < 8 ? "#15202a" : "#ffffff";
  ctx.font = "800 58px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), 128, 64);
  return labelCanvas;
}

function cellToWorld(x, y, z) {
  return new THREE.Vector3(x - 1.5, y - 1.5, z - 1.5);
}

function updateStats() {
  scoreEl.textContent = state.score.toLocaleString();
  bestEl.textContent = state.best.toLocaleString();
}

function showNotice(title, body) {
  messageTitle.textContent = title;
  messageBody.textContent = body;
  message.hidden = false;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  tileGroup.children.forEach((mesh) => {
    if (mesh.scale.x < 1) {
      const next = Math.min(1, mesh.scale.x + 0.08);
      mesh.scale.setScalar(next);
    }
    const label = mesh.children[0];
    if (label) label.quaternion.copy(camera.quaternion);
  });
  board.rotation.y = Math.sin(performance.now() / 4200) * 0.04;
  renderer.render(scene, camera);
}
