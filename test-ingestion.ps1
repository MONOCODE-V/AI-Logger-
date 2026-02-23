###############################################################################
#  AI Logger - Full Ingestion Test Script
#  Tests all 3 ingestion methods:
#    1. HTTP API with API Key
#    2. Syslog Listener (UDP + TCP)
#    3. Scheduled Pull (HTTP pull from a fake log server)
###############################################################################

$ErrorActionPreference = "Continue"
$BASE = "http://localhost:8051"

# --- Colors ---
function Write-Header  ($msg) { Write-Host "`n======================================================" -ForegroundColor Cyan; Write-Host "  $msg" -ForegroundColor Cyan; Write-Host "======================================================" -ForegroundColor Cyan }
function Write-Step    ($msg) { Write-Host "  -> $msg" -ForegroundColor Yellow }
function Write-OK      ($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail    ($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info    ($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Write-JSON    ($obj) { Write-Host ($obj | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray }

# Helper: POST/GET with error handling
function Invoke-Api {
    param(
        [string]$Method = "GET",
        [string]$Uri,
        [object]$Body,
        [hashtable]$Headers = @{}
    )
    $params = @{
        Method          = $Method
        Uri             = $Uri
        ContentType     = "application/json"
        UseBasicParsing = $true
        Headers         = $Headers
    }
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $resp = Invoke-WebRequest @params -ErrorAction Stop
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $detail = ""
        try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).message } catch {}
        if (-not $detail) { $detail = $_.Exception.Message }
        Write-Fail "HTTP $statusCode - $detail"
        return $null
    }
}

###############################################################################
#  PHASE 0: Ensure server is reachable
###############################################################################
Write-Header 'PHASE 0 - Server Health Check'
Write-Step "Checking $BASE ..."
try {
    $response = Invoke-WebRequest -Uri $BASE -UseBasicParsing -ErrorAction Stop
    Write-OK "Server is running"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-OK "Server is running (401 Unauthorized - expected with auth)"
    } else {
        Write-Fail "Server not reachable at $BASE (Status: $statusCode)"
        Write-Host "  Start it first:  cd app; pnpm start:dev" -ForegroundColor Red
        exit 1
    }
}

###############################################################################
#  PHASE 1: Register + Login + Create API Key
###############################################################################
Write-Header 'PHASE 1 - Auth Setup: Register, Login, API Key'

$rand = Get-Random -Maximum 99999
$email    = "testuser$rand@ingestion-test.com"
$username = "testuser$rand"
$password = "TestPass123!"

# Register
Write-Step "Registering $email ..."
$regResult = Invoke-Api -Method POST -Uri "$BASE/auth/register" -Body @{
    email    = $email
    username = $username
    password = $password
}
if ($regResult) { Write-OK "Registered user: $($regResult.userId)" } else { Write-Fail "Registration failed"; exit 1 }

# Login
Write-Step "Logging in ..."
$loginResult = Invoke-Api -Method POST -Uri "$BASE/auth/login" -Body @{
    email    = $email
    password = $password
}
if (-not $loginResult.access_token) { Write-Fail "Login failed"; exit 1 }
$JWT = $loginResult.access_token
Write-OK "Got JWT: $($JWT.Substring(0, 20))..."

$AuthHeaders = @{ Authorization = "Bearer $JWT" }

# Create API Key
Write-Step "Creating API Key ..."
$apiKeyResult = Invoke-Api -Method POST -Uri "$BASE/auth/api-keys" -Body @{
    name        = "ingestion-test-key"
    permissions = @("ingest")
} -Headers $AuthHeaders

if (-not $apiKeyResult.rawKey) { Write-Fail "API Key creation failed"; exit 1 }
$API_KEY = $apiKeyResult.rawKey
Write-OK "Got API Key: $($apiKeyResult.prefix)... full key stored"
Write-Info "Key ID: $($apiKeyResult.id)"

# List API Keys
Write-Step "Listing API keys ..."
$keys = Invoke-Api -Method GET -Uri "$BASE/auth/api-keys" -Headers $AuthHeaders
Write-OK "Found $($keys.Count) API keys"

###############################################################################
#  PHASE 2: Create Remote Server + Log Sources
###############################################################################
Write-Header 'PHASE 2 - Setup: Remote Server + Log Sources'

$userId = $regResult.userId

