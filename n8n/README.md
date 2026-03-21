# VIS n8n Workflows

Two n8n workflow templates for automated visual health auditing with Slack notifications.

## Workflows

### 1. Weekly Visual Health Audit (`weekly-visual-audit.json`)

Runs every Monday at 9:00 AM UTC. Executes `audit-visual-health.mjs --json` against the FrankX codebase and posts a formatted health report to Slack.

**Nodes:**
- Schedule Trigger (Monday 9am UTC)
- Execute Command (runs audit script)
- Code (parses JSON, calculates score, formats Slack message)
- Slack (posts to #visual-health)

### 2. On-Demand Webhook Audit (`visual-audit-webhook.json`)

Triggered via POST request. Same audit pipeline but webhook-initiated, with JSON response returned to the caller.

**Nodes:**
- Webhook (POST `/webhook/visual-audit`)
- Execute Command (runs audit script)
- Code (parses + formats)
- Slack (posts to channel)
- Respond to Webhook (returns JSON with score/summary)

**Trigger:**
```bash
curl -X POST https://your-n8n-instance.com/webhook/visual-audit
```

Optional: specify a different Slack channel in the body:
```bash
curl -X POST https://your-n8n-instance.com/webhook/visual-audit \
  -H "Content-Type: application/json" \
  -d '{"channel": "#general"}'
```

## Import & Configuration

### Step 1: Import

1. Open n8n UI
2. Go to **Workflows** > **Add Workflow** > **Import from File**
3. Select the desired `.json` file
4. The workflow imports in inactive state

### Step 2: Configure Slack Credential

1. In the imported workflow, click the **Post to Slack** node
2. Under Credential, select your existing Slack OAuth2 credential or create one:
   - Go to **Settings** > **Credentials** > **Add Credential** > **Slack OAuth2**
   - Required scopes: `chat:write`, `chat:write.public`
3. Update the channel name if `#visual-health` does not exist in your workspace

### Step 3: Verify Script Path

The Execute Command node runs:
```
cd /mnt/c/Users/Frank/FrankX && node scripts/audit-visual-health.mjs --json
```

If your FrankX repo is at a different path (e.g., on Railway), update this command in the **Run Visual Health Audit** node.

### Step 4: Activate

1. Toggle the workflow to **Active**
2. For the webhook variant: after activation, deactivate and reactivate once to ensure the webhook endpoint registers (known n8n behavior)
3. Test with **Execute Workflow** button before relying on the schedule

## Slack Message Format

```
:mag: Weekly Visual Health Report

:warning: Score: 51/100 (NEEDS ATTENTION)

:bar_chart: Issues:
- :red_circle: HIGH: 1 (placeholders in production)
- :large_yellow_circle: MEDIUM: 0 (duplicate heroes)
- :large_blue_circle: LOW: 17 (oversized images)
- :information_source: INFO: 338 (orphaned images)

:clipboard: Top Actions:
1. Replace 1 placeholder(s): app/resources/page.tsx
2. Optimize 17 oversized images (~100MB savings potential)

Timestamp: 2026-03-21T09:00:00.000Z
Run `vis report --html` for full details
```

## Health Score Calculation

The score mirrors `audit-visual-health.mjs` logic:

```
score = 100 - (HIGH * 15) - (MEDIUM * 5) - (LOW * 2)
```

| Score   | Status          |
|---------|-----------------|
| 90-100  | EXCELLENT       |
| 70-89   | GOOD            |
| 50-69   | NEEDS ATTENTION |
| 0-49    | CRITICAL        |

## Integration with Mega Orchestrator

To wire into the existing Mega Orchestrator workflow, add a VISUAL intent route that calls the webhook variant:

```
VISUAL intent -> HTTP Request node -> POST /webhook/visual-audit
```
