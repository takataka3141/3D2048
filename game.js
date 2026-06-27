import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const SIZE = 4;
const START_TILES = 3;
const GARBAGE_DURATION_MS = 14000;
const CPU_DELAY_MS = 420;
const DIRECTIONS = ["x+", "x-", "y+", "y-", "z+", "z-"];
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
const attackEl = document.querySelector("#attack");
const message = document.querySelector("#message");
const messageTitle = document.querySelector("#message-title");
const messageBody = document.querySelector("#message-body");
const modeCaption = document.querySelector("#mode-caption");
const p1Label = document.querySelector("#p1-label");
const p2Label = document.querySelector("#p2-label");
const p1Score = document.querySelector("#p1-score");
const p2Score = document.querySelector("#p2-score");
const p1Garbage = document.querySelector("#p1-garbage");
const p2Garbage = document.querySelector("#p2-garbage");

const state = {
  mode: "solo",
  activePlayer: 0,
  players: [makePlayer("Player"), makePlayer("Opponent")],
  best: Number(localStorage.getItem("3d2048-best") || 0),
  busy: false,
  lastAttack: 0
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

initBoard();
newGame();
bindEvents();
resize();
animate();
setInterval(tickGarbage, 250);

function makePlayer(name) {
  return {
    name,
    grid: createGrid(),
    score: 0,
    alive: true
  };
}

function createGrid() {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null))
  );
}

function makeTileCell(value) {
  return { kind: "tile", value };
}

function makeGarbageCell() {
  const now = Date.now();
  return {
    kind: "garbage",
    value: 0,
    createdAt: now,
    expiresAt: now + GARBAGE_DURATION_MS,
    duration: GARBAGE_DURATION_MS
  };
}

function newGame() {
  state.players = [
    makePlayer(state.mode === "friend" ? "P1" : "Player"),
    makePlayer(state.mode === "cpu" ? "CPU" : "P2")
  ];
  state.activePlayer = 0;
  state.busy = false;
  state.lastAttack = 0;
  message.hidden = true;
  for (const player of state.players) {
    for (let i = 0; i < START_TILES; i += 1) addRandomTile(player);
  }
  updateModeText();
  updateStats();
  renderTiles(true);
}

function initBoard() {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x50606d, transparent: true, opacity: 0.72 });
  const box = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const edges = new THREE.EdgesGeometry(box);
  board.add(new THREE.LineSegments(edges, lineMaterial));

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
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((modeButton) => {
        modeButton.classList.toggle("is-active", modeButton === button);
      });
      newGame();
    });
  });
  document.querySelector("#new-game").addEventListener("click", newGame);
  document.querySelector("#add-garbage").addEventListener("click", () => {
    addGarbage(state.players[state.activePlayer], 3);
    showNotice("Garbage test", "Added 3 garbage blocks to the active board.");
    updateStats();
    renderTiles();
  });
  document.querySelector("#undo-view").addEventListener("click", resetView);
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

function resetView() {
  camera.position.set(5.6, 5.2, 6.8);
  camera.lookAt(0, 0, 0);
}

function move(direction, options = {}) {
  if (state.busy && !options.force) return false;
  const playerIndex = options.playerIndex ?? state.activePlayer;
  const player = state.players[playerIndex];
  expireGarbage(player);
  const result = slideGrid(player.grid, direction);
  if (!result.changed) {
    if (!options.silent) showNotice("Move blocked", "No tiles can move in that direction.");
    return false;
  }

  player.grid = result.grid;
  player.score += result.score;
  state.best = Math.max(state.best, player.score);
  state.lastAttack = calculateAttack(result);
  localStorage.setItem("3d2048-best", String(state.best));
  addRandomTile(player);
  sendAttack(playerIndex, state.lastAttack);
  message.hidden = true;

  if (!hasMove(player)) {
    player.alive = false;
    showNotice("Game Over", `${player.name} has no legal moves.`);
  }

  afterMove(playerIndex);
  return true;
}

function afterMove(playerIndex) {
  updateStats();
  if (playerIndex === state.activePlayer) renderTiles();

  if (state.mode === "friend") {
    state.activePlayer = state.activePlayer === 0 ? 1 : 0;
    showNotice("Turn change", `${state.players[state.activePlayer].name}'s turn.`);
    updateStats();
    renderTiles();
    return;
  }

  if (state.mode === "cpu" && playerIndex === 0) {
    state.busy = true;
    setTimeout(cpuTurn, CPU_DELAY_MS);
  }
}

