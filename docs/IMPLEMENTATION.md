# ThreatLens implementation guide

ThreatLens is a hackathon-scale cybersecurity investigation workbench. The
current implementation provides a React/Vite frontend scaffold, a TypeScript
Express API, and an LLM-driven investigation agent backed by a fixed,
in-memory synthetic event dataset.

> **Synthetic data only:** The current agent does not connect to identity
> providers, endpoint tools, cloud accounts, SIEMs, or other real security
> systems. Its tools are read-only and inspect only the fixture described
> below. It does not execute containment or remediation actions.

## 1. Architecture at a glance

```text
Browser
  |
  | React/Vite (localhost:5173)
  | /api requests are proxied during development
  v
Express API (localhost:3001)
  |-- GET  /api/health
  `-- POST /api/investigate
        |
        v
     Investigation agent
        |-- OpenAI official Node.js SDK
        |-- bounded model/tool loop
        |-- Zod input and report validation
        `-- three local read-only tools
              |
              v
          In-memory synthetic fixture
```

The API app is created by `createApp`, which accepts an optional investigator
function. Production startup uses the OpenAI-backed default. Tests inject
mock investigators or mock model responses, so they do not need a provider
account or API key.

## 2. Repository layout

| Path | Responsibility |
| --- | --- |
| `apps/web/` | React 19 + TypeScript frontend scaffold, built and served with Vite. |
| `apps/api/src/server.ts` | Loads root `.env`, validates `PORT`, and starts the API listener. |
| `apps/api/src/app.ts` | Express application, JSON body-size limit, routes, and common errors. |
| `apps/api/src/routes/health.ts` | Health-check endpoint. |
| `apps/api/src/routes/investigate.ts` | Request validation, investigation call, response envelope, and API error mapping. |
| `apps/api/src/investigation/dataset.ts` | Synthetic security event fixture and its source label. |
| `apps/api/src/investigation/tools.ts` | Validated, read-only event search functions. |
| `apps/api/src/investigation/agent.ts` | OpenAI adapter, function definitions, bounded tool loop, and model error handling. |
| `apps/api/src/investigation/report.ts` | Zod report schema factory, including per-investigation evidence provenance. |
| `apps/api/tests/` | Vitest tests; Supertest exercises HTTP routes. |
| `packages/shared/src/index.ts` | Shared TypeScript event and investigation interfaces. |
| `docs/IMPLEMENTATION.md` | Detailed architecture and behavior reference. |

The root `package.json` defines npm workspaces and commands that coordinate all
packages. `npm run build` compiles the shared package first, then the API, then
the frontend.

## 3. Local setup

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- An OpenAI API key to run a real investigation request

### Install and configure

Run from the repository root:

```sh
npm install
cp .env.example .env
```

Edit `.env` locally and set `OPENAI_API_KEY` to your key. Do not paste the key
into source files, tests, chat, or commits. `.env` is ignored by Git; the
checked-in `.env.example` contains no secret.

Environment variables:

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API listen port. Must be an integer from 1 through 65535. |
| `OPENAI_API_KEY` | None | Required only when calling the real OpenAI-backed investigator. |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model used for Chat Completions tool/function calling. |

The API server resolves `.env` relative to its source location, so the root
environment file is used even when the API is launched from its workspace.

### Run locally

```sh
npm run dev
```

- Frontend: <http://localhost:5173>
- API health: <http://localhost:3001/api/health>
- API investigation: `POST http://localhost:3001/api/investigate`

Vite proxies `/api` to `http://localhost:3001` while developing the frontend.
The current frontend is only a basic scaffold; investigations are submitted
directly to the API.

### Test and build

```sh
npm test
npm run build
```

`npm test` runs each workspace's test script when present. The API uses Vitest
and Supertest. `npm run build` builds shared types, the API, and the frontend.
No network request to OpenAI is performed by these commands.

## 4. Synthetic event model and fixture

The fixture is defined in `apps/api/src/investigation/dataset.ts`. Each event
has an event ID, ISO timestamp, source, event type, severity, description, user
ID, and source IP; the sensitive-resource event also has a resource ID. All
addresses are documentation/test addresses rather than real indicators.

| Event IDs | Fixture behavior |
| --- | --- |
| `EVT-1001`–`EVT-1003` | Three failed logins for `usr-alex` from `198.51.100.24`. |
| `EVT-1004` | Successful login for the same user and address after those failures. |
| `EVT-1005` | Sensitive payroll-report access for `usr-alex`, shortly after login. |
| `EVT-1006` | Successful login for `usr-jordan` from `203.0.113.17`. |

The endpoint response includes `dataSource: "SYNTHETIC SECURITY EVENTS"` so
clients can identify the origin of the data. The fixture is an in-process
constant: it is not persisted, refreshed, or connected to a live source.

## 5. Read-only investigation tools

These are ordinary TypeScript functions. Their parameters are accepted as
`unknown` and validated with Zod before filtering data. Results are returned in
chronological timestamp order.

### `searchAuthEvents({ userId?, sourceIp? })`

Searches authentication event types (`auth.*`) by user ID, source IP, or both.
At least one filter must be supplied. User IDs must be non-empty and at most
128 characters; source IPs must be valid IPv4 or IPv6 strings.

### `getUserTimeline({ userId })`

Returns every fixture event for that user in chronological order, including
authentication and resource events.

### `getResourceAccessEvents({ userId })`

Returns the user's sensitive-resource access events.

Unknown users return an empty array. Tool input validation failures, invalid
JSON arguments from the model, or unknown tool names are represented as a
tool-result error for the model rather than crashing the agent.

## 6. Agent and tool-calling lifecycle

