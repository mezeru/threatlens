# ThreatLens

ThreatLens is an AI-powered cybersecurity investigation workbench. This initial
scaffold includes a React/Vite frontend, an Express API, and shared TypeScript
contracts. It intentionally has no database, external AI integration, or real
credentials.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Setup and run

From the repository root:

```sh
npm install
npm run dev
```

The frontend runs at <http://localhost:5173> and proxies `/api` requests to the
API at <http://localhost:3001>. Check API health at
<http://localhost:3001/api/health>.

## Test and build

```sh
npm test
npm run build
```

## Workspaces

- `apps/web` — React, TypeScript, and Vite frontend
- `apps/api` — TypeScript Express API and Vitest/Supertest tests
- `packages/shared` — shared security event and investigation result types

The API uses port `3001` by default. Set `PORT` in the environment to override
it; the value must be an integer from 1 through 65535.
