import React, { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import "../styles/theme.css";
import "../styles/game.css";
import { getAvatarUrl, createFallbackAvatar } from "../utils/avatar";

export default function Game() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const playerId = localStorage.getItem("playerId");
  const name = location.state?.name || sessionStorage.getItem("playerName") || "Player";
  const [players, setPlayers] = useState([]);
  const [currentDish, setCurrentDish] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [remainingIngredients, setRemainingIngredients] = useState([]);
  const [foundByMe, setFoundByMe] = useState([]);
  const [foundByOthers, setFoundByOthers] = useState([]); // [{ ingredient, name }]
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timer, setTimer] = useState(0);
  const [timePerRound, setTimePerRound] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);

  const [guess, setGuess] = useState("");
  const [popups, setPopups] = useState([]);
  const [confetti, setConfetti] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatRef = useRef(null);

  // create confetti pieces for a short celebration animation
  const spawnConfetti = () => {
    const colors = ["#ff6b6b", "#ffd166", "#6bffb3", "#6bc1ff", "#c36bff"];
    const pieces = new Array(28).fill(0).map(() => {
      const left = Math.random() * 100;
      const bg = colors[Math.floor(Math.random() * colors.length)];
      const rot = Math.floor(Math.random() * 360);
      const dur = 1600 + Math.floor(Math.random() * 1200);
      const delay = Math.floor(Math.random() * 200);
      return { id: Math.random().toString(36).slice(2), left, bg, rot, dur, delay };
    });
    setConfetti(pieces);
    // clear after animation
    setTimeout(() => setConfetti([]), 2200);
  };

  

  // If navigated from Lobby with initial game payload, apply it immediately
  useEffect(() => {
    const init = location.state?.initialDish;
    if (init) {
      // `initialDish` from lobby: { dish, ingredients, round }
      const dishPayload = init.dish || init;
      setCurrentDish(dishPayload || null);
      setIngredients(init.ingredients || []);
      setRound(init.round || 1);
      setTotalRounds((prev) => (location.state?.totalRounds ?? prev));
      // apply timePerRound if navigation provided it so timer starts correctly
      if (typeof location.state?.timePerRound !== 'undefined') {
        setTimePerRound(Number(location.state.timePerRound) || 0);
        setTimer(Number(location.state.timePerRound) || 0);
      }
      setShowIngredients(false);
    }
    // only run on first mount or when location.state changes
  }, [location.state]);

  // ===== CONNECT + LISTEN =====
  useEffect(() => {
    // prevent the whole page from scrolling while Game is mounted
    try { document.body.classList.add('game-page'); } catch {}

    if (!socket.connected) socket.connect();

    // join the room (server expects { roomId, name, playerId })
    socket.emit("joinRoom", { roomId, name, playerId });

    // ask server for current room state (helps when joining mid-round)
    socket.emit("requestRoomState", { roomId }, (res) => {
      if (!res?.ok) console.debug("requestRoomState ack:", res);
    });

    // MAIN GAME STATE UPDATE (some events come from server under different names)
    socket.on("gameState", (data) => {
      setPlayers(data.players || []);
      setCurrentDish(data.dish || null);
      setIngredients(data.ingredients || []);
      setRemainingIngredients(data.ingredients || []);
      // reset per-round found lists
      setFoundByMe([]);
      setFoundByOthers([]);
      setShowIngredients(data.showIngredients || false);
      setRound(data.round || 1);
      setTotalRounds(data.totalRounds || 3);
      // apply timePerRound and timer if provided
      setTimePerRound(data.timePerRound ?? 0);
      setTimer((data.timer ?? data.timePerRound) ?? 0);
    });

    // server emits when a round starts
    socket.on("gameStarted", (data) => {
      console.log("[game] gameStarted payload:", data);
      setPlayers(data.players || []);
      setCurrentDish(data.dish || null);
      setIngredients(data.ingredients || []);
      setRemainingIngredients(data.ingredients || []);
      // reset found lists at start
      setFoundByMe([]);
      setFoundByOthers([]);
      setRound(data.round || 1);
      setTotalRounds(data.totalRounds || 3);
      setTimePerRound(data.timePerRound ?? data.timePerRound ?? 0);
      // ensure timer resets if provided (fallback to timePerRound)
      setTimer((data.timer ?? data.timePerRound) ?? 0);
      setShowIngredients(false);
    });

    // room/player updates
    socket.on("roomUpdate", ({ players: pList }) => {
      setPlayers(pList || []);
    });

    // chat messages from server — avoid duplicates (optimistic + broadcast)
    socket.on("chatMessage", (msg) => {
      setMessages((prev) => {
        if (!msg) return prev;
        const exists = prev.some(x => x.ts === msg.ts && x.playerId === msg.playerId);
        if (exists) return prev;
        return [...prev, msg];
      });
    });

    // keep listener cleanup in same effect

    socket.on("ingredientResult", (res) => {
      // payload: { ingredient, playerId: pid, correct, points, players }
      const { ingredient, playerId: pid, correct, points, players: updated } = res || {};
      setPlayers(updated || []);

      if (!correct) return;

      const clean = String(ingredient || "").trim().toLowerCase();

      // remove from remaining
      setRemainingIngredients(prev => prev.filter(i => i !== clean));

      const player = (updated || []).find(p => p.playerId === pid) || {};

      if (pid === playerId) {
        // This client guessed correctly — show personal success popup + confetti
        setFoundByMe(prev => Array.from(new Set([...prev, clean])));
        const message = `You found "${ingredient}" +${points}`;
        const id = Date.now() + Math.random();
        setPopups(p => [...p, { id, message, type: "success" }]);
        setTimeout(() => setPopups(p => p.filter(x => x.id !== id)), 2500);
        spawnConfetti();
        // celebration: no sound (was removed)
      } else {
        // Another player found it — show a short notice to others and mark it
        setFoundByOthers(prev => Array.from(new Set([...prev, JSON.stringify({ ingredient: clean, name: player.name || 'Someone' })])));
        const message = `${player.name || 'Someone'} found "${ingredient}" +${points}`;
        const id = Date.now() + Math.random();
        setPopups(p => [...p, { id, message, type: "notice" }]);
        setTimeout(() => setPopups(p => p.filter(x => x.id !== id)), 1400);
        // notice: no sound (was removed)
      }
    });
    socket.on("timerUpdate", ({ timer: t }) => {
      console.log("[game] timerUpdate ->", t);
      setTimer(typeof t === "number" ? t : 0);
    });
    socket.on("roundOver", (payload = {}) => {
      setShowIngredients(true);
      // server may send remaining ingredients
      if (Array.isArray(payload.remaining)) {
        setRemainingIngredients(payload.remaining || []);
      }
    });

    socket.on("gameOver", ({ players }) => {
      navigate("/scoreboard", { state: { players } });
    });

    return () => {
      socket.off("gameState");
      socket.off("ingredientResult");
      socket.off("timerUpdate");
      socket.off("roundOver");
      socket.off("gameOver");
      socket.off("gameStarted");
      socket.off("roomUpdate");
      socket.off("chatMessage");
      try { document.body.classList.remove('game-page'); } catch {}
    };
  }, [roomId, navigate, playerId, name]);

  // ===== SUBMIT =====
  const submit = () => {
    if (!guess.trim() || timer === 0) return;
    socket.emit("submitIngredient", { roomId, playerId, ingredient: guess.trim() });
    setGuess("");
  };

  const isHost = players.length > 0 && players[0].playerId === playerId;

  const nextRound = () => {
    // server uses `startGame` to advance/start rounds
    socket.emit("startGame", { roomId, playerId }, (res) => {
      if (!res?.ok) console.warn("startGame ack fail", res);
    });
    setShowIngredients(false);
  };

  const waitingForHost = round === 0 || !currentDish;

  const sendChat = () => {
    const text = String(chatInput || "").trim();
    if (!text) return;
    const msg = { roomId, playerId, name, text, ts: Date.now() };
    // optimistic add
    setMessages(m => [...m, msg]);
    setChatInput("");
    try { socket.emit("sendMessage", msg); } catch (e) { /* ignore */ }
  };

  // auto-scroll chat to bottom when messages change
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    // allow the DOM to update then scroll
    requestAnimationFrame(() => {
      try { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); } catch { el.scrollTop = el.scrollHeight; }
    });
  }, [messages]);

  return (
    <div className="page game">
      <div className="popups-root">
        {popups.map(p => (
          <div key={p.id} className={`message-popup ${p.type || ''}`}>
            {p.message}
          </div>
        ))}
      </div>
      <div className="confetti-root" aria-hidden>
        {confetti.map(c => (
          <div
            key={c.id}
            className="confetti-piece"
            style={{ left: `${c.left}%`, background: c.bg, transform: `rotate(${c.rot}deg)`, animationDuration: `${c.dur}ms`, animationDelay: `${c.delay}ms` }}
          />
        ))}
      </div>
        <div className="app-brand" style={{ opacity: 1 }}>
          <div
            className="brand-name"
            style={{ border: 'none', background: 'transparent', boxShadow: 'none', backdropFilter: 'none', color: '#1f2937' }}
          >
            🍲Food Wars
          </div>
        </div>

        <div className="card">
        
        {/* HEADER */}
        <div className="game-head">
          <div className="dish-title" style={{ fontWeight: 'bold', fontSize: '20px' }}>
            {waitingForHost ? "Waiting for host to start..." : currentDish?.name}
          </div>

          <div className="right-head">
            <div className="meta">
              <span className="rounds">Round {round > 0 ? round : 0}/{totalRounds}</span>
              <span className="timer"> • ⏱ {timer ?? 0}s{timePerRound ? ` / ${timePerRound}s` : ''}</span>
            </div>
          </div>
        </div>

        <div className="game-flex">
          
          {/* LEFT SIDE */}
          <div className="dish-area">
            {!currentDish ? (
              <div className="dish-placeholder">Loading image...</div>
            ) : (
              <>
                <img
                  src={currentDish.imageUrl || '/placeholder-dish.svg'}
                  alt={currentDish.name || 'Dish image'}
                  className="dish-img"
                />
              </>
            )}

            {showIngredients && (
              <div className="ingredients-box">
                {(foundByMe.length > 0 || foundByOthers.length > 0 || remainingIngredients.length > 0) ? (
                  <>
                    {foundByMe.length > 0 && (
                      <div className="ingredient-group">
                        <div className="group-title">You found</div>
                        {foundByMe.map((ing, i) => (
                          <span key={`me-${i}`} className="ingredient-chip found-me">{ing}</span>
                        ))}
                      </div>
                    )}

                    {foundByOthers.length > 0 && (
                      <div className="ingredient-group">
                        <div className="group-title">Found by others</div>
                        {foundByOthers.map((s, i) => {
                          let o = { ingredient: s, name: 'Someone' };
                          try { o = JSON.parse(s); } catch { o = { ingredient: s, name: 'Someone' }; }
                          return (
                            <span key={`other-${i}`} className="ingredient-chip found-other">{o.ingredient} <small className="by-who">({o.name})</small></span>
                          );
                        })}
                      </div>
                    )}

                    {remainingIngredients.length > 0 && (
                      <div className="ingredient-group">
                        <div className="group-title">Remaining</div>
                        {remainingIngredients.map((ing, i) => (
                          <span key={`rem-${i}`} className="ingredient-chip remaining">{ing}</span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {ingredients.map((ing, i) => (
                      <span key={i} className="ingredient-chip">{ing}</span>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SIDE */}
          <div className="play-area" style={{ minHeight: 0 }}>
            
            {/* Player List */}
            <div className="players-box" style={{ flex: 'none' }}>
              <h4>Players</h4>
              <ul>
                {players.map((p, i) => (
                  <li key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={p.avatar || getAvatarUrl(p.playerId || p.name,48)} onError={(e)=>{e.currentTarget.src = createFallbackAvatar(p.name,48);}} alt={p.name} className="avatar" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{p.name} {p.playerId === playerId ? " (You)" : ""} {i === 0 ? " ⭐ Host" : ""}</span>
                      <strong style={{ fontSize: 13 }}>{p.score}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Chat */}
            <div className="chat-box" style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <h4>Chat</h4>
              <div className="chat-messages" ref={chatRef} style={{ maxHeight: 260, overflow: 'auto' }}>
                {messages.map((m, i) => (
                  <div key={`${m.playerId || 'p'}-${m.ts}-${i}`} className={`chat-message ${m.playerId === playerId ? 'me' : 'other'}`}>
                    <div className="chat-meta"><strong>{m.playerId === playerId ? 'You' : (m.name || 'Someone')}</strong> <small className="ts">{new Date(m.ts).toLocaleTimeString()}</small></div>
                    <div className="chat-text">{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="chat-input-row">
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Say something..." onKeyDown={(e)=>{ if(e.key==='Enter') sendChat(); }} />
                <button className="btn primary" onClick={sendChat} disabled={!chatInput.trim()}>Send</button>
              </div>
            </div>

            {/* Guess */}
            <div className="guess-box" style={{ flex: 'none', paddingTop: 8 }}>
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Type ingredient..."
                disabled={waitingForHost}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button className="btn primary" onClick={submit} disabled={timer === 0}>
                Submit
              </button>
            </div>

            {/* Host Button */}
            {isHost && showIngredients && (
              <button className="btn primary next-round" onClick={nextRound}>
                ➤ Next Round
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );

  
}