# Create a fake remote server
Write-Step 'Creating remote server fake-web-server ...'
$server = Invoke-Api -Method POST -Uri "$BASE/remote-servers" -Body @{
    name        = "fake-web-server"
    url         = "http://127.0.0.1:9999"
    ownerId     = $userId
    description = "Test server for ingestion demo"
    config      = @{
        ssh = @{
            host     = "127.0.0.1"
            port     = 22
            username = "testuser"
        }
    }
} -Headers $AuthHeaders
if ($server) { Write-OK "Server created: $($server.id)" } else { Write-Fail "Server creation failed"; exit 1 }
$SERVER_ID = $server.id

# Create Log Source for HTTP API testing
Write-Step 'Creating log source http-api-source, type: api ...'
$httpSource = Invoke-Api -Method POST -Uri "$BASE/log-sources" -Body @{
    name   = "http-api-source"
    type   = "api"
    config = @{ description = "Logs ingested via HTTP API + API Key" }
} -Headers $AuthHeaders
if ($httpSource) { Write-OK "HTTP source created: $($httpSource.id)" } else { Write-Fail "Source creation failed" }
$HTTP_SOURCE_ID = $httpSource.id

# Create Log Source for Syslog testing
Write-Step 'Creating log source syslog-source, type: syslog ...'
$syslogSource = Invoke-Api -Method POST -Uri "$BASE/log-sources" -Body @{
    name   = "syslog-source"
    type   = "syslog"
    config = @{
        syslogIp = "127.0.0.1"
        serverId = $SERVER_ID
    }
} -Headers $AuthHeaders
if ($syslogSource) { Write-OK "Syslog source created: $($syslogSource.id)" } else { Write-Fail 'Source creation failed' }
$SYSLOG_SOURCE_ID = $syslogSource.id
# Refresh syslog IP cache after creating the source
Write-Step 'Refreshing syslog IP cache ...'
$refreshResult = Invoke-Api -Method POST -Uri "$BASE/ingestion/syslog/refresh" -Headers $AuthHeaders
Write-OK "Cache refreshed: $($refreshResult.status.registeredIps.Count) IPs registered"
# Create Log Source for Scheduled Pull testing (HTTP pull from our fake server)
Write-Step 'Creating log source pull-http-source, type: api pullEnabled ...'
$pullSource = Invoke-Api -Method POST -Uri "$BASE/log-sources" -Body @{
    name   = "pull-http-source"
    type   = "api"
    config = @{
        pullEnabled    = $true
        pullIntervalMs = 120000
        pullMethod     = "http"
        httpUrl        = "http://127.0.0.1:9999/logs"
        format         = "json"
        serverId       = $SERVER_ID
    }
} -Headers $AuthHeaders
if ($pullSource) { Write-OK "Pull source created: $($pullSource.id)" } else { Write-Fail 'Source creation failed' }
$PULL_SOURCE_ID = $pullSource.id

Write-Info "HTTP Source ID:   $HTTP_SOURCE_ID"
Write-Info "Syslog Source ID: $SYSLOG_SOURCE_ID"
Write-Info "Pull Source ID:   $PULL_SOURCE_ID"

###############################################################################
#  PHASE 3: TEST - HTTP API Ingestion with API Key
###############################################################################
Write-Header 'PHASE 3 - Test: HTTP API Ingestion with X-API-Key'

$ApiKeyHeaders = @{ "X-API-Key" = $API_KEY }

# Test 1: Single log via POST /logs
Write-Step 'Sending single log via POST /logs ...'
$singleLog = Invoke-Api -Method POST -Uri "$BASE/logs" -Body @{
    sourceId = $HTTP_SOURCE_ID
    serverId = $SERVER_ID
    level    = "info"
    message  = "User alice logged in from 192.168.1.100"
    format   = "json"
    metadata = @{ service = "auth"; ip = "192.168.1.100"; userId = "alice" }
} -Headers $ApiKeyHeaders

if ($singleLog) { Write-OK "Single log created: $($singleLog.id)" } else { Write-Fail "Single log failed" }

# Test 2: Bulk ingest via POST /logs/ingest
Write-Step 'Sending bulk ingest (5 logs) via POST /logs/ingest ...'
$bulkResult = Invoke-Api -Method POST -Uri "$BASE/logs/ingest" -Body @{
    sourceId = $HTTP_SOURCE_ID
    serverId = $SERVER_ID
    format   = "json"
    logs     = @(
        @{ level = "info";  message = "Request GET /api/users 200 OK 12ms";           metadata = @{ path = "/api/users"; status = 200; duration = 12 } }
        @{ level = "warn";  message = "Slow query detected: SELECT * FROM logs - 3.2s"; metadata = @{ query = "SELECT * FROM logs"; duration = 3200 } }
        @{ level = "error"; message = "Database connection pool exhausted max=10";  metadata = @{ pool = "main"; active = 10; waiting = 5 } }
        @{ level = "info";  message = "Cron job cleanup-old-logs completed - 42 deleted"; metadata = @{ job = "cleanup-old-logs"; deleted = 42 } }
        @{ level = "fatal"; message = "CRITICAL: Out of memory - process killed by OOM killer"; metadata = @{ pid = 12345; rss = "2.1GB"; limit = "2GB" } }
    )
} -Headers $ApiKeyHeaders

