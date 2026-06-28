const crypto = require("node:crypto");
const http = require("node:http");

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("3D 2048 battle room server\n");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  socket.on("data", (buffer) => {
    try {
      handleFrame(socket, buffer);
    } catch (error) {
      send(socket, JSON.stringify({ type: "error", message: "bad frame" }));
    }
  });
  socket.on("close", () => leaveRoom(socket));
  socket.on("error", () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`3D 2048 room server listening on ws://localhost:${PORT}`);
});

function handleFrame(socket, buffer) {
  const messages = decodeFrames(buffer);
  for (const message of messages) {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      continue;
    }

    if (data.type === "join") {
      joinRoom(socket, data.room, data.role);
    } else {
      relay(socket, JSON.stringify(data));
    }
  }
}

function joinRoom(socket, room, role) {
  const roomName = String(room || "").trim().slice(0, 64);
  if (!roomName) {
    send(socket, JSON.stringify({ type: "error", message: "missing room" }));
    return;
  }

  leaveRoom(socket);
  let peers = rooms.get(roomName);
  if (!peers) {
    peers = new Set();
    rooms.set(roomName, peers);
  }

  if (peers.size >= 2) {
    send(socket, JSON.stringify({ type: "error", message: "room full" }));
    socket.end();
    return;
  }

  socket.room = roomName;
  socket.role = role === "host" ? "host" : "join";
  peers.add(socket);
  broadcastPeerCount(roomName);
}

function leaveRoom(socket) {
  if (!socket.room) return;
  const peers = rooms.get(socket.room);
  if (peers) {
    peers.delete(socket);
    if (peers.size) broadcastPeerCount(socket.room);
    else rooms.delete(socket.room);
  }
  socket.room = null;
}

function relay(socket, payload) {
  if (!socket.room) return;
  const peers = rooms.get(socket.room);
  if (!peers) return;
  for (const peer of peers) {
    if (peer !== socket) send(peer, payload);
  }
}

function broadcastPeerCount(roomName) {
  const peers = rooms.get(roomName);
  if (!peers) return;
  const payload = JSON.stringify({ type: "peer-count", count: peers.size });
  for (const peer of peers) send(peer, payload);
}

function send(socket, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {
    leaveRoom(socket);
  }
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let mask;
    if (masked) {
      if (offset + 4 > buffer.length) break;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (offset + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;

    if (opcode === 0x8) {
      return messages;
    }
    if (opcode !== 0x1) continue;

    if (masked) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    messages.push(payload.toString("utf8"));
  }

  return messages;
}
