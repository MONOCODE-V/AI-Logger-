# AI Logger - Project Plan

> **Last updated:** 2026-02-23 — Full architecture analysis & phase re-alignment.

---

## 🎯 Project Goal

Build a highly scalable, AI-powered log monitoring and alerting system. The system ingests logs from remote servers, parses them, analyzes them using AI (OpenAI / Ollama) for anomalies, and uses an **Event-Driven Architecture** to automatically generate tickets and notify administrators when thresholds are crossed.

---

## 💡 The Idea — What This App Does

AI Logger is an **intelligent ops assistant** for DevOps / SRE teams. Instead of manually watching log files or grepping through thousands of lines, AI Logger:

1. **Collects** logs from any source — files, APIs, syslog, webhooks, monitoring tools (Zabbix, Prometheus, Datadog)
2. **Understands** them using AI — not just regex pattern matching, but actual LLM-powered analysis that can detect subtle anomalies humans would miss
3. **Acts** automatically — creates incident tickets, sends Slack/webhook/email alerts, all without human intervention
4. **Learns context** — performs root cause analysis by looking at surrounding logs, not just the single error line

Think of it as **"PagerDuty + Datadog + ChatGPT for your logs"** — but self-hosted, privacy-friendly (Ollama runs locally), and fully customizable.

### Who Is It For?
- **Small-to-mid DevOps teams** who can't afford enterprise monitoring stacks
- **Solo developers** managing multiple servers who need an extra pair of eyes
- **Security-conscious organizations** that want AI-powered log analysis without sending data to third parties (Ollama mode)

---

## 🔄 End-to-End Flows

### Flow 1: Setup & Configuration
```
Admin registers → logs in → gets JWT token
  → Creates Remote Servers (the machines being monitored)
  → Creates Log Sources (what kind of logs: nginx, app, syslog, etc.)
  → Creates Alert Rules (when to be notified: "if >50 errors in 5 min, alert me on Slack")
```

### Flow 2: Log Ingestion (How Logs Enter the System)

Currently AI Logger uses a **push model** — the monitored servers must send logs TO the API.
There is **no built-in agent or pull-based collector yet** (see Phase 3).

