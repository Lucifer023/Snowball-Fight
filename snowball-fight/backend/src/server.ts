import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { Vec2, Player, Snowball, Obstacle, MAP_WIDTH, MAP_HEIGHT, WIN_SCORE, INITIAL_OBSTACLES } from './models/types';
import { tickBots, createBots } from './ai/bots';
import { leaderboardRouter, incrementWinner, getLeaderboard } from './routes/leaderboard';


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const players = new Map<string, Player>();
const snowballs: Snowball[] = [];
const obstacles: Obstacle[] = [];
// whether a round is currently active (true) or paused/ended waiting for restart (false)
let roundActive = true;
// requested bot count to apply on next restart (or immediately if roundActive)
let pendingBotCount = 0;

// Preset templates: arrays of obstacle shape templates (w,h,hp)
const OBSTACLE_PRESETS: Array<Array<{ w: number; h: number; hp: number }>> = [
  // Preset 0: derive shapes from INITIAL_OBSTACLES
  INITIAL_OBSTACLES.map((t) => ({ w: t.w, h: t.h, hp: t.hp })),
  // Preset 1: compact spread
  [ { w: 100, h: 36, hp: 100 }, { w: 180, h: 52, hp: 150 }, { w: 140, h: 64, hp: 120 } ],
  // Preset 2: asymmetric
  [ { w: 60, h: 28, hp: 80 }, { w: 220, h: 56, hp: 160 }, { w: 160, h: 60, hp: 130 } ],
  // Preset 3: many small obstacles (split sizes)
  [ { w: 80, h: 30, hp: 70 }, { w: 80, h: 30, hp: 70 }, { w: 160, h: 48, hp: 110 } ],
];

function choosePreset(): Array<{ w: number; h: number; hp: number }> {
  const idx = Math.floor(Math.random() * OBSTACLE_PRESETS.length);
  return OBSTACLE_PRESETS[idx];
}

// Helper: generate randomized obstacles using provided size/hp templates
function generateObstacles(templates?: Array<{ w: number; h: number; hp: number }>): Obstacle[] {
  const tplList = templates && templates.length ? templates : INITIAL_OBSTACLES.map((t) => ({ w: t.w, h: t.h, hp: t.hp }));
  const out: Obstacle[] = [];
  const margin = 40;
  const maxAttempts = 200;

  for (let i = 0; i < tplList.length; i++) {
    const tpl = tplList[i];
    let attempts = 0;
    let placed = false;
    while (!placed && attempts < maxAttempts) {
      attempts++;
      const w = tpl.w; const h = tpl.h;
      const x = Math.floor(Math.random() * (MAP_WIDTH - margin * 2 - w)) + margin;
      const y = Math.floor(Math.random() * (MAP_HEIGHT - margin * 2 - h)) + margin;
      // ensure not overlapping existing obstacles
      let overlap = false;
      for (const o of out) {
        const pad = 16;
        if (x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y) { overlap = true; break; }
      }
      if (overlap) continue;
      const obs: Obstacle = { id: `obs_${Date.now()}_${i}_${Math.floor(Math.random()*10000)}`, x, y, w, h, hp: tpl.hp };
      out.push(obs);
      placed = true;
    }
    // if not placed after attempts, fall back to center-ish position
    if (!placed) {
      const fallbackX = Math.max(margin, Math.min(MAP_WIDTH - tpl.w - margin, Math.floor(MAP_WIDTH/2 - tpl.w/2)));
      const fallbackY = Math.max(margin, Math.min(MAP_HEIGHT - tpl.h - margin, Math.floor(MAP_HEIGHT/2 - tpl.h/2)));
      out.push({ id: `obs_fallback_${i}_${Date.now()}`, x: fallbackX, y: fallbackY, w: tpl.w, h: tpl.h, hp: tpl.hp });
    }
  }
  return out;
}

// initialize obstacles with randomized positions
obstacles.push(...generateObstacles(choosePreset()));


// Map / world size (adjust as needed to match client canvas coordinate space)
// MAP_WIDTH, MAP_HEIGHT, WIN_SCORE come from types.ts

// leaderboard routes
app.use('/leaderboard', leaderboardRouter);

