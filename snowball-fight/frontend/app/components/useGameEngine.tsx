"use client";

import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

type Player = { id: string; x: number; y: number; health: number; score: number; name?: string; color?: string };
type Snowball = { id: string; x: number; y: number };
type Obstacle = { id: string; x: number; y: number; w: number; h: number; hp: number };

const MAP_WIDTH = Number(process.env.NEXT_PUBLIC_MAP_WIDTH) || 1600;
const MAP_HEIGHT = Number(process.env.NEXT_PUBLIC_MAP_HEIGHT) || 900;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

type UseGameEngineOpts = {
  started: boolean;
  playerName: string;
  playerColor: string;
  botCount: number;
  showEscapeConfirm: boolean;
  setShowEscapeConfirm: (b: boolean) => void;
  setRoundWinner: (s: string | null) => void;
  setHomeLeaderboard: (lb: Record<string, number> | null) => void;
  setShowHomeLeaderboard: (b: boolean) => void;
};

export default function useGameEngine(opts: UseGameEngineOpts) {
  const { started, playerName, playerColor, botCount, showEscapeConfirm, setShowEscapeConfirm, setRoundWinner, setHomeLeaderboard, setShowHomeLeaderboard } = opts;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<any>(null);
  const botsRequestedRef = useRef<number | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const stateRef = useRef<{ players: Player[]; snowballs: Snowball[]; obstacles?: Obstacle[] }>({ players: [], snowballs: [], obstacles: [] });
  const myIdRef = useRef<string | null>(null);
  const leaderboardRef = useRef<Record<string, number> | null>(null);
  const continueBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!started) return;

    const app = new PIXI.Application({
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      backgroundColor: 0x1b1b1b,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    appRef.current = app;

    if (containerRef.current) {
      containerRef.current.style.width = `${MAP_WIDTH}px`;
      containerRef.current.style.height = `${MAP_HEIGHT}px`;
      containerRef.current.style.margin = '0 auto';
      containerRef.current.style.position = 'relative';
      containerRef.current.appendChild(app.view as HTMLCanvasElement);
      const view = app.view as HTMLCanvasElement;
      view.style.width = `${MAP_WIDTH}px`;
      view.style.height = `${MAP_HEIGHT}px`;
    }

    (async () => {
      try {
        let sockMod: any = null;
        try {
          // @ts-ignore
          sockMod = await import('socket.io-client/dist/socket.io.js');
        } catch (e) {
          sockMod = await import('socket.io-client');
        }
        const ioCtor = sockMod?.io || sockMod?.default || sockMod;
        const socket = typeof ioCtor === 'function' ? ioCtor(BACKEND) : (sockMod as any).connect ? (sockMod as any).connect(BACKEND) : null;
        socketRef.current = socket;

        let myId: string | null = null;

        socket.on('init', (data: { id: string; players: Player[]; snowballs?: Snowball[]; obstacles?: Obstacle[]; leaderboard?: Record<string, number> }) => {
          myId = data.id;
          myIdRef.current = myId;
          stateRef.current.players = data.players || [];
          stateRef.current.snowballs = data.snowballs || [];
          stateRef.current.obstacles = data.obstacles || [];
          if (data.leaderboard) leaderboardRef.current = data.leaderboard;
          try { socket.emit('setName', { name: playerName, color: playerColor }); localStorage.setItem('snowball_name', playerName); localStorage.setItem('snowball_color', playerColor); } catch (e) {}
        });

        socket.on('playerJoined', (p: Player) => { stateRef.current.players = [...stateRef.current.players.filter((x) => x.id !== p.id), p]; });
        socket.on('playerLeft', ({ id }: { id: string }) => { stateRef.current.players = stateRef.current.players.filter((p) => p.id !== id); });
        socket.on('playerUpdated', (p: Player) => { stateRef.current.players = [...stateRef.current.players.filter((x) => x.id !== p.id), p]; });
        socket.on('leaderboard', (lb: Record<string, number>) => { leaderboardRef.current = lb; });
        socket.on('roundWinner', (data: { id: string; name: string }) => { setRoundWinner(data.name); });
        socket.on('state', (st: { players: Player[]; snowballs: Snowball[]; obstacles?: Obstacle[] }) => { stateRef.current.players = st.players; stateRef.current.snowballs = st.snowballs; stateRef.current.obstacles = st.obstacles || []; });
        socket.on('snowballCreated', (sb: { id: string; x: number; y: number }) => {
          const exists = stateRef.current.snowballs.find((s) => s.id === sb.id);
          if (!exists) stateRef.current.snowballs = [...stateRef.current.snowballs, sb];
        });

        if (botsRequestedRef.current !== botCount) {
          botsRequestedRef.current = botCount;
          setTimeout(() => { try { socket.emit('addBots', { count: botCount }); } catch (e) {} }, 300);
        }
      } catch (err) {
        console.error('failed to load socket.io-client in the browser', err);
      }
    })();

    // input and rendering setup
    const keys: Record<string, boolean> = {};
    let mouse = { x: 0, y: 0 };

    function onKey(d: KeyboardEvent, down: boolean) {
      keys[d.key.toLowerCase()] = down;
      if (down && d.key === 'Escape') { setShowEscapeConfirm(true); d.preventDefault(); return; }
      if (down && d.key === ' ') {
        if (showEscapeConfirm) return;
        const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
        if (!me) return;
        const px = mouse.x; const py = mouse.y; const dx = px - me.x; const dy = py - me.y;
        try { debugGraphics.clear(); debugGraphics.lineStyle(2, 0x00ff00); debugGraphics.moveTo(me.x, me.y); debugGraphics.lineTo(px, py); } catch (e) {}
        setTimeout(() => { debugGraphics.clear(); }, 600);
        socketRef.current?.emit('throwSnowball', { dx, dy });
      }
    }

    function onMouse(e: MouseEvent) {
      const view = app.view as HTMLCanvasElement;
      if (view) {
        const rect = view.getBoundingClientRect();
        const cssX = e.clientX - rect.left; const cssY = e.clientY - rect.top;
        const scaleX = app.renderer.width / rect.width || 1; const scaleY = app.renderer.height / rect.height || 1;
        mouse.x = cssX * scaleX; mouse.y = cssY * scaleY;
      } else { mouse.x = e.clientX; mouse.y = e.clientY; }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      try {
        if (showEscapeConfirm) return;
        const view = app.view as HTMLCanvasElement | undefined;
        const target = e.target as Node | null;
        if (view && target !== view) { if (!containerRef.current || !containerRef.current.contains(target)) return; }
        const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
        if (!me) return;
        const px = mouse.x; const py = mouse.y; const dx = px - me.x; const dy = py - me.y;
        socketRef.current?.emit('throwSnowball', { dx, dy });
      } catch (e) {}
    }

    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mousedown', onMouseDown);

    // graphics maps
    const playerDisplays = new Map<string, { container: PIXI.Container; body: PIXI.Graphics; hb: PIXI.Graphics; txt: PIXI.Text; nameTxt: PIXI.Text; }>();
    const snowSprites = new Map<string, PIXI.Graphics>();
    const obstacleSprites = new Map<string, PIXI.Graphics>();

    const scoreStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 12 });
    const nameStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 14, fontWeight: 'bold' });

    const debugGraphics = new PIXI.Graphics(); app.stage.addChild(debugGraphics);
    const minimapGraphics = new PIXI.Graphics(); const miniScale = Math.min(200 / MAP_WIDTH, 200 / MAP_HEIGHT); minimapGraphics.x = MAP_WIDTH - Math.round(MAP_WIDTH * miniScale) - 10; minimapGraphics.y = 10; app.stage.addChild(minimapGraphics);

    const scoreboardDivRef = (window as any).__snowball_scoreboard_ref || { current: null };
    if (!(window as any).__snowball_scoreboard_ref) (window as any).__snowball_scoreboard_ref = scoreboardDivRef;
    if (!scoreboardDivRef.current && containerRef.current) {
      const sd = document.createElement('div'); sd.style.position = 'absolute'; sd.style.left = '10px'; sd.style.top = '10px'; sd.style.color = 'white'; sd.style.fontFamily = 'Arial, Helvetica, sans-serif'; sd.style.zIndex = '1000'; containerRef.current.appendChild(sd); scoreboardDivRef.current = sd;
    }

    const selectedHighlight = new PIXI.Graphics(); app.stage.addChild(selectedHighlight);

    app.ticker.add(() => {
      const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
      if (me) {
        const speed = 3; let nx = me.x; let ny = me.y;
        if (keys['arrowup'] || keys['w']) ny -= speed;
        if (keys['arrowdown'] || keys['s']) ny += speed;
        if (keys['arrowleft'] || keys['a']) nx -= speed;
        if (keys['arrowright'] || keys['d']) nx += speed;
        if (nx !== me.x || ny !== me.y) socketRef.current?.emit('move', { x: nx, y: ny });
      }

      const players = stateRef.current.players;
      for (const p of players) {
        let d = playerDisplays.get(p.id);
        if (!d) {
          const container = new PIXI.Container(); const body = new PIXI.Graphics(); const hb = new PIXI.Graphics(); const txt = new PIXI.Text(`${p.score}`, scoreStyle); const nameTxt = new PIXI.Text(p.name || '', nameStyle);
          const colNum = Number(((p.color || '#2f9cff').replace('#', '0x')));
          body.beginFill(colNum); body.drawCircle(0, -8, 8); body.drawRect(-8, 2, 16, 18); body.endFill(); hb.beginFill(0x000000); hb.drawRect(-20, -20, 40, 6); hb.endFill(); txt.x = 18; txt.y = -8; nameTxt.x = -nameTxt.width / 2; nameTxt.y = -36;
          container.addChild(body); container.addChild(hb); container.addChild(txt); container.addChild(nameTxt);
          (container as any).eventMode = 'static'; try { (container as any).cursor = 'pointer'; } catch (e) {}
          container.on('pointerdown', () => { selectedHighlight.clear(); selectedHighlight.lineStyle(2, 0xffff00); selectedHighlight.drawRect(p.x - 18, p.y - 36, 36, 48); });
          app.stage.addChild(container); d = { container, body, hb, txt, nameTxt }; playerDisplays.set(p.id, d);
        }
        d.container.x = p.x; d.container.y = p.y; d.nameTxt.text = p.name || ''; d.nameTxt.x = -d.nameTxt.width / 2; d.hb.clear(); d.hb.beginFill(0x000000); d.hb.drawRect(-20, -20, 40, 6); d.hb.endFill(); d.hb.beginFill(0xff4444); d.hb.drawRect(-20, -20, (p.health / 100) * 40, 6); d.hb.endFill(); d.txt.text = `${p.score}`;
      }

      for (const [id, disp] of playerDisplays) {
        if (!players.find((p) => p.id === id)) { app.stage.removeChild(disp.container); disp.body.destroy(); disp.hb.destroy(); disp.txt.destroy(); playerDisplays.delete(id); }
      }

      const sbs = stateRef.current.snowballs;
      for (const sb of sbs) {
        let g = snowSprites.get(sb.id);
        if (!g) { g = new PIXI.Graphics(); snowSprites.set(sb.id, g); app.stage.addChild(g); }
        g.clear(); g.beginFill(0xffffff); g.drawCircle(0, 0, 6); g.endFill(); g.x = sb.x; g.y = sb.y;
      }
      for (const [id, spr] of snowSprites) { if (!sbs.find((s) => s.id === id)) { app.stage.removeChild(spr); spr.destroy(); snowSprites.delete(id); } }

      const obsList = stateRef.current.obstacles || [];
      for (const o of obsList) {
        let g = obstacleSprites.get(o.id);
        if (!g) { g = new PIXI.Graphics(); obstacleSprites.set(o.id, g); app.stage.addChild(g); }
        g.clear(); g.beginFill(0xe6f2ff); g.drawRect(0, 0, o.w, o.h); g.endFill(); g.beginFill(0xff4444); const hpWidth = Math.max(2, (o.hp / 150) * o.w); g.drawRect(0, -6, hpWidth, 4); g.endFill(); g.x = o.x; g.y = o.y;
      }
      for (const [id, spr] of obstacleSprites) { if (!obsList.find((o) => o.id === id)) { app.stage.removeChild(spr); spr.destroy(); obstacleSprites.delete(id); } }

      try {
        minimapGraphics.clear(); const miniW = Math.round(MAP_WIDTH * miniScale); const miniH = Math.round(MAP_HEIGHT * miniScale); minimapGraphics.beginFill(0x0b0b0b, 0.6); minimapGraphics.drawRect(0, 0, miniW + 2, miniH + 2); minimapGraphics.endFill();
        for (const o of obsList) { minimapGraphics.beginFill(0xffffff); minimapGraphics.drawRect(Math.round(o.x * miniScale), Math.round(o.y * miniScale), Math.max(2, Math.round(o.w * miniScale)), Math.max(2, Math.round(o.h * miniScale))); minimapGraphics.endFill(); }
        for (const p of players) { minimapGraphics.beginFill(p.id === myIdRef.current ? 0x00ff00 : 0x2f9cff); const mx = Math.round(p.x * miniScale); const my = Math.round(p.y * miniScale); minimapGraphics.drawRect(mx, my, 4, 4); minimapGraphics.endFill(); }
      } catch (e) {}

      try {
        const sd = scoreboardDivRef.current as HTMLDivElement | null;
        if (sd) {
          sd.style.display = 'none'; // scoreboard toggling handled in parent UI if needed
          const lb = leaderboardRef.current;
          let html = `<div style="font-weight:bold;margin-bottom:6px">Score: ${me ? me.score : 0}</div>`;
          html += '<div style="font-size:12px">Leaderboard</div>';
          html += '<ol style="margin:4px 0 0 10px;padding:0">';
          if (lb) {
            const entries = Object.entries(lb).sort((a, b) => b[1] - a[1]).slice(0, 6);
            for (const [name, sc] of entries) html += `<li style="color:${name === (me?.name||'') ? '#00ff00' : '#fff'}">${name.slice(0,12)} — ${sc}</li>`;
          } else {
            const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 6);
            for (const s of sorted) html += `<li style="color:${s.id === myIdRef.current ? '#00ff00' : '#fff'}">${(s.name||'Player').slice(0,12)} — ${s.score}</li>`;
          }
          html += '</ol>';
          html += '<div style="margin-top:8px"><button id="restartBtn">Restart Game</button></div>';
          sd.innerHTML = html;
          const btn = document.getElementById('restartBtn'); if (btn) btn.onclick = () => { try { socketRef.current?.emit('restartGame'); } catch (e) {} };
        }
      } catch (e) {}
    });

    return () => {
      try { app.destroy(true, { children: true }); } catch (e) {}
      try { appRef.current = null; } catch (e) {}
      try { socketRef.current?.disconnect(); } catch (e) {}
      try { const sd = (scoreboardDivRef && (scoreboardDivRef as any).current) as HTMLDivElement | null; if (sd && containerRef.current) { try { containerRef.current.removeChild(sd); } catch (e) {} } try { if ((window as any).__snowball_scoreboard_ref) (window as any).__snowball_scoreboard_ref.current = null; } catch (e) {} } catch (e) {}
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', (e) => onKey(e, true));
      window.removeEventListener('keyup', (e) => onKey(e, false));
    };
  }, [started]);

  return { containerRef, continueBtnRef, appRef, socketRef };
}
