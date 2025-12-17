// src/pages/lobby.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { socket } from "../socket";
import "../styles/theme.css";
import { getAvatarUrl, createFallbackAvatar } from "../utils/avatar";

export default function Lobby() {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = location.state || {};

  const roomId = urlRoomId || nav.roomId;
  const name = nav.name || sessionStorage.getItem("playerName") || "Player";
  const rounds = nav.rounds || 3;
  const timePerRound = nav.timePerRound || 20;
  const initialIsHost = nav.isHost || false;
  const playerId = localStorage.getItem("playerId");
  const sessionAvatar = sessionStorage.getItem("playerAvatar");
  const navAvatar = nav.avatar;
  const selectedAvatar = navAvatar || sessionAvatar || null;

  const [players, setPlayers] = useState([]);
  const [hostPlayerId, setHostPlayerId] = useState(null);
  const [localRounds, setLocalRounds] = useState(rounds);
  const [localTimePerRound, setLocalTimePerRound] = useState(timePerRound);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    if (initialIsHost) {
      socket.emit("createRoom", { roomId, name, totalRounds: rounds, playerId, timePerRound, avatar: selectedAvatar }, (res) => {
        if (!res.ok) console.warn("createRoom failed", res?.message);
      });
    } else {
      socket.emit("joinRoom", { roomId, name, playerId, avatar: selectedAvatar }, (res) => {
        if (!res.ok) console.warn("joinRoom failed", res?.message);
      });
    }

    const onRoomUpdate = ({ players: updated = [], hostPlayerId: hostId, totalRounds: tr, timePerRound: tpr }) => {
      setPlayers(updated);
      setHostPlayerId(hostId);
      if (typeof tr !== 'undefined') setLocalRounds(tr);
      if (typeof tpr !== 'undefined') setLocalTimePerRound(tpr);
    };

    const onGameStarted = (payload) => {
      navigate(`/game/${roomId}`, {
        state: {
          name,
          totalRounds: payload.totalRounds || localRounds,
          timePerRound: payload.timePerRound ?? localTimePerRound,
          initialDish: { dish: payload.dish, ingredients: payload.ingredients, round: payload.round },
          players: payload.players
        }
      });
    };

    socket.on("roomUpdate", onRoomUpdate);
    socket.on("gameStarted", onGameStarted);

    return () => {
      socket.off("roomUpdate", onRoomUpdate);
      socket.off("gameStarted", onGameStarted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const isHost = hostPlayerId === playerId;

  const startGame = () => {
    if (!isHost) return;
    socket.emit("startGame", { roomId, playerId }, (res) => {
      if (!res?.ok) console.warn("startGame ack fail", res);
    });
  };

  const updateSettings = () => {
    if (!isHost) return;
    socket.emit("updateRoomSettings", { roomId, playerId, totalRounds: Number(localRounds), timePerRound: Number(localTimePerRound) }, (res) => {
      if (!res?.ok) console.warn("updateRoomSettings failed", res);
    });
  };

  return (
    <div className="page lobby">
      <div className="card">
        <h2>🍲 Room: {roomId}</h2>

        <div className="players">
          <h4>Players ({players.length})</h4>
          <ul className="player-list">
            {players.map((p, i) => (
              <li key={p.playerId || p.socketId || i} className="player-entry">
                <img src={p.avatar || getAvatarUrl(p.playerId || p.name, 48)} onError={(e) => { e.currentTarget.src = createFallbackAvatar(p.name,48); }} alt={p.name} className="avatar" />
                <div className="player-info">
                  <div className="name">{p.name} {p.playerId === playerId ? <span className="you">(You)</span> : null}</div>
                  <div className="meta">{p.playerId === hostPlayerId ? <span className="host-badge">Host ⭐</span> : null}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="form lobby-settings">
          <label className="form-row">Rounds:
            <input className="form-input" type="number" min={1} value={localRounds} onChange={(e) => setLocalRounds(e.target.value)} disabled={!isHost} />
          </label>
          <label className="form-row">Time per round (s):
            <input className="form-input" type="number" min={5} value={localTimePerRound} onChange={(e) => setLocalTimePerRound(e.target.value)} disabled={!isHost} />
          </label>
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <>
              <button className="btn primary" onClick={updateSettings}>Update Settings</button>
              <button className="btn primary" onClick={startGame} disabled={players.length < 1}>Start Game</button>
            </>
          ) : (
            <div>Waiting for host to start…</div>
          )}
          <button className="btn primary" onClick={() => navigate("/")}>Leave</button>
        </div>
      </div>
    </div>
  );
}
