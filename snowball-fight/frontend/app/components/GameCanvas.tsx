"use client";

import { useEffect, useRef, useState } from 'react';
import { Box, Input, Button, HStack, VStack, Portal, Select } from '@chakra-ui/react';
import * as PIXI from 'pixi.js';

type Player = { id: string; x: number; y: number; health: number; score: number; name?: string; color?: string };
type Snowball = { id: string; x: number; y: number };
type Obstacle = { id: string; x: number; y: number; w: number; h: number; hp: number };
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
// Map size (client-side). Can be overridden by NEXT_PUBLIC_MAP_WIDTH/HEIGHT environment variables.
const MAP_WIDTH = Number(process.env.NEXT_PUBLIC_MAP_WIDTH) || 1600;
const MAP_HEIGHT = Number(process.env.NEXT_PUBLIC_MAP_HEIGHT) || 900;

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<any>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const stateRef = useRef<{ players: Player[]; snowballs: Snowball[]; obstacles?: Obstacle[] }>({ players: [], snowballs: [], obstacles: [] });
    const myIdRef = useRef<string | null>(null);
  const [started, setStarted] = useState(false);
  const [botCount, setBotCount] = useState<number>(0);
  const [localPlayers, setLocalPlayers] = useState<number>(1);
  const [playerName, setPlayerName] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_name') || 'Player' : 'Player'));
  const [playerColor, setPlayerColor] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_color') || '#2f9cff' : '#2f9cff'));
  const [mounted, setMounted] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const leaderboardRef = useRef<Record<string, number> | null>(null);
  const [homeLeaderboard, setHomeLeaderboard] = useState<Record<string, number> | null>(null);
  const [showHomeLeaderboard, setShowHomeLeaderboard] = useState(false);
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  // mark mounted on first client render to avoid SSR/client hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!started) return;

    // mark mounted so we can avoid SSR/client hydration mismatches for UI that
    // depends on localStorage (like selected color swatch)
    setMounted(true);

    const app = new PIXI.Application({
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      backgroundColor: 0x1b1b1b,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    appRef.current = app;
    if (containerRef.current) {
      // set container size to match the map and append the canvas
      containerRef.current.style.width = `${MAP_WIDTH}px`;
      containerRef.current.style.height = `${MAP_HEIGHT}px`;
      containerRef.current.style.margin = '0 auto';
      containerRef.current.style.position = 'relative';
      containerRef.current.appendChild(app.view as HTMLCanvasElement);
      // ensure canvas displays at native pixel size
      const view = app.view as HTMLCanvasElement;
      view.style.width = `${MAP_WIDTH}px`;
      view.style.height = `${MAP_HEIGHT}px`;
    }

    // lazy-load socket.io-client in the browser to avoid Next.js server/build-time resolving node-only optional deps
    (async () => {
      try {
        // prefer the bundled browser build if present to avoid pulling node-only debug/ws codepaths
        let sockMod: any = null;
        try {
          // @ts-ignore - import the browser bundle entry (may not have TS types)
          sockMod = await import('socket.io-client/dist/socket.io.js');
        } catch (e) {
          // fallback to package entry
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
          if (data.leaderboard) {
            leaderboardRef.current = data.leaderboard;
          }
          // send chosen name + color
          try {
            socket.emit('setName', { name: playerName, color: playerColor });
            localStorage.setItem('snowball_name', playerName);
            localStorage.setItem('snowball_color', playerColor);
          } catch (e) {}
        });

        socket.on('playerJoined', (p: Player) => {
          stateRef.current.players = [...stateRef.current.players.filter((x) => x.id !== p.id), p];
        });

        socket.on('playerLeft', ({ id }: { id: string }) => {
          stateRef.current.players = stateRef.current.players.filter((p) => p.id !== id);
        });

        socket.on('playerUpdated', (p: Player) => {
          stateRef.current.players = [...stateRef.current.players.filter((x) => x.id !== p.id), p];
        });

        socket.on('leaderboard', (lb: Record<string, number>) => {
          leaderboardRef.current = lb;
        });

        socket.on('roundWinner', (data: { id: string; name: string }) => {
          setRoundWinner(data.name);
        });

        socket.on('state', (st: { players: Player[]; snowballs: Snowball[]; obstacles?: Obstacle[] }) => {
          stateRef.current.players = st.players;
          stateRef.current.snowballs = st.snowballs;
          stateRef.current.obstacles = st.obstacles || [];
        });

        // handle immediate snowball creations (server notifies right away)
        socket.on('snowballCreated', (sb: { id: string; x: number; y: number }) => {
          // if we already have it in state, skip; otherwise add to state so it will be rendered
          const exists = stateRef.current.snowballs.find((s) => s.id === sb.id);
          if (!exists) {
            stateRef.current.snowballs = [...stateRef.current.snowballs, sb];
          }
        });
        // if user requested bots, ask the server to spawn them shortly after connect
        if (botCount && botCount > 0) {
          setTimeout(() => {
            try { socket.emit('addBots', { count: botCount }); } catch (e) {}
          }, 300);
        }
      } catch (err) {
        console.error('failed to load socket.io-client in the browser', err);
      }
    })();

    // simple input
    const keys: Record<string, boolean> = {};
    let mouse = { x: 0, y: 0 };

    // Tab key toggles leaderboard visibility
    function onTabKey(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowLeaderboard((s) => !s);
      }
    }
  window.addEventListener('keydown', onTabKey);

  const keydownHandler = (e: KeyboardEvent) => onKey(e, true);
  const keyupHandler = (e: KeyboardEvent) => onKey(e, false);

    function onKey(d: KeyboardEvent, down: boolean) {
      keys[d.key.toLowerCase()] = down;
      if (down && d.key === ' ') {
        // throw — use mapped mouse coordinates (canvas space)
    const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
        if (!me) return;
        const px = mouse.x;
        const py = mouse.y;
        const dx = px - me.x;
        const dy = py - me.y;
        console.log('emit throw', { px, py, meX: me.x, meY: me.y, dx, dy });
        // visual debug: draw a short line indicating throw direction for 600ms
        try {
          debugGraphics.clear();
          debugGraphics.lineStyle(2, 0x00ff00);
          debugGraphics.moveTo(me.x, me.y);
          debugGraphics.lineTo(px, py);
        } catch (e) {
          // ignore drawing errors
        }
        setTimeout(() => {
          debugGraphics.clear();
        }, 600);

  socketRef.current?.emit('throwSnowball', { dx, dy });
      }
    }

    function onMouse(e: MouseEvent) {
      // Map window coordinates to canvas coordinates, accounting for canvas position and CSS scaling
      const view = app.view as HTMLCanvasElement;
      if (view) {
        const rect = view.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        // account for renderer resolution vs CSS size
        const scaleX = app.renderer.width / rect.width || 1;
        const scaleY = app.renderer.height / rect.height || 1;
        mouse.x = cssX * scaleX;
        mouse.y = cssY * scaleY;
      } else {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return; // left click only
      try {
        const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
        if (!me) return;
        const px = mouse.x;
        const py = mouse.y;
        const dx = px - me.x;
        const dy = py - me.y;
        socketRef.current?.emit('throwSnowball', { dx, dy });
      } catch (e) {}
    }

  window.addEventListener('keydown', keydownHandler);
  window.addEventListener('keyup', keyupHandler);
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mousedown', onMouseDown);

    // graphics maps
    const playerDisplays = new Map<
      string,
      {
        container: PIXI.Container;
        body: PIXI.Graphics;
        hb: PIXI.Graphics;
        txt: PIXI.Text; // score text
        nameTxt: PIXI.Text; // name above player
      }
    >();
    const snowSprites = new Map<string, PIXI.Graphics>();
    const obstacleSprites = new Map<string, PIXI.Graphics>();

    const scoreStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 12 });
    const nameStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 14, fontWeight: 'bold' });

    // debug graphics for showing last throw vector
    const debugGraphics = new PIXI.Graphics();
    app.stage.addChild(debugGraphics);

    // minimap graphics
    const minimapGraphics = new PIXI.Graphics();
    const miniScale = Math.min(200 / MAP_WIDTH, 200 / MAP_HEIGHT);
    minimapGraphics.x = MAP_WIDTH - Math.round(MAP_WIDTH * miniScale) - 10;
    minimapGraphics.y = 10;
    app.stage.addChild(minimapGraphics);

    // scoreboard (HTML overlay) — attach to the container and keep a persistent ref so we can remove it reliably
    const scoreboardDivRef = (window as any).__snowball_scoreboard_ref || { current: null };
    // if an existing global ref isn't present, create one that we can reuse across mounts in dev
    if (!(window as any).__snowball_scoreboard_ref) (window as any).__snowball_scoreboard_ref = scoreboardDivRef;
    if (!scoreboardDivRef.current && containerRef.current) {
      const sd = document.createElement('div');
      sd.style.position = 'absolute';
      sd.style.left = '10px';
      sd.style.top = '10px';
      sd.style.color = 'white';
      sd.style.fontFamily = 'Arial, Helvetica, sans-serif';
      sd.style.zIndex = '1000';
      containerRef.current.appendChild(sd);
      scoreboardDivRef.current = sd;
    }

    // selection highlight
    const selectedHighlight = new PIXI.Graphics();
    app.stage.addChild(selectedHighlight);

  // main loop
  app.ticker.add(() => {
      // send movement updates
    const me = stateRef.current.players.find((p) => p.id === myIdRef.current);
      if (me) {
        const speed = 3;
        let nx = me.x;
        let ny = me.y;
  if (keys['arrowup'] || keys['w']) ny -= speed;
        if (keys['arrowdown'] || keys['s']) ny += speed;
        if (keys['arrowleft'] || keys['a']) nx -= speed;
        if (keys['arrowright'] || keys['d']) nx += speed;
        if (nx !== me.x || ny !== me.y) {
          socketRef.current?.emit('move', { x: nx, y: ny });
        }
      }

      // render players (reuse display objects to avoid creating new Graphics/text each frame)
      const players = stateRef.current.players;
      for (const p of players) {
        let d = playerDisplays.get(p.id);
        if (!d) {
          const container = new PIXI.Container();
          const body = new PIXI.Graphics();
          const hb = new PIXI.Graphics();
          const txt = new PIXI.Text(`${p.score}`, scoreStyle);
          const nameTxt = new PIXI.Text(p.name || '', nameStyle);

          // draw simple humanoid: head and torso
          const colNum = Number(((p.color || '#2f9cff').replace('#', '0x')));
          body.beginFill(colNum); // head/body color
          // head
          body.drawCircle(0, -8, 8);
          // torso
          body.drawRect(-8, 2, 16, 18);
          body.endFill();

          // health bar background (black) — foreground updated each frame
          hb.beginFill(0x000000);
          hb.drawRect(-20, -20, 40, 6);
          hb.endFill();

          txt.x = 18;
          txt.y = -8;

          nameTxt.x = -nameTxt.width / 2;
          nameTxt.y = -36;

          container.addChild(body);
          container.addChild(hb);
          container.addChild(txt);
          container.addChild(nameTxt);
          // use eventMode instead of deprecated interactive/buttonMode
          (container as any).eventMode = 'static';
          try { (container as any).cursor = 'pointer'; } catch (e) {}
          container.on('pointerdown', () => {
            // highlight when clicked
            selectedHighlight.clear();
            selectedHighlight.lineStyle(2, 0xffff00);
            selectedHighlight.drawRect(p.x - 18, p.y - 36, 36, 48);
          });

          app.stage.addChild(container);

          d = { container, body, hb, txt, nameTxt };
          playerDisplays.set(p.id, d);
        }

        // update position
        d.container.x = p.x;
        d.container.y = p.y;

        // update name text (in case changed)
        d.nameTxt.text = p.name || '';
        d.nameTxt.x = -d.nameTxt.width / 2;

  // update health bar (red foreground)
  d.hb.clear();
  d.hb.beginFill(0x000000);
  d.hb.drawRect(-20, -20, 40, 6);
  d.hb.endFill();
  d.hb.beginFill(0xff4444);
  d.hb.drawRect(-20, -20, (p.health / 100) * 40, 6);
  d.hb.endFill();

        // update score text
        d.txt.text = `${p.score}`;
      }

      // remove old player displays
      for (const [id, disp] of playerDisplays) {
        if (!players.find((p) => p.id === id)) {
          app.stage.removeChild(disp.container);
          disp.body.destroy();
          disp.hb.destroy();
          disp.txt.destroy();
          playerDisplays.delete(id);
        }
      }

  // render snowballs
      const sbs = stateRef.current.snowballs;
      for (const sb of sbs) {
        let g = snowSprites.get(sb.id);
        if (!g) {
          g = new PIXI.Graphics();
          snowSprites.set(sb.id, g);
          app.stage.addChild(g);
        }
        g.clear();
        g.beginFill(0xffffff);
        g.drawCircle(0, 0, 6);
        g.endFill();
        g.x = sb.x;
        g.y = sb.y;
      }
      // cleanup snowballs
      for (const [id, spr] of snowSprites) {
        if (!sbs.find((s) => s.id === id)) {
          app.stage.removeChild(spr);
          spr.destroy();
          snowSprites.delete(id);
        }
      }

      // render obstacles
      const obsList = stateRef.current.obstacles || [];
      for (const o of obsList) {
        let g = obstacleSprites.get(o.id);
        if (!g) {
          g = new PIXI.Graphics();
          obstacleSprites.set(o.id, g);
          app.stage.addChild(g);
        }
        g.clear();
        // snow-colored base
        g.beginFill(0xe6f2ff);
        g.drawRect(0, 0, o.w, o.h);
        g.endFill();
        // hp overlay (red bar at top)
        g.beginFill(0xff4444);
        const hpWidth = Math.max(2, (o.hp / 150) * o.w);
        g.drawRect(0, -6, hpWidth, 4);
        g.endFill();
        g.x = o.x;
        g.y = o.y;
      }
      // cleanup obstacles
      for (const [id, spr] of obstacleSprites) {
        if (!obsList.find((o) => o.id === id)) {
          app.stage.removeChild(spr);
          spr.destroy();
          obstacleSprites.delete(id);
        }
      }

  // update minimap
      try {
        minimapGraphics.clear();
        const miniW = Math.round(MAP_WIDTH * miniScale);
        const miniH = Math.round(MAP_HEIGHT * miniScale);
        minimapGraphics.beginFill(0x0b0b0b, 0.6);
        minimapGraphics.drawRect(0, 0, miniW + 2, miniH + 2);
        minimapGraphics.endFill();
        // draw obstacles scaled
        for (const o of obsList) {
          minimapGraphics.beginFill(0xffffff);
          minimapGraphics.drawRect(Math.round(o.x * miniScale), Math.round(o.y * miniScale), Math.max(2, Math.round(o.w * miniScale)), Math.max(2, Math.round(o.h * miniScale)));
          minimapGraphics.endFill();
        }
        // draw players as dots
        for (const p of players) {
          minimapGraphics.beginFill(p.id === myIdRef.current ? 0x00ff00 : 0x2f9cff);
          const mx = Math.round(p.x * miniScale);
          const my = Math.round(p.y * miniScale);
          minimapGraphics.drawRect(mx, my, 4, 4);
          minimapGraphics.endFill();
        }
      } catch (e) {
        // ignore minimap render errors
      }

      // update scoreboard HTML (toggle visibility with Tab)
      try {
        const sd = scoreboardDivRef.current as HTMLDivElement | null;
        if (sd) {
          sd.style.display = showLeaderboard ? 'block' : 'none';
          const lb = leaderboardRef.current;
          let html = `<div style="font-weight:bold;margin-bottom:6px">Score: ${me ? me.score : 0}</div>`;
          html += '<div style="font-size:12px">Leaderboard</div>';
          html += '<ol style="margin:4px 0 0 10px;padding:0">';
          if (lb) {
            const entries = Object.entries(lb).sort((a, b) => b[1] - a[1]).slice(0, 6);
            for (const [name, sc] of entries) {
              html += `<li style="color:${name === (me?.name||'') ? '#00ff00' : '#fff'}">${name.slice(0,12)} — ${sc}</li>`;
            }
          } else {
            const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 6);
            for (const s of sorted) {
              html += `<li style="color:${s.id === myIdRef.current ? '#00ff00' : '#fff'}">${(s.name||'Player').slice(0,12)} — ${s.score}</li>`;
            }
          }
          html += '</ol>';
          html += '<div style="margin-top:8px"><button id="restartBtn">Restart Game</button></div>';
          sd.innerHTML = html;
          const btn = document.getElementById('restartBtn');
          if (btn) {
            btn.onclick = () => { try { socketRef.current?.emit('restartGame'); } catch (e) {} };
          }
        }
      } catch (e) {}
    });

    return () => {
      try { app.destroy(true, { children: true }); } catch (e) {}
      try { socketRef.current?.disconnect(); } catch (e) {}
      try {
        const sd = (scoreboardDivRef && (scoreboardDivRef as any).current) as HTMLDivElement | null;
        if (sd && containerRef.current) {
          try { containerRef.current.removeChild(sd); } catch (e) {}
        }
        // clear the global ref to avoid stale DOM refs across mounts in dev
        try { if ((window as any).__snowball_scoreboard_ref) (window as any).__snowball_scoreboard_ref.current = null; } catch (e) {}
      } catch (e) {}
  window.removeEventListener('keydown', onTabKey);
  window.removeEventListener('keydown', keydownHandler);
  window.removeEventListener('keyup', keyupHandler);
  window.removeEventListener('mousemove', onMouse);
  window.removeEventListener('mousedown', onMouseDown);
    };
  }, [started]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      {!started ? (
        <div style={{ width: 480, padding: 20, background: '#111', color: '#fff', borderRadius: 8 }}>
          <h2>Snowball Fight</h2>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} style={{ width: '100%', padding: 8, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['#2f9cff', '#ff6b6b', '#ffd166', '#8aff8a', '#d99bff'].map((c) => (
                <div
                  key={c}
                  onClick={() => setPlayerColor(c)}
                  style={{ width: 32, height: 32, background: c, borderRadius: 4, cursor: 'pointer', boxShadow: mounted && playerColor === c ? '0 0 0 3px #fff inset' : 'none' }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ color: '#ddd' }}>Local players</label>
              <select value={localPlayers} onChange={(e) => setLocalPlayers(Number(e.target.value))} style={{ padding: 6, width: 80, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ color: '#ddd' }}>Bots</label>
              <select value={botCount} onChange={(e) => setBotCount(Number(e.target.value))} style={{ padding: 6, width: 80, background: '#fff', color: '#111', borderRadius: 4, border: '1px solid rgba(0,0,0,0.12)' }}>
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
            <button onClick={() => setStarted(true)} style={{ padding: '8px 12px' }}>
              Start Game
            </button>
            <button onClick={async () => {
              // fetch persistent leaderboard from the server and show it in a modal
              try {
                const res = await fetch(BACKEND + '/leaderboard');
                if (res.ok) {
                  const data = await res.json();
                  setHomeLeaderboard(data || {});
                  setShowHomeLeaderboard(true);
                } else {
                  setHomeLeaderboard(null);
                  setShowHomeLeaderboard(true);
                }
              } catch (e) {
                setHomeLeaderboard(null);
                setShowHomeLeaderboard(true);
              }
            }} style={{ padding: '8px 12px' }}>
              Show Leaderboard
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div ref={containerRef} />
        </div>
      )}
      {showHomeLeaderboard && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ width: 360, background: '#222', color: '#fff', padding: 16, borderRadius: 8 }}>
            <h3>Leaderboard</h3>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {homeLeaderboard ? (
                <ol>
                  {Object.entries(homeLeaderboard).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name, sc]) => (
                    <li key={name}>{name} — {sc}</li>
                  ))}
                </ol>
              ) : (
                <div>No leaderboard data</div>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHomeLeaderboard(false)} style={{ padding: '6px 10px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {roundWinner && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ width: 520, background: '#111', color: '#fff', padding: 24, borderRadius: 10, textAlign: 'center' }}>
            <h2 style={{ marginBottom: 10 }}>Round Winner</h2>
            <div style={{ fontSize: 20, marginBottom: 16 }}>The player <strong>{roundWinner}</strong> won the snow match.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => { try { socketRef.current?.emit('restartGame'); } catch(e){}; setRoundWinner(null); }} style={{ padding: '8px 12px' }}>Restart</button>
              <button onClick={() => setRoundWinner(null)} style={{ padding: '8px 12px' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
