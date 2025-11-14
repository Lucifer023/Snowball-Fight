import { Player, Snowball } from '../models/types';

/**
 * Move bots toward nearest human and occasionally create a snowball toss.
 * This module does not mutate the global `players` map directly; instead it
 * operates on arrays passed in by the caller to make testing easier.
 */
export function tickBots(bots: Player[], humans: Player[], snowballs: Snowball[], addSnowball: (s: Snowball) => void, obstacles: import('../models/types').Obstacle[] = []) {
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
    const bSpeed = 1.8;
      try {
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const moveX = (dx / len) * bSpeed;
      const moveY = (dy / len) * bSpeed;

      // candidate new position
      const nx = bot.x + moveX;
      const ny = bot.y + moveY;

      // simple AABB collision check with obstacles
      let collides = false;
      for (const obs of obstacles) {
        if (nx >= obs.x && nx <= obs.x + obs.w && ny >= obs.y && ny <= obs.y + obs.h) { collides = true; break; }
      }

      if (!collides) {
        bot.x = nx; bot.y = ny;
      } else {
        // try a simple sidestep: perpendicular left/right vectors
        const perp1 = { x: -moveY, y: moveX };
        const perp2 = { x: moveY, y: -moveX };
        const len1 = Math.sqrt(perp1.x * perp1.x + perp1.y * perp1.y) || 1;
        const len2 = Math.sqrt(perp2.x * perp2.x + perp2.y * perp2.y) || 1;
        const sx1 = bot.x + (perp1.x / len1) * bSpeed;
        const sy1 = bot.y + (perp1.y / len1) * bSpeed;
        const sx2 = bot.x + (perp2.x / len2) * bSpeed;
        const sy2 = bot.y + (perp2.y / len2) * bSpeed;
        let placed = false;
        let ok1 = true;
        let ok2 = true;
        for (const obs of obstacles) {
          if (sx1 >= obs.x && sx1 <= obs.x + obs.w && sy1 >= obs.y && sy1 <= obs.y + obs.h) ok1 = false;
          if (sx2 >= obs.x && sx2 <= obs.x + obs.w && sy2 >= obs.y && sy2 <= obs.y + obs.h) ok2 = false;
        }
        if (ok1) { bot.x = sx1; bot.y = sy1; placed = true; }
        else if (ok2) { bot.x = sx2; bot.y = sy2; placed = true; }
        // if neither sidestep works, bot stays in place this tick
      }
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
        addSnowball(sb);
      }
    } catch (e) {
      // swallow AI errors
    }
  }
}

export function createBots(currentBots: Player[], target: number, randomPos: () => { x: number; y: number }) {
  const existingCount = currentBots.length;
  const newBots: Player[] = [];
  if (existingCount < target) {
    const toCreate = target - existingCount;
    for (let i = 0; i < toCreate; i++) {
      const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const pos = randomPos();
      const bot: Player = { id: botId, x: pos.x, y: pos.y, health: 100, score: 0, name: `Bot${existingCount + i + 1}`, color: '#888', isBot: true };
      newBots.push(bot);
    }
  }
  return newBots;
}
