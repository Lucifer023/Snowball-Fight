"use client";

import React, { JSX, useEffect, useRef, useState } from 'react';
import { Box, Input, Select, Button, HStack, VStack, Portal } from '@chakra-ui/react';
import * as PIXI from 'pixi.js';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const MAP_WIDTH = Number(process.env.NEXT_PUBLIC_MAP_WIDTH) || 1600;
const MAP_HEIGHT = Number(process.env.NEXT_PUBLIC_MAP_HEIGHT) || 900;

export default function GameCanvasFixed(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [clientError, setClientError] = useState<null | { message: string; stack?: string }>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const socketRef = useRef<any>(null);
  const scoreboardDivRef = useRef<HTMLDivElement | null>(null);

  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_name') || 'Player' : 'Player'));
  const [playerColor, setPlayerColor] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('snowball_color') || '#2f9cff' : '#2f9cff'));
  const [localPlayers, setLocalPlayers] = useState<number>(1);
  const [botCount, setBotCount] = useState<number>(0);
  const [homeLeaderboard, setHomeLeaderboard] = useState<Record<string, number> | null>(null);
  const [showHomeLeaderboard, setShowHomeLeaderboard] = useState(false);
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  // keep page dark while mounted
  useEffect(() => {
    const prevBg = document.body.style.background || '';
    const prevOverflow = document.documentElement.style.overflow || '';
    try {
      document.body.style.background = '#111';
      document.documentElement.style.overflow = 'hidden';
    } catch (e) {}
    // global error handlers to surface runtime issues
    function onError(ev: ErrorEvent) {
      try {
        console.error('Global error captured', ev.error || ev.message, ev);
        setClientError({ message: String(ev.message || ev.error || 'Unknown error'), stack: (ev.error && ev.error.stack) || undefined });
      } catch (e) {}
    }
    function onRejection(ev: PromiseRejectionEvent) {
      try {
        console.error('Unhandled rejection', ev.reason);
        const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
        const stack = ev.reason instanceof Error ? ev.reason.stack : undefined;
        setClientError({ message: reason, stack });
      } catch (e) {}
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection as any);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection as any);
      try {
        document.body.style.background = prevBg;
        document.documentElement.style.overflow = prevOverflow;
      } catch (e) {}
    };
  }, []);

  function cleanupApp() {
    try {
      if (appRef.current) {
        try { (appRef.current as any).__sceneCleanup?.(); } catch (e) {}
        try { appRef.current.destroy(true, { children: true }); } catch (e) {}
        try { const v = appRef.current.view as HTMLCanvasElement | null; if (v && v.parentNode) v.parentNode.removeChild(v); } catch (e) {}
        appRef.current = null;
      }
    } catch (e) {}
    try { socketRef.current?.disconnect(); } catch (e) {}
    try {
      if (scoreboardDivRef.current) {
        try {
          const parent = scoreboardDivRef.current.parentNode as HTMLElement | null;
          if (parent) parent.removeChild(scoreboardDivRef.current);
        } catch (e) {}
        scoreboardDivRef.current = null;
      }
    } catch (e) {}
  }

  function handleReturnToMenu() {
    cleanupApp();
    setStarted(false);
  }

  useEffect(() => {
    if (!started) return;

    const app = new PIXI.Application({ width: MAP_WIDTH, height: MAP_HEIGHT, backgroundColor: 0x1b1b1b, autoDensity: true, resolution: window.devicePixelRatio || 1 });
    appRef.current = app;

    // ensure the canvas is visible even if the container ref isn't set yet.
    try {
      const view = app.view as HTMLCanvasElement;
  // make canvas fill the viewport and sit under UI buttons
      view.style.position = 'fixed';
      view.style.left = '0';
      view.style.top = '0';
      view.style.width = '100vw';
      view.style.height = '100vh';
      view.style.zIndex = '1000';
  // ensure background is visible and no default margins
  try { view.style.background = '#111'; } catch (e) {}
  try { view.style.display = 'block'; } catch (e) {}

      const mountTarget = containerRef.current || document.body;
      // if we have a container element, make it full-viewport too
      if (containerRef.current) {
        try { containerRef.current.style.position = 'fixed'; } catch (e) {}
        try { containerRef.current.style.left = '0'; } catch (e) {}
        try { containerRef.current.style.top = '0'; } catch (e) {}
        try { containerRef.current.style.width = '100vw'; } catch (e) {}
        try { containerRef.current.style.height = '100vh'; } catch (e) {}
        try { containerRef.current.style.zIndex = '1000'; } catch (e) {}
      }

      try { mountTarget.appendChild(view); } catch (e) { /* ignore */ }

      // scoreboard overlay — attach to the same mount target so it positions correctly
      if (!scoreboardDivRef.current) {
        const sd = document.createElement('div');
        // if mounted on document.body use fixed so it's viewport-relative
        sd.style.position = mountTarget === document.body ? 'fixed' : 'absolute';
        sd.style.left = '10px';
        sd.style.top = '10px';
        sd.style.color = 'white';
        sd.style.fontFamily = 'Arial, Helvetica, sans-serif';
        sd.style.zIndex = '1100';
        sd.style.pointerEvents = 'none';
        sd.style.background = 'transparent';
        try { mountTarget.appendChild(sd); } catch (e) {}
        scoreboardDivRef.current = sd;
      }
    } catch (e) {}

    // basic resize handler
    function resize() {
      try { app.renderer.resize(window.innerWidth, window.innerHeight); } catch (e) {}
      try {
        const view = app.view as HTMLCanvasElement;
        view.style.width = window.innerWidth + 'px';
        view.style.height = window.innerHeight + 'px';
      } catch (e) {}
    }
    resize();
    window.addEventListener('resize', resize);

    // simple ticker to update placeholder scoreboard
    const ticker = () => {
      if (scoreboardDivRef.current) {
        scoreboardDivRef.current.innerHTML = `<div style="font-weight:bold;margin-bottom:6px">Player: ${playerName}</div>`;
      }
    };
    app.ticker.add(ticker);

    // --- game scene: integrate with backend when available, otherwise fall back to local-only scene ---
    try {
      const stage = app.stage;
      stage.removeChildren();

      // local representation; when the server sends a 'state' we'll overwrite playersState
      let playersState: Record<string, any> = {};
      let localId = 'local';

      // simple fallback player while waiting for server
      playersState[localId] = { id: localId, x: app.renderer.width / 2, y: app.renderer.height / 2, r: 18, color: playerColor || '#2f9cff', score: 0 };

      const projectiles: any[] = [];

      function makeCircleSprite(radius: number, colorHex: number) {
        const g = new PIXI.Graphics();
        g.beginFill(colorHex);
        g.drawCircle(0, 0, radius);
        g.endFill();
        const tex = app.renderer.generateTexture(g);
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5);
        return s;
      }

      // sprite maps
      const playerSprites: Record<string, PIXI.Sprite> = {};

      // create initial local sprite
      const localSprite = makeCircleSprite(playersState[localId].r, 0xffffff);
      localSprite.x = playersState[localId].x; localSprite.y = playersState[localId].y;
      try { localSprite.tint = parseInt((playersState[localId].color || '#2f9cff').replace('#', ''), 16); } catch (e) {}
      playerSprites[localId] = localSprite;
      stage.addChild(localSprite);

      // input handling
      const keys: Record<string, boolean> = {};
      function onKey(e: KeyboardEvent) { keys[e.key.toLowerCase()] = e.type === 'keydown'; }
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);

      let lastShot = 0;
      function onPointerDown(ev: PointerEvent) {
        const now = Date.now();
        if (now - lastShot < 120) return;
        lastShot = now;
        const rect = (app.view as HTMLCanvasElement).getBoundingClientRect();
        const tx = ev.clientX - rect.left;
        const ty = ev.clientY - rect.top;
        const me = playersState[localId];
        if (!me) return;
        const dx = tx - me.x;
        const dy = ty - me.y;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        const speed = 8;
        // local immediate projectile for responsiveness
        projectiles.push({ id: `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, x: me.x, y: me.y, vx: (dx / len) * speed, vy: (dy / len) * speed, r: 6, owner: localId });
        // emit to server
        try { socketRef.current?.emit('throwSnowball', { dx, dy }); } catch (e) {}
      }
      window.addEventListener('pointerdown', onPointerDown);

      // scene ticker consumes current playersState and projectiles
      let lastMoveEmit = 0;
      const sceneTicker = () => {
        const w = app.renderer.width;
        const h = app.renderer.height;

        // move local player from input
        const spd = 3.6;
        const me = playersState[localId];
        if (me) {
          let vx = 0, vy = 0;
          if (keys['w'] || keys['arrowup']) vy -= 1;
          if (keys['s'] || keys['arrowdown']) vy += 1;
          if (keys['a'] || keys['arrowleft']) vx -= 1;
          if (keys['d'] || keys['arrowright']) vx += 1;
          const mag = Math.hypot(vx, vy) || 1;
          me.x += (vx / mag) * spd;
          me.y += (vy / mag) * spd;
          me.x = Math.max(me.r || 18, Math.min(w - (me.r || 18), me.x));
          me.y = Math.max(me.r || 18, Math.min(h - (me.r || 18), me.y));

          // emit move to server at ~20Hz
          const now = performance.now();
          if (socketRef.current && now - lastMoveEmit > 50) {
            lastMoveEmit = now;
            try { socketRef.current.emit('move', { x: me.x, y: me.y }); } catch (e) {}
          }
        }

        // update sprites for playersState
        for (const id of Object.keys(playersState)) {
          const p = playersState[id];
          if (!playerSprites[id]) {
            const s = makeCircleSprite(p.r || 16, 0xffffff);
            try { s.tint = parseInt((p.color || '#ffd166').replace('#', ''), 16); } catch (e) {}
            s.x = p.x; s.y = p.y;
            playerSprites[id] = s;
            stage.addChild(s);
          } else {
            const s = playerSprites[id];
            s.x = p.x; s.y = p.y;
            // tint might change on name/color update
            try { s.tint = parseInt((p.color || '#ffd166').replace('#', ''), 16); } catch (e) {}
          }
        }
        // remove sprites for players no longer present
        for (const id of Object.keys(playerSprites)) {
          if (!playersState[id]) {
            const s = playerSprites[id];
            if (s && s.parent) s.parent.removeChild(s);
            delete playerSprites[id];
          }
        }

        // advance projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.x += p.vx; p.y += p.vy;
          if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
            projectiles.splice(i, 1);
          }
        }

        // redraw projectile layer
        try {
          const prev = stage.getChildByName('__projectiles');
          if (prev) stage.removeChild(prev);
          const layer = new PIXI.Container(); layer.name = '__projectiles';
          for (const p of projectiles) {
            const g = new PIXI.Graphics(); g.beginFill(0xffffff); g.drawCircle(0,0,p.r); g.endFill();
            const sp = new PIXI.Sprite(app.renderer.generateTexture(g)); sp.anchor.set(0.5); sp.x = p.x; sp.y = p.y; layer.addChild(sp);
          }
          stage.addChild(layer);
        } catch (e) {}

        // scoreboard DOM
        if (scoreboardDivRef.current) {
          try {
            const s = (playersState[localId] && playersState[localId].score) || 0;
            const otherCount = Object.keys(playersState).filter((i) => i !== localId).length;
            scoreboardDivRef.current.innerHTML = `<div style="font-weight:bold;margin-bottom:6px">${playerName} — ${s}</div><div style="font-size:12px;opacity:0.9">Players: ${otherCount}</div>`;
          } catch (e) {}
        }
      };

      app.ticker.add(sceneTicker);

      const sceneCleanup = () => {
        try { window.removeEventListener('keydown', onKey); } catch (e) {}
        try { window.removeEventListener('keyup', onKey); } catch (e) {}
        try { window.removeEventListener('pointerdown', onPointerDown); } catch (e) {}
      };
      (app as any).__sceneCleanup = sceneCleanup;

      // wire socket events: keep server state in playersState and create/remove sprites accordingly
      (async () => {
        try {
          const mod = await import('socket.io-client');
          const ctor = (mod && ((mod as any).io || (mod as any).default || mod)) as any;
          const socket = typeof ctor === 'function' ? ctor(BACKEND) : null;
          socketRef.current = socket;

          socket?.on('connect', () => {
            // connected
          });

          socket?.on('init', (data: any) => {
            try {
              localId = data.id || socket.id || localId;
              const map: Record<string, any> = {};
              for (const p of (data.players || [])) map[p.id] = p;
              if (!map[localId]) map[localId] = { id: localId, x: app.renderer.width/2, y: app.renderer.height/2, r: 18, color: playerColor, score: 0 };
              playersState = map;
              for (const s of (data.snowballs || [])) {
                projectiles.push({ id: s.id, x: s.x, y: s.y, vx: 0, vy: 0, r: 6, owner: s.ownerId || 'remote' });
              }
              if (data.leaderboard) setHomeLeaderboard(data.leaderboard);
            } catch (e) {}
          });

          socket?.on('state', (s: any) => {
            try {
              const map: Record<string, any> = {};
              for (const p of (s.players || [])) map[p.id] = p;
              playersState = map;
              if (Array.isArray(s.snowballs)) {
                projectiles.length = 0;
                for (const sb of s.snowballs) projectiles.push({ id: sb.id, x: sb.x, y: sb.y, vx: sb.vx || 0, vy: sb.vy || 0, r: 6, owner: sb.ownerId || 'remote' });
              }
            } catch (e) {}
          });

          socket?.on('playerJoined', (p: any) => {
            try {
              if (Array.isArray(p)) {
                for (const it of p) playersState[it.id] = it;
              } else if (p && p.id) playersState[p.id] = p;
            } catch (e) {}
          });

          socket?.on('playerLeft', (d: any) => {
            try { if (d && d.id) delete playersState[d.id]; } catch (e) {}
          });

          socket?.on('playerUpdated', (p: any) => { try { if (p && p.id) playersState[p.id] = p; } catch (e) {} });

          socket?.on('snowballCreated', (s: any) => { try { projectiles.push({ id: s.id, x: s.x, y: s.y, vx: s.vx || 0, vy: s.vy || 0, r: 6, owner: s.ownerId || 'remote' }); } catch (e) {} });

          socket?.on('leaderboard', (lb: any) => setHomeLeaderboard(lb));
          socket?.on('roundWinner', (d: any) => setRoundWinner(d?.name || null));

          try { socket?.emit('setName', { name: playerName, color: playerColor }); } catch (e) {}
          try { if (botCount && botCount > 0) socket?.emit('addBots', { count: botCount }); } catch (e) {}
        } catch (e) {
          // ignore socket errors — keep fallback local-only scene
        }
      })();

    } catch (e) {
      console.error('Scene init error', e);
    }

    // lazy-load socket.io-client (best effort)
    (async () => {
      try {
        let mod: any = null;
        // load socket.io-client (use package entry)
        mod = await import('socket.io-client');
        const ctor = mod?.io || mod?.default || mod;
        const socket = typeof ctor === 'function' ? ctor(BACKEND) : null;
        socketRef.current = socket;
        socket?.on('leaderboard', (lb: Record<string, number>) => setHomeLeaderboard(lb));
        socket?.on('roundWinner', (d: any) => setRoundWinner(d?.name || null));
        // send chosen name/color
        try { socket?.emit('setName', { name: playerName, color: playerColor }); } catch (e) {}
      } catch (e) {}
    })();

    return () => {
      try {
        // ticker may have been nulled by a concurrent destroy; guard before calling
        if (app && app.ticker && typeof app.ticker.remove === 'function') {
          try { app.ticker.remove(ticker); } catch (e) {}
        }
      } catch (e) {}
      try { window.removeEventListener('resize', resize); } catch (e) {}
      try { cleanupApp(); } catch (e) {}
    };
  }, [started, playerName, playerColor]);

  // ensure we cleanup when component unmounts
  useEffect(() => {
    return () => cleanupApp();
  }, []);

  return (
    <div data-test-id="game-canvas-root" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      {/* client-side runtime error overlay */}
      {clientError && (
        <div style={{ position: 'fixed', left: 12, top: 12, zIndex: 99999, background: 'rgba(255,50,50,0.95)', color: 'white', padding: 12, borderRadius: 6, maxWidth: 'min(96vw,640px)', boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Client runtime error</div>
          <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>{clientError.message}</div>
          {clientError.stack && <details style={{ marginTop: 8, color: '#eee' }}><summary>Stack</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{clientError.stack}</pre></details>}
        </div>
      )}
      {/* mounted indicator removed (debug) */}
      {!started ? (
        <Portal>
          <Box
            // center the portal overlay and keep a subtle polished border
            position="fixed"
            left="50%"
            top="50%"
            transform="translate(-50%,-50%)"
            zIndex={4000}
            width="min(92vw,520px)"
            p={6}
            bgGradient="linear(to-b,#141414,#131313)"
            color="white"
            borderRadius="md"
            boxShadow="lg"
            border="1px solid rgba(255,255,255,0.06)"
          >
            <VStack spacing={4} alignItems="stretch">
              <Box as="h2" fontSize="lg">Snowball Fight</Box>
              <Box>
                <Box mb={2}>Name</Box>
                <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} bg="white" color="#111" />
              </Box>
              <Box>
                <Box mb={2}>Color</Box>
                <HStack>
                  {['#2f9cff', '#ff6b6b', '#ffd166', '#8aff8a', '#d99bff'].map((c) => (
                    <Button key={c} onClick={() => setPlayerColor(c)} bg={c} _hover={{ opacity: 0.9 }} aria-label={`color-${c}`}>
                      {playerColor === c ? '✓' : ''}
                    </Button>
                  ))}
                </HStack>
              </Box>
              <HStack spacing={3} alignItems="center">
                <Box>Local</Box>
                <Select value={localPlayers} onChange={(e) => setLocalPlayers(Number(e.target.value))} width="72px" bg="white" color="#111">
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </Select>
                <Box>Bots</Box>
                <Select value={botCount} onChange={(e) => setBotCount(Number(e.target.value))} width="72px" bg="white" color="#111">
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </Select>
              </HStack>
              <HStack justifyContent="flex-end" spacing={3} pt={3}>
                <Button onClick={() => setStarted(true)} colorScheme="whiteAlpha" bg="white" color="#111">Start</Button>
                <Button variant="ghost" onClick={async () => { try { const res = await fetch(BACKEND + '/leaderboard'); if (res.ok) { const data = await res.json(); setHomeLeaderboard(data || {}); setShowHomeLeaderboard(true); } else { setHomeLeaderboard(null); setShowHomeLeaderboard(true); } } catch (e) { setHomeLeaderboard(null); setShowHomeLeaderboard(true); } }}>Leaderboard</Button>
              </HStack>
            </VStack>
          </Box>
        </Portal>
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div ref={containerRef} />
          <div style={{ position: 'fixed', left: 12, top: 12, zIndex: 3001 }}>
            <Button onClick={handleReturnToMenu} bg="white" color="#111">Main Menu</Button>
          </div>
        </div>
      )}

      {showHomeLeaderboard && (
        <Portal>
          <Box position="fixed" left={0} top={0} right={0} bottom={0} bg="rgba(0,0,0,0.7)" display="flex" alignItems="center" justifyContent="center" zIndex={2000}>
            <Box width={360} bg="#222" color="white" p={4} borderRadius="md">
              <Box as="h3" fontSize="lg">Leaderboard</Box>
              <Box maxH="300px" overflowY="auto">
                <ol>
                  {homeLeaderboard ? Object.entries(homeLeaderboard).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name, sc]) => <li key={name}>{name} — {sc}</li>) : <li>No data</li>}
                </ol>
              </Box>
              <Box display="flex" justifyContent="flex-end" mt={3}><Button onClick={() => setShowHomeLeaderboard(false)}>Close</Button></Box>
            </Box>
          </Box>
        </Portal>
      )}

      {roundWinner && (
        <Portal>
          <Box position="fixed" left={0} top={0} right={0} bottom={0} bg="rgba(0,0,0,0.85)" display="flex" alignItems="center" justifyContent="center" zIndex={3000}>
            <Box width={520} bg="#111" color="white" p={6} borderRadius="md" textAlign="center">
              <Box as="h2" fontSize="2xl">Round Winner</Box>
              <Box fontSize="lg" my={3}>The player <strong>{roundWinner}</strong> won the snow match.</Box>
              <HStack justifyContent="center" spacing={3}>
                <Button onClick={() => { try { socketRef.current?.emit('restartGame'); } catch(e){}; setRoundWinner(null); }}>Restart</Button>
                <Button onClick={() => setRoundWinner(null)}>Close</Button>
              </HStack>
            </Box>
          </Box>
        </Portal>
      )}
    </div>
  );
}
