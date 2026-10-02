#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const registryPath = path.join(root, "docs", "VIS_TASK_REGISTRY.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const repo = getArgValue("--repo") ?? registry.repo;
const STATUS_LABELS = ["status:todo", "status:in-progress", "status:blocked", "status:done"];

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function gh(ghArgs, options = {}) {
  if (!execute && options.write) {
    console.error(`[dry-run] gh ${ghArgs.join(" ")}`);
    return "";
  }

  return execFileSync("gh", ghArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function ghJson(ghArgs) {
  const output = gh(ghArgs, { json: true });
  if (!output.trim()) return [];
  return JSON.parse(output);
}

function issueBody(issue) {
  const taskList = issue.tasks.map(taskCheckbox).join("\n");
  const acceptanceList = issue.acceptance.map(taskCheckbox).join("\n");
  const labels = issue.labels.map((label) => `\`${label}\``).join(", ");
  const status = issueStatus(issue);

  return `Synced from \`docs/VIS_TASK_REGISTRY.json\`. Update the registry first, then run \`npm run tasks:sync -- --execute\`.

## Summary
${issue.summary}

## Task Key
\`${issue.key}\`

## Status
\`${status}\`

## Milestone
${issue.milestone}

## Labels
${labels}

## Tasks
${taskList}

## Acceptance
${acceptanceList}

## Agent Notes
- Keep writes, uploads, publishing, wallet actions, paid services, and file deletion human-gated.
- Keep Music IS canonical for music release state; VIS indexes and links assets.
- Keep Eagle, Drive, Cloudinary, R2, Postiz, and Web3 services as adapters unless a later issue explicitly changes that boundary.
`;
}

function taskCheckbox(task) {
  const text = String(task);
  if (text.startsWith("Done:")) return `- [x] ${text.slice("Done:".length).trim()}`;
  if (text.startsWith("[done]")) return `- [x] ${text.slice("[done]".length).trim()}`;
  return `- [ ] ${text}`;
}

function issueStatus(issue) {
  const status = issue.status ?? "todo";
  const label = `status:${status}`;
  if (!STATUS_LABELS.includes(label)) {
    throw new Error(`Invalid status for ${issue.key}: ${status}`);
  }
  return status;
}

function ensureLabels() {
  const existing = new Set(ghJson(["label", "list", "--repo", repo, "--limit", "200", "--json", "name"]).map((item) => item.name));
  const actions = [];

  for (const label of registry.labels) {
    if (existing.has(label.name)) {
      gh(["label", "edit", label.name, "--repo", repo, "--color", label.color, "--description", label.description], { write: true });
      actions.push({ type: "label", action: execute ? "updated" : "would-update", name: label.name });
    } else {
      gh(["label", "create", label.name, "--repo", repo, "--color", label.color, "--description", label.description], { write: true });
      actions.push({ type: "label", action: execute ? "created" : "would-create", name: label.name });
    }
  }

  return actions;
}

function ensureMilestones() {
  const existing = new Map(
    ghJson(["api", `repos/${repo}/milestones`, "--paginate"]).map((item) => [item.title, item])
  );
  const actions = [];

  for (const milestone of registry.milestones) {
    if (existing.has(milestone.title)) {
      actions.push({ type: "milestone", action: "exists", name: milestone.title });
      continue;
    }

    gh([
      "api",
      `repos/${repo}/milestones`,
      "-f",
      `title=${milestone.title}`,
      "-f",
      `description=${milestone.description}`
    ], { write: true });
    actions.push({ type: "milestone", action: execute ? "created" : "would-create", name: milestone.title });
  }

  return actions;
}

function ensureIssues() {
  const existingIssues = new Map(
    ghJson(["issue", "list", "--repo", repo, "--state", "all", "--limit", "300", "--json", "number,title,url,labels"]).map((item) => [item.title, item])
  );
  const tempDir = mkdtempSync(path.join(tmpdir(), "vis-github-tasks-"));
  const actions = [];

  try {
    for (const issue of registry.issues) {
      const status = issueStatus(issue);
      const statusLabel = `status:${status}`;
      const labels = [statusLabel, ...issue.labels].join(",");
      const bodyFile = path.join(tempDir, `${issue.key}.md`);
      writeFileSync(bodyFile, issueBody(issue));
      const existing = existingIssues.get(issue.title);

      if (existing) {
        const existingStatusLabels = (existing.labels ?? [])
          .map((label) => label.name)
          .filter((name) => STATUS_LABELS.includes(name) && name !== statusLabel);
        const editArgs = [
          "issue",
          "edit",
          String(existing.number),
          "--repo",
          repo,
          "--body-file",
          bodyFile,
          "--add-label",
          labels,
          "--milestone",
          issue.milestone
        ];
        if (existingStatusLabels.length > 0) {
          editArgs.push("--remove-label", existingStatusLabels.join(","));
        }
        gh(editArgs, { write: true });
        actions.push({ type: "issue", action: execute ? "updated" : "would-update", key: issue.key, status, number: existing.number, title: issue.title, url: existing.url });
      } else {
        const output = gh([
          "issue",
          "create",
          "--repo",
          repo,
          "--title",
          issue.title,
          "--body-file",
          bodyFile,
          "--label",
          labels,
          "--milestone",
          issue.milestone
        ], { write: true });
        actions.push({ type: "issue", action: execute ? "created" : "would-create", key: issue.key, status, title: issue.title, url: output.trim() });
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  return actions;
}

function main() {
  const actions = [
    ...ensureLabels(),
    ...ensureMilestones(),
    ...ensureIssues()
  ];

  const summary = {
    repo,
    mode: execute ? "execute" : "dry-run",
    labels: registry.labels.length,
    milestones: registry.milestones.length,
    issues: registry.issues.length,
    actions
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