if ($bulkResult) { Write-OK "Bulk ingest: $($bulkResult.ingested) logs ingested" } else { Write-Fail "Bulk ingest failed" }

# Test 3: Verify logs are queryable
Write-Step 'Querying logs for HTTP source ...'
$queryResult = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$HTTP_SOURCE_ID&limit=10" -Headers $AuthHeaders
if ($queryResult.total -gt 0) {
    Write-OK "Query returned $($queryResult.total) logs for HTTP source"
} else {
    Write-Fail "No logs found"
}

# Test 4: API Key without JWT (pure API key auth)
Write-Step 'Testing API key auth alone - no JWT ...'
$pureApiResult = Invoke-Api -Method POST -Uri "$BASE/logs" -Body @{
    sourceId = $HTTP_SOURCE_ID
    level    = "debug"
    message  = "This log was sent with ONLY an API key, no JWT"
    metadata = @{ authMethod = "api-key-only" }
} -Headers @{ "X-API-Key" = $API_KEY }

if ($pureApiResult) { Write-OK "API-key-only auth works! Log: $($pureApiResult.id)" } else { Write-Fail "API-key-only auth failed" }

###############################################################################
#  PHASE 4: TEST - Syslog Listener (UDP + TCP)
###############################################################################
Write-Header 'PHASE 4 - Test: Syslog Listener UDP + TCP'

# Wait a moment for the syslog IP cache to refresh
Write-Step 'Waiting 5s for syslog IP cache to pick up our new source ...'
Start-Sleep -Seconds 5

# Check syslog status
Write-Step 'Checking syslog listener status ...'
$syslogStatus = Invoke-Api -Method GET -Uri "$BASE/ingestion/syslog/status" -Headers $AuthHeaders
if ($syslogStatus) {
    Write-OK "Syslog status: enabled=$($syslogStatus.enabled), UDP=$($syslogStatus.udpRunning), TCP=$($syslogStatus.tcpRunning)"
    Write-Info "Registered IPs: $($syslogStatus.registeredIps -join ', ')"
} else {
    Write-Fail "Could not get syslog status"
}

# Test UDP syslog
Write-Step 'Sending 3 syslog messages via UDP to port 1514 ...'
$udpClient = New-Object System.Net.Sockets.UdpClient
try {
    $messages = @(
        "<34>Feb 23 10:15:01 fake-web-server sshd: Accepted publickey for admin from 10.0.1.50 port 22",
        "<11>Feb 23 10:15:02 fake-web-server kernel: TCP: out of memory -- consider tuning tcp_mem",
        '<165>Feb 23 10:15:03 fake-web-server nginx: 10.0.1.99 - - GET /health 200 15'
    )
    foreach ($msg in $messages) {
        $bytes = [System.Text.Encoding]::ASCII.GetBytes($msg)
        $null = $udpClient.Send($bytes, $bytes.Length, "127.0.0.1", 1514)
        Write-Info "  UDP → $($msg.Substring(0, [Math]::Min(70, $msg.Length)))..."
    }
    Write-OK "Sent 3 UDP syslog messages"
} catch {
    Write-Fail "UDP send error: $_"
} finally {
    $udpClient.Close()
}

Start-Sleep -Seconds 1

# Test TCP syslog
Write-Step 'Sending 3 syslog messages via TCP to port 1514 ...'
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect("127.0.0.1", 1514)
    $stream = $tcpClient.GetStream()
    $writer = New-Object System.IO.StreamWriter($stream)
    $writer.AutoFlush = $true

    $tcpMessages = @(
        "<38>Feb 23 10:16:01 fake-web-server crond: root CMD /usr/local/bin/backup.sh",
        "<27>Feb 23 10:16:02 fake-web-server systemd: Started Daily apt download activities.",
        "<131>Feb 23 10:16:03 fake-web-server app: ERROR DatabaseError: Connection refused to postgres:5432"
    )
    foreach ($msg in $tcpMessages) {
        $writer.WriteLine($msg)
        Write-Info "  TCP → $($msg.Substring(0, [Math]::Min(70, $msg.Length)))..."
    }
    Write-OK "Sent 3 TCP syslog messages"
    $writer.Close()
    $tcpClient.Close()
} catch {
    Write-Fail "TCP send error: $_"
}