#### How logs get from your server to AI Logger:

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR MONITORED SERVER (e.g. web-server-01)                         │
│                                                                     │
│  nginx / your app / system writes logs to disk or stdout            │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────────────────────┐                       │
│  │ OPTION A: Log Forwarder (recommended)    │                       │
│  │  • Filebeat (watches log files, sends    │                       │
│  │    batches via HTTP)                     │                       │
│  │  • Fluentd / Fluent Bit                  │                       │
│  │  • Vector (Datadog's open-source tool)   │                       │
│  │                                          │                       │
│  │  Config example (Filebeat):              │                       │
│  │    output.http:                          │                       │
│  │      url: "http://ai-logger:8051/logs/ingest"                    │
│  │      headers:                            │                       │
│  │        Authorization: "Bearer <JWT>"     │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                     │
│  ┌──────────────────────────────────────────┐                       │
│  │ OPTION B: Direct from your app           │                       │
│  │  • Add an HTTP transport to your logger  │                       │
│  │    (e.g. Winston HTTP transport, Pino    │                       │
│  │    transport, Python logging handler)    │                       │
│  │  • Your app POSTs logs in real-time      │                       │
│  │    alongside writing to file/console     │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                     │
│  ┌──────────────────────────────────────────┐                       │
│  │ OPTION C: Cron / script                  │                       │
│  │  • A shell script that tails log files   │                       │
│  │    and POSTs new lines every N seconds   │                       │
│  │  • curl -X POST ai-logger:8051/logs/ingest                      │
│  │    -H "Authorization: Bearer <JWT>"      │                       │
│  │    -d '{"sourceId":"...","logs":[...]}'  │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                     │
│  ┌──────────────────────────────────────────┐                       │
│  │ OPTION D: Webhook (for cloud services)   │                       │
│  │  • AWS CloudWatch → Lambda → POST to API │                       │
│  │  • GitHub/GitLab webhooks                │                       │
│  │  • Any service that can POST JSON        │                       │
│  └──────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  HTTP POST
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI LOGGER (this app)                                               │
│                                                                     │
│  POST /logs          → single log entry                             │
│  POST /logs/ingest   → bulk batch (array of log entries)            │
│       │                                                             │
│       ▼                                                             │
│  LogsService                                                        │
│    → validates & stores in DB                                       │
│    → attaches sourceId + serverId for traceability                  │
│    → marks isAnalyzed = false (queued for AI)                       │
│       │                                                             │
│       ▼                                                             │
│  Log is now queryable:                                              │
│    GET /logs?sourceId=X&level=error&search=timeout&page=1           │
│    GET /logs/stats → total counts, breakdown by level/source        │
└─────────────────────────────────────────────────────────────────────┘
```

#### What's NOT built yet (planned for Phase 3):
- **Pull-based collection**: AI Logger connecting to remote servers via SSH/API to
  pull logs on a schedule (using the `RemoteServer.url` and `RemoteServer.config` fields)
- **Syslog listener**: A UDP/TCP syslog server built into AI Logger that remote
  servers can forward syslog messages to directly (no agent needed)
- **Log Source connectors**: Native integrations with Zabbix, Prometheus, Datadog APIs
  that pull metrics/logs automatically

> **Bottom line today:** You register your servers and sources as metadata in AI Logger,
> then you set up something on each server (Filebeat, script, app transport) to POST
> logs to `POST /logs/ingest`. The system doesn't reach out to servers on its own — yet.

---

### 📦 Integration Guide: Connecting Log Sources to AI Logger

All external tools must POST to the AI Logger API. Here's the exact contract:

#### API Contract

**Endpoint:** `POST /logs/ingest`
**Auth:** `Authorization: Bearer <JWT_TOKEN>` (get token from `POST /auth/login`)
**Content-Type:** `application/json`

```json
{
  "sourceId": "<uuid-of-log-source>",     // REQUIRED — from GET /log-sources
  "serverId": "<uuid-of-remote-server>",  // optional — from GET /remote-servers
  "format": "json",                        // optional — json | syslog | plain | custom
  "logs": [                                // REQUIRED — array of log entries
    {
      "level": "error",                    // REQUIRED — debug | info | warn | error | fatal
      "message": "Connection refused to DB", // REQUIRED
      "metadata": { "host": "web-01", "service": "api" },  // optional
      "timestamp": "2026-02-23T14:30:00Z"  // optional (defaults to now)
    },
    {
      "level": "info",
      "message": "Request handled in 120ms"
    }
  ]
}
```

**Level mapping** (use these exact values):
| Your log level | AI Logger level |
|----------------|-----------------|
| DEBUG, TRACE, VERBOSE | `debug` |
| INFO, NOTICE | `info` |
| WARNING, WARN | `warn` |
| ERROR, ERR | `error` |
| FATAL, CRITICAL, EMERGENCY, ALERT | `fatal` |

---

#### Integration 1: Fluent Bit (Recommended — Lightweight Agent)

Install Fluent Bit on each monitored server. It watches log files and forwards to AI Logger.

**Install (Ubuntu/Debian):**
```bash
curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
```

**Config: `/etc/fluent-bit/fluent-bit.conf`**
```ini
[SERVICE]
    Flush        5
    Log_Level    info

# Watch your application log file
[INPUT]
    Name         tail
    Path         /var/log/myapp/*.log
    Tag          myapp
    Read_from_Head  true

# Watch nginx error log
[INPUT]
    Name         tail
    Path         /var/log/nginx/error.log
    Tag          nginx

# Watch syslog
[INPUT]
    Name         systemd
    Tag          system
    Systemd_Filter  _SYSTEMD_UNIT=ssh.service

# Transform logs into AI Logger format using a Lua script
[FILTER]
    Name         lua
    Match        *
    Script       /etc/fluent-bit/transform.lua
    Call         transform_for_ai_logger

# Send to AI Logger
[OUTPUT]
    Name         http
    Match        *
    Host         <AI_LOGGER_HOST>
    Port         8051
    URI          /logs/ingest
    Format       json
    Header       Authorization Bearer <YOUR_JWT_TOKEN>
    Header       Content-Type application/json
    json_date_key  timestamp
    json_date_format  iso8601
```

**Lua transform script: `/etc/fluent-bit/transform.lua`**
```lua
function transform_for_ai_logger(tag, timestamp, record)
    -- Map Fluent Bit record to AI Logger format
    local level = "info"
    local msg = record["log"] or record["MESSAGE"] or record["message"] or ""

    -- Auto-detect level from message content
    local lower_msg = string.lower(msg)
    if string.find(lower_msg, "error") or string.find(lower_msg, "err") then
        level = "error"
    elseif string.find(lower_msg, "warn") then
        level = "warn"
    elseif string.find(lower_msg, "fatal") or string.find(lower_msg, "critical") then
        level = "fatal"
    elseif string.find(lower_msg, "debug") then
        level = "debug"
    end

    -- Override with explicit level if present
    if record["level"] then
        level = string.lower(record["level"])
    end

    local new_record = {
        sourceId = "<YOUR_SOURCE_UUID>",
        serverId = "<YOUR_SERVER_UUID>",
        format   = "plain",
        logs     = {
            {
                level     = level,
                message   = msg,
                timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
                metadata  = {
                    tag      = tag,
                    hostname = record["_HOSTNAME"] or os.getenv("HOSTNAME") or "unknown"
                }
            }
        }
    }
    return 1, timestamp, new_record
end
```

---

#### Integration 2: Zabbix (via Webhook Media Type)

Zabbix doesn't forward raw logs, but it can send **alert/problem notifications** to AI Logger when it detects issues.

**Step 1:** Create a Webhook media type in Zabbix:
- Go to **Administration → Media types → Create media type**
- Type: **Webhook**
- Script:

```javascript
var params = JSON.parse(value);

var req = new HttpRequest();
req.addHeader('Content-Type: application/json');
req.addHeader('Authorization: Bearer ' + params.token);

var payload = JSON.stringify({
    sourceId: params.sourceId,
    serverId: params.serverId,
    format: "json",
    logs: [{
        level: params.severity === "Disaster" || params.severity === "High" ? "fatal" :
               params.severity === "Average" ? "error" :
               params.severity === "Warning" ? "warn" : "info",
        message: "[Zabbix] " + params.subject + ": " + params.message,
        timestamp: new Date().toISOString(),
        metadata: {
            source: "zabbix",
            host: params.host,
            trigger: params.trigger,
            severity: params.severity,
            eventId: params.eventId
        }
    }]
});

var resp = req.post(params.url + '/logs/ingest', payload);
if (req.getStatus() !== 200) {
    throw 'Failed: ' + resp;
}
return 'OK';
```

- Parameters:
  | Name | Value |
  |------|-------|
  | `url` | `http://<AI_LOGGER_HOST>:8051` |
  | `token` | `<YOUR_JWT_TOKEN>` |
  | `sourceId` | `<YOUR_SOURCE_UUID>` |
  | `serverId` | `{HOST.HOST}` |
  | `host` | `{HOST.NAME}` |
  | `trigger` | `{TRIGGER.NAME}` |
  | `severity` | `{TRIGGER.SEVERITY}` |
  | `subject` | `{EVENT.NAME}` |
  | `message` | `{TRIGGER.DESCRIPTION}` |
  | `eventId` | `{EVENT.ID}` |

**Step 2:** Assign the media type to a user and create an Action that triggers on problems.

---

#### Integration 3: Prometheus / Alertmanager (Webhook Receiver)

Prometheus itself stores metrics, not logs. But **Alertmanager** can forward firing alerts to AI Logger:

**In `alertmanager.yml`:**
```yaml
receivers:
  - name: 'ai-logger'
    webhook_configs:
      - url: 'http://<AI_LOGGER_HOST>:8051/logs/ingest'
        http_config:
          authorization:
            type: Bearer
            credentials: '<YOUR_JWT_TOKEN>'
        send_resolved: true

route:
  receiver: 'ai-logger'
  group_wait: 30s
  group_interval: 5m
```

**Problem:** Alertmanager's webhook format doesn't match AI Logger's `IngestLogsDto`.
**Solution:** Use a small transform proxy, OR add a dedicated `/logs/ingest/alertmanager` endpoint to AI Logger (Phase 3 plan). For now, use a lightweight Lambda/function to transform:

```javascript
// Transform Alertmanager webhook → AI Logger format
function transform(alertmanagerPayload) {
    return {
        sourceId: "<YOUR_SOURCE_UUID>",
        format: "json",
        logs: alertmanagerPayload.alerts.map(alert => ({
            level: alert.status === "firing" ? "error" : "info",
            message: `[Prometheus] ${alert.labels.alertname}: ${alert.annotations.summary || alert.annotations.description}`,
            timestamp: alert.startsAt,
            metadata: {
                source: "prometheus",
                alertname: alert.labels.alertname,
                instance: alert.labels.instance,
                job: alert.labels.job,
                status: alert.status,
                labels: alert.labels
            }
        }))
    };
}
```

---

#### Integration 4: Datadog (Webhook Integration)

**In Datadog → Integrations → Webhooks:**
- URL: `http://<AI_LOGGER_HOST>:8051/logs/ingest`
- Custom Headers: `{"Authorization": "Bearer <YOUR_JWT_TOKEN>", "Content-Type": "application/json"}`
- Payload:
```json
{
    "sourceId": "<YOUR_SOURCE_UUID>",
    "format": "json",
    "logs": [{
        "level": "$ALERT_TYPE",
        "message": "[Datadog] $EVENT_TITLE: $EVENT_MSG",
        "timestamp": "$DATE",
        "metadata": {
            "source": "datadog",
            "host": "$HOSTNAME",
            "alertId": "$ALERT_ID",
            "link": "$LINK",
            "tags": "$TAGS"
        }
    }]
}
```

> **Note:** Datadog's `$ALERT_TYPE` returns "error"/"warning"/"info" which maps directly to AI Logger levels.

---

#### Integration 5: Direct from Your App (Code Examples)

**Node.js (Winston HTTP Transport):**
```javascript
const winston = require('winston');

// Custom transport that sends logs to AI Logger
class AILoggerTransport extends winston.Transport {
    constructor(opts) {
        super(opts);
        this.url = opts.url || 'http://localhost:8051';
        this.token = opts.token;
        this.sourceId = opts.sourceId;
        this.serverId = opts.serverId;
        this.buffer = [];
        this.flushInterval = setInterval(() => this.flush(), 5000); // flush every 5s
    }

    log(info, callback) {
        this.buffer.push({
            level: info.level,  // Winston uses: error, warn, info, debug
            message: info.message,
            timestamp: new Date().toISOString(),
            metadata: { ...info, level: undefined, message: undefined }
        });
        if (this.buffer.length >= 50) this.flush(); // flush at 50 entries
        callback();
    }

    async flush() {
        if (this.buffer.length === 0) return;
        const logs = [...this.buffer];
        this.buffer = [];
        try {
            await fetch(`${this.url}/logs/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    sourceId: this.sourceId,
                    serverId: this.serverId,
                    format: 'json',
                    logs
                })
            });
        } catch (err) {
            console.error('Failed to send logs to AI Logger:', err.message);
            this.buffer.unshift(...logs); // re-queue on failure
        }
    }
}

// Usage
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new AILoggerTransport({
            url: 'http://ai-logger-host:8051',
            token: 'your-jwt-token',
            sourceId: 'your-source-uuid',
            serverId: 'your-server-uuid'
        })
    ]
});

logger.info('User logged in', { userId: '123' });
logger.error('Database connection failed', { host: 'db-01', port: 5432 });
```

**Python (logging handler):**
```python
import logging, json, requests, threading, time

class AILoggerHandler(logging.Handler):
    LEVEL_MAP = {
        'DEBUG': 'debug', 'INFO': 'info', 'WARNING': 'warn',
        'ERROR': 'error', 'CRITICAL': 'fatal'
    }

    def __init__(self, url, token, source_id, server_id=None, flush_interval=5):
        super().__init__()
        self.url = f"{url}/logs/ingest"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        self.source_id = source_id
        self.server_id = server_id
        self.buffer = []
        self._start_flush_timer(flush_interval)

    def emit(self, record):
        self.buffer.append({
            "level": self.LEVEL_MAP.get(record.levelname, "info"),
            "message": self.format(record),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "metadata": {"logger": record.name, "module": record.module}
        })

    def flush(self):
        if not self.buffer:
            return
        logs, self.buffer = self.buffer[:], []
        payload = {"sourceId": self.source_id, "format": "json", "logs": logs}
        if self.server_id:
            payload["serverId"] = self.server_id
        try:
            requests.post(self.url, json=payload, headers=self.headers, timeout=5)
        except Exception:
            self.buffer = logs + self.buffer  # re-queue

    def _start_flush_timer(self, interval):
        def loop():
            while True:
                time.sleep(interval)
                self.flush()
        t = threading.Thread(target=loop, daemon=True)
        t.start()

# Usage
handler = AILoggerHandler(
    url="http://ai-logger-host:8051",
    token="your-jwt-token",
    source_id="your-source-uuid"
)
logger = logging.getLogger("myapp")
logger.addHandler(handler)
logger.error("Payment processing failed", extra={"order_id": "ORD-456"})
```

**cURL (quick test / shell script):**
```bash
# Get a JWT token first
TOKEN=$(curl -s -X POST http://localhost:8051/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}' \
  | jq -r '.access_token')

# Send logs
curl -X POST http://localhost:8051/logs/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "sourceId": "your-source-uuid",
    "serverId": "your-server-uuid",
    "format": "plain",
    "logs": [
      {"level": "error", "message": "Disk usage at 95%", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
      {"level": "warn", "message": "Memory usage at 80%"},
      {"level": "info", "message": "Backup completed successfully"}
    ]
  }'
```

---

#### Integration Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MONITORED INFRASTRUCTURE                          │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ Web Server  │  │  App Server │  │  DB Server  │  │ K8s Pods  │  │
│  │  (nginx)    │  │  (Node.js)  │  │ (Postgres)  │  │           │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
│         │                │                │                │        │
│    Fluent Bit       App Logger       Fluent Bit       Fluent Bit    │
│    (tail logs)    (direct HTTP)     (tail logs)      (tail stdout)  │
│         │                │                │                │        │
└─────────┼────────────────┼────────────────┼────────────────┼────────┘
          │                │                │                │
          └────────────────┴────────┬───────┴────────────────┘
                                    │
                              HTTP POST to
                          POST /logs/ingest
                                    │
┌───────────────────────────────────┼──────────────────────────────────┐
│                              AI LOGGER                               │
│                                   │                                  │
│  ┌────────────────────────────────┴─────────────────────────┐       │
│  │                    LogsService                            │       │
│  │  → validate → store in DB → mark isAnalyzed=false         │       │
│  └───────────────────────────────────────────────────────────┘       │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │  AI Analysis │  │ Rules Engine │  │  Alerts → Tickets →    │     │
│  │  (OpenAI /   │  │  (evaluate   │  │  Notifications         │     │
│  │   Ollama)    │  │   rules)     │  │  (Slack/Webhook/Email) │     │
│  └──────────────┘  └──────────────┘  └────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    MONITORING TOOLS (alert forwarding)                │
│                                                                      │
│  ┌─────────┐    ┌─────────────┐    ┌─────────┐                     │
│  │ Zabbix  │    │ Alertmanager│    │ Datadog │                     │
│  │ Webhook │    │  webhook    │    │ Webhook │                     │
│  └────┬────┘    └──────┬──────┘    └────┬────┘                     │
│       │                │                │                           │
│       └────────────────┴────────┬───────┘                           │
│                                 │                                    │
│                      HTTP POST /logs/ingest                          │
│                        (with level mapping)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Flow 3: AI Analysis (The Intelligence Layer)
```
Operator triggers analysis (or scheduled job in future):
  │
  ├─ POST /ai/analyze              → analyze specific source logs
  ├─ POST /ai/analyze/unanalyzed   → analyze all pending logs
  ├─ POST /ai/summarize            → summarize recent log activity
  ├─ POST /ai/root-cause           → deep-dive into specific errors
  │
  ▼
AIService
  → picks active provider (OpenAI or Ollama)
  → fetches logs from DB via LogsService
  → sends structured prompt to LLM:
      "Here are 50 log entries. Find anomalies, patterns, severity."
  → LLM responds with JSON:
      { severity: "critical", anomalies: [...], recommendations: [...], healthScore: 35 }
  → saves AnalysisResult to DB
  → marks processed logs as isAnalyzed = true
  │
  ▼
Results accessible via:
  GET /ai/history   → all past analyses
  GET /ai/:id       → specific analysis detail
```

### Flow 4: Alert Rules & Automated Response (The Brain)
```
Operator creates rules like:
  "If error_count > 100 in last 10 minutes for source nginx → alert critical via Slack + webhook"
  "If no_logs from source payment-api for 30 minutes → alert high via email"
  "If keyword 'OutOfMemoryError' appears → alert critical"
  │
  ▼
POST /alerts/evaluate  (manual trigger, or scheduled in future)
  │
  ▼
RulesEngineService.evaluateAllRules()
  → loads all enabled rules
  → for each rule:
      → checks cooldown (don't re-alert within N minutes)
      → evaluates ALL conditions against live log data:
          ├─ error_count:    COUNT logs WHERE level IN (error,fatal) in time window
          ├─ error_rate:     error_count / total_count as percentage
          ├─ log_level:      ANY logs matching specified levels exist?
          ├─ keyword_match:  LIKE search for keywords (AND/OR logic)
          ├─ no_logs:        ZERO logs in time window? (silence = problem)
          └─ ai_anomaly:     (planned) AI detected severity above threshold
      → if ALL conditions met → triggerAlert()
```

### Flow 5: The Event Chain (Anomaly → Ticket → Notification)
This is the core event-driven pipeline — **fully automated, zero human intervention**:

```
┌─────────────────────────────────────────────────────────────────┐
│  RulesEngineService.triggerAlert()                               │
│    → creates Alert entity (severity, description, log references)│
│    → emits EVENT: 'anomaly.detected'                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  TicketsService @OnEvent('anomaly.detected')                     │
│    → creates Ticket (title, description, priority mapped from    │
│      alert severity, linked to rule + log)                       │
│    → emits EVENT: 'ticket.created'                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  NotificationsService @OnEvent('ticket.created')                 │
│    → reads rule.actions[] to determine channels                  │
│    → for each action:                                            │
│        ├─ webhook:  HTTP POST to configured URL ✅               │
│        ├─ slack:    POST to Slack webhook URL ✅                 │
│        ├─ email:    (stub — logs to console) 🔜                 │
│        └─ in_app:   (stub — future WebSocket push) 🔜           │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 6: Ticket Lifecycle (Incident Management)
```
Ticket created automatically (from event chain above)
  │  status: OPEN, priority: CRITICAL/HIGH/MEDIUM/LOW
  │
  ├─ Operator views:   GET /tickets
  ├─ Operator reviews:  GET /tickets/:id
  ├─ Operator acts:    PATCH /tickets/:id/status
  │     → IN_PROGRESS  (someone is investigating)
  │     → RESOLVED     (root cause fixed)
  │     → CLOSED       (confirmed resolved)
  │
  ▼
Meanwhile, the related Alert also has its own lifecycle:
  POST /alerts/:id/acknowledge  → "I see it, working on it"
  POST /alerts/:id/resolve      → "Fixed, here's what happened" (notes required)
  POST /alerts/:id/silence      → "Known issue, stop alerting me"
```

### Flow 7: Observability & Debugging
```
At any time, operators can:
  │
  ├─ GET /logs?level=error&startTime=...&endTime=...  → find specific errors
  ├─ GET /logs/stats                                    → volume & error rate overview
  ├─ POST /ai/root-cause { logIds: [...] }             → "why did this happen?"
  │     → AI looks at the error logs + surrounding context (±5 min window)
  │     → returns: probable causes, timeline, recommendations
  ├─ GET /ai/status                                     → which AI provider is active?
  ├─ POST /ai/switch-provider { provider: 'ollama' }   → switch to local AI
  └─ GET /alerts/stats                                  → alert volume & severity breakdown
```

---

## 🏗️ Current Architecture

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (TypeScript) |
| Database | SQLite via `better-sqlite3` + TypeORM |
| Auth | JWT (`@nestjs/passport` + `passport-jwt`) |
| AI Providers | OpenAI (GPT-4o-mini) / Ollama (llama3.2) |
| Event Bus | `@nestjs/event-emitter` (in-process) |
| API Docs | Swagger (`@nestjs/swagger`) |
| Package Mgr | pnpm |

### Module Map (8 feature modules)

```
AppModule (root)
├── AuthModule          → JWT auth, login, register, profile
│     └─ depends on: UsersModule
├── UsersModule         → User CRUD
├── RemoteServersModule → Remote server CRUD
├── LogSourcesModule    → Log source configuration CRUD
├── LogsModule          → Log ingestion, querying, parsing, stats
├── AIModule            → AI analysis (OpenAI/Ollama), anomaly detection, RCA
│     └─ depends on: LogsModule
├── AlertsModule        → Alert rules, rule evaluation, notifications
│     └─ depends on: LogsModule
└── TicketsModule       → Incident tickets (event-driven creation)
```

### Event-Driven Flow (Implemented ✅)

```
RulesEngineService.evaluateAllRules()
  └─ conditions met → triggerAlert()
       └─ creates Alert entity
       └─ emits 'anomaly.detected'
            └─ TicketsService @OnEvent('anomaly.detected')
                 └─ creates Ticket
                 └─ emits 'ticket.created'
                      └─ NotificationsService @OnEvent('ticket.created')
                           └─ dispatches: webhook ✅ | slack ✅ | email (stub) | in_app (stub)
```

### Entity Relationship Diagram

```
┌─────────┐     ┌───────────┐     ┌──────────┐
│  User    │     │RemoteServer│    │ LogSource │
│  (UUID)  │     │  (UUID)    │    │  (UUID)   │
└────┬─────┘     └─────┬──────┘    └─────┬─────┘
     │ownerId          │serverId         │sourceId
     │(string)         │(string)         │(string)
     ▼                 ▼                 ▼
┌──────────────────────────────────────────────┐
│                    Log                        │
│  (UUID) — sourceId, serverId, level, message  │
│  isAnalyzed, timestamp, metadata, parsedData  │
└───────┬───────────────────────┬──────────────┘
        │logIds (JSON)          │logIds (JSON)
        ▼                       ▼
┌───────────────┐       ┌──────────────┐
│AnalysisResult │       │    Alert     │
│ (UUID)        │       │   (UUID)     │
│ provider,     │       │ ruleId,      │
│ severity,     │       │ severity,    │
│ anomalies,    │       │ status       │
│ healthScore   │       └──────┬───────┘
└───────────────┘              │
                               │ event: anomaly.detected
                               ▼
                        ┌──────────────┐
                        │   Ticket     │
                        │  (UUID)      │
                        │ status,      │
                        │ priority     │
                        └──────────────┘

┌───────────────┐
│  AlertRule    │
│  (UUID)       │
│ conditions[], │
│ actions[],    │
│ cooldown      │
└───────────────┘
```

> **Note:** All cross-entity references use plain string IDs. There are **no TypeORM foreign key relations** (`@ManyToOne`/`@OneToMany`). No cascading deletes.

### Key API Endpoints

| Module | Endpoints | Notable |
|--------|-----------|---------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile` | Public register/login; everything else JWT-guarded (global `APP_GUARD`) |
| Users | CRUD `/users` | Standard CRUD |
| Remote Servers | CRUD `/remote-servers` | Standard CRUD |
| Log Sources | CRUD `/log-sources` | Auto-stamps `ownerId` from JWT |
| Logs | `POST /logs`, `POST /logs/ingest`, `GET /logs`, `GET /logs/stats` | Bulk ingest, paginated query, stats |
| AI | `POST /ai/analyze`, `POST /ai/analyze/unanalyzed`, `POST /ai/summarize`, `POST /ai/root-cause`, `GET /ai/status` | Provider switching at runtime |
| Alerts | CRUD `/alerts`, CRUD `/alerts/rules`, `POST /alerts/evaluate`, `POST /alerts/test-notification` | Full rules engine + notification testing |
| Tickets | `GET /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id/status` | Event-driven creation only (no POST endpoint) |

---

## 🚀 Development Phases

### ✅ Phase 1: Core MVP (Complete)
- [x] NestJS project setup with SQLite + TypeORM
- [x] JWT Authentication & User Management (register, login, profile)
- [x] Global JWT guard with `@Public()` decorator bypass
- [x] Remote Servers CRUD
- [x] Log Sources CRUD
- [x] Log Ingestion (single + bulk) with pagination & filtering
- [x] Log Parser Service (JSON, Syslog RFC 3164/5424, plain text)
- [x] AI Integration — OpenAI provider (raw `fetch`, GPT-4o-mini)
- [x] AI Integration — Ollama provider (local LLM, auto-select)
- [x] AI Analysis endpoints (batch, unanalyzed, summarize, RCA)
- [x] Analysis Results persisted to DB
- [x] Swagger API documentation on `/api`

### ✅ Phase 2: Event-Driven Architecture (Complete)
- [x] Installed `@nestjs/event-emitter`
- [x] Created `TicketsModule` (entity, service, controller)
- [x] Alert Rules CRUD with conditions/actions schema
- [x] `RulesEngineService` — evaluates rules: `error_count`, `error_rate`, `log_level`, `keyword_match`, `no_logs`
- [x] `RulesEngineService.triggerAlert()` emits `'anomaly.detected'` event
- [x] `TicketsService` listens to `'anomaly.detected'`, creates ticket, emits `'ticket.created'`
- [x] `NotificationsService` listens to `'ticket.created'`, dispatches via Webhook & Slack
- [x] Alert lifecycle: active → acknowledged → resolved / silenced
- [x] Cooldown logic to prevent alert fatigue

### 🔧 Phase 2.5: Bug Fixes & Hardening (Current — Must Do)

These are issues discovered during the architecture analysis that should be fixed before adding new features:

#### Critical
- [ ] **Alert route conflict:** `GET /alerts/rules` is registered AFTER `GET /alerts/:id` — NestJS matches `:id = 'rules'` instead of the rules endpoint. **Fix: reorder routes in `AlertsController` so `/alerts/rules/*` routes come before `/alerts/:id`, or split into a separate `AlertRulesController`.**
- [ ] **Ticket priority mapping broken:** `TicketsService.handleAnomalyDetectedEvent()` compares `priority` against uppercase strings (`'CRITICAL'`, `'HIGH'`) but `AlertSeverity` values are lowercase (`'critical'`, `'high'`). All tickets default to `MEDIUM`. **Fix: normalize case in comparison.**

#### Medium
- [ ] **JWT secret mismatch:** `JwtModule.register()` has fallback `'default-secret-key'`, but `JwtStrategy` constructor throws `Error('JWT_SECRET not configured')` if env var is missing. These must be consistent — either both throw or both use the same fallback.
- [ ] **CurrentUser interface mismatch:** `CurrentUser` interface has `name` field, but `JwtStrategy.validate()` only returns `{ id, email }`. The `name` will always be `undefined`.
- [ ] **LogParserService unused:** `LogParserService` is provided and exported by `LogsModule` but **never called** during log ingestion (`create()` / `ingest()`). Wire it into the ingestion flow or remove dead code.
- [ ] **Unimplemented rule conditions:** `ai_anomaly` and `custom` condition types exist in the enum but `evaluateCondition()` returns `{ met: false }` for them. Either implement or remove from the enum.
- [ ] **RemoteServer ownerId not auto-stamped:** Unlike `LogSourcesController`, `RemoteServersController` doesn't extract `ownerId` from the JWT user — client must supply it manually. Should be consistent.

#### Low
- [ ] **LogSources controller missing Swagger decorators:** No `@ApiTags('log-sources')` or `@ApiBearerAuth()` — endpoints won't appear grouped in Swagger UI.
- [ ] **AI controller DTOs inline:** `AnalyzeBatchDto`, `RootCauseDto`, `SwitchProviderDto` are defined inside the controller file. Move to `ai/dto/` directory.
- [ ] **Tickets controller redundant guard:** `@UseGuards(JwtGuard)` is explicit but already applied globally. Not harmful, but inconsistent with other controllers.
- [ ] **No TypeORM relations:** All entity cross-references are plain string IDs with no FK constraints. Orphaned data is possible (e.g., deleting a LogSource won't affect Logs referencing it).

### ✅ Phase 2.7: Ingestion Infrastructure (DONE)

Three log ingestion methods are now fully implemented:

#### 1. HTTP API with API Key Auth (Enhanced)
- **New entity:** `ApiKey` — stores hashed keys with prefix, permissions, expiry
- **New service:** `ApiKeyService` — create / validate / revoke API keys (SHA-256 hashed, `ak_live_` prefix)
- **New guard:** `ApiKeyGuard` — global guard that checks `X-API-Key` header before JWT falls through
- **New endpoints:**
  - `POST /auth/api-keys` — create key (returns raw key once)
  - `GET /auth/api-keys` — list user's keys (prefix only, no secrets)
  - `DELETE /auth/api-keys/:id` — revoke key
- **How it works:** External servers use `X-API-Key` header → guard validates → injects ownerId → existing `POST /logs` and `POST /logs/ingest` work as-is

#### 2. Syslog Listener (New)
- **File:** `src/ingestion/syslog-listener.service.ts`
- Starts UDP + TCP syslog servers on port 1514 (configurable via `SYSLOG_UDP_PORT` / `SYSLOG_TCP_PORT`)
- Maps sender IP → LogSource via `LogSource.config.syslogIp` field
- Parses RFC 3164 + 5424 using existing `LogParserService.parseSyslog()`
- Auto-caches IP→source mappings (refreshes every 60s)
- **Customer setup:** `echo "*.* @@<HOST>:1514" >> /etc/rsyslog.conf && systemctl restart rsyslog`
- **Env vars:** `SYSLOG_ENABLED=true`, `SYSLOG_UDP_PORT=1514`, `SYSLOG_TCP_PORT=1514`

#### 3. Scheduled Pull (New)
- **File:** `src/ingestion/scheduled-pull.service.ts`
- SSH pull: connects to remote servers via `ssh2`, runs `tail -c +<offset>` to get only new lines, tracks byte offset cursor
- HTTP pull: `fetch()` with `?since=<timestamp>` cursor, supports Bearer and API key auth headers
- Configurable per LogSource via `config.pullEnabled`, `config.pullIntervalMs`, `config.pullMethod`
- Auto-discovers all LogSources with `pullEnabled: true` on startup
- **RemoteServer.config** example: `{ ssh: { host, port, username, privateKey } }`
- **LogSource.config** example: `{ pullEnabled: true, pullIntervalMs: 30000, pullMethod: "ssh-tail", filePath: "/var/log/syslog", serverId: "uuid" }`

#### Ingestion Module & API
- **File:** `src/ingestion/ingestion.module.ts` — wires everything together
- **Controller endpoints:**
  - `GET /ingestion/status` — combined syslog + pull status
  - `GET /ingestion/syslog/status` — syslog listener details
  - `GET /ingestion/pull/status` — scheduled pull job details
  - `POST /ingestion/pull/trigger/:sourceId` — manually trigger a pull
  - `POST /ingestion/pull/refresh` — re-scan sources and register new pull jobs

#### Dependencies Added
- `@nestjs/schedule` — cron/interval management for pull jobs
- `ssh2` / `@types/ssh2` — SSH connections to remote servers

#### ✅ Comprehensive Testing Results
All 3 ingestion methods tested successfully with automated test script (`test-ingestion.ps1`):

**Test Results Summary:**
```
┌─────────────────────────────┬──────────┐
│ Ingestion Method            │ Status   │
├─────────────────────────────┼──────────┤
│ HTTP API + API Key          │ ✅ 7 logs│
│ Syslog Listener (UDP+TCP)   │ ✅ 6 logs│
│ Scheduled Pull (HTTP)       │ ✅ 3 logs│
└─────────────────────────────┴──────────┘
```

**1. HTTP API with API Key Auth: ✅ FULLY WORKING**
- API key creation, validation, and revocation working
- Single log ingestion: `POST /logs` with `X-API-Key` header
- Bulk ingestion: `POST /logs/ingest` with array of logs
- Authentication bypasses JWT requirement when API key provided
- Total: 7 logs successfully ingested and stored

**2. Syslog Listener: ✅ FULLY WORKING**
- UDP and TCP servers running on port 1514
- IP-to-source mapping working (127.0.0.1 → syslog source)
- RFC 3164/5424 parsing working correctly
- Manual cache refresh endpoint added (`POST /ingestion/syslog/refresh`)
- Total: 6 syslog messages received, parsed, and stored with proper metadata

**3. Scheduled Pull: ✅ FULLY WORKING**
- Pull job registration and scheduling working (6 active jobs detected)
- HTTP pull method working with JSON parsing and cursor support
- Manual trigger endpoint working (`POST /ingestion/pull/trigger/:sourceId`)
- Fake test server now starting correctly with proper Node.js path resolution
- Total: 3 logs successfully pulled from HTTP endpoint and stored

**Test Infrastructure Created:**
- `test-ingestion.ps1` — Comprehensive automated test script
- `fake-log-server.js` — Node.js HTTP server for pull testing
- Manual cache refresh endpoint for syslog IP mappings
- All ingestion status endpoints working

**Total Logs Ingested:** 34 logs across all methods (includes test data)

### ⏳ Phase 3: Real-Time & Background Processing (Next)
- [ ] Implement WebSockets (`@nestjs/websockets`) — gateway for streaming:
  - Live log feed per source/server
  - Real-time ticket/alert updates pushed to connected clients
  - Dashboard connection status
- [ ] Implement `in_app` notification channel via WebSocket push (currently stub)
- [ ] Integrate Redis + BullMQ (`@nestjs/bull`) for background job queues:
  - AI analysis jobs (heavy, 10-30s per batch)
  - Email sending (network-bound)
  - Scheduled rule evaluation (cron-based `evaluateAllRules`)
- [ ] Implement actual email sending (currently `console.log` stub) via Nodemailer or SendGrid

### ⏳ Phase 4: Data Integrity & Observability
- [ ] Add TypeORM relations (`@ManyToOne` / `@OneToMany`) between entities for FK constraints and cascading deletes
- [ ] Add database migrations (disable `synchronize: true` for production)
- [ ] Add health check endpoint (`@nestjs/terminus`)
- [ ] Add request logging middleware (correlation IDs, timing)
- [ ] Add unit tests and e2e tests for critical flows
- [ ] Implement `ai_anomaly` rule condition (wire AI analysis results into rule evaluation)

### ⏳ Phase 5: Frontend Dashboard
- [ ] Build React/Next.js dashboard
- [ ] Real-time log viewer with WebSocket connection
- [ ] Log volume & error rate charts (line/bar graphs)
- [ ] AI anomaly heatmap and severity breakdown
- [ ] Ticket management UI (list, detail, acknowledge, resolve, assign)
- [ ] Alert rules configuration UI
- [ ] User settings & notification preferences

### ⏳ Phase 6: Connectors, Scaling & Deployment
- [ ] Build log source connectors: Zabbix, Prometheus, Datadog
- [ ] Switch from SQLite to PostgreSQL for production scaling
- [ ] Dockerize the application (`Dockerfile` + `docker-compose.yml`)
- [ ] Add rate limiting (`@nestjs/throttler`)
- [ ] Add RBAC (role-based access control) — admin, operator, viewer roles
- [ ] CI/CD pipeline (GitHub Actions)

---

## 📁 Project Structure

```
app/src/
├── main.ts                          # Bootstrap, Swagger, global pipes
├── app.module.ts                    # Root module, DB config, global JWT guard
├── app.controller.ts                # Health check (GET /)
├── app.service.ts                   # Hello world
├── auth/                            # JWT auth (register, login, profile)
│   ├── decorators/                  # @CurrentUser(), @Public()
│   ├── dto/                         # AuthLoginDto, AuthRegisterDto
│   ├── guards/                      # JwtGuard (with @Public() bypass)
│   ├── interfaces/                  # CurrentUser interface
│   └── strategies/                  # JwtStrategy (passport)
├── users/                           # User CRUD
│   ├── dto/                         # CreateUserDto, UpdateUserDto
│   └── entities/                    # User entity (password @Exclude)
├── remote-servers/                  # Remote server CRUD
│   ├── dto/
│   └── entities/
├── log-sources/                     # Log source config CRUD
│   ├── dto/
│   └── entities/
├── logs/                            # Log ingestion & querying
│   ├── dto/                         # CreateLogDto, IngestLogsDto, QueryLogsDto
│   ├── entities/                    # Log entity (indexed, composite indexes)
│   └── services/                    # LogParserService (JSON/syslog/plain)
├── ai/                              # AI-powered analysis
│   ├── entities/                    # AnalysisResult entity
│   ├── interfaces/                  # AIProvider interface + types
│   └── providers/                   # OpenAIProvider, OllamaProvider
├── alerts/                          # Alert rules & notifications
│   ├── dto/                         # Alert, AlertRule, query DTOs
│   ├── entities/                    # Alert, AlertRule entities
│   └── services/                    # RulesEngineService, NotificationsService
└── tickets/                         # Incident tickets (event-driven)
    └── entities/                    # Ticket entity
```

---

## 🔑 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8051` | Server port |
| `JWT_SECRET` | `'default-secret-key'` | JWT signing secret |
| `DB_LOCATION` | `'database.sqlite'` | SQLite file path |
| `DB_AUTO_LOAD_ENTITIES` | `'true'` | TypeORM auto-load entities |
| `DB_SYNCHRONIZE` | `'true'` | TypeORM schema sync (disable in prod!) |
| `AI_PROVIDER` | auto-detect | `'openai'` or `'ollama'` |
| `OPENAI_API_KEY` | — | Required for OpenAI provider |
| `OPENAI_MODEL` | `'gpt-4o-mini'` | OpenAI model name |
| `OPENAI_MAX_TOKENS` | `2000` | Max response tokens |
| `OPENAI_TEMPERATURE` | `0.3` | LLM temperature |
| `OLLAMA_BASE_URL` | `'http://localhost:11434'` | Ollama API URL |
| `OLLAMA_MODEL` | `'llama3.2'` | Ollama model name |

---

## ☁️ SaaS Strategy — Making AI Logger a Product

### The Core Idea as a SaaS

**"Datadog-like log monitoring with AI built in, at 1/10th the price."**

Most log monitoring SaaS tools (Datadog, Splunk Cloud, New Relic) charge $1.50–$3.00+ per GB of ingested logs. AI analysis is either not included or costs extra. AI Logger can undercut by using Ollama (free, self-hosted AI) and keeping infrastructure lean.

### What Needs to Change (Current → SaaS)

| Area | Current State | SaaS Requirement |
|------|--------------|-------------------|
| **Tenancy** | Single-user, no org concept | Multi-tenant with `organizationId` on every entity |
| **Database** | SQLite (single file, no concurrency) | PostgreSQL (required — concurrent writes from many tenants) |
| **Auth for machines** | JWT tokens (designed for humans) | API Keys (long-lived, non-expiring, tied to org) |
| **Auth for humans** | JWT only | JWT + OAuth2 (Google/GitHub login) |
| **Log ingestion** | Synchronous write to DB | Queue-based: HTTP → Redis/BullMQ → Worker → DB |
| **AI costs** | Unlimited, whoever runs it pays | Metered per org — quotas, usage tracking |
| **Data isolation** | None | Row-level isolation via `organizationId` filter on every query |
| **Billing** | None | Usage-based billing (per GB ingested, per AI analysis) |
| **Retention** | Infinite (just grows) | Per-plan retention policies (7d free, 30d pro, 90d enterprise) |

### Recommended Multi-Tenancy Approach

**Shared Database, Shared Schema** — One PostgreSQL database, every table gets an `organizationId` column.

Why this over separate DBs per tenant:
- **Simplest to build** — just add a column + query filter
- **Cheapest to operate** — one DB instance for all customers
- **Easiest to maintain** — one migration applies to everyone
- **Good enough until ~1000 customers** — then consider sharding

```
┌─ organizations ─────────────────────────────────────────┐
│  id | name          | plan    | apiKey         | ...    │
│  1  | Acme Corp     | pro     | ak_live_xxx... |        │
│  2  | StartupCo     | free    | ak_live_yyy... |        │
└──────────────────────────────────────────────────────────┘

Every other table gets:
  ┌─────────────────────────────────┐
  │  organizationId  (indexed, FK)  │  ← added to: users, logs, log_sources,
  │                                 │     remote_servers, alerts, alert_rules,
  │                                 │     tickets, analysis_results
  └─────────────────────────────────┘

Every query becomes:
  SELECT * FROM logs WHERE organizationId = :orgId AND ...
```

### Recommended Pricing Model

Based on what works in the market (Datadog, Betterstack, Axiom):

| Plan | Price | Log Ingestion | Retention | AI Analysis | Alert Rules | Users |
|------|-------|---------------|-----------|-------------|-------------|-------|
| **Free** | $0/mo | 500 MB/mo | 1 day | 10 analyses/mo (Ollama) | 3 rules | 1 |
| **Starter** | $25/mo | 5 GB/mo | 7 days | 100 analyses/mo | 20 rules | 3 |
| **Pro** | $79/mo | 50 GB/mo | 30 days | Unlimited (Ollama), 500 OpenAI | Unlimited | 10 |
| **Enterprise** | Custom | Unlimited | 90+ days | Unlimited | Unlimited | Unlimited |

**Overage**: $0.50 per extra GB (much cheaper than Datadog's ~$1.70/GB).

**Key insight**: Ollama is free to run — so AI analysis costs you only GPU time, not per-token fees. This is AI Logger's competitive advantage. Offer OpenAI as a "premium accuracy" option.

### API Key Authentication (For Machine-to-Machine)

Currently log ingestion requires a JWT token, which expires in 24h. Machines (Fluent Bit, app loggers) need a **permanent API key**. This is the #1 change for SaaS:

```
Current (bad for SaaS):
  POST /logs/ingest
  Authorization: Bearer eyJhbGciOiJI...  ← expires in 24h, must re-login

SaaS (correct):
  POST /logs/ingest
  X-API-Key: ak_live_abc123def456      ← permanent, tied to org, revocable
```

**Implementation:**
1. New `ApiKey` entity: `{ id, organizationId, key, name, permissions, lastUsedAt, createdAt }`
2. New `ApiKeyGuard` that validates the key and injects `organizationId` into the request
3. Log ingestion endpoints accept EITHER JWT (for dashboard/Swagger) OR API Key (for machines)
4. API key management endpoints: create, list, revoke

### The Most Efficient Build Order for SaaS

Here's the **minimum path** from current state to a deployable SaaS, ordered by impact:

```
STEP 1: Foundation (do these first, everything depends on them)
────────────────────────────────────────────────────────────
 ① Switch SQLite → PostgreSQL           (can't scale without this)
 ② Add Organization entity + tenantId   (multi-tenancy core)
 ③ Add API Key auth for log ingestion   (machines can't use JWT)
 ④ Fix the Phase 2.5 bugs              (route conflicts, priority mapping)

STEP 2: Scale the ingestion pipeline
────────────────────────────────────────────────────────────
 ⑤ Add Redis + BullMQ queue             (don't write DB in HTTP request)
 ⑥ Add rate limiting per org            (@nestjs/throttler)
 ⑦ Add usage metering                   (count bytes/logs per org per month)

STEP 3: Make it usable
────────────────────────────────────────────────────────────
 ⑧ Build minimal dashboard              (React: login, view logs, see alerts)
 ⑨ Add log retention policies           (auto-delete old logs per plan)
 ⑩ Add onboarding flow                  (register org → get API key → see setup guide)

STEP 4: Make it billable
────────────────────────────────────────────────────────────
 ⑪ Integrate Stripe                     (subscriptions + usage-based billing)
 ⑫ Add plan enforcement                 (reject ingestion when quota exceeded)
 ⑬ Usage dashboard                      (show customer their consumption)

STEP 5: Deploy & launch
────────────────────────────────────────────────────────────
 ⑭ Dockerize + docker-compose           (API + PostgreSQL + Redis + Ollama)
 ⑮ Deploy to cloud                      (Railway/Fly.io/AWS ECS)
 ⑯ Landing page                         (pricing, docs, "Get Started")
```

### SaaS Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER INFRASTRUCTURE                                             │
│                                                                      │
│  Fluent Bit / App Logger / Zabbix / etc.                            │
│       │                                                              │
│       │  X-API-Key: ak_live_xxx...                                  │
│       │  POST /logs/ingest                                           │
└───────┼──────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI LOGGER SaaS                                                      │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │   API Layer  │    │ Auth Layer   │    │   Rate Limiter        │  │
│  │  (NestJS)    │◄──►│ JWT + API Key│◄──►│  per org/plan         │  │
│  └──────┬───────┘    └──────────────┘    └───────────────────────┘  │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Redis + BullMQ (Message Queue)                              │   │
│  │                                                              │   │
│  │  log-ingestion-queue    │  ai-analysis-queue │  email-queue  │   │
│  └──────┬──────────────────┼────────────────────┼───────────────┘   │
│         │                  │                    │                    │
│         ▼                  ▼                    ▼                    │
│  ┌────────────┐    ┌────────────┐    ┌────────────────────────┐    │
│  │  Ingestion │    │    AI      │    │   Notification         │    │
│  │  Worker    │    │  Worker    │    │   Worker               │    │
│  │            │    │ (Ollama /  │    │  (Slack/Email/Webhook) │    │
│  │  → parse   │    │  OpenAI)   │    │                        │    │
│  │  → meter   │    │            │    │                        │    │
│  │  → store   │    │            │    │                        │    │
│  └──────┬─────┘    └─────┬──────┘    └────────────────────────┘    │
│         │                │                                          │
│         ▼                ▼                                          │
│  ┌──────────────────────────────────────────────────┐              │
│  │  PostgreSQL                                       │              │
│  │                                                   │              │
│  │  Every table filtered by organizationId           │              │
│  │  ┌─────────────────────────────────────────────┐  │              │
│  │  │ organizations │ users │ api_keys │ plans    │  │              │
│  │  │ logs │ log_sources │ remote_servers         │  │              │
│  │  │ alerts │ alert_rules │ tickets              │  │              │
│  │  │ analysis_results │ usage_records            │  │              │
│  │  └─────────────────────────────────────────────┘  │              │
│  └───────────────────────────────────────────────────┘              │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐                               │
│  │  Ollama      │    │  Stripe      │                               │
│  │  (self-hosted│    │  (billing)   │                               │
│  │   free AI)   │    │              │                               │
│  └──────────────┘    └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER DASHBOARD (React/Next.js)                                  │
│                                                                      │
│  Login → View Logs → See AI Analysis → Manage Alerts → Tickets      │
│  Settings → API Keys → Usage & Billing → Team Members               │
└─────────────────────────────────────────────────────────────────────┘
```

### New Entities Needed for SaaS

```
Organization (new)
├── id, name, slug
├── plan: free | starter | pro | enterprise
├── planLimits: { maxBytesPerMonth, maxAiAnalyses, maxRules, maxUsers, retentionDays }
├── currentUsage: { bytesThisMonth, aiAnalysesThisMonth }
├── stripeCustomerId, stripeSubscriptionId
├── createdAt, updatedAt

ApiKey (new)
├── id, organizationId
├── key (hashed), prefix (first 8 chars for display: "ak_live_abc1...")
├── name ("Production Key", "Staging Key")
├── permissions: ['ingest', 'read', 'admin']
├── lastUsedAt, expiresAt (optional)
├── createdAt

UsageRecord (new)
├── id, organizationId
├── period: "2026-02" (monthly)
├── bytesIngested, logsIngested, aiAnalysesRun
├── createdAt

Existing entities get new column:
├── User            + organizationId, role (admin/member/viewer)
├── Log             + organizationId
├── LogSource       + organizationId
├── RemoteServer    + organizationId
├── Alert           + organizationId
├── AlertRule       + organizationId
├── Ticket          + organizationId
├── AnalysisResult  + organizationId
```

### Competitive Advantage

| Feature | Datadog | Splunk Cloud | AI Logger SaaS |
|---------|---------|-------------|----------------|
| Log ingestion | $1.70/GB | $2.00/GB | **$0.50/GB** |
| AI analysis | Extra cost | Not included | **Included (Ollama = free)** |
| Self-host option | No | No | **Yes** |
| Privacy (no data leaves your infra) | No | No | **Yes (Ollama mode)** |
| Open source | No | No | **Yes** |
| Min price | ~$15/mo | ~$15/mo | **Free tier** |
