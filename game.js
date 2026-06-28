import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const SIZE = 4;
const START_TILES = 3;
const GARBAGE_DURATION_MS = 14000;
const MATCH_DURATION_MS = 120000;
const CPU_INTERVAL_MS = 850;
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

const ui = {
  best: document.querySelector("#best"),
  timer: document.querySelector("#timer"),
  rule: document.querySelector("#rule"),
  caption: document.querySelector("#mode-caption"),
  message: document.querySelector("#message"),
  messageTitle: document.querySelector("#message-title"),
  messageBody: document.querySelector("#message-body"),
  labels: [document.querySelector("#p1-label"), document.querySelector("#p2-label")],
  scores: [document.querySelector("#p1-score"), document.querySelector("#p2-score")],
  attacks: [document.querySelector("#p1-attack"), document.querySelector("#p2-attack")],
  garbage: [document.querySelector("#p1-garbage"), document.querySelector("#p2-garbage")],
  onlineServer: document.querySelector("#online-server"),
  onlineRoom: document.querySelector("#online-room"),
  onlineHost: document.querySelector("#online-host"),
  onlineJoin: document.querySelector("#online-join"),
  onlineStatus: document.querySelector("#online-status")
};

const state = {
  mode: "solo",
  rule: "ko",
  players: [makePlayer("Player"), makePlayer("Opponent")],
  boards: [],
  best: Number(localStorage.getItem("3d2048-best") || 0),
  matchStartedAt: null,
  matchActive: false,
  matchOver: false,
  cpuTimer: null,
  online: {
    socket: null,
    role: null,
    localPlayerIndex: 0,
    connected: false,
    suppressSend: false
  }
};

state.boards = [
  createBoard(document.querySelector("#scene-p1"), 0),
  createBoard(document.querySelector("#scene-p2"), 1)
];

newGame();
bindEvents();
setDefaultOnlineServer();
resize();
animate();
setInterval(tick, 250);

function makePlayer(name) {
  return {
    name,
    grid: createGrid(),
    score: 0,
    lastAttack: 0,
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

function createBoard(canvas, index) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const boardGroup = new THREE.Group();
  const tileGroup = new THREE.Group();
  scene.add(boardGroup, tileGroup);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x223344, 2.4);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 8, 7);
  scene.add(key);

  initBoardFrame(boardGroup);
  resetCamera(camera);

  return {
    canvas,
    index,
    renderer,
    scene,
    camera,
    boardGroup,
    tileGroup,
    tileMeshes: new Map(),
    lastWidth: 0,
    lastHeight: 0
  };
}

function initBoardFrame(boardGroup) {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x50606d, transparent: true, opacity: 0.72 });
  const box = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  boardGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), lineMaterial));

  const cellMaterial = new THREE.LineBasicMaterial({ color: 0x2d3844, transparent: true, opacity: 0.45 });
  for (let i = 1; i < SIZE; i += 1) {
    const offset = i - SIZE / 2;
    addPlaneGrid(boardGroup, "x", offset, cellMaterial);
    addPlaneGrid(boardGroup, "y", offset, cellMaterial);
    addPlaneGrid(boardGroup, "z", offset, cellMaterial);
  }
}

function addPlaneGrid(boardGroup, axis, offset, material) {
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
  boardGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
}

function resetCamera(camera) {
  camera.position.set(5.6, 5.2, 6.8);
  camera.lookAt(0, 0, 0);
}

function newGame() {
  clearCpuTimer();
  state.players = [
    makePlayer(getPlayerName(0)),
    makePlayer(getPlayerName(1))
  ];
  state.matchStartedAt = null;
  state.matchActive = false;
  state.matchOver = false;
  ui.message.hidden = true;

  for (const player of state.players) {
    for (let i = 0; i < START_TILES; i += 1) addRandomTile(player);
  }

  updateModeText();
  updateStats();
  renderAllBoards(true);
  requestAnimationFrame(() => {
    resize();
    renderAllBoards(true);
  });
  if (state.mode === "online" && state.online.connected) sendOnlineState();
}

