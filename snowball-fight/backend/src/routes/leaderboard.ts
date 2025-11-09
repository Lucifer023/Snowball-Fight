import fs from 'fs';
import path from 'path';
import express from 'express';

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

let leaderboard: Record<string, number> = {};

function loadLeaderboard() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      leaderboard = JSON.parse(raw || '{}');
    } else {
      leaderboard = {};
    }
  } catch (e) {
    console.error('failed to load leaderboard', e);
    leaderboard = {};
  }
}

function saveLeaderboard() {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), 'utf8');
  } catch (e) {
    console.error('failed to save leaderboard', e);
  }
}

function getLeaderboard() {
  return leaderboard;
}

function incrementWinner(name: string) {
  if (!name) return;
  leaderboard[name] = (leaderboard[name] || 0) + 1;
  saveLeaderboard();
}

// initialize on module load
loadLeaderboard();

router.get('/', (_req, res) => {
  res.json(getLeaderboard());
});

export { router as leaderboardRouter, getLeaderboard, incrementWinner };
