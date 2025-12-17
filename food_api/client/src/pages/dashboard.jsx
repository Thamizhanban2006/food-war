// src/pages/dashboard.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import "../styles/theme.css";
import { getAvatarUrl, createFallbackAvatar } from "../utils/avatar";

function getOrCreatePlayerId() {
  let pid = localStorage.getItem("playerId");
  if (!pid) {
    pid = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem("playerId", pid);
  }
  return pid;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [totalRounds, setTotalRounds] = useState(3);
  const [timePerRound, setTimePerRound] = useState(20);

  const playerId = getOrCreatePlayerId();
  // generate a random avatar that changes every time (use random seed)
  const [randomSeed] = useState(() => Math.random().toString(36).substring(2, 15));
  const generatedAvatar = getAvatarUrl(randomSeed, 64);

  const handleCreateRoom = () => {
    if (!name) return alert("Enter your name");
    const generatedRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    sessionStorage.setItem("playerName", name);
    sessionStorage.setItem("roomMeta", JSON.stringify({ isHost: true, roomId: generatedRoomId, rounds: totalRounds, timePerRound }));
    sessionStorage.setItem("playerAvatar", generatedAvatar);

    socket.emit("createRoom", { roomId: generatedRoomId, name, totalRounds, playerId, timePerRound, avatar: generatedAvatar }, (res) => {
      if (res.ok) {
        navigate(`/lobby/${generatedRoomId}`, { state: { name, roomId: generatedRoomId, rounds: totalRounds, timePerRound, isHost: true } });
      } else {
        alert(res.message || "Failed to create");
      }
    });
  };

  const handleJoinRoom = () => {
    if (!name || !roomId) return alert("Enter name and room id");
    sessionStorage.setItem("playerName", name);
    sessionStorage.setItem("roomMeta", JSON.stringify({ isHost: false, roomId, rounds: totalRounds, timePerRound }));
    sessionStorage.setItem("playerAvatar", generatedAvatar);

    socket.emit("joinRoom", { roomId, name, playerId, avatar: generatedAvatar }, (res) => {
      if (res.ok) {
        navigate(`/lobby/${roomId}`, { state: { name, roomId, rounds: totalRounds, timePerRound, isHost: false } });
      } else {
        alert(res.message || "Failed to join");
      }
    });
  };

  return (
    <div className="page dashboard">
      <div className="card">
        <h1 className="title">🍲 Food War</h1>

        {!mode ? (
          <div className="choices">
            <button className="btn primary" onClick={() => setMode("create")}>Create Room</button>
            <button className="btn primary" onClick={() => setMode("join")}>Join Room</button>
          </div>
        ) : mode === "create" ? (
            <div className="form">
            <h2>Create</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={generatedAvatar} onError={(e)=>{e.currentTarget.src = createFallbackAvatar(name||playerId,48)}} alt="avatar" className="avatar" style={{ width:48, height:48 }} />
              <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <input type="number" min={1} value={totalRounds} onChange={e => setTotalRounds(Number(e.target.value))} placeholder="Total rounds" />
            <input type="number" min={5} value={timePerRound} onChange={e => setTimePerRound(Number(e.target.value))} placeholder="Time per round (s)" />
            <div className="actions">
              <button className="btn primary" onClick={handleCreateRoom}>Create</button>
              <button className="btn secondary" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        ) : (
          <div className="form">
            <h2>Join</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={generatedAvatar} onError={(e)=>{e.currentTarget.src = createFallbackAvatar(name||playerId,48)}} alt="avatar" className="avatar" style={{ width:48, height:48 }} />
              <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
            <div className="actions">
              <button className="btn primary" onClick={handleJoinRoom}>Join</button>
              <button className="btn secondary" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