function randomPos(): Vec2 {
  // spawn anywhere inside the map bounds with a margin
  const margin = 50;
  return { x: Math.random() * (MAP_WIDTH - margin * 2) + margin, y: Math.random() * (MAP_HEIGHT - margin * 2) + margin };
}

io.on('connection', (socket) => {
  const id = socket.id;
  const pos = randomPos();
  const player: Player = { id, x: pos.x, y: pos.y, health: 100, score: 0 };
  players.set(id, player);

  // emit full initial state including obstacles and snowballs and leaderboard
  // regenerate obstacles for each new connection so entering the game always gets a fresh layout
  obstacles.length = 0;
  obstacles.push(...generateObstacles(choosePreset()));

  socket.emit('init', {
    id,
    players: Array.from(players.values()),
    snowballs: snowballs.map((s) => ({ id: s.id, x: s.x, y: s.y })),
    obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
    leaderboard: getLeaderboard(),
  });
  io.emit('playerJoined', player);

  socket.on('move', (data: { x: number; y: number }) => {
    const p = players.get(id);
    if (p) {
      // prevent moving inside obstacles or outside map bounds
      const nx = Math.max(0, Math.min(MAP_WIDTH, data.x));
      const ny = Math.max(0, Math.min(MAP_HEIGHT, data.y));
      let blocked = false;
      for (const obs of obstacles) {
        if (nx >= obs.x && nx <= obs.x + obs.w && ny >= obs.y && ny <= obs.y + obs.h) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        p.x = nx;
        p.y = ny;
      } else {
        // ignore the move that would place player inside an obstacle
      }
    }
  });

  // allow clients to request bot spawns (simple server-side bots/AI)
  socket.on('addBots', (data: { count: number }) => {
    // treat requested count as an absolute target; if round is active, apply immediately,
    // otherwise defer until restart to avoid bots acting while user is deciding to play again.
    const target = Math.max(0, Math.min(6, data.count || 0));
    pendingBotCount = target;
    const existingBots = Array.from(players.values()).filter((p) => p.isBot);
    console.log(`addBots requested: target=${target}, existing=${existingBots.length}, roundActive=${roundActive}`);
    // If round is inactive (paused awaiting restart), don't spawn bots now — just clear any existing bots and wait
    if (!roundActive) {
      for (const b of existingBots) {
        players.delete(b.id);
        io.emit('playerLeft', { id: b.id });
      }
      console.log('round inactive — deferred bot creation until restart');
      // ack the requester that bots are recorded but deferred
      try { socket.emit('botsSet', { count: target, applied: false }); } catch (e) {}
      return;
    }
    // Round active: replace existing bots immediately
    for (const b of existingBots) {
      players.delete(b.id);
      io.emit('playerLeft', { id: b.id });
    }
    if (target > 0) {
      const newBots = createBots([], target, randomPos);
      for (const b of newBots) {
        players.set(b.id, b);
        io.emit('playerJoined', b);
      }
      console.log(`created ${newBots.length} bot(s), now total bots=${Array.from(players.values()).filter(p=>p.isBot).length}`);
      try { socket.emit('botsSet', { count: target, applied: true }); } catch (e) {}
    } else {
      console.log('no bots requested; cleared existing bots');
      try { socket.emit('botsSet', { count: 0, applied: true }); } catch (e) {}
    }
  });

  socket.on('setName', (name: string) => {
    const p = players.get(id);
    if (p) {
      // support receiving either a string or an object { name, color }
      let newName: string | undefined;
      let color: string | undefined;
      if (typeof name === 'string') {
        newName = name;
      } else if (typeof (name as any) === 'object' && name != null) {
        newName = (name as any).name;
        color = (name as any).color;
      }
      if (newName) p.name = newName.substring(0, 24);
      if (color) p.color = color;
      io.emit('playerUpdated', p);
      // send current persistent leaderboard
      io.emit('leaderboard', getLeaderboard());
    }
  });

  socket.on('throwSnowball', (data: { dx: number; dy: number }) => {
    console.log('throwSnowball from', id, 'dx,dy=', data.dx.toFixed(2), data.dy.toFixed(2));
    const p = players.get(id);
    if (!p) return;
    const speed = 6;
    const len = Math.sqrt(data.dx * data.dx + data.dy * data.dy) || 1;
    const vx = (data.dx / len) * speed;
    const vy = (data.dy / len) * speed;
    const sb: Snowball = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      x: p.x,
      y: p.y,
      vx,
      vy,
      ownerId: id,
    };
    snowballs.push(sb);
    console.log('snowball created', sb.id, 'at', sb.x.toFixed(1), sb.y.toFixed(1), 'vel', sb.vx.toFixed(2), sb.vy.toFixed(2));
    // Immediately inform clients about the new snowball so they can render it before the next tick
    io.emit('snowballCreated', { id: sb.id, x: sb.x, y: sb.y });
  });

  socket.on('disconnect', () => {
    players.delete(id);
    io.emit('playerLeft', { id });
  });

  socket.on('restartGame', () => {
    console.log('restartGame requested by', id);
    // reactivate round and reset players/obstacles/snowballs
    roundActive = true;
    for (const [pid, pp] of players) {
      pp.health = 100;
      pp.score = 0;
      const pos = randomPos();
      pp.x = pos.x;
      pp.y = pos.y;
    }
    snowballs.length = 0;
    obstacles.length = 0;
    obstacles.push(...generateObstacles());

    // spawn any pending bots requested while round was inactive
    if (pendingBotCount > 0) {
      // remove any existing bots first to avoid accidental accumulation
      const existingBots = Array.from(players.values()).filter((p) => p.isBot);
      for (const b of existingBots) {
        players.delete(b.id);
        io.emit('playerLeft', { id: b.id });
      }
      const newBots = createBots([], pendingBotCount, randomPos);
      for (const b of newBots) {
        players.set(b.id, b);
        io.emit('playerJoined', b);
      }
      console.log(`spawned ${newBots.length} pending bot(s) on restart`);
      // broadcast an ack to all clients that bot count was applied
      io.emit('botsSet', { count: pendingBotCount, applied: true });
    }
    // broadcast reset state
    io.emit('state', {
      players: Array.from(players.values()),
      snowballs: [],
      obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
    });
  });
});

