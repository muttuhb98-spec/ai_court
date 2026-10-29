# AI Court

AI Court is a fictional mystery investigation game. Start with a scenario seed, inspect the case evidence, and make a final accusation.

## Requirements

- Node.js 20 or newer and npm
- MongoDB is optional in mock mode; cases and accounts use an in-memory store until the server restarts
- A Google Gemini API key is only needed when real generation is implemented and `MOCK_GEMINI=false`

## Start locally

```sh
npm install
Copy-Item .env.example server/.env
npm run dev
```

Open http://localhost:5173. The API runs at http://localhost:5000 and exposes `GET /health`. Mock mode is enabled by default, so no API key or MongoDB service is required.

The live Gemini generation pipeline is not implemented yet. The server validates that a key is present when `MOCK_GEMINI=false`, but case generation currently remains fixture-driven. Never put server credentials in a `VITE_` variable.

## Project layout

- `client/` — React, Vite, Tailwind application
- `server/` — Express API, authentication, case flow, and fixture data
- `docs/DECISIONS.md` — implementation choices left open by the product spec

## Available commands

- `npm run dev` — start client and API
- `npm run build` — build the client
- `npm test` — run server and client tests
- `npm run lint` — lint both workspaces

## Current scope

The scaffold includes account registration/login, mock case generation and polling, case archive, evidence viewers for chats/images/footage/documents, local notes and pins, hints, accusation, scoring, and the verdict reveal. Real Gemini generation, GridFS asset storage, and the automated solvability repair pipeline are next implementation milestones.