function bindEvents() {
  document.querySelectorAll("[data-dir]").forEach((button) => {
    button.addEventListener("click", () => move(getLocalPlayerIndex(), button.dataset.dir));
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      if (state.mode !== "online") disconnectOnline();
      document.querySelectorAll("[data-mode]").forEach((modeButton) => {
        modeButton.classList.toggle("is-active", modeButton === button);
      });
      newGame();
    });
  });
  document.querySelectorAll("[data-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.rule = button.dataset.rule;
      document.querySelectorAll("[data-rule]").forEach((ruleButton) => {
        ruleButton.classList.toggle("is-active", ruleButton === button);
      });
      updateStats();
    });
  });
  document.querySelector("#new-game").addEventListener("click", newGame);
  document.querySelector("#add-garbage").addEventListener("click", () => {
    addGarbage(state.players[0], 3);
    showNotice("Garbage test", "Added 3 garbage blocks to the player board.");
    updateStats();
    renderAllBoards();
  });
  document.querySelector("#undo-view").addEventListener("click", () => {
    for (const board of state.boards) resetCamera(board.camera);
  });
  ui.onlineHost.addEventListener("click", () => connectOnline("host"));
  ui.onlineJoin.addEventListener("click", () => connectOnline("join"));
  addEventListener("keydown", handleKeydown);
  addEventListener("resize", resize);
}

