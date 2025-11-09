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
  localPlayers?: number;
  showEscapeConfirm: boolean;
  setShowEscapeConfirm: (b: boolean) => void;
  setRoundWinner: (s: string | null) => void;
  setHomeLeaderboard: (lb: Record<string, number> | null) => void;
  setShowHomeLeaderboard: (b: boolean) => void;
};

export default function useGameEngine(opts: UseGameEngineOpts) {
  // destructure options (includes localPlayers)
  const { started, playerName, playerColor, botCount, localPlayers = 1, showEscapeConfirm, setShowEscapeConfirm, setRoundWinner, setHomeLeaderboard, setShowHomeLeaderboard } = opts;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<any>(null); // primary socket (for backwards compat)
  const socketRefsRef = useRef<any[]>([]); // all sockets for local players
  const botsRequestedRef = useRef<number | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const stateRef = useRef<{ players: Player[]; snowballs: Snowball[]; obstacles?: Obstacle[] }>({ players: [], snowballs: [], obstacles: [] });
  const myIdRef = useRef<string | null>(null); // primary id
  const myIdsRef = useRef<string[]>([]); // ids for all local sockets
  const aimRef = useRef<Array<{ x: number; y: number }>>([]); // aim vector per local player
  const leaderboardRef = useRef<Record<string, number> | null>(null);
  const continueBtnRef = useRef<HTMLButtonElement | null>(null);
  // keysRef is used across effects/handlers so we can clear it when the game is paused
  const keysRef = useRef<Record<string, boolean>>({});

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

        // create one socket per local player (1 or 2). primary socketRefsRef.current[0]
        socketRefsRef.current = [];
        myIdsRef.current = [];

        for (let i = 0; i < Math.max(1, localPlayers); i++) {
          const socket = typeof ioCtor === 'function' ? ioCtor(BACKEND) : (sockMod as any).connect ? (sockMod as any).connect(BACKEND) : null;
          socketRefsRef.current.push(socket);

          // per-socket init handler
          socket.on('init', (data: { id: string; players: Player[]; snowballs?: Snowball[]; obstacles?: Obstacle[]; leaderboard?: Record<string, number> }) => {
            myIdsRef.current[i] = data.id;
            // update global state
            stateRef.current.players = data.players || [];
            stateRef.current.snowballs = data.snowballs || [];
            stateRef.current.obstacles = data.obstacles || [];
            if (data.leaderboard) leaderboardRef.current = data.leaderboard;

            try {
              const name = i === 0 ? playerName : `${playerName} 2`;
              let color = playerColor;
              if (i === 1) {
                color = playerColor === '#2f9cff' ? '#ff6b6b' : '#2f9cff';
              }
              socket.emit('setName', { name, color });
              if (i === 0) { localStorage.setItem('snowball_name', playerName); localStorage.setItem('snowball_color', playerColor); }
            } catch (e) {}
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
        }

        // keep primary references for backwards compat
        socketRef.current = socketRefsRef.current[0];
        myIdRef.current = myIdsRef.current[0] || null;

        if (botsRequestedRef.current !== botCount && socketRefsRef.current[0]) {
          botsRequestedRef.current = botCount;
          setTimeout(() => { try { socketRefsRef.current[0].emit('addBots', { count: botCount }); } catch (e) {} }, 300);
        }
      } catch (err) {
        console.error('failed to load socket.io-client in the browser', err);
      }
    })();

  // input and rendering setup
  // use keysRef.current for shared mutable key state
  keysRef.current = keysRef.current || {};
    let mouse = { x: 0, y: 0 };

    function onKey(d: KeyboardEvent, down: boolean) {
      try { keysRef.current[d.key.toLowerCase()] = down; } catch (e) {}
      if (down && d.key === 'Escape') { setShowEscapeConfirm(true); d.preventDefault(); return; }

      // Keep aimRefs array in sync with localPlayers count
      aimRef.current = aimRef.current || [];
      while (aimRef.current.length < Math.max(1, localPlayers)) aimRef.current.push({ x: 1, y: 0 });

      // When player moves, update that player's last-aim vector so throws use last movement/aim direction
      // Player 1 movement keys
      const key = d.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
        // compute a simple movement vector from current keys
        const k = keysRef.current;
        const v1x = (k['d'] ? 1 : 0) + (k['arrowright'] ? 1 : 0) - (k['a'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0);
        const v1y = (k['s'] ? 1 : 0) + (k['arrowdown'] ? 1 : 0) - (k['w'] ? 1 : 0) - (k['arrowup'] ? 1 : 0);
        if (v1x !== 0 || v1y !== 0) {
          // assign aim for both players depending on which keys are used
          // if WASD used, update player 0 aim; if arrows used, update player1 aim
          if (k['w'] || k['a'] || k['s'] || k['d']) {
            const len = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
            aimRef.current[0] = { x: v1x / len, y: v1y / len };
          }
          if (k['arrowup'] || k['arrowleft'] || k['arrowdown'] || k['arrowright']) {
            const ax = (k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0);
            const ay = (k['arrowdown'] ? 1 : 0) - (k['arrowup'] ? 1 : 0);
            const len2 = Math.sqrt(ax * ax + ay * ay) || 1;
            aimRef.current[1] = { x: ax / len2, y: ay / len2 };
          }
        }
      }

      // Player 1: Space key throws in current aim direction (prefer mouse-derived aim if set)
      if (down && d.key === ' ') {
        if (showEscapeConfirm) return;
        const idx0 = 0;
        const myId0 = myIdsRef.current[idx0] || myIdRef.current;
        const me = stateRef.current.players.find((p) => p.id === myId0);
        if (!me) return;
        // prefer explicit mouse-based aim (set by onMouse), otherwise use aimRef
        const aim = aimRef.current[idx0] || { x: 1, y: 0 };
        const dx = aim.x; const dy = aim.y;
        socketRefsRef.current[0]?.emit('throwSnowball', { dx, dy });
        return;
      }

      // Player 2: Enter to throw using aimRef[1]
      if (down && d.key === 'Enter') {
        if (showEscapeConfirm) return;
        const idx1 = 1;
        const myId1 = myIdsRef.current[idx1];
        if (!myId1) return;
        const me = stateRef.current.players.find((p) => p.id === myId1);
        if (!me) return;
        const aim = aimRef.current[idx1] || { x: 1, y: 0 };
        const dx = aim.x; const dy = aim.y;
        socketRefsRef.current[1]?.emit('throwSnowball', { dx, dy });
        return;
      }
    }

    function onMouse(e: MouseEvent) {
      const view = app.view as HTMLCanvasElement;
      if (view) {
        const rect = view.getBoundingClientRect();
        const cssX = e.clientX - rect.left; const cssY = e.clientY - rect.top;
        const scaleX = app.renderer.width / rect.width || 1; const scaleY = app.renderer.height / rect.height || 1;
        mouse.x = cssX * scaleX; mouse.y = cssY * scaleY;
        // update player 1 aim based on mouse position relative to player 1's position
        const myId0 = myIdsRef.current[0] || myIdRef.current;
        if (myId0) {
          const me = stateRef.current.players.find((p) => p.id === myId0);
          if (me) {
            const dx = mouse.x - me.x; const dy = mouse.y - me.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            aimRef.current[0] = { x: dx / len, y: dy / len };
          }
        }
      } else { mouse.x = e.clientX; mouse.y = e.clientY; }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      try {
        if (showEscapeConfirm) return;
        const view = app.view as HTMLCanvasElement | undefined;
        const target = e.target as Node | null;
        if (view && target !== view) { if (!containerRef.current || !containerRef.current.contains(target)) return; }
        // primary mouse actions go to player 1 (socket 0)
        const myId0 = myIdsRef.current[0] || myIdRef.current;
        const me = stateRef.current.players.find((p) => p.id === myId0);
        if (!me) return;
        const px = mouse.x; const py = mouse.y; const dx = px - me.x; const dy = py - me.y;
        socketRefsRef.current[0]?.emit('throwSnowball', { dx, dy });
      } catch (e) {}
    }

  // named handlers so they can be removed in cleanup
  const keydownHandler = (e: KeyboardEvent) => onKey(e, true);
  const keyupHandler = (e: KeyboardEvent) => onKey(e, false);
  const mousemoveHandler = (e: MouseEvent) => onMouse(e);
  const mousedownHandler = (e: MouseEvent) => onMouseDown(e);

  window.addEventListener('keydown', keydownHandler as any);
  window.addEventListener('keyup', keyupHandler as any);
  window.addEventListener('mousemove', mousemoveHandler as any);
  window.addEventListener('mousedown', mousedownHandler as any);

    // graphics maps
    const playerDisplays = new Map<string, { container: PIXI.Container; body: PIXI.Graphics; hb: PIXI.Graphics; txt: PIXI.Text; nameTxt: PIXI.Text; }>();
    const snowSprites = new Map<string, PIXI.Graphics>();
    const obstacleSprites = new Map<string, PIXI.Graphics>();

    const scoreStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 12 });
    const nameStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 14, fontWeight: 'bold' });

  // debug graphics removed (no aim indicator lines)
  const minimapGraphics = new PIXI.Graphics(); const miniScale = Math.min(200 / MAP_WIDTH, 200 / MAP_HEIGHT); minimapGraphics.x = MAP_WIDTH - Math.round(MAP_WIDTH * miniScale) - 10; minimapGraphics.y = 10; app.stage.addChild(minimapGraphics);

    // Note: scoreboard and HUD are managed by React in GameCanvas. Avoid touching DOM here to prevent
    // 'The deferred DOM Node could not be resolved to a valid node.' warnings. Use leaderboardRef/stateRef
    // for game data only.

    const selectedHighlight = new PIXI.Graphics(); app.stage.addChild(selectedHighlight);

    app.ticker.add(() => {
      const keys = keysRef.current || {};
      const speed = 3;
      // Player 1 (local socket 0) uses WASD
      const myId0 = myIdsRef.current[0] || myIdRef.current;
      if (myId0) {
        const me0 = stateRef.current.players.find((p) => p.id === myId0);
        if (me0) {
          let nx = me0.x; let ny = me0.y;
          if (keys['w']) ny -= speed;
          if (keys['s']) ny += speed;
          if (keys['a']) nx -= speed;
          if (keys['d']) nx += speed;
          if (nx !== me0.x || ny !== me0.y) socketRefsRef.current[0]?.emit('move', { x: nx, y: ny });
        }
      }

      // Player 2 (local socket 1) uses Arrow keys
      const myId1 = myIdsRef.current[1];
      if (myId1) {
        const me1 = stateRef.current.players.find((p) => p.id === myId1);
        if (me1) {
          let nx = me1.x; let ny = me1.y;
          if (keys['arrowup']) ny -= speed;
          if (keys['arrowdown']) ny += speed;
          if (keys['arrowleft']) nx -= speed;
          if (keys['arrowright']) nx += speed;
          if (nx !== me1.x || ny !== me1.y) socketRefsRef.current[1]?.emit('move', { x: nx, y: ny });
        }
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

      // Scoreboard and HUD rendering handled by React. Do not manipulate DOM here.
    });

    return () => {
  try { app.destroy(true, { children: true }); } catch (e) {}
      try { appRef.current = null; } catch (e) {}
  try { (socketRefsRef.current || []).forEach((s) => { try { s?.disconnect(); } catch (e) {} }); } catch (e) {}
  // No DOM cleanup needed for scoreboard; React handles HUD rendering.
      window.removeEventListener('mousemove', mousemoveHandler as any);
      window.removeEventListener('mousedown', mousedownHandler as any);
      window.removeEventListener('keydown', keydownHandler as any);
      window.removeEventListener('keyup', keyupHandler as any);
    };
  }, [started]);

  // Pause/resume the PIXI ticker when escape-confirm modal is shown or hidden
  useEffect(() => {
    const app = appRef.current as PIXI.Application | null;
    if (!app || !(app as any).ticker) return;
    try {
      if (showEscapeConfirm) {
        // stop the ticker and clear input state so movement doesn't continue
        (app as any).ticker.stop();
        keysRef.current = {};
      } else {
        (app as any).ticker.start();
      }
    } catch (e) {
      // ignore ticker control errors
    }
  }, [showEscapeConfirm]);

  return { containerRef, continueBtnRef, appRef, socketRef };
}