The OpenAI integration uses the official `openai` Node.js SDK. The agent sends
the investigation question, a system instruction, and JSON-schema-like tool
definitions to the model. The model can either request tools or return a final
JSON report.

For each model iteration:

1. Ask the model for the next response.
2. If it requests tools, append the assistant tool-call message to the
   conversation.
3. Validate each tool's JSON arguments and execute only the named local
   function.
4. Append each tool result to the conversation so the model can inspect it.
5. Continue until the model returns a response without tool calls.
6. Validate the final report and evidence provenance before returning it.

The limits are explicit constants in `agent.ts`:

- At most **6 tool calls** are executed per investigation.
- At most **4 model iterations** are made.

Each requested call, including one with invalid arguments or an unknown name,
uses a tool-call budget slot. A call counts as successful evidence gathering
only when a known tool's arguments pass validation and it returns its result.
At least one such successful call is required before the agent will accept a
report.

If OpenAI throws an error, the agent returns a sanitized provider error without
including credentials or provider response details. Missing configuration,
provider errors, malformed reports, invalid input, and exceeded limits use
distinct `InvestigationError` codes internally.

## 7. Report contract and evidence provenance

The agent's final response must be a JSON object with this shape:

```json
{
  "summary": "Repeated failures preceded a successful login and a sensitive access.",
  "severity": "high",
  "evidence": [
    {
      "eventId": "EVT-1004",
      "relevance": "Successful login followed multiple failures from the same address."
    },
    {
      "eventId": "EVT-1005",
      "relevance": "Sensitive payroll report was accessed shortly afterward."
    }
  ],
  "alternativeExplanations": [
    "The account owner may have mistyped their password before authenticating."
  ],
  "confidence": 0.86,
  "recommendedNextSteps": [
    "Verify the login and report access with the account owner."
  ]
}
```

`createInvestigationReportSchema(retrievedEventIds)` validates:

- Required keys and no unknown keys.
- Non-empty bounded summary and evidence.
- Severity is one of `low`, `medium`, `high`, or `critical`.
- Every evidence item has an event ID and a non-empty relevance statement.
- Every cited ID was returned by a successful tool call in this specific
  investigation.
- Confidence is between `0` and `1`.
- Alternative explanations and recommended next steps are bounded string
  arrays; at least one next step is required.

Knowing an ID exists in the fixture is not sufficient: the agent records the
IDs returned in tool results and passes only that set to the report schema.
This prevents the model from citing unrelated events it did not retrieve.

## 8. HTTP API

### `GET /api/health`

Successful response (`200`):

```json
{ "status": "ok" }
```

### `POST /api/investigate`

Request body:

```json
{ "question": "Investigate the login and sensitive access events for usr-alex." }
```

The request must be a JSON object containing only `question`, which must be a
non-empty string of at most 2000 characters. The Express JSON parser rejects
bodies over 16 KB.

Successful response (`200`):

```json
{
  "dataSource": "SYNTHETIC SECURITY EVENTS",
  "report": {
    "summary": "Investigation summary.",
    "severity": "high",
    "evidence": [
      { "eventId": "EVT-1005", "relevance": "Sensitive resource access." }
    ],
    "alternativeExplanations": ["The activity could be legitimate."],
    "confidence": 0.8,
    "recommendedNextSteps": ["Verify with the user."]
  }
}
```

Example request:

```sh
curl -X POST http://localhost:3001/api/investigate \
  -H 'Content-Type: application/json' \
  -d '{"question":"Investigate the login and sensitive access events for usr-alex."}'
```

Errors use a JSON envelope with `error.code` and `error.message`. Important
statuses include:

| Status | When it is returned |
| --- | --- |
| `400` | Invalid request shape/question, malformed JSON, or invalid agent input. |
| `404` | Unknown route. |
| `413` | JSON request body exceeds 16 KB. |
| `502` | OpenAI request failed, model output was invalid, an investigation limit was reached, or another investigation error occurred. |
| `503` | `OPENAI_API_KEY` is not configured. |

The endpoint maps unexpected investigator exceptions to a generic `502`
response; internal provider details are not sent to API clients.

## 9. Tests and what they cover

Tests live in `apps/api/tests/`:

- `health.test.ts` covers the health response and unknown-route error envelope.
- `investigation-tools.test.ts` covers searches, chronological ordering,
  sensitive-resource filtering, and invalid search input.
- `investigation-agent.test.ts` uses a mocked model to cover multiple tool
  iterations, report validation, evidence provenance, malformed arguments,
  provider failures, and both investigation limits.
- `investigate-route.test.ts` uses an injected investigator to cover request
  validation, malformed JSON handling, and synthetic-data response labeling.

The tests do not require a valid OpenAI key and do not send model requests.
They verify the agent/model contract and local tools using deterministic
responses.

## 10. Current boundaries and extension points

- **No persistent storage:** The fixture is held in memory and resets with the
  process.
- **No real telemetry:** Replacing the fixture with production connectors
  would require separate authentication, authorization, privacy, audit,
  reliability, and security review.
- **No containment:** Recommendations are text only; the system performs no
  blocking, account changes, deletion, or other actions.
- **No elaborate UI:** The web workspace currently renders a minimal scaffold;
  use the API directly for an investigation.
- **No multi-agent framework or vector database:** The investigation is a
  single bounded model/tool loop over a small deterministic fixture.

The main extension seams are the event contract in `packages/shared`, the
synthetic dataset and tool functions, the `InvestigationModel` interface, and
the `Investigator` dependency accepted by the Express app. Preserve request
validation, per-investigation evidence tracking, and bounded execution when
adding new data sources or tools.
