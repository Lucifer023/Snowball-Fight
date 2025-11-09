"use client";

import React from 'react';
import ColorSwatch from './ColorSwatch';

type Props = {
  playerName: string;
  setPlayerName: (s: string) => void;
  playerColor: string;
  setPlayerColor: (c: string) => void;
  mounted: boolean;
  localPlayers: number;
  setLocalPlayers: (n: number) => void;
  botCount: number;
  setBotCount: (n: number) => void;
  onStart: () => void;
  onShowLeaderboard: () => void;
};

export default function PlayerSetup({ playerName, setPlayerName, playerColor, setPlayerColor, mounted, localPlayers, setLocalPlayers, botCount, setBotCount, onStart, onShowLeaderboard }: Props) {
  return (
    <div style={{ width: 480, padding: 20, background: '#111', color: '#fff', borderRadius: 8 }}>
      <h2>Snowball Fight</h2>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="playerName" style={{ display: 'block', marginBottom: 4 }}>Name</label>
        <input id="playerName" name="playerName" value={playerName} onChange={(e) => setPlayerName(e.target.value)} style={{ width: '100%', padding: 8, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'block', marginBottom: 4 }}>Color</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['#2f9cff', '#ff6b6b', '#ffd166', '#8aff8a', '#d99bff'].map((c) => (
            <ColorSwatch key={c} color={c} selected={mounted && playerColor === c} onClick={() => setPlayerColor(c)} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="localPlayers" style={{ color: '#ddd' }}>Local players</label>
          <select id="localPlayers" name="localPlayers" value={localPlayers} onChange={(e) => setLocalPlayers(Number(e.target.value))} style={{ padding: 6, width: 80, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="botCount" style={{ color: '#ddd' }}>Bots</label>
          <select id="botCount" name="botCount" value={botCount} onChange={(e) => setBotCount(Number(e.target.value))} style={{ padding: 6, width: 80, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }}>
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <button onClick={onStart} style={{ padding: '8px 12px' }}>
          Start Game
        </button>
        <button onClick={onShowLeaderboard} style={{ padding: '8px 12px' }}>
          Show Leaderboard
        </button>
      </div>
    </div>
  );
}