function cpuTurn() {
  const cpu = state.players[1];
  expireGarbage(cpu);
  const direction = chooseCpuDirection(cpu);
  if (direction) {
    move(direction, { playerIndex: 1, silent: true, force: true });
  }
  state.busy = false;
  updateStats();
  renderTiles();
}

function chooseCpuDirection(player) {
  let best = null;
  for (const direction of DIRECTIONS) {
    const result = slideGrid(player.grid, direction);
    if (!result.changed) continue;
    const emptyCount = countEmpty(result.grid);
    const value = result.score * 3 + result.merges * 20 + emptyCount;
    if (!best || value > best.value) best = { direction, value };
  }
  return best?.direction ?? null;
}

function calculateAttack(result) {
  if (!result.merges) return 0;
  const comboBonus = Math.max(0, result.merges - 1);
  const valueBonus = Math.floor(result.score / 64);
  return Math.min(8, 1 + comboBonus + valueBonus);
}

function sendAttack(playerIndex, amount) {
  if (!amount || state.mode === "solo") return;
  const target = state.players[playerIndex === 0 ? 1 : 0];
  addGarbage(target, amount);
  if (playerIndex === state.activePlayer) {
    showNotice("Attack", `Sent ${amount} garbage blocks.`);
  }
}

function slideGrid(grid, direction) {
  const next = createGrid();
  let changed = false;
  let score = 0;
  let merges = 0;
  const lines = getLines(direction);

  for (const line of lines) {
    const pieces = line.map(([x, y, z]) => grid[x][y][z]).filter(Boolean);
    const merged = [];
    for (let i = 0; i < pieces.length; i += 1) {
      const current = cloneCell(pieces[i]);
      const nextPiece = pieces[i + 1];
      if (
        current.kind === "tile" &&
        nextPiece?.kind === "tile" &&
        current.value === nextPiece.value
      ) {
        const value = current.value * 2;
        merged.push(makeTileCell(value));
        score += value;
        merges += 1;
        i += 1;
      } else {
        merged.push(current);
      }
    }
    while (merged.length < SIZE) merged.push(null);
    line.forEach(([x, y, z], index) => {
      next[x][y][z] = merged[index];
      if (!sameCell(next[x][y][z], grid[x][y][z])) changed = true;
    });
  }

  return { grid: next, changed, score, merges };
}

function cloneCell(cell) {
  return cell ? { ...cell } : null;
}

function sameCell(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "tile") return a.value === b.value;
  return a.expiresAt === b.expiresAt;
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

function addRandomTile(player) {
  const empty = emptyCells(player.grid);
  if (!empty.length) return;
  const [x, y, z] = empty[Math.floor(Math.random() * empty.length)];
  player.grid[x][y][z] = makeTileCell(Math.random() < 0.9 ? 2 : 4);
}

function addGarbage(player, amount) {
  const empty = emptyCells(player.grid);
  const count = Math.min(amount, empty.length);
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(Math.random() * empty.length);
    const [x, y, z] = empty.splice(index, 1)[0];
    player.grid[x][y][z] = makeGarbageCell();
  }
}

function emptyCells(grid) {
  const empty = [];
  forEachGridCell(grid, (x, y, z, cell) => {
    if (!cell) empty.push([x, y, z]);
  });
  return empty;
}

function countEmpty(grid) {
  return emptyCells(grid).length;
}

function countGarbage(player) {
  let count = 0;
  forEachGridCell(player.grid, (x, y, z, cell) => {
    if (cell?.kind === "garbage") count += 1;
  });
  return count;
}

function hasMove(player) {
  expireGarbage(player);
  for (const direction of DIRECTIONS) {
    if (slideGrid(player.grid, direction).changed) return true;
  }
  return false;
}

function tickGarbage() {
  let changed = false;
  for (const player of state.players) changed = expireGarbage(player) || changed;
  if (changed) {
    updateStats();
    renderTiles();
  } else {
    updateGarbageLabels();
  }
}

function expireGarbage(player) {
  const now = Date.now();
  let changed = false;
  forEachGridCell(player.grid, (x, y, z, cell) => {
    if (cell?.kind === "garbage" && cell.expiresAt <= now) {
      player.grid[x][y][z] = null;
      changed = true;
    }
  });
  return changed;
}

function forEachGridCell(grid, callback) {
  for (let x = 0; x < SIZE; x += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      for (let z = 0; z < SIZE; z += 1) {
        callback(x, y, z, grid[x][y][z]);
      }
    }
  }
}

