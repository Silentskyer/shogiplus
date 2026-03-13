const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer();
const wss = new WebSocketServer({ server });

const rooms = new Map();

function getRoom(code) {
  const key = code.toUpperCase();
  if (!rooms.has(key)) {
    rooms.set(key, new Set());
  }
  return { key, clients: rooms.get(key) };
}

function broadcast(room, message, except) {
  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client !== except && client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function safeSend(client, message) {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function cleanupRoom(room) {
  if (room.clients.size === 0) {
    rooms.delete(room.key);
  }
}

wss.on("connection", (ws) => {
  ws.data = { room: null, role: null };

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const { room: roomCode } = msg;
      if (!roomCode || typeof roomCode !== "string") return;

      const room = getRoom(roomCode);
      if (room.clients.size >= 2) {
        safeSend(ws, { type: "error", message: "room_full" });
        return;
      }

      room.clients.add(ws);
      ws.data.room = room;
      ws.data.role = room.clients.size === 1 ? "black" : "white";

      safeSend(ws, { type: "role", role: ws.data.role, room: room.key });

      if (room.clients.size === 2) {
        broadcast(room, { type: "peer-joined" });
        broadcast(room, { type: "ready" });
      }
      return;
    }

    if (msg.type === "signal") {
      const room = ws.data.room;
      if (!room) return;
      broadcast(room, { type: "signal", data: msg.data }, ws);
      return;
    }
  });

  ws.on("close", () => {
    const room = ws.data.room;
    if (!room) return;
    room.clients.delete(ws);
    broadcast(room, { type: "peer-left" });
    cleanupRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on :${PORT}`);
});
