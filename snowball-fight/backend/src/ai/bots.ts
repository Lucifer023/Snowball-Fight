import { Player, Snowball } from '../models/types';

/**
 * Move bots toward nearest human and occasionally create a snowball toss.
 * This module does not mutate the global `players` map directly; instead it
 * operates on arrays passed in by the caller to make testing easier.
 */
export function tickBots(bots: Player[], humans: Player[], snowballs: Snowball[], addSnowball: (s: Snowball) => void) {
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
