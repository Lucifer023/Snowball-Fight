# Snowball Fight — Minimal Starter

This repo contains a minimal multiplayer starter for "Snowball Fight":

- `backend/` — TypeScript + Express + Socket.io server (port 3001)
- `frontend/` — Next.js + TypeScript + Pixi.js + socket.io-client client (port 3000)

Goal: open two browser tabs to `http://localhost:3000` and see two players move and throw simple snowballs in real time.

Quick run (from repo root):

1. Install dependencies for backend and frontend separately:

```powershell
cd "c:\Users\Marko\Desktop\Projekat browser igra\backend"; npm install
cd "c:\Users\Marko\Desktop\Projekat browser igra\frontend"; npm install
```

2. Start backend (port 3001) in dev mode:

```powershell
cd "c:\Users\Marko\Desktop\Projekat browser igra\backend"; npm run dev
```

3. Start frontend (Next.js dev):

```powershell
cd "c:\Users\Marko\Desktop\Projekat browser igra\frontend"; npm run dev
```

4. Open `http://localhost:3000` in two tabs.

Notes:
- This is a minimal prototype. For production you should add build scripts, env config, CORS/allowed origins, and proper error handling.
