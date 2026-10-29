# AI Court

AI Court is a fictional mystery investigation game. Start with a scenario seed, inspect the case evidence, and make a final accusation.

## Deploy to Render

This repository includes a Render Blueprint (`render.yaml`) that builds the React client and runs it with the Express API as one web service.

1. Push this repository to GitHub (or another Git provider connected to Render).
2. In Render, choose **New + → Blueprint**, connect the repository, and select the branch to deploy.
3. Review the `ai-court` web service and apply the Blueprint. Render builds with `npm ci && npm run build`, then starts the API with `npm start`.
4. The Blueprint generates `JWT_SECRET` and configures production cookies and mock case mode. Wait for the service health check at `/health` to pass.
5. Open the `onrender.com` URL shown on the service. Register an account and create a case to check the deployment.

The frontend calls `/api` on the same origin, so no frontend API URL needs to be set. No Gemini key or MongoDB is required for the current mock experience. Do not put server secrets in a `VITE_` variable.

### Data persistence

Accounts and cases currently live in an in-memory store. They disappear whenever the server restarts or deploys, and a free instance may spin down while idle. MongoDB connection support exists, but the application does not yet read or write users/cases through MongoDB. For a persistent public launch, Mongo-backed storage still needs to be implemented before configuring a database.

## Run locally

## GitHub Pages frontend

The `.github/workflows/pages.yml` workflow publishes the React frontend at `https://muttuhb98-spec.github.io/ai_court/` whenever changes are pushed to `main`. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. GitHub Pages only hosts the frontend; sign-in, case creation, and saved cases require the Express API to run separately. To connect it, add a repository Actions variable named `VITE_API_BASE_URL` with the deployed API URL ending in `/api` (for example, `https://your-api.example.com/api`).

Requirements: Node.js 20 or newer and npm.

```sh
npm install
```

Copy `.env.example` to `.env`, then run:

```sh
npm run dev
```

Open http://localhost:5173. The API runs at http://localhost:5000. Mock mode is enabled by default.

## Commands

- `npm run dev` starts the client and API
- `npm run build` builds the production client
- `npm start` starts the API (and serves the built client when present)
- `npm test` runs server and client tests
- `npm run lint` lints both workspaces

## Project layout

- `client/` — React, Vite, and Tailwind application
- `server/` — Express API, authentication, case flow, and fixture data
- `docs/DECISIONS.md` — implementation choices left open by the product spec

The live Gemini generation pipeline, persistent user/case storage, GridFS asset storage, and the automated solvability repair pipeline are not implemented yet. Case generation currently uses fixture data.
