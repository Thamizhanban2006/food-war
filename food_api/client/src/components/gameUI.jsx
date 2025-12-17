import { useState, useEffect } from "react";
import "../styles/game.css";

export default function GameUI({ socket }) {
  const [input, setInput] = useState("");
  const [popups, setPopups] = useState([]);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(60);
  const [round, setRound] = useState(1);

  useEffect(() => {
    socket.on("popup", ({ type, message }) => {
      setPopups(p => [...p, { type, message, id: Date.now() }]);
      setTimeout(() => {
        setPopups(p => p.filter(x => x.id !== Date.now()));
      }, 2000);
    });

    socket.on("ingredientFound", ({ points }) => {
      setScore(s => s + points);
    });

    socket.on("roundStarted", ({ time, round }) => {
      setTime(time);
      setRound(round);
    });

    socket.on("finalScoreboard", (ranking) => {
      alert("🏆 FINAL SCOREBOARD:\n" + ranking.map((r,i)=>`${i+1}. ${r.id} — ${r.score}`).join("\n"));
    });
  }, []);

  return (
    <div className="game-container">
      <div className="left-panel">
        <img src="/food.jpg" className="food-img" />
        <div className="score">Your Score: {score}</div>
      </div>

      <div className="right-panel">
        <div className="top-bar">Round {round} — Time: {time}s</div>

        <div className="chat-box">
          <input
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type an ingredient..."
            onKeyDown={e => {
              if (e.key === "Enter") {
                socket.emit("submitIngredient", {
                  roomId: "abc",
                  guess: input
                });
                setInput("");
              }
            }}
          />
        </div>

        <div className="popups">
          {popups.map(p => (
            <div key={p.id} className={`popup ${p.type}`}>
              {p.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
