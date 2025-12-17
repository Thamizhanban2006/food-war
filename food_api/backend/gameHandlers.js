// gamehandler.js
const rooms = {};

module.exports = (io, socket) => {
  console.log("🎮 Socket connected:", socket.id);

  // CREATE ROOM
  socket.on("createRoom", ({ roomId, name, totalRounds }, callback) => {
    try {
      if (!roomId || !name) return callback({ ok: false, message: "Missing fields" });

      if (rooms[roomId])
        return callback({ ok: false, message: "Room already exists" });

      // FIRST PLAYER → HOST
      rooms[roomId] = {
        hostSocketId: socket.id,
        totalRounds: totalRounds || 5,
        players: [
          { socketId: socket.id, name, score: 0 }
        ],
      };

      socket.join(roomId);
      socket.roomId = roomId;

      callback({
        ok: true,
        isHost: true,
        players: rooms[roomId].players
      });

      io.to(roomId).emit("roomUpdate", rooms[roomId]);
    } catch (err) {
      console.error(err);
      callback({ ok: false, message: "Server error" });
    }
  });

  // JOIN ROOM
  socket.on("joinRoom", ({ roomId, name }, callback) => {
    try {
      if (!roomId || !name)
        return callback({ ok: false, message: "Missing fields" });

      const room = rooms[roomId];
      if (!room) return callback({ ok: false, message: "Room not found" });

      // ADD PLAYER
      room.players.push({
        socketId: socket.id,
        name,
        score: 0,
      });

      socket.join(roomId);
      socket.roomId = roomId;

      const isHost = socket.id === room.hostSocketId;

      callback({
        ok: true,
        isHost,
        players: room.players,
        hostSocketId: room.hostSocketId,
      });

      io.to(roomId).emit("roomUpdate", rooms[roomId]);
    } catch (err) {
      console.error(err);
      callback({ ok: false, message: "Server error" });
    }
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("🔌 Player disconnected:", socket.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];

      // REMOVE PLAYER
      room.players = room.players.filter(p => p.socketId !== socket.id);

      // IF HOST LEFT → NEW HOST
      if (room.hostSocketId === socket.id && room.players.length > 0) {
        room.hostSocketId = room.players[0].socketId;
      }

      // If no players → delete room
      if (room.players.length === 0) {
        delete rooms[roomId];
        continue;
      }

      // update all players
      io.to(roomId).emit("roomUpdate", rooms[roomId]);
    }
  });
};
