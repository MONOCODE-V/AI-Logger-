<p align="center">
  <img src="https://img.icons8.com/fluency/96/artificial-intelligence.png" width="80" alt="AI Logger Logo" />
</p>

<h1 align="center">AI Logger</h1>

<p align="center">
  <strong>AI-Powered Log Monitoring & Alerting System</strong><br />
  Ingest logs from any source. Analyze with AI. Alert automatically.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-red?style=flat-square&logo=nestjs" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/AI-Ollama%20%7C%20OpenAI-purple?style=flat-square" alt="AI Providers" />
  <img src="https://img.shields.io/badge/Database-SQLite-lightblue?style=flat-square" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## What Is AI Logger?

AI Logger is an **intelligent ops assistant** for DevOps / SRE teams. Instead of manually watching log files or grepping through thousands of lines, AI Logger:

1. **Collects** logs from any source — files, APIs, syslog, webhooks, monitoring tools (Zabbix, Prometheus, Datadog)
2. **Understands** them using AI — not just regex pattern matching, but actual LLM-powered analysis that detects subtle anomalies humans would miss
3. **Acts** automatically — creates incident tickets, sends Slack/webhook/email alerts, all without human intervention
4. **Learns context** — performs root cause analysis by looking at surrounding logs, not just the single error line

> Think of it as **"PagerDuty + Datadog + ChatGPT for your logs"** — but self-hosted, privacy-friendly (Ollama runs locally), and fully customizable.

### Who Is It For?

- **Small-to-mid DevOps teams** who can't afford enterprise monitoring stacks
- **Solo developers** managing multiple servers who need an extra pair of eyes
- **Security-conscious organizations** that want AI-powered log analysis without sending data to third parties (Ollama mode)

---

## Features

### Log Ingestion (3 Methods)

| Method | Description | Status |
|--------|-------------|--------|
| **HTTP API + API Key** | Push logs via REST API with API key or JWT auth | ✅ Working |
| **Syslog Listener** | UDP + TCP syslog servers (port 1514) — just point rsyslog at it | ✅ Working |
| **Scheduled Pull (SSH)** | SSH into remote servers, `tail -c` new log data on a schedule | ✅ Working |

### AI Analysis

| Feature | Description |
|---------|-------------|
| **Batch Analysis** | Analyze groups of logs for anomalies, patterns, and severity |
| **Summary** | Generate health score (0–100) and executive summary for any time window |
| **Root Cause Analysis** | Deep-dive into specific errors with surrounding log context |
| **Dual Provider** | Ollama (local, free, private) or OpenAI (GPT-4o-mini, cloud) — switch at runtime |

### Event-Driven Alerting

```
Alert Rule triggered
  → Creates Alert
    → Emits 'anomaly.detected' event
      → Auto-creates Ticket
        → Emits 'ticket.created' event
          → Sends Notifications (Slack, Webhook, Email)
```

### Alert Rule Conditions