// Simple game loop
const TICK = 1000 / 30;
setInterval(() => {
  // bot AI: delegate to bots.tickBots
  // Only pass alive bots and alive humans to the AI so dead entities don't act.
  const botsArr = Array.from(players.values()).filter((p) => p.isBot && p.health > 0) as Player[];
  const humans = Array.from(players.values()).filter((p) => !p.isBot && p.health > 0) as Player[];
  tickBots(botsArr, humans, snowballs, (sb: Snowball) => {
    snowballs.push(sb);
    io.emit('snowballCreated', { id: sb.id, x: sb.x, y: sb.y });
  }, obstacles);
  // NOTE: previous call pushed snowballs in callback; updated tickBots signature accepts obstacles for avoidance
  // update snowballs
  for (let i = snowballs.length - 1; i >= 0; i--) {
    const sb = snowballs[i];
    // guard against concurrent modification
    if (!sb) continue;
    sb.x += sb.vx;
    sb.y += sb.vy;

    // remove if out of bounds (use MAP_WIDTH / MAP_HEIGHT)
    if (sb.x < -50 || sb.x > MAP_WIDTH + 50 || sb.y < -50 || sb.y > MAP_HEIGHT + 50) {
      console.log('remove snowball out of bounds', sb.id, sb.x.toFixed(1), sb.y.toFixed(1));
      snowballs.splice(i, 1);
      continue;
    }

    // collision with players
    for (const [pid, p] of players) {
      if (pid === sb.ownerId) continue;
      // if target is inside an obstacle, we consider them protected (simple cover mechanic)
      let insideObstacle = false;
      for (const obs of obstacles) {
        if (p.x >= obs.x && p.x <= obs.x + obs.w && p.y >= obs.y && p.y <= obs.y + obs.h) {
          insideObstacle = true;
          break;
        }
      }
      if (insideObstacle) continue;
      const dx = p.x - sb.x;
      const dy = p.y - sb.y;
      const dist2 = dx * dx + dy * dy;
      const r = 18; // hit radius
      if (dist2 < r * r) {
        // hit
        p.health -= 20;
        // credit owner score
        const owner = players.get(sb.ownerId);
        if (owner) owner.score += 1;
        snowballs.splice(i, 1);

        // Decide round-end policy: if there are bots in the match, use elimination (all bots or all humans dead).
        // Only use WIN_SCORE "first to" rule when no bots are present.
        const botExists = Array.from(players.values()).some((pp) => pp.isBot);

        // check for round win (first to reach WIN_SCORE) only when playing without bots
        if (!botExists && owner) {
          if (owner.score >= WIN_SCORE) {
            const winnerName = owner.name || 'Player';
            console.log('round winner:', winnerName);
            // increment persistent leaderboard by wins
            incrementWinner(winnerName);
            io.emit('leaderboard', getLeaderboard());
            // pause the round and notify clients; actual reset will happen on restart
            roundActive = false;
            io.emit('roundEnded', { id: owner.id, name: winnerName });
            // clear snowballs so no new hits while players decide
            snowballs.length = 0;
          }
        }

  // elimination-style round end when bots are present: end round when one side is eliminated
  if (botExists) {
          const aliveBots = Array.from(players.values()).filter((pp) => pp.isBot && pp.health > 0).length;
          const aliveHumans = Array.from(players.values()).filter((pp) => !pp.isBot && pp.health > 0).length;
          if (aliveBots === 0 || aliveHumans === 0) {
            let winnerName = 'Bots';
            if (aliveBots === 0 && aliveHumans > 0) {
              // human(s) win — choose highest-score human or first alive
              const humansAlive = Array.from(players.values()).filter((pp) => !pp.isBot && pp.health > 0);
              if (humansAlive.length > 0) {
                const top = humansAlive.sort((a, b) => b.score - a.score)[0];
                winnerName = top.name || 'Player';
              } else {
                winnerName = 'Player';
              }
            }
            console.log('elimination round winner:', winnerName);
            if (winnerName !== 'Bots') {
              incrementWinner(winnerName);
              io.emit('leaderboard', getLeaderboard());
            }
            // notify clients round ended and pause the game; clients can show a Play Again dialog
            roundActive = false;
            io.emit('roundEnded', { id: owner?.id || '', name: winnerName });
            // clear snowballs while paused
            snowballs.length = 0;
          }
        }

        if (p.health <= 0) {
          // if bots are present we treat this as elimination mode (no auto-respawn until round reset)
          const botExistsNow = Array.from(players.values()).some((pp) => pp.isBot);
          if (!botExistsNow) {
            // respawn after short delay for humans
            const deadId = pid;
            setTimeout(() => {
              const pos = randomPos();
              const pp = players.get(deadId);
              if (pp) {
                pp.x = pos.x;
                pp.y = pos.y;
                pp.health = 100;
              }
            }, 2000);
          } else {
            // during elimination: remove dead bots immediately so they no longer act or appear on the map.
            if (p.isBot) {
              players.delete(pid);
              io.emit('playerLeft', { id: pid });
            } else {
              // keep human dead until round reset
              p.health = 0;
            }
          }
        }
        break;
      }
    }

    // collision with obstacles (snowball hits obstacle and reduces its hp)
    for (let oi = obstacles.length - 1; oi >= 0; oi--) {
      const obs = obstacles[oi];
      // simple AABB check
      if (sb.x >= obs.x && sb.x <= obs.x + obs.w && sb.y >= obs.y && sb.y <= obs.y + obs.h) {
        obs.hp -= 20;
        console.log('snowball hit obstacle', obs.id, 'hp now', obs.hp);
        // remove snowball
        snowballs.splice(i, 1);
        if (obs.hp <= 0) {
          console.log('obstacle destroyed', obs.id);
          obstacles.splice(oi, 1);
          io.emit('obstacleDestroyed', { id: obs.id });
        }
        break;
      }
    }
  }

  // broadcast state
  const state = {
    players: Array.from(players.values()),
    snowballs: snowballs.map((s) => ({ id: s.id, x: s.x, y: s.y })),
    obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
  };
  io.emit('state', state);
}, TICK);

httpServer.listen(PORT, () => {
  console.log(`Snowball backend listening on ${PORT}`);
});
