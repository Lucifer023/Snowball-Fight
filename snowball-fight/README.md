# Snowball Fight — Minimal Starter

This repo contains a minimal multiplayer starter for "Snowball Fight":

- `backend/` — TypeScript + Express + Socket.io server (port 3001)
- `frontend/` — Next.js + TypeScript + Pixi.js + socket.io-client client (port 3000)

Goal: open two browser tabs to `http://localhost:3000` and see two players move and throw simple snowballs in real time.

Quick run (from repo root):

1. Install dependencies for backend and frontend separately (run these from the repository root):

```powershell
cd backend
npm install

cd ../frontend
npm install
```

2. Start backend (port 3001) in dev mode (from repo root or inside the `backend/` folder):

```powershell
cd backend
npm run dev
```

3. Start frontend (Next.js dev) (from repo root or inside the `frontend/` folder):

```powershell
cd frontend
npm run dev
```

4. Open `http://localhost:3000` in two tabs.

Notes:
- This is a minimal prototype. For production you should add build scripts, env config, CORS/allowed origins, and proper error handling.