| Condition | Description |
|-----------|-------------|
| `error_count` | Number of error/fatal logs exceeds threshold in time window |
| `error_rate` | Error percentage exceeds threshold |
| `log_level` | Logs matching specific levels exist |
| `keyword_match` | Keyword search with AND/OR logic |
| `no_logs` | Silence detection — zero logs in time window |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (TypeScript) |
| Database | SQLite via `better-sqlite3` + TypeORM |
| Auth | JWT + API Key (dual auth) |
| AI Providers | OpenAI (GPT-4o-mini) / Ollama (llama3.2, local) |
| Event Bus | `@nestjs/event-emitter` (in-process) |
| SSH | `ssh2` for remote server log pulling |
| API Docs | Swagger (`@nestjs/swagger`) at `/api` |
| Package Manager | pnpm |

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **pnpm** (`npm install -g pnpm`)
- **Ollama** (optional, for local AI) — [Install Ollama](https://ollama.ai)

### 1. Clone & Install

```bash
git clone https://github.com/MONOCODE-V/AI-Logger-.git
cd AI-Logger-/app
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
PORT=8051
JWT_SECRET=your-secret-key-here

# AI Provider: 'ollama' (free, local) or 'openai'
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Optional: OpenAI (if using cloud AI)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
```

### 3. Start Ollama (if using local AI)

```bash
ollama pull llama3.2
ollama serve
```

### 4. Run the Server

```bash
# Development (watch mode)
pnpm run start:dev

# Production
pnpm run build
pnpm run start:prod
```

The server starts on **http://localhost:8051**. Swagger docs at **http://localhost:8051/api**.

---

## API Overview

### Authentication

```bash
# Register
curl -X POST http://localhost:8051/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","username":"admin","password":"YourPassword123!"}'

# Login (returns JWT)
curl -X POST http://localhost:8051/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword123!"}'

# Create API Key (for machine-to-machine)
curl -X POST http://localhost:8051/auth/api-keys \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-server-key","permissions":["ingest"]}'
```

### Log Ingestion

```bash
# Bulk ingest (with API key)
curl -X POST http://localhost:8051/logs/ingest \
  -H "X-API-Key: ak_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "<source-uuid>",
    "logs": [
      {"level": "error", "message": "Connection refused to DB"},
      {"level": "info", "message": "Request handled in 120ms"}
    ]
  }'
```

### AI Analysis

```bash
# Analyze unanalyzed logs
curl -X POST "http://localhost:8051/ai/analyze/unanalyzed?limit=50" \
  -H "Authorization: Bearer <JWT>"

# Get health summary (last 24h)
curl -X POST "http://localhost:8051/ai/summarize" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"hours": 24}'

# Root cause analysis
curl -X POST "http://localhost:8051/ai/root-cause" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"logIds": ["<log-uuid-1>", "<log-uuid-2>"]}'
```

### Key Endpoints

| Module | Endpoints | Description |
|--------|-----------|-------------|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile`, `POST /auth/api-keys` | Registration, JWT auth, API key management |
| **Users** | `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id` | User management |
| **Remote Servers** | CRUD `/remote-servers` | Manage monitored servers |
| **Log Sources** | CRUD `/log-sources` | Configure log sources (type, pull config) |
| **Logs** | `POST /logs`, `POST /logs/ingest`, `GET /logs`, `GET /logs/stats` | Ingest and query logs |
| **AI** | `POST /ai/analyze`, `POST /ai/analyze/unanalyzed`, `POST /ai/summarize`, `POST /ai/root-cause`, `GET /ai/history`, `GET /ai/status` | AI-powered analysis |
| **Alerts** | CRUD `/alerts`, CRUD `/alerts/rules`, `POST /alerts/evaluate` | Alert rules and evaluation |
| **Tickets** | `GET /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id/status` | Incident tickets (auto-created) |
| **Ingestion** | `GET /ingestion/status`, `POST /ingestion/pull/trigger/:sourceId` | Ingestion pipeline status and control |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  MONITORED SERVERS                                                   │
│                                                                      │
│  Fluent Bit / App Logger / rsyslog / cron scripts                   │
│       │              │              │                                │
│  HTTP API Key    Syslog UDP/TCP   SSH Pull                          │
└───────┼──────────────┼──────────────┼───────────────────────────────┘
        │              │              │
        └──────────────┴──────┬───────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI LOGGER                                                           │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Ingestion Layer                                               │ │
│  │  HTTP API + API Key │ Syslog Listener │ Scheduled Pull (SSH)   │ │
│  └──────────┬─────────────────────────────────────────────────────┘ │
│             │                                                        │
│             ▼                                                        │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  LogsService      │  │  AI Module   │  │  Alerts Module        │ │
│  │  Store + Parse    │  │  Ollama /    │  │  Rules Engine         │ │
│  │  Query + Stats    │  │  OpenAI      │  │  Evaluate + Trigger   │ │
│  └──────────────────┘  └──────────────┘  └───────────┬───────────┘ │
│                                                       │             │
│                         Event Bus ('anomaly.detected') │             │
│                                                       ▼             │
│                                           ┌───────────────────────┐ │
│                                           │  Tickets + Notify     │ │
│                                           │  Auto-create tickets  │ │
│                                           │  Slack / Webhook      │ │
│                                           └───────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  SQLite Database                                              │   │
│  │  users │ logs │ log_sources │ remote_servers │ api_keys       │   │
│  │  alerts │ alert_rules │ tickets │ analysis_results            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Module Map

```
AppModule (root)
├── AuthModule          → JWT + API Key auth, login, register
│     └─ ApiKeyService, ApiKeyGuard
├── UsersModule         → User CRUD
├── RemoteServersModule → Remote server CRUD
├── LogSourcesModule    → Log source configuration
├── LogsModule          → Log ingestion, querying, parsing
├── IngestionModule     → Syslog listener + Scheduled pull (SSH/HTTP)
├── AIModule            → AI analysis (Ollama / OpenAI)
├── AlertsModule        → Alert rules, evaluation, notifications
└── TicketsModule       → Incident tickets (event-driven)
```

---

## Integrations

AI Logger accepts logs from any source that can send HTTP, syslog, or be accessed via SSH.

### Fluent Bit (Recommended Agent)

```ini
[OUTPUT]
    Name         http
    Match        *
    Host         <AI_LOGGER_HOST>
    Port         8051
    URI          /logs/ingest
    Format       json
    Header       X-API-Key ak_live_your_key_here
```

### rsyslog (Syslog Forwarding)

```bash
echo "*.* @@<AI_LOGGER_HOST>:1514" >> /etc/rsyslog.conf
systemctl restart rsyslog
```

### Zabbix / Prometheus / Datadog

Use their webhook integrations to POST alerts to `POST /logs/ingest`. See [PROJECT_PLAN.md](app/PROJECT_PLAN.md) for detailed configuration examples for each platform.

### Direct from Your App

**Node.js (Winston):**
```javascript
const transport = new AILoggerTransport({
    url: 'http://ai-logger:8051',
    apiKey: 'ak_live_...',
    sourceId: 'your-source-uuid'
});
```

**Python:**
```python
handler = AILoggerHandler(
    url="http://ai-logger:8051",
    token="your-jwt-token",
    source_id="your-source-uuid"
)
```

**cURL:**
```bash
curl -X POST http://localhost:8051/logs/ingest \
  -H "X-API-Key: ak_live_..." \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"...","logs":[{"level":"error","message":"Disk at 95%"}]}'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8051` | Server port |
