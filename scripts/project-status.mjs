#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const registryPath = path.join(root, "docs", "VIS_TASK_REGISTRY.json");
const reportPath = path.join(root, "docs", "PROJECT_STATUS_REPORT.md");
const syncReportPath = path.join(root, "docs", "GITHUB_ISSUE_SYNC_REPORT.md");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

function statusOf(issue) {
  return issue.status ?? "todo";
}

function openIssues() {
  return registry.issues.filter((issue) => statusOf(issue) !== "done");
}

function issueLinksByKey() {
  if (!existsSync(syncReportPath)) return new Map();
  const text = readFileSync(syncReportPath, "utf8");
  const links = new Map();
  const rowPattern = /\| (VIS-\d+) \| \[#(\d+) ([^\]]+)\]\(([^)]+)\) \| ([^|]+) \|/g;
  let match;

  while ((match = rowPattern.exec(text)) !== null) {
    links.set(match[1], {
      number: Number(match[2]),
      title: match[3],
      url: match[4],
      milestone: match[5].trim()
    });
  }

  return links;
}

function countBy(items, fn) {
  const counts = new Map();
  for (const item of items) {
    const key = fn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function milestoneRows(links) {
  return registry.milestones.map((milestone) => {
    const issues = registry.issues.filter((issue) => issue.milestone === milestone.title);
    const open = issues.filter((issue) => statusOf(issue) !== "done");
    const done = issues.filter((issue) => statusOf(issue) === "done");
    const next = open.slice(0, 3).map((issue) => linkedKey(issue, links)).join(", ") || "Clear";
    return `| ${milestone.title} | ${open.length} | ${done.length} | ${next} |`;
  });
}

function linkedKey(issue, links) {
  const link = links.get(issue.key);
  if (!link) return `\`${issue.key}\``;
  return `[#${link.number} ${issue.key}](${link.url})`;
}

function issueLine(issue, links) {
  const labels = issue.labels.map((label) => `\`${label}\``).join(" ");
  return `- ${linkedKey(issue, links)} ${issue.title} - \`${statusOf(issue)}\` ${labels}`;
}

function issueChecklist(issue, links) {
  const link = links.get(issue.key);
  const url = link?.url ?? `https://github.com/${registry.repo}/issues`;
  return `- [ ] ${issue.key}: ${issue.title} (${url})`;
}

function reminderIssues() {
  const personalLabels = new Set(["setup", "human-gated", "good-first-internal"]);
  return openIssues().filter((issue) => issue.labels.some((label) => personalLabels.has(label)));
}

function buildJson(links) {
  const issues = registry.issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    status: statusOf(issue),
    milestone: issue.milestone,
    labels: issue.labels,
    url: links.get(issue.key)?.url ?? null
  }));

  return {
    date: today,
    repo: registry.repo,
    project: registry.project,
    totals: {
      issues: registry.issues.length,
      open: openIssues().length,
      done: registry.issues.filter((issue) => statusOf(issue) === "done").length,
      by_status: countBy(registry.issues, statusOf),
      by_milestone: countBy(openIssues(), (issue) => issue.milestone)
    },
    install_lane: openIssues().filter((issue) => issue.milestone === "M0 Personal Estate Setup").map((issue) => issue.key),
    reminder_candidates: reminderIssues().map((issue) => issue.key),
    issues
  };
}

function buildMarkdown(links) {
  const open = openIssues();
  const done = registry.issues.filter((issue) => statusOf(issue) === "done");
  const blocked = open.filter((issue) => statusOf(issue) === "blocked");
  const humanGated = open.filter((issue) => issue.labels.includes("human-gated"));
  const installLane = open.filter((issue) => issue.milestone === "M0 Personal Estate Setup");
  const productLane = open.filter((issue) => issue.milestone !== "M0 Personal Estate Setup");

  return `# VIS Project Status Report

Date: ${today}

Registry: \`docs/VIS_TASK_REGISTRY.json\`
GitHub repo: https://github.com/${registry.repo}

## Summary

- Total issues in registry: ${registry.issues.length}
- Open issues: ${open.length}
- Completed issues: ${done.length}
- Blocked issues: ${blocked.length}
- Human-gated open issues: ${humanGated.length}
- GitHub Projects v2: ${registry.project.status}

## Milestones

| Milestone | Open | Done | Next Visible Work |
| --- | ---: | ---: | --- |
${milestoneRows(links).join("\n")}

## Install And Estate Lane

These are the tasks that make VIS real across Google Drive, Eagle, two laptops, two phones, Claude/Codex MCP, scans, and dashboard checks.

${installLane.map((issue) => issueLine(issue, links)).join("\n") || "- Clear"}

## Product Evolution Lane

These are the tasks that turn the internal OS into the sellable product: cockpit, intelligence, adapters, media expansion, and beta packaging.

${productLane.map((issue) => issueLine(issue, links)).join("\n") || "- Clear"}

## Google Tasks Reminder Candidates

Google Tasks should only contain personal nudges. Use these as copy-ready task titles and keep the GitHub issue as the detail link.

${reminderIssues().map((issue) => issueChecklist(issue, links)).join("\n") || "- No personal reminder candidates."}

## Agent Cross-Check

Use this on the second laptop or with Claude before changing scope:

\`\`\`powershell
cd C:\\Users\\frank\\starlight\\repos\\visual-intelligence
git fetch origin
git checkout codex/visual-intelligence-os-v02
git pull
npm install
npm run project:status
npm run lint
npm test
node bin\\vis.mjs doctor
node bin\\vis.mjs scan-profile frank-estate --json
node bin\\vis.mjs dashboard --limit 3000
\`\`\`

## Management Rule

Update \`docs/VIS_TASK_REGISTRY.json\` first, run \`npm run tasks:dry-run\`, sync with \`npm run tasks:sync -- --execute\`, then regenerate this report with \`npm run project:report\`.
`;
}

function main() {
  const links = issueLinksByKey();

  if (args.has("--json")) {
    console.log(JSON.stringify(buildJson(links), null, 2));
    return;
  }

  const markdown = buildMarkdown(links);

  if (args.has("--write-report")) {
    writeFileSync(reportPath, markdown);
    console.log(`Wrote ${path.relative(root, reportPath)}`);
    return;
  }

  console.log(markdown);
}

main();
