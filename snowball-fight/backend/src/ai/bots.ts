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

      // robust collision check: sample along the segment and check against obstacles expanded by a pad
      const pad = 12; // approximate bot radius
      const samples = 5;
      let collides = false;
      for (let s = 1; s <= samples; s++) {
        const t = s / samples;
        const sx = bot.x + (nx - bot.x) * t;
        const sy = bot.y + (ny - bot.y) * t;
        for (const obs of obstacles) {
          if (sx >= obs.x - pad && sx <= obs.x + obs.w + pad && sy >= obs.y - pad && sy <= obs.y + obs.h + pad) { collides = true; break; }
        }
        if (collides) break;
      }

      if (!collides) {
        bot.x = nx; bot.y = ny;
      } else {
        // try a simple sidestep: perpendicular left/right vectors, with same sampling check
        const perp1 = { x: -moveY, y: moveX };
        const perp2 = { x: moveY, y: -moveX };
        const len1 = Math.sqrt(perp1.x * perp1.x + perp1.y * perp1.y) || 1;
        const len2 = Math.sqrt(perp2.x * perp2.x + perp2.y * perp2.y) || 1;
        const sx1 = bot.x + (perp1.x / len1) * bSpeed;
        const sy1 = bot.y + (perp1.y / len1) * bSpeed;
        const sx2 = bot.x + (perp2.x / len2) * bSpeed;
        const sy2 = bot.y + (perp2.y / len2) * bSpeed;
        let ok1 = true;
        let ok2 = true;
        // sample along perp1
        for (let s = 1; s <= samples; s++) {
          const t = s / samples;
          const tx = bot.x + (sx1 - bot.x) * t;
          const ty = bot.y + (sy1 - bot.y) * t;
          for (const obs of obstacles) {
            if (tx >= obs.x - pad && tx <= obs.x + obs.w + pad && ty >= obs.y - pad && ty <= obs.y + obs.h + pad) { ok1 = false; break; }
          }
          if (!ok1) break;
        }
        // sample along perp2
        for (let s = 1; s <= samples; s++) {
          const t = s / samples;
          const tx = bot.x + (sx2 - bot.x) * t;
          const ty = bot.y + (sy2 - bot.y) * t;
          for (const obs of obstacles) {
            if (tx >= obs.x - pad && tx <= obs.x + obs.w + pad && ty >= obs.y - pad && ty <= obs.y + obs.h + pad) { ok2 = false; break; }
          }
          if (!ok2) break;
        }
        if (ok1) { bot.x = sx1; bot.y = sy1; }
        else if (ok2) { bot.x = sx2; bot.y = sy2; }
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