| `JWT_SECRET` | `'default-secret-key'` | JWT signing secret |
| `DB_LOCATION` | `'database.sqlite'` | SQLite file path |
| `DB_SYNCHRONIZE` | `'true'` | TypeORM schema sync (disable in prod) |
| `AI_PROVIDER` | auto-detect | `'openai'` or `'ollama'` |
| `OPENAI_API_KEY` | — | Required for OpenAI provider |
| `OPENAI_MODEL` | `'gpt-4o-mini'` | OpenAI model name |
| `OLLAMA_BASE_URL` | `'http://localhost:11434'` | Ollama API URL |
| `OLLAMA_MODEL` | `'llama3.2'` | Ollama model name |
| `SYSLOG_ENABLED` | `'true'` | Enable syslog listener |
| `SYSLOG_UDP_PORT` | `1514` | Syslog UDP port |
| `SYSLOG_TCP_PORT` | `1514` | Syslog TCP port |

---

## Project Structure

```
app/src/
├── main.ts                          # Bootstrap, Swagger, global pipes
├── app.module.ts                    # Root module, DB config, global guards
├── auth/                            # JWT + API Key authentication
│   ├── guards/                      # JwtGuard, ApiKeyGuard
│   ├── services/                    # ApiKeyService
│   ├── strategies/                  # JwtStrategy (passport)
│   └── decorators/                  # @CurrentUser(), @Public()
├── users/                           # User CRUD
├── remote-servers/                  # Remote server management
├── log-sources/                     # Log source configuration
├── logs/                            # Log ingestion & querying
│   └── services/                    # LogParserService (JSON/syslog/plain)
├── ingestion/                       # Ingestion infrastructure
│   ├── ingestion.controller.ts      # Status & control endpoints
│   ├── syslog-listener.service.ts   # UDP + TCP syslog servers
│   └── scheduled-pull.service.ts    # SSH + HTTP pull scheduler
├── ai/                              # AI-powered analysis
│   ├── providers/                   # OllamaProvider, OpenAIProvider
│   ├── entities/                    # AnalysisResult
│   └── interfaces/                  # AIProvider interface
├── alerts/                          # Alert rules & notifications
│   └── services/                    # RulesEngineService, NotificationsService
└── tickets/                         # Incident tickets (event-driven)
```

---

## SaaS Roadmap

AI Logger is designed to evolve into a SaaS product:

> **"Datadog-like log monitoring with AI built in, at 1/10th the price."**

| Feature | Datadog | Splunk Cloud | AI Logger |
|---------|---------|-------------|-----------|
| Log ingestion cost | $1.70/GB | $2.00/GB | **$0.50/GB** |
| AI analysis | Extra cost | Not included | **Included (Ollama = free)** |
| Self-host option | No | No | **Yes** |
| Privacy (data stays local) | No | No | **Yes (Ollama mode)** |
| Open source | No | No | **Yes** |

See [PROJECT_PLAN.md](app/PROJECT_PLAN.md) for the full SaaS strategy, pricing model, and architecture.

---

## License

[MIT](LICENSE)