function renderTiles(immediate = false) {
  const player = state.players[state.activePlayer];
  const seen = new Set();
  forEachGridCell(player.grid, (x, y, z, cell) => {
    if (!cell) return;
    const key = `${x}-${y}-${z}`;
    seen.add(key);
    let mesh = tileMeshes.get(key);
    if (!mesh) {
      mesh = makeTile(cell);
      mesh.scale.setScalar(immediate ? 1 : 0.1);
      tileGroup.add(mesh);
      tileMeshes.set(key, mesh);
    }
    updateMeshForCell(mesh, cell);
    mesh.position.copy(cellToWorld(x, y, z));
  });

  for (const [key, mesh] of tileMeshes.entries()) {
    if (!seen.has(key)) {
      disposeTile(mesh);
      tileMeshes.delete(key);
    }
  }
}

function makeTile(cell) {
  const geometry = new THREE.BoxGeometry(0.78, 0.78, 0.78);
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.42,
    metalness: 0.08,
    transparent: true,
    opacity: 1
  });
  const mesh = new THREE.Mesh(geometry, material);
  updateMeshForCell(mesh, cell);
  return mesh;
}

function updateMeshForCell(mesh, cell) {
  const labelText = getCellLabel(cell);
  const signature = `${cell.kind}:${cell.value}:${labelText}`;
  if (mesh.userData.signature !== signature) {
    updateTileLabel(mesh, labelText, cell);
    mesh.userData.signature = signature;
  }

  if (cell.kind === "garbage") {
    const ratio = garbageRatio(cell);
    mesh.material.color.set("#050608");
    mesh.material.opacity = 0.22 + ratio * 0.68;
    mesh.material.emissive.set("#000000");
  } else {
    mesh.material.color.set(COLORS.get(cell.value) || "#ffffff");
    mesh.material.opacity = 1;
    mesh.material.emissive.set("#000000");
  }
}

function updateGarbageLabels() {
  const player = state.players[state.activePlayer];
  forEachGridCell(player.grid, (x, y, z, cell) => {
    if (!cell || cell.kind !== "garbage") return;
    const mesh = tileMeshes.get(`${x}-${y}-${z}`);
    if (mesh) updateMeshForCell(mesh, cell);
  });
}

function getCellLabel(cell) {
  if (cell.kind === "garbage") return String(Math.max(1, Math.ceil((cell.expiresAt - Date.now()) / 1000)));
  return String(cell.value);
}

function garbageRatio(cell) {
  return Math.max(0, Math.min(1, (cell.expiresAt - Date.now()) / cell.duration));
}

function makeLabel(text, cell) {
  const texture = new THREE.CanvasTexture(drawLabel(text, cell));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.82, 0.36, 1);
  sprite.position.set(0, 0, 0.42);
  return sprite;
}

function updateTileLabel(mesh, text, cell) {
  const oldLabel = mesh.children[0];
  disposeLabel(oldLabel);
  if (oldLabel) mesh.remove(oldLabel);
  mesh.add(makeLabel(text, cell));
}

function disposeTile(mesh) {
  tileGroup.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  disposeLabel(mesh.children[0]);
}

function disposeLabel(label) {
  if (!label) return;
  label.material.map.dispose();
  label.material.dispose();
}

function drawLabel(text, cell) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = cell.kind === "garbage" || cell.value >= 8 ? "#ffffff" : "#15202a";
  ctx.font = `800 ${text.length >= 4 ? 48 : 58}px Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);
  return labelCanvas;
}

function cellToWorld(x, y, z) {
  return new THREE.Vector3(x - 1.5, y - 1.5, z - 1.5);
}

function updateModeText() {
  const captions = {
    solo: "Solo practice / 4 x 4 x 4 cube",
    cpu: "CPU practice battle / attacks send garbage",
    friend: "Friend battle / pass the turn after each move"
  };
  modeCaption.textContent = captions[state.mode];
  p1Label.textContent = state.mode === "friend" ? "P1" : "Player";
  p2Label.textContent = state.mode === "cpu" ? "CPU" : state.mode === "friend" ? "P2" : "Opponent";
}

function updateStats() {
  const current = state.players[state.activePlayer];
  scoreEl.textContent = current.score.toLocaleString();
  bestEl.textContent = state.best.toLocaleString();
  attackEl.textContent = state.lastAttack.toLocaleString();
  p1Score.textContent = state.players[0].score.toLocaleString();
  p2Score.textContent = state.players[1].score.toLocaleString();
  p1Garbage.textContent = `Garbage ${countGarbage(state.players[0])}`;
  p2Garbage.textContent = `Garbage ${countGarbage(state.players[1])}`;
  document.querySelectorAll("[data-player-card]").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.playerCard) === state.activePlayer);
  });
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
  requestAnimationFrame(animate);
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