Start-Sleep -Seconds 2

# Verify syslog logs were stored
Write-Step 'Querying logs received by syslog source ...'
$syslogLogs = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$SYSLOG_SOURCE_ID&limit=10" -Headers $AuthHeaders
if ($syslogLogs -and $syslogLogs.total -gt 0) {
    Write-OK "Syslog: $($syslogLogs.total) logs received and stored!"
    foreach ($log in $syslogLogs.data) {
        Write-Info "  [$($log.level)] $($log.message.Substring(0, [Math]::Min(60, $log.message.Length)))..."
    }
} else {
    Write-Info "Syslog logs may take a moment to appear (check if localhost mapped correctly)"
    # Try querying all recent logs to see if they ended up as unregistered
    $allRecent = Invoke-Api -Method GET -Uri "$BASE/logs?limit=20&sortOrder=DESC" -Headers $AuthHeaders
    $syslogReceived = @($allRecent.data | Where-Object { $_.metadata -and $_.metadata.receivedVia -eq 'syslog-listener' })
    if ($syslogReceived.Count -gt 0) {
        Write-OK "Found $($syslogReceived.Count) syslog-received logs (some may be from unregistered IP)"
    } else {
        Write-Fail "No syslog logs found in the database"
    }
}

###############################################################################
#  PHASE 5: TEST - Scheduled Pull (with a fake HTTP log server)
###############################################################################
Write-Header 'PHASE 5 - Test: Scheduled Pull with Fake HTTP Server'

# Start a tiny HTTP server that serves fake logs
Write-Step 'Starting fake log server on port 9999 ...'