function handleKeydown(event) {
  const playerOneKeys = {
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
  const playerTwoKeys = {
    i: "y+",
    I: "y+",
    k: "y-",
    K: "y-",
    j: "x-",
    J: "x-",
    l: "x+",
    L: "x+",
    u: "z+",
    U: "z+",
    o: "z-",
    O: "z-"
  };
  if (playerOneKeys[event.key]) {
    event.preventDefault();
    move(getLocalPlayerIndex(), playerOneKeys[event.key]);
  } else if (state.mode === "friend" && playerTwoKeys[event.key]) {
    event.preventDefault();
    move(1, playerTwoKeys[event.key]);
  }
}

function getPlayerName(index) {
  if (state.mode === "cpu") return index === 0 ? "Player" : "CPU";
  if (state.mode === "friend") return index === 0 ? "P1" : "P2";
  if (state.mode === "online") return index === 0 ? "Host" : "Guest";
  return index === 0 ? "Player" : "P2";
}

function getLocalPlayerIndex() {
  return state.mode === "online" ? state.online.localPlayerIndex : 0;
}

function startCpuTimer() {
  clearCpuTimer();
  state.cpuTimer = setInterval(() => {
    if (state.mode !== "cpu" || state.matchOver) return;
    const direction = chooseCpuDirection(state.players[1]);
    if (direction) move(1, direction, { silent: true });
  }, CPU_INTERVAL_MS);
}

function clearCpuTimer() {
  if (!state.cpuTimer) return;
  clearInterval(state.cpuTimer);
  state.cpuTimer = null;
}

function move(playerIndex, direction, options = {}) {
  if (state.matchOver) return false;
  if (state.mode === "solo" && playerIndex !== 0) return false;
  if (state.mode === "cpu" && playerIndex === 1 && !options.silent) return false;
  if (state.mode === "online" && playerIndex !== state.online.localPlayerIndex && !options.remote) return false;
  if (state.mode === "online" && !state.matchActive && !options.remote) {
    showNotice("Waiting", "Online battle starts after both players connect.");
    return false;
  }
  if (!state.matchActive) startMatch();

  const player = state.players[playerIndex];
  expireGarbage(player);
  const result = slideGrid(player.grid, direction);
  if (!result.changed) {
    if (!options.silent && playerIndex === 0) showNotice("Move blocked", "No tiles can move in that direction.");
    return false;
  }

  player.grid = result.grid;
  player.score += result.score;
  player.lastAttack = calculateAttack(result);
  state.best = Math.max(state.best, player.score);
  localStorage.setItem("3d2048-best", String(state.best));
  addRandomTile(player);
  sendAttack(playerIndex, player.lastAttack);
  ui.message.hidden = true;

  if (!hasMove(player)) endMatch(playerIndex === 0 ? 1 : 0, `${player.name} has no legal moves.`);
  updateStats();
  renderAllBoards();
  if (state.mode === "online" && !options.remote) sendOnlineState();
  return true;
}

function chooseCpuDirection(player) {
  let best = null;
  for (const direction of DIRECTIONS) {
    const result = slideGrid(player.grid, direction);
    if (!result.changed) continue;
    const value = result.score * 3 + result.merges * 24 + countEmpty(result.grid);
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
  const targetIndex = playerIndex === 0 ? 1 : 0;
  addGarbage(state.players[targetIndex], amount);
  if (playerIndex === 0) showNotice("Attack", `Sent ${amount} garbage blocks.`);
  if (state.mode === "online" && playerIndex === state.online.localPlayerIndex) {
    sendOnline({ type: "garbage", amount });
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

function tick() {
  if (
    state.matchActive &&
    !state.matchOver &&
    state.rule === "score" &&
    Date.now() - state.matchStartedAt >= MATCH_DURATION_MS
  ) {
    const winner = state.players[0].score === state.players[1].score ? -1 : state.players[0].score > state.players[1].score ? 0 : 1;
    endMatch(winner, "Time is up.");
  }

  let changed = false;
  for (const player of state.players) changed = expireGarbage(player) || changed;
  updateStats();
  if (changed) renderAllBoards();
  else updateGarbageLabels();
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

function endMatch(winnerIndex, reason) {
  if (state.matchOver) return;
  state.matchOver = true;
  clearCpuTimer();
  const title = winnerIndex < 0 ? "Draw" : `${state.players[winnerIndex].name} wins`;
  showNotice(title, reason);
  if (state.mode === "online" && !state.online.suppressSend) {
    sendOnline({ type: "match-over", winnerIndex, reason });
  }
}

function startMatch(startedAt = Date.now(), options = {}) {
  if (state.matchActive) return;
  state.matchStartedAt = startedAt;
  state.matchActive = true;
  if (state.mode === "cpu") startCpuTimer();
  updateStats();
  if (state.mode === "online" && !options.remote) {
    sendOnline({ type: "match-start", startedAt, rule: state.rule });
    sendOnlineState();
  }
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

function renderAllBoards(immediate = false) {
  for (let i = 0; i < state.boards.length; i += 1) {
    const panel = document.querySelector(`[data-board-panel="${i}"]`);
    panel.classList.toggle("is-inactive", state.mode === "solo" && i === 1);
    resizeBoard(state.boards[i]);
    renderBoard(state.boards[i], state.players[i], immediate);
  }
}

function renderBoard(board, player, immediate = false) {
  const seen = new Set();
  forEachGridCell(player.grid, (x, y, z, cell) => {
    if (!cell) return;
    const key = `${x}-${y}-${z}`;
    seen.add(key);
    let mesh = board.tileMeshes.get(key);
    if (!mesh) {
      mesh = makeTile(cell);
      mesh.scale.setScalar(immediate ? 1 : 0.1);
      board.tileGroup.add(mesh);
      board.tileMeshes.set(key, mesh);
    }
    updateMeshForCell(mesh, cell);
    mesh.position.copy(cellToWorld(x, y, z));
  });

  for (const [key, mesh] of board.tileMeshes.entries()) {
    if (!seen.has(key)) {
      disposeTile(board, mesh);
      board.tileMeshes.delete(key);
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
  } else {
    mesh.material.color.set(COLORS.get(cell.value) || "#ffffff");
    mesh.material.opacity = 1;
  }
}

function updateGarbageLabels() {
  for (let playerIndex = 0; playerIndex < state.players.length; playerIndex += 1) {
    const board = state.boards[playerIndex];
    const player = state.players[playerIndex];
    forEachGridCell(player.grid, (x, y, z, cell) => {
      if (!cell || cell.kind !== "garbage") return;
      const mesh = board.tileMeshes.get(`${x}-${y}-${z}`);
      if (mesh) updateMeshForCell(mesh, cell);
    });
  }
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

function disposeTile(board, mesh) {
  board.tileGroup.remove(mesh);
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
    solo: "Solo practice / one visible board",
    cpu: "Real-time CPU battle / opponent board is visible",
    friend: "Local simultaneous friend battle / P1 and P2 controls",
    online: "Online friend battle / passphrase room"
  };
  ui.caption.textContent = captions[state.mode];
  ui.labels[0].textContent = getPlayerName(0);
  ui.labels[1].textContent = getPlayerName(1);
  updateOnlineStatus();
}

function updateStats() {
  const elapsed = state.matchActive && state.matchStartedAt ? Date.now() - state.matchStartedAt : 0;
  const remaining = Math.max(0, MATCH_DURATION_MS - elapsed);
  ui.timer.textContent = formatTime(remaining);
  ui.rule.textContent = state.rule === "ko" ? "KO" : "Score";
  ui.best.textContent = state.best.toLocaleString();
  for (let i = 0; i < state.players.length; i += 1) {
    ui.scores[i].textContent = state.players[i].score.toLocaleString();
    ui.attacks[i].textContent = `ATK ${state.players[i].lastAttack}`;
    ui.garbage[i].textContent = `Garbage ${countGarbage(state.players[i])}`;
  }
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function showNotice(title, body) {
  ui.messageTitle.textContent = title;
  ui.messageBody.textContent = body;
  ui.message.hidden = false;
}

function connectOnline(role) {
  const serverUrl = ui.onlineServer.value.trim();
  const room = ui.onlineRoom.value.trim();
  if (!serverUrl || !room) {
    showNotice("Online", "Enter a server URL and passphrase.");
    return;
  }
  disconnectOnline();
  state.mode = "online";
  state.online.role = role;
  state.online.localPlayerIndex = role === "host" ? 0 : 1;
  document.querySelectorAll("[data-mode]").forEach((modeButton) => {
    modeButton.classList.toggle("is-active", modeButton.dataset.mode === "online");
  });
  newGame();
  try {
    const socket = new WebSocket(serverUrl);
    state.online.socket = socket;
    updateOnlineStatus("Connecting");
    socket.addEventListener("open", () => {
      state.online.connected = true;
      sendOnline({ type: "join", room, role });
      updateOnlineStatus("Waiting");
    });
    socket.addEventListener("message", (event) => handleOnlineMessage(event.data));
    socket.addEventListener("close", () => {
      state.online.connected = false;
      updateOnlineStatus("Offline");
    });
    socket.addEventListener("error", () => {
      updateOnlineStatus("Error");
      showNotice("Online error", getOnlineConnectionHint(serverUrl));
    });
  } catch {
    updateOnlineStatus("Error");
    showNotice("Online error", getOnlineConnectionHint(serverUrl));
  }
}

function disconnectOnline() {
  if (state.online.socket) state.online.socket.close();
  state.online.socket = null;
  state.online.connected = false;
}

function sendOnline(payload) {
  const socket = state.online.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function sendOnlineState() {
  if (state.online.suppressSend) return;
  const playerIndex = state.online.localPlayerIndex;
  sendOnline({
    type: "state",
    playerIndex,
    player: serializePlayer(state.players[playerIndex]),
    matchStartedAt: state.matchStartedAt,
    matchActive: state.matchActive,
    rule: state.rule
  });
}

function handleOnlineMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (message.type === "peer-count") {
    const ready = message.count >= 2;
    updateOnlineStatus(ready ? "Connected" : "Waiting");
    if (ready && state.online.role === "host" && !state.matchActive) {
      startMatch(Date.now());
    }
    return;
  }
  if (message.type === "error") {
    updateOnlineStatus("Error");
    showNotice("Online error", message.message || "Connection error.");
    return;
  }
  if (message.type === "state" && Number.isInteger(message.playerIndex)) {
    const remoteIndex = message.playerIndex;
    if (remoteIndex === state.online.localPlayerIndex) return;
    state.players[remoteIndex] = deserializePlayer(message.player);
    if (message.rule) state.rule = message.rule;
    if (message.matchActive && message.matchStartedAt && !state.matchActive) {
      startMatch(message.matchStartedAt, { remote: true });
    }
    state.best = Math.max(state.best, state.players[remoteIndex].score);
    updateStats();
    renderAllBoards();
    return;
  }
  if (message.type === "garbage") {
    addGarbage(state.players[state.online.localPlayerIndex], Number(message.amount) || 0);
    updateStats();
    renderAllBoards();
    sendOnlineState();
    return;
  }
  if (message.type === "match-start") {
    if (message.rule) state.rule = message.rule;
    startMatch(message.startedAt || Date.now(), { remote: true });
    updateOnlineStatus("Connected");
    return;
  }
  if (message.type === "match-over") {
    state.online.suppressSend = true;
    endMatch(message.winnerIndex, message.reason || "Remote match ended.");
    state.online.suppressSend = false;
  }
}

function serializePlayer(player) {
  return {
    name: player.name,
    score: player.score,
    lastAttack: player.lastAttack,
    alive: player.alive,
    grid: player.grid
  };
}

function deserializePlayer(player) {
  return {
    name: player?.name || "Remote",
    score: Number(player?.score) || 0,
    lastAttack: Number(player?.lastAttack) || 0,
    alive: player?.alive !== false,
    grid: player?.grid || createGrid()
  };
}

function updateOnlineStatus(label) {
  const role = state.online.role ? state.online.role.toUpperCase() : "OFF";
  const status = label || (state.online.connected ? "Connected" : "Offline");
  ui.onlineStatus.textContent = `${status} / ${role}`;
}

function setDefaultOnlineServer() {
  if (!ui.onlineServer || ui.onlineServer.dataset.autofilled === "true") return;
  const host = location.hostname;
  if (!host) return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ui.onlineServer.value = `${protocol}://${host}:8787`;
  ui.onlineServer.dataset.autofilled = "true";
}

function getOnlineConnectionHint(serverUrl) {
  if (serverUrl.includes("localhost") || serverUrl.includes("127.0.0.1")) {
    return "On a phone, localhost means the phone itself. Use the host PC LAN IP, for example ws://192.168.1.20:8787.";
  }
  if (location.protocol === "https:" && serverUrl.startsWith("ws://")) {
    return "This page is HTTPS, so the browser may block ws://. Use a wss:// server, or open the game over http:// on the same LAN.";
  }
  return "Could not connect. Check that node server.js is running, the phone is on the same Wi-Fi, and Windows Firewall allows Node.js on private networks.";
}

function resize() {
  for (const board of state.boards) {
    resizeBoard(board);
  }
}

function resizeBoard(board) {
  const rect = board.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (board.lastWidth === width && board.lastHeight === height) return;
  board.lastWidth = width;
  board.lastHeight = height;
  board.renderer.setSize(width, height, false);
  board.camera.aspect = rect.width / rect.height;
  board.camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  for (const board of state.boards) {
    resizeBoard(board);
    board.tileGroup.children.forEach((mesh) => {
      if (mesh.scale.x < 1) {
        const next = Math.min(1, mesh.scale.x + 0.08);
        mesh.scale.setScalar(next);
      }
      const label = mesh.children[0];
      if (label) label.quaternion.copy(board.camera.quaternion);
    });
    board.boardGroup.rotation.y = Math.sin((performance.now() + board.index * 700) / 4200) * 0.04;
    board.renderer.render(board.scene, board.camera);
  }
}
