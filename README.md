# ThreatLens

ThreatLens is an AI-powered cybersecurity investigation workbench. This initial
scaffold includes a React/Vite frontend, an Express API, a synthetic-data
investigation agent, and shared TypeScript contracts. It intentionally has no
database or connection to real security systems.

For the architecture, agent lifecycle, event fixture, tool contracts, report
validation, API details, and test coverage, see
[the implementation guide](./docs/IMPLEMENTATION.md).

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Setup and run

From the repository root:

```sh
npm install
cp .env.example .env
# Set OPENAI_API_KEY in .env, then run:
npm run dev
```

The `.env` file is ignored by Git. Never commit or share API keys.
The frontend runs at <http://localhost:5173> and proxies `/api` requests to the
API at <http://localhost:3001>. Check API health at
<http://localhost:3001/api/health>.

## Synthetic investigation

`POST /api/investigate` accepts a JSON body such as:

```sh
curl -X POST http://localhost:3001/api/investigate \
  -H 'Content-Type: application/json' \
  -d '{"question":"Investigate the login and sensitive access events for usr-alex."}'
```

The response includes a structured report and labels the source as
`SYNTHETIC SECURITY EVENTS`. The agent can only inspect its small in-memory
fixture through three read-only tools; it does not connect to production
systems or perform containment actions. It uses the official OpenAI Node.js SDK
with `OPENAI_MODEL` defaulting to `gpt-4o-mini`.

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