# Start the fake server (file should already exist)
try {
    $scriptPath = Join-Path $PSScriptRoot "fake-log-server.js"
    $nodePath = "C:\Program Files\node.exe"
    $fakeJob = Start-Process -FilePath $nodePath -ArgumentList "`"$scriptPath`"" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden -ErrorAction Stop
    Write-Info "Fake server process started with ID: $($fakeJob.Id)"
    Start-Sleep -Seconds 3  # Give it time to start
} catch {
    Write-Fail "Failed to start fake server: $_"
}

Start-Sleep -Seconds 2

# Verify fake server works
Write-Step 'Verifying fake log server responds ...'
try {
    # First check if the process is still running
    $processRunning = Get-Process -Id $fakeJob.Id -ErrorAction SilentlyContinue
    if (-not $processRunning) {
        Write-Fail "Fake server process is not running"
    } else {
        Write-Info "Fake server process is running (PID: $($fakeJob.Id))"
    }

    $fakeResp = Invoke-WebRequest -Uri "http://127.0.0.1:9999/logs" -UseBasicParsing -ErrorAction Stop -TimeoutSec 10
    $fakeLogs = $fakeResp.Content | ConvertFrom-Json
    Write-OK "Fake server responded with $($fakeLogs.Count) log entries"
} catch {
    Write-Fail "Fake server not reachable: $($_.Exception.Message)"
    Write-Info "Continuing with test anyway..."
}

# Tell AI Logger to refresh pull jobs (so it discovers the new pull source)
Write-Step 'Refreshing pull jobs in AI Logger ...'
$refreshResult = Invoke-Api -Method POST -Uri "$BASE/ingestion/pull/refresh" -Headers $AuthHeaders
if ($refreshResult) {
    Write-OK "Pull jobs refreshed: $($refreshResult.status.activeJobs) active jobs"
} else {
    Write-Fail "Failed to refresh pull jobs"
}

# Manually trigger a pull
Write-Step "Manually triggering pull for source $PULL_SOURCE_ID ..."
$triggerResult = Invoke-Api -Method POST -Uri "$BASE/ingestion/pull/trigger/$PULL_SOURCE_ID" -Headers $AuthHeaders
if ($triggerResult) {
    Write-OK "Pull trigger result: $($triggerResult.message)"
} else {
    Write-Fail "Manual pull trigger failed"
}

Start-Sleep -Seconds 3

# Query logs from pull source
Write-Step 'Querying logs from pull source ...'
$pullLogs = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$PULL_SOURCE_ID&limit=10" -Headers $AuthHeaders
if ($pullLogs -and $pullLogs.total -gt 0) {
    Write-OK "Scheduled Pull: $($pullLogs.total) logs pulled and stored!"
    foreach ($log in $pullLogs.data) {
        $msgPreview = $log.message.Substring(0, [Math]::Min(60, $log.message.Length))
        Write-Info "  [$($log.level)] $msgPreview..."
    }
} else {
    Write-Fail "No logs found from pull source"
}

# Cleanup fake server
Stop-Process -Id $fakeJob.Id -Force -ErrorAction SilentlyContinue

###############################################################################
#  PHASE 6: Overall Status + Summary
###############################################################################
Write-Header 'PHASE 6 - Overall Ingestion Status'

Write-Step 'Fetching ingestion status ...'
$status = Invoke-Api -Method GET -Uri "$BASE/ingestion/status" -Headers $AuthHeaders
if ($status) {
    Write-OK "Syslog: enabled=$($status.syslog.enabled), IPs=$($status.syslog.sourceMappings), UDP=$($status.syslog.udpRunning), TCP=$($status.syslog.tcpRunning)"
    Write-OK "Pull: $($status.scheduledPull.activeJobs) active jobs"
}

# Get total log count
Write-Step 'Getting total log stats ...'
$stats = Invoke-Api -Method GET -Uri "$BASE/logs/stats" -Headers $AuthHeaders
if ($stats) {
    Write-OK "Total logs in DB: $($stats.total)"
    Write-Info "By level: $(($stats.byLevel | ConvertTo-Json -Compress))"
}

# Final tally
Write-Host ""
Write-Header "TEST SUMMARY"

$httpLogs = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$HTTP_SOURCE_ID&limit=1" -Headers $AuthHeaders
$sysLogs  = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$SYSLOG_SOURCE_ID&limit=1" -Headers $AuthHeaders
$pullLogs2 = Invoke-Api -Method GET -Uri "$BASE/logs?sourceId=$PULL_SOURCE_ID&limit=1" -Headers $AuthHeaders

# Also check for unregistered syslog (127.0.0.1 might resolve differently)
$allLogs = Invoke-Api -Method GET -Uri "$BASE/logs?limit=100&sortOrder=DESC" -Headers $AuthHeaders
$syslogVia = @($allLogs.data | Where-Object { $_.metadata.receivedVia -eq "syslog-listener" })
$pullVia   = @($allLogs.data | Where-Object { $_.metadata.receivedVia -eq "scheduled-pull" })

Write-Host ""
Write-Host "  +------------------------------+--------+" -ForegroundColor White
Write-Host "  |  Ingestion Method            |  Logs  |" -ForegroundColor White
Write-Host "  +------------------------------+--------+" -ForegroundColor White

$httpCount = if ($httpLogs) { $httpLogs.total } else { 0 }
$httpIcon = if ($httpCount -gt 0) { "[OK]" } else { "[FAIL]" }
Write-Host "  |  $httpIcon HTTP API + API Key     |  $($httpCount.ToString().PadLeft(6))  |" -ForegroundColor White

$sysCount = if ($sysLogs) { $sysLogs.total } else { 0 }
$sysAllCount = $syslogVia.Count
$sysIcon = if ($sysCount -gt 0 -or $sysAllCount -gt 0) { "[OK]" } else { "[WARN]" }
$sysStr = "$sysCount/$sysAllCount"
Write-Host "  |  $sysIcon Syslog Listener        |  $($sysStr.PadLeft(6))  |" -ForegroundColor White

$pullCount = if ($pullLogs2) { $pullLogs2.total } else { 0 }
$pullAllCount = $pullVia.Count
$pullIcon = if ($pullCount -gt 0 -or $pullAllCount -gt 0) { "[OK]" } else { "[WARN]" }
$pullStr = "$pullCount/$pullAllCount"
Write-Host "  |  $pullIcon Scheduled Pull         |  $($pullStr.PadLeft(6))  |" -ForegroundColor White

Write-Host "  +------------------------------+--------+" -ForegroundColor White

Write-Host ""
Write-Host "  Total logs in database: $($stats.total)" -ForegroundColor Cyan
Write-Host ""

# Cleanup temp file
Remove-Item "$PSScriptRoot\fake-log-server.js" -ErrorAction SilentlyContinue

$swaggerUrl = "$BASE/api"
Write-Host 'Done! Check Swagger UI at' $swaggerUrl 'for interactive testing.' -ForegroundColor Green
Write-Host ""
