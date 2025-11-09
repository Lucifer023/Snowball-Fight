export type Vec2 = { x: number; y: number };

export interface Player {
  id: string;
  x: number;
  y: number;
  health: number;
  score: number;
  name?: string;
  color?: string;
  isBot?: boolean;
}

export interface Snowball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
}

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 900;
export const WIN_SCORE = 5;

export const INITIAL_OBSTACLES: Obstacle[] = [
  { id: 'obs1', x: 300, y: 200, w: 120, h: 40, hp: 100 },
  { id: 'obs2', x: 700, y: 420, w: 200, h: 60, hp: 150 },
  { id: 'obs3', x: 1200, y: 300, w: 160, h: 80, hp: 120 },
];
