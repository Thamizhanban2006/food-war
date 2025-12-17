// src/pages/scoreboard.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/theme.css";
import "../styles/game.css";
import { getAvatarUrl, createFallbackAvatar } from "../utils/avatar";

export default function Scoreboard(){
  const location = useLocation();
  const navigate = useNavigate();
  const players = (location.state && location.state.players) || [];

  const sorted = players.slice().sort((a,b)=> (b.score||0) - (a.score||0));

  return (
    <div className="page scoreboard">
      <div className="card">
        <h1>🏆 Final Scores</h1>
        <div className="scoregrid">
          {sorted.map((p,i)=>(
            <div key={p.playerId || i} className={`score-card ${i===0? 'winner':''}`}>
              <div className="rank">#{i+1}</div>
              <img src={p.avatar || getAvatarUrl(p.playerId || p.name,56)} onError={(e)=>{e.currentTarget.src = createFallbackAvatar(p.name,56);}} alt={p.name} className="avatar" style={{ width:56, height:56 }} />
              <div className="pname">{p.name}</div>
              <div className="pscore">{p.score || 0}</div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={()=> navigate("/")}>Back to Dashboard</button>
        </div>
      </div>
    </div>
  );
}
