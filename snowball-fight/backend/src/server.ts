import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

type Vec2 = { x: number; y: number };

interface Player {
  id: string;
  x: number;
  y: number;
  health: number;
  score: number;
  name?: string;
  color?: string;
  isBot?: boolean;
}

interface Snowball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
}

interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const players = new Map<string, Player>();
const snowballs: Snowball[] = [];
const obstacles: Obstacle[] = [];

// initial obstacle template (used to reset)
const INITIAL_OBSTACLES: Obstacle[] = [
  { id: 'obs1', x: 300, y: 200, w: 120, h: 40, hp: 100 },
  { id: 'obs2', x: 700, y: 420, w: 200, h: 60, hp: 150 },
  { id: 'obs3', x: 1200, y: 300, w: 160, h: 80, hp: 120 },
];
obstacles.push(...INITIAL_OBSTACLES.map((o) => ({ ...o })));

// leaderboard persistence
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
let leaderboard: Record<string, number> = {};
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(LEADERBOARD_FILE)) {
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    leaderboard = JSON.parse(raw || '{}');
  }
} catch (e) {
  console.error('failed to load leaderboard', e);
  leaderboard = {};
}

function saveLeaderboard() {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), 'utf8');
  } catch (e) {
    console.error('failed to save leaderboard', e);
  }
}

// Map / world size (adjust as needed to match client canvas coordinate space)
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const WIN_SCORE = 5; // points required to win a round

// expose a simple leaderboard endpoint so clients can fetch without joining
app.get('/leaderboard', (req, res) => {
  res.json(leaderboard);
});

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
  socket.emit('init', {
    id,
    players: Array.from(players.values()),
    snowballs: snowballs.map((s) => ({ id: s.id, x: s.x, y: s.y })),
    obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
    leaderboard,
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
    // Treat the requested count as an absolute target. Create or remove bots
    // so that the total number of bots on the server matches the requested value.
  const target = Math.max(0, Math.min(6, data.count || 0));
  const existingBots = Array.from(players.values()).filter((p) => p.isBot);
  console.log(`addBots requested: target=${target}, existing=${existingBots.length}`);
    const existingCount = existingBots.length;
    if (existingCount < target) {
      const toCreate = target - existingCount;
      const newBots: Player[] = [];
      for (let i = 0; i < toCreate; i++) {
        const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const pos = randomPos();
        const bot: Player = { id: botId, x: pos.x, y: pos.y, health: 100, score: 0, name: `Bot${existingCount + i + 1}`, color: '#888', isBot: true };
        players.set(botId, bot);
        newBots.push(bot);
      }
      // emit each bot join individually for client compatibility
      for (const b of newBots) io.emit('playerJoined', b);
      console.log(`created ${newBots.length} bot(s), now total bots=${Array.from(players.values()).filter(p=>p.isBot).length}`);
    } else if (existingCount > target) {
      const toRemove = existingCount - target;
      // remove the oldest bots first (stable behavior)
      const botsToRemove = existingBots.slice(0, toRemove);
      for (const b of botsToRemove) {
        players.delete(b.id);
        io.emit('playerLeft', { id: b.id });
      }
      console.log(`removed ${toRemove} bot(s), now total bots=${Array.from(players.values()).filter(p=>p.isBot).length}`);
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
      io.emit('leaderboard', leaderboard);
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
    // reset players (health, score, respawn positions)
    for (const [pid, pp] of players) {
      pp.health = 100;
      pp.score = 0;
      const pos = randomPos();
      pp.x = pos.x;
      pp.y = pos.y;
    }
    // reset obstacles and snowballs
    snowballs.length = 0;
    obstacles.length = 0;
    obstacles.push(...INITIAL_OBSTACLES.map((o) => ({ ...o })));
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
  // simple bot AI: move toward nearest human and occasionally throw
  const bots = Array.from(players.values()).filter((p) => p.isBot);
  const humans = Array.from(players.values()).filter((p) => !p.isBot);
  for (const bot of bots) {
    if (humans.length === 0) break;
    // find nearest human
    let target = humans[0];
    let best = Number.POSITIVE_INFINITY;
    for (const h of humans) {
      const dx = h.x - bot.x;
      const dy = h.y - bot.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        target = h;
      }
    }
    // move toward target
    const bSpeed = 1.8; // slower than player
    try {
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      bot.x += (dx / len) * bSpeed;
      bot.y += (dy / len) * bSpeed;
      // occasionally throw when within a reasonable range
      if (Math.random() < 0.02) {
        const speed = 6;
        const vx = (dx / len) * speed;
        const vy = (dy / len) * speed;
        const sb: Snowball = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          x: bot.x,
          y: bot.y,
          vx,
          vy,
          ownerId: bot.id,
        };
        snowballs.push(sb);
        io.emit('snowballCreated', { id: sb.id, x: sb.x, y: sb.y });
      }
    } catch (e) {
      // swallow AI errors
    }
  }
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

        // check for round win (first to reach WIN_SCORE)
        if (owner) {
          if (owner.score >= WIN_SCORE) {
            const winnerName = owner.name || 'Player';
            console.log('round winner:', winnerName);
            // increment persistent leaderboard by wins
            leaderboard[winnerName] = (leaderboard[winnerName] || 0) + 1;
            saveLeaderboard();
            io.emit('leaderboard', leaderboard);
            io.emit('roundWinner', { id: owner.id, name: winnerName });
            // reset scores and respawn players, reset obstacles and clear snowballs
            for (const [pid, pp] of players) {
              pp.score = 0;
              pp.health = 100;
              const pos = randomPos();
              pp.x = pos.x;
              pp.y = pos.y;
            }
            snowballs.length = 0;
            obstacles.length = 0;
            obstacles.push(...INITIAL_OBSTACLES.map((o) => ({ ...o })));
            // broadcast reset state
            io.emit('state', {
              players: Array.from(players.values()),
              snowballs: [],
              obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
            });
          }
        }

        // elimination-style round end when bots are present: end round when one side is eliminated
        const botExists = Array.from(players.values()).some((pp) => pp.isBot);
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
              leaderboard[winnerName] = (leaderboard[winnerName] || 0) + 1;
              saveLeaderboard();
              io.emit('leaderboard', leaderboard);
            }
            io.emit('roundWinner', { id: owner?.id || '', name: winnerName });
            // reset state
            for (const [pid, pp] of players) {
              pp.score = 0;
              pp.health = 100;
              const pos = randomPos();
              pp.x = pos.x;
              pp.y = pos.y;
            }
            snowballs.length = 0;
            obstacles.length = 0;
            obstacles.push(...INITIAL_OBSTACLES.map((o) => ({ ...o })));
            io.emit('state', {
              players: Array.from(players.values()),
              snowballs: [],
              obstacles: obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp })),
            });
          }
        }

        if (p.health <= 0) {
          // if bots are present we treat this as elimination mode (no auto-respawn until round reset)
          const botExistsNow = Array.from(players.values()).some((pp) => pp.isBot);
          if (!botExistsNow) {
            // respawn after short delay
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
            // no respawn during elimination; leave dead until end of round
            p.health = 0;
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
