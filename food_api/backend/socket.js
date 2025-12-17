// backend/socket.js
const Dish = require("./models/Dish.js");
const { Server } = require("socket.io");
const stringSimilarity = require("string-similarity");

/**
 In-memory structure:
 rooms = {
   roomId: {
     hostPlayerId,
     hostSocketId,
     players: [{ playerId, socketId, name, score }],
     totalRounds,
     currentRound,
     usedDishes: [],
     currentIngredients: []
   }
 }
*/
const rooms = {};

function setupSocket(server) {
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    // createRoom
    socket.on("createRoom", ({ roomId, name, totalRounds, playerId, timePerRound, avatar }, callback) => {
      try {
        if (!roomId || !name || !playerId) return callback?.({ ok: false, message: "Missing roomId/name/playerId" });
        if (rooms[roomId]) return callback?.({ ok: false, message: "Room already exists" });

        rooms[roomId] = {
          hostPlayerId: playerId,
          hostSocketId: socket.id,
          players: [{ playerId, socketId: socket.id, name, score: 0, avatar: avatar || null }],
          totalRounds: Number(totalRounds) || 3,
          currentRound: 0,
          usedDishes: [],
          currentIngredients: [],
          // timer settings
          timePerRound: Number(timePerRound) || 20,
          timer: 0,
          timerInterval: null
        };

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerId = playerId;

        // ack and broadcast
        callback?.({ ok: true, isHost: true, players: rooms[roomId].players, hostPlayerId: rooms[roomId].hostPlayerId });
        io.to(roomId).emit("roomUpdate", { players: rooms[roomId].players, hostPlayerId: rooms[roomId].hostPlayerId });

        console.log(`✅ Room ${roomId} created by ${name} (${playerId})`);
      } catch (err) {
        console.error("❌ createRoom error:", err);
        callback?.({ ok: false, message: "Server error creating room" });
      }
    });

    // joinRoom
    socket.on("joinRoom", ({ roomId, name, playerId, avatar }, callback) => {
      try {
        if (!roomId || !name || !playerId) return callback?.({ ok: false, message: "Missing roomId/name/playerId" });
        const room = rooms[roomId];
        if (!room) return callback?.({ ok: false, message: "Room not found" });

        const existing = room.players.find(p => p.playerId === playerId);
        if (existing) {
          // reconnection / name change
          existing.socketId = socket.id;
          existing.name = name;
          if (typeof avatar !== 'undefined') existing.avatar = avatar;
          console.log(`🔁 Player reconnected/updated ${name} (${playerId}) in ${roomId}`);
        } else {
          room.players.push({ playerId, socketId: socket.id, name, score: 0, avatar: avatar || null });
          console.log(`➕ Player joined ${name} (${playerId}) -> ${roomId}`);
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerId = playerId;

        callback?.({ ok: true, players: room.players, hostPlayerId: room.hostPlayerId, isHost: room.hostPlayerId === playerId });
        io.to(roomId).emit("roomUpdate", { players: room.players, hostPlayerId: room.hostPlayerId });
      } catch (err) {
        console.error("❌ joinRoom error:", err);
        callback?.({ ok: false, message: "Server error joining room" });
      }
    });

      // update room settings (host only)
      socket.on("updateRoomSettings", ({ roomId, playerId, totalRounds, timePerRound }, callback) => {
        try {
          const room = rooms[roomId];
          if (!room) return callback?.({ ok: false, message: "Room not found" });
          if (room.hostPlayerId !== playerId) return callback?.({ ok: false, message: "Only host can update settings" });

          if (typeof totalRounds !== 'undefined') room.totalRounds = Number(totalRounds) || room.totalRounds;
          if (typeof timePerRound !== 'undefined') room.timePerRound = Number(timePerRound) || room.timePerRound;

          io.to(roomId).emit("roomUpdate", { players: room.players, hostPlayerId: room.hostPlayerId, totalRounds: room.totalRounds, timePerRound: room.timePerRound });
          console.log(`⚙️ Room ${roomId} settings updated: rounds=${room.totalRounds}, timePerRound=${room.timePerRound}s`);
          callback?.({ ok: true });
        } catch (err) {
          console.error("❌ updateRoomSettings error:", err);
          callback?.({ ok: false, message: "Server error updating settings" });
        }
      });

      // clients can request current room state (useful for late-joiners or reconnections)
      socket.on("requestRoomState", ({ roomId: rqid } = {}, callback) => {
        try {
          const rid = rqid || socket.roomId;
          if (!rid || !rooms[rid]) return callback?.({ ok: false, message: "Room not found" });
          const room = rooms[rid];
          const payload = {
            players: room.players,
            dish: room.currentDish || null,
            ingredients: room.currentIngredients || [],
            round: room.currentRound || 0,
            totalRounds: room.totalRounds || 0,
            timer: room.timer || 0,
            timePerRound: room.timePerRound || 0
          };
          socket.emit("gameState", payload);
          callback?.({ ok: true, state: payload });
        } catch (err) {
          console.error("❌ requestRoomState error:", err);
          callback?.({ ok: false, message: "Server error" });
        }
      });

    // startGame / next round
    socket.on("startGame", async ({ roomId, playerId }, callback) => {
      try {
        const room = rooms[roomId];
        if (!room) return callback?.({ ok: false, message: "Room not found" });
        if (room.hostPlayerId !== playerId) return callback?.({ ok: false, message: "Only host can start" });

        room.currentRound = (room.currentRound || 0) + 1;

        if (room.currentRound > (room.totalRounds || 0)) {
          io.to(roomId).emit("gameOver", { players: room.players });
          return callback?.({ ok: true, finished: true });
        }

        // fetch dishes
        const dishes = await Dish.find({});
        if (!dishes || dishes.length === 0) {
          io.to(roomId).emit("gameError", { message: "No dishes in DB" });
          return callback?.({ ok: false, message: "No dishes in DB" });
        }

        const available = dishes.filter(d => !room.usedDishes.includes(d._id.toString()));
        const pool = available.length ? available : dishes;
        const picked = pool[Math.floor(Math.random() * pool.length)];

        room.usedDishes.push(picked._id.toString());
        // persist current dish for late-joining clients
        room.currentDish = { name: picked.name, imageUrl: picked.imageUrl };
        room.currentIngredients = picked.ingredients.map(i => String(i || "").toLowerCase().trim());

        // set and start timer for this round
        room.timer = Number(room.timePerRound) || 20;
        // clear any existing interval
        if (room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }

        // emit initial gameStarted with timePerRound
        io.to(roomId).emit("gameStarted", {
          dish: { name: picked.name, imageUrl: picked.imageUrl },
          ingredients: room.currentIngredients,
          round: room.currentRound,
          totalRounds: room.totalRounds,
          players: room.players,
          timePerRound: room.timePerRound,
          timer: room.timer
        });

        // start countdown
        room.timerInterval = setInterval(() => {
          try {
            room.timer = Math.max(0, (room.timer || 0) - 1);
            io.to(roomId).emit("timerUpdate", { timer: room.timer });
            console.log(`⏱️ [timer] Room ${roomId} -> ${room.timer}s`);

            // if timer reached zero => round over
            if (room.timer <= 0) {
              clearInterval(room.timerInterval);
              room.timerInterval = null;
              io.to(roomId).emit("roundOver", { round: room.currentRound, players: room.players, remaining: room.currentIngredients });
              // reveal ingredients to clients via roomUpdate or specific event
              io.to(roomId).emit("showIngredients", { ingredients: room.currentIngredients });
            }
          } catch (err) {
            console.error("Timer tick error:", err);
          }
        }, 1000);

        console.log(`🎮 Room ${roomId} round ${room.currentRound} started. Dish: ${picked.name}`);
        callback?.({ ok: true });
      } catch (err) {
        console.error("❌ startGame error:", err);
        callback?.({ ok: false, message: "Server error starting game" });
      }
    });

    // submitIngredient
    socket.on("submitIngredient", ({ roomId, playerId, ingredient }, callback) => {
      try {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.playerId === playerId);
        if (!player) return;

        const clean = String(ingredient || "").trim().toLowerCase();
        let correct = false;
        let points = 0;

        // fuzzy match against remaining ingredients
        if (room.currentIngredients && room.currentIngredients.length > 0) {
          const best = stringSimilarity.findBestMatch(clean, room.currentIngredients || []);
          const bestRating = best.bestMatch.rating;
          const bestIndex = best.bestMatchIndex;

          // threshold for accepting fuzzy matches
          const THRESHOLD = 0.65;
          if (bestRating >= THRESHOLD) {
            const matched = room.currentIngredients[bestIndex];
            correct = true;

            // dynamic scoring: base points scaled by similarity and remaining time fraction
            const base = 10;
            const timeFactor = (room.timer && room.timePerRound) ? (room.timer / room.timePerRound) : 1;
            points = Math.max(1, Math.ceil(base * bestRating * timeFactor));

            player.score = (player.score || 0) + points;
            // remove matched ingredient so it can't be guessed again
            room.currentIngredients.splice(bestIndex, 1);
          }
        }

        io.to(roomId).emit("ingredientResult", {
          ingredient,
          playerId,
          correct,
          points,
          players: room.players
        });

        // if all ingredients found, end round early
        if (room.currentIngredients.length === 0) {
          if (room.timerInterval) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;
          }
          io.to(roomId).emit("roundOver", { round: room.currentRound, players: room.players, remaining: [] });
          io.to(roomId).emit("showIngredients", { ingredients: [] });
        }

        callback?.({ ok: true, correct, points });
      } catch (err) {
        console.error("❌ submitIngredient error:", err);
        callback?.({ ok: false, message: "Server error submitting ingredient" });
      }
    });

    // chat messages: broadcast to room so all players see chats
    socket.on("sendMessage", (msg = {}, callback) => {
      try {
        const rid = msg.roomId || socket.roomId;
        if (!rid || !rooms[rid]) {
          console.warn("⚠️ sendMessage: invalid room", rid);
          return callback?.({ ok: false, message: "Room not found" });
        }

        // normalize message payload
        const message = {
          roomId: rid,
          playerId: msg.playerId || socket.playerId || null,
          name: msg.name || null,
          text: String(msg.text || "").slice(0, 1000),
          ts: msg.ts || Date.now()
        };

        console.log(`💬 [chat] ${message.name || message.playerId} @ ${rid}: ${message.text}`);

        // broadcast to everyone in the room
        io.to(rid).emit("chatMessage", message);
        console.log(`🔊 [chat] broadcasted to room ${rid}`);
        callback?.({ ok: true });
      } catch (err) {
        console.error("❌ sendMessage error:", err);
        callback?.({ ok: false, message: "Server error sending message" });
      }
    });

    // disconnect
    socket.on("disconnect", () => {
      try {
        const rid = socket.roomId;
        const pid = socket.playerId;

        if (!rid || !rooms[rid]) {
          console.log("🔴 disconnected (no room):", socket.id);
          return;
        }

        // remove by socketId
        rooms[rid].players = rooms[rid].players.filter(p => p.socketId !== socket.id);

        // if host's playerId left, reassign host to first player
        if (rooms[rid].hostPlayerId === pid) {
          const newHost = rooms[rid].players[0];
          if (newHost) {
            rooms[rid].hostPlayerId = newHost.playerId;
            rooms[rid].hostSocketId = newHost.socketId;
            console.log(`🔹 Host changed for ${rid} → ${newHost.name} (${newHost.playerId})`);
          } else {
            delete rooms[rid];
            console.log("🗑️ Room deleted (empty):", rid);
            return;
          }
        }

        io.to(rid).emit("roomUpdate", { players: rooms[rid].players, hostPlayerId: rooms[rid].hostPlayerId });
        console.log(`🔌 Player disconnected socket=${socket.id} playerId=${pid} from room=${rid}`);
      } catch (err) {
        console.error("❌ disconnect handler error:", err);
      }
    });
  });

  return io;
}

module.exports = setupSocket;
