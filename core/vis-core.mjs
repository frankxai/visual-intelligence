import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { DatabaseSync } from 'node:sqlite'

export const VIS_VERSION = '0.2.0'

export const DEFAULT_CONFIG = {
  imagesDir: 'public/images',
  mediaRoots: null,
  registryPath: 'data/visual-registry.json',
  atlasPath: 'data/vis-atlas.json',
  indexPath: 'data/vis.sqlite',
  dashboardPath: 'data/vis-dashboard.html',
  brandDnaPath: 'data/brand-visual-dna.json',
  sitemapMapPath: 'data/sitemap-image-map.json',
  skipSuffixes: ['_thumb.jpeg', '_thumb.jpg', '_thumb.png'],
  imageExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'],
  videoExtensions: ['.mp4', '.webm', '.mov', '.m4v'],
  audioExtensions: ['.mp3', '.wav', '.m4a', '.flac', '.ogg'],
  documentExtensions: ['.md', '.mdx', '.txt', '.json', '.yaml', '.yml'],
  maxFileSizeKB: 2000,
  placeholderImages: ['blog-hero-aurora.svg', 'placeholder.png', 'default-hero.png'],
  contentDirs: ['app', 'pages', 'components', 'content', 'data', 'docs', 'lib', 'src'],
  usageRoots: null,
  scanProfiles: {},
  eagleLibraries: [],
  usageIncludeDirs: ['app', 'pages', 'components', 'content', 'docs', 'lib', 'src'],
  maxUsageFileBytes: 512 * 1024,
  privateDirPatterns: [
    '.git',
    'node_modules',
    '.next',
    '.turbo',
    '.vercel',
    'dist',
    'build',
    'coverage',
    'cache',
    '.cache',
    'tmp',
    '.codex-scratch',
    '.codex-verify',
    '.codex-worktrees',
    'chrome-mobile-*',
    'Manifest Resources',
    '_originals',
    '.starlight',
    '.agent',
    '.machine',
    '.heart',
    '.env',
  ],
  allowedRoots: null,
  rightsDefault: 'unknown',
  approvalDefault: 'candidate',
}

export const TAG_RULES = [
  { pattern: /nft|token|mint|web3|ipfs|trait|collection/i, tag: 'web3' },
  { pattern: /music|suno|audio|song|track|melody|rhythm/i, tag: 'music' },
  { pattern: /video|motion|reel|short|mp4|webm/i, tag: 'video' },
  { pattern: /ai|agent|agentic|llm|claude|gpt|codex|grok/i, tag: 'ai' },
  { pattern: /hero/i, tag: 'hero' },
  { pattern: /mascot|avatar|axi|frank-omega/i, tag: 'mascot' },
  { pattern: /arcanea|eldrian|godbeast|guardian|luminor|sanctum/i, tag: 'arcanea' },
  { pattern: /anime|manga|chibi|character/i, tag: 'character' },
  { pattern: /nature|forest|garden|bloom|crystal|tree/i, tag: 'nature' },
  { pattern: /brand|logo|mark|identity/i, tag: 'brand' },
  { pattern: /diagram|architecture|flowchart|topology|system/i, tag: 'technical' },
  { pattern: /portrait|headshot|avatar/i, tag: 'portrait' },
  { pattern: /infographic|poster|flywheel|canvas/i, tag: 'infographic' },
  { pattern: /screenshot|screen|ui/i, tag: 'screenshot' },
  { pattern: /book|chapter|cover/i, tag: 'book' },
  { pattern: /ecosystem|overview|map/i, tag: 'ecosystem' },
  { pattern: /vibe|consciousness|soul|frequency|energy/i, tag: 'consciousness' },
  { pattern: /team|echo|draconia|nero|arion|shinkami|nova|stella|lumina/i, tag: 'team' },
  { pattern: /game|play|quest/i, tag: 'game' },
  { pattern: /course|learn|student|education/i, tag: 'education' },
  { pattern: /newsletter|email|social|post/i, tag: 'distribution' },
  { pattern: /design-lab|design|style|taste/i, tag: 'design' },
  { pattern: /gencreator|creator/i, tag: 'creator' },
]

export function findProjectRoot(dir = process.cwd()) {
  if (fs.existsSync(path.join(dir, 'vis.config.json'))) return dir
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir
  const parent = path.dirname(dir)
  if (parent === dir) return process.cwd()
  return findProjectRoot(parent)
}

export function loadConfig(root = findProjectRoot()) {
  const configPath = path.join(root, 'vis.config.json')
  const local = fs.existsSync(configPath) ? readConfigFile(configPath) : {}
  return normalizeConfig({ ...DEFAULT_CONFIG, ...local })
}

function readConfigFile(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch (error) {
    throw new Error(`Invalid VIS config JSON at ${configPath}: ${error.message}`)
  }
}

export function normalizeConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config }
  merged.imageExtensions = uniq([...(merged.imageExtensions || []), ...DEFAULT_CONFIG.imageExtensions]).map(lowerExt)
  merged.videoExtensions = uniq([...(merged.videoExtensions || []), ...DEFAULT_CONFIG.videoExtensions]).map(lowerExt)
  merged.audioExtensions = uniq([...(merged.audioExtensions || []), ...DEFAULT_CONFIG.audioExtensions]).map(lowerExt)
  merged.documentExtensions = uniq([...(merged.documentExtensions || []), ...DEFAULT_CONFIG.documentExtensions]).map(lowerExt)
  merged.skipSuffixes = uniq(merged.skipSuffixes || [])
  merged.contentDirs = uniq(merged.contentDirs || DEFAULT_CONFIG.contentDirs)
  merged.privateDirPatterns = uniq(merged.privateDirPatterns || DEFAULT_CONFIG.privateDirPatterns)
  merged.scanProfiles = merged.scanProfiles || {}
  merged.eagleLibraries = uniq(merged.eagleLibraries || [])
  return merged
}

export function resolveProjectPath(root, maybeRelative) {
  if (!maybeRelative) return null
  const expanded = expandPathTokens(maybeRelative)
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(root, expanded)
}

export function expandPathTokens(value) {
  if (!value) return value
  let next = String(value)
  if (next === '~') next = process.env.USERPROFILE || process.env.HOME || next
  else if (next.startsWith(`~${path.sep}`) || next.startsWith('~/')) {
    const home = process.env.USERPROFILE || process.env.HOME || '~'
    next = path.join(home, next.slice(2))
  }
  next = next.replace(/%([^%]+)%/g, (match, key) => process.env[key] || process.env[key.toUpperCase()] || match)
  next = next.replace(/\$\{([^}]+)\}/g, (match, key) => process.env[key] || process.env[key.toUpperCase()] || match)
  next = next.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, key) => process.env[key] || process.env[key.toUpperCase()] || match)
  return next
}

export function getIndexPath(root, config = loadConfig(root)) {
  return resolveProjectPath(root, config.indexPath || DEFAULT_CONFIG.indexPath)
}

export function openVisDatabase(root, config = loadConfig(root)) {
  const indexPath = getIndexPath(root, config)
  fs.mkdirSync(path.dirname(indexPath), { recursive: true })
  const db = new DatabaseSync(indexPath)
  db.exec('PRAGMA busy_timeout = 10000')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  createSchema(db)
  return db
}

export function createSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset (
  asset_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  title TEXT,
  primary_path TEXT,
  source_hash TEXT NOT NULL,
  category TEXT,
  mood TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  rights_status TEXT NOT NULL DEFAULT 'unknown',
  approval_status TEXT NOT NULL DEFAULT 'candidate',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_version (
  version_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT,
  extension TEXT,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS asset_location (
  location_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES asset_version(version_id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  public_path TEXT,
  repo TEXT,
  storage_kind TEXT NOT NULL DEFAULT 'local',
  provider TEXT,
  provider_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  seen_at TEXT NOT NULL,
  exists_now INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS asset_usage (
  usage_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT,
  source_file TEXT NOT NULL,
  route TEXT,
  usage_context TEXT,
  reference_text TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_annotation (
  asset_id TEXT PRIMARY KEY REFERENCES asset(asset_id) ON DELETE CASCADE,
  rating INTEGER,
  color_label TEXT,
  curation_status TEXT NOT NULL DEFAULT 'uncurated',
  notes TEXT,
  custom_tags_json TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_derivative (
  derivative_id TEXT PRIMARY KEY,
  source_asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  derived_asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  transform_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt (
  prompt_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  source_path TEXT,
  prompt_text TEXT,
  negative_prompt TEXT,
  model_hint TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_event (
  event_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT,
  prompt_id TEXT,
  model TEXT,
  provider TEXT,
  seed TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_run (
  agent_run_id TEXT PRIMARY KEY,
  asset_id TEXT,
  coding_agent TEXT,
  repo TEXT,
  thread_ref TEXT,
  session_ref TEXT,
  summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_run (
  skill_run_id TEXT PRIMARY KEY,
  asset_id TEXT,
  skill_name TEXT NOT NULL,
  agent_run_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication (
  publication_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT,
  platform TEXT NOT NULL,
  url TEXT,
  route TEXT,
  caption TEXT,
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection (
  collection_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'curation',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_item (
  collection_id TEXT NOT NULL REFERENCES collection(collection_id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  position INTEGER,
  traits_json TEXT NOT NULL DEFAULT '{}',
  readiness_score INTEGER,
  notes TEXT,
  PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS rights_record (
  rights_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  license TEXT,
  owner TEXT,
  source_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_record (
  eval_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  evaluator TEXT NOT NULL,
  score INTEGER,
  rubric TEXT,
  verdict TEXT,
  notes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_object (
  storage_object_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT,
  provider TEXT NOT NULL,
  bucket TEXT,
  key TEXT,
  url TEXT,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_search (
  saved_search_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  query TEXT,
  filters_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provenance_event (
  provenance_event_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  version_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT,
  source TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_version_asset ON asset_version(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_location_asset ON asset_location(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_location_path ON asset_location(absolute_path);
CREATE INDEX IF NOT EXISTS idx_asset_usage_asset ON asset_usage(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_annotation_status ON asset_annotation(curation_status);
CREATE INDEX IF NOT EXISTS idx_publication_asset ON publication(asset_id);
CREATE INDEX IF NOT EXISTS idx_provenance_asset ON provenance_event(asset_id);
`)
  setMetadata(db, 'schema_version', '1')
  setMetadata(db, 'vis_version', VIS_VERSION)
}

export function setMetadata(db, key, value) {
  const next = String(value)
  const current = db.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value
  if (current === next) return
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, next)
}

export function getMetadata(db, key) {
  return db.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value
}

export function indexProject(options = {}) {
  const root = path.resolve(options.root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(root), ...(options.config || {}) })
  const mediaRoots = resolveMediaRoots(root, config, options.mediaRoots)
  const db = openVisDatabase(root, config)
  const startedAt = nowIso()
  const runId = stableId('run', `${startedAt}:${root}`)

  const scanned = []
  db.exec('BEGIN')
  try {
    if (options.reset !== false) {
      db.exec('UPDATE asset_location SET exists_now = 0')
      db.exec('DELETE FROM asset_usage')
    }
    for (const mediaRoot of mediaRoots) {
      for (const filePath of walkMediaFiles(mediaRoot, config)) {
        const entry = buildAssetEntry(root, mediaRoot, filePath, config)
        if (!entry) continue
        upsertAssetGraph(db, entry, config)
        scanned.push(entry)
      }
    }
    if (options.reset !== false) {
      db.exec('DELETE FROM asset WHERE asset_id NOT IN (SELECT DISTINCT asset_id FROM asset_location WHERE exists_now = 1)')
    }
    const usageCount = scanUsageEdges(db, root, config)
    setMetadata(db, 'last_index_run_id', runId)
    setMetadata(db, 'last_index_started_at', startedAt)
    setMetadata(db, 'last_index_completed_at', nowIso())
    setMetadata(db, 'last_index_root', root)
    setMetadata(db, 'last_index_media_roots', JSON.stringify(mediaRoots))
    db.exec('COMMIT')

    exportLegacyRegistry(db, root, config)
    exportAtlasJson(db, root, config)

    return {
      runId,
      root,
      indexPath: getIndexPath(root, config),
      mediaRoots,
      scannedFiles: scanned.length,
      logicalAssets: countRows(db, 'asset'),
      versions: countRows(db, 'asset_version'),
      locations: countRows(db, 'asset_location', 'exists_now = 1'),
      usageEdges: usageCount,
      registryPath: resolveProjectPath(root, config.registryPath),
      atlasPath: resolveProjectPath(root, config.atlasPath),
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function scanUsageOnly(options = {}) {
  const root = path.resolve(options.root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(root), ...(options.config || {}) })
  const db = openVisDatabase(root, config)
  const startedAt = nowIso()
  try {
    db.exec('BEGIN')
    db.exec('DELETE FROM asset_usage')
    const usageEdges = scanUsageEdges(db, root, config)
    setMetadata(db, 'last_usage_scan_started_at', startedAt)
    setMetadata(db, 'last_usage_scan_completed_at', nowIso())
    db.exec('COMMIT')
    exportAtlasJson(db, root, config)
    return {
      root,
      usageRoots: config.usageRoots || config.contentDirs || DEFAULT_CONFIG.contentDirs,
      usageEdges,
      assets: countRows(db, 'asset'),
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function resolveMediaRoots(root, config = loadConfig(root), overrideRoots = null) {
  const candidates = overrideRoots?.length
    ? overrideRoots
    : (config.mediaRoots?.length ? config.mediaRoots : [config.imagesDir])
  return candidates
    .filter(Boolean)
    .map(candidate => resolveProjectPath(root, candidate))
    .filter(candidate => candidate && fs.existsSync(candidate))
}

export function listScanProfiles(config = DEFAULT_CONFIG) {
  return Object.entries(config.scanProfiles || {}).map(([name, profile]) => ({
    name,
    description: profile.description || '',
    mediaRoots: (profile.mediaRoots || []).length,
    usageRoots: (profile.usageRoots || []).length,
    allowedRoots: (profile.allowedRoots || []).length,
  }))
}

export function resolveScanProfile(root, config = loadConfig(root), profileName = 'default') {
  const profiles = config.scanProfiles || {}
  const profile = profiles[profileName]
  if (!profile) {
    const names = Object.keys(profiles)
    throw new Error(`Unknown VIS scan profile "${profileName}". Available profiles: ${names.join(', ') || 'none'}`)
  }

  const media = resolveProfilePaths(root, profile.mediaRoots || [])
  const usage = resolveProfilePaths(root, profile.usageRoots || [])
  const allowed = resolveProfilePaths(root, profile.allowedRoots || profile.mediaRoots || [])

  return {
    name: profileName,
    description: profile.description || '',
    notes: profile.notes || [],
    mediaRoots: media.resolved,
    existingMediaRoots: media.existing,
    missingMediaRoots: media.missing,
    usageRoots: usage.resolved,
    existingUsageRoots: usage.existing,
    missingUsageRoots: usage.missing,
    allowedRoots: allowed.resolved,
    existingAllowedRoots: allowed.existing,
    missingAllowedRoots: allowed.missing,
    mcpAllowedRoots: allowed.existing.join(path.delimiter),
    commands: {
      dryRun: `node bin\\vis.mjs scan-profile ${profileName}`,
      execute: `node bin\\vis.mjs scan-profile ${profileName} --execute`,
      dashboard: 'node bin\\vis.mjs dashboard --limit 3000',
    },
  }
}

export function planCreativeVault(root = findProjectRoot(), args = {}) {
  const projectRoot = path.resolve(root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(projectRoot), ...(args.config || {}) })
  const candidates = creativeVaultCandidates(projectRoot, config, args)
  const selectedRoot = selectCreativeVaultRoot(projectRoot, config, args, candidates)
  const folders = CREATIVE_VAULT_FOLDERS.map(folder => {
    const absolutePath = path.join(selectedRoot, folder.path)
    return {
      ...folder,
      absolute_path: absolutePath,
      exists: fs.existsSync(absolutePath),
    }
  })
  const manifestPath = path.join(selectedRoot, '_MANIFESTS', 'vis-vault-manifest.json')
  const readmePath = path.join(selectedRoot, 'README_VIS_VAULT.md')
  const existingFolders = folders.filter(folder => folder.exists).length

  return {
    dryRun: true,
    project_root: projectRoot,
    vault_root: selectedRoot,
    vault_exists: fs.existsSync(selectedRoot),
    candidates,
    folders,
    existing_folders: existingFolders,
    missing_folders: folders.length - existingFolders,
    manifest_path: manifestPath,
    readme_path: readmePath,
    mcp_allowed_roots: uniq([
      projectRoot,
      selectedRoot,
      path.resolve(projectRoot, '..'),
    ]).join(path.delimiter),
    scan_profile_patch: {
      mediaRoots: [selectedRoot],
      eagleLibraries: [path.join(selectedRoot, '01_Eagle_Library')],
      usageRoots: [],
    },
    commands: {
      dry_run: `node bin\\vis.mjs vault-plan --vault-root ${shellToken(selectedRoot)}`,
      execute: `node bin\\vis.mjs vault-init --vault-root ${shellToken(selectedRoot)} --execute`,
      scan: `node bin\\vis.mjs scan --media-root ${shellToken(selectedRoot)} --json`,
      eagle_import: `node bin\\vis.mjs eagle --library ${shellToken(path.join(selectedRoot, '01_Eagle_Library'))}`,
      dashboard: 'node bin\\vis.mjs dashboard --limit 3000',
    },
    phone_workflow: [
      'Keep Google Photos as camera backup and memory search.',
      'Share product-relevant phone captures into 00_INBOX_MOBILE in Google Drive.',
      'Curate the mobile inbox weekly from a laptop into Eagle, approved masters, music releases, website assets, or social exports.',
      'Run VIS scan after each curation pass so visual:// packets resolve on both laptops.',
    ],
    eagle_workflow: [
      'Create or move the Eagle library under 01_Eagle_Library.',
      'Use one active Eagle writer at a time and wait for Drive sync before switching laptops.',
      'Import Eagle metadata into VIS only after dry-run item counts and samples look right.',
    ],
    music_is_boundary: [
      'Use 06_MUSIC_RELEASES for audio, cover, Canvas, short videos, and proof exports that need cross-device access.',
      'Music IS remains canonical for release state, catalog rows, rights, AI disclosure, credits, and distribution gates.',
      'VIS indexes and links music media so agents can create Music IS handoff packets without flattening the release system.',
    ],
  }
}

export function initCreativeVault(root = findProjectRoot(), args = {}) {
  const plan = planCreativeVault(root, args)
  if (args.execute !== true) {
    return {
      ...plan,
      note: 'Dry run only. Pass --execute to create folders and write the VIS vault manifest.',
    }
  }

  const created = []
  fs.mkdirSync(plan.vault_root, { recursive: true })
  for (const folder of plan.folders) {
    if (!fs.existsSync(folder.absolute_path)) created.push(folder.absolute_path)
    fs.mkdirSync(folder.absolute_path, { recursive: true })
  }
  fs.mkdirSync(path.dirname(plan.manifest_path), { recursive: true })
  const manifest = buildCreativeVaultManifest(plan)
  fs.writeFileSync(plan.manifest_path, JSON.stringify(manifest, null, 2), 'utf-8')
  fs.writeFileSync(plan.readme_path, renderCreativeVaultReadme(plan), 'utf-8')

  return {
    ...planCreativeVault(root, args),
    dryRun: false,
    created_folders: created,
    manifest_written: plan.manifest_path,
    readme_written: plan.readme_path,
    note: 'Creative Vault initialized. Keep this folder synced locally on both laptops before opening the Eagle library.',
  }
}

export function importEagleLibrary(dbOrRoot, args = {}) {
  const { db, root, config, close } = resolveDbArgs(dbOrRoot)
  const libraryInputs = normalizeLibraryInputs(args, config)
  if (!libraryInputs.length) {
    if (close) db.close()
    throw new Error('No Eagle library path provided. Use --library <path> or configure eagleLibraries in vis.config.json.')
  }

  const libraries = libraryInputs.map(libraryRoot => {
    const resolved = resolveProjectPath(root, libraryRoot)
    return {
      input: libraryRoot,
      root: resolved,
      exists: Boolean(resolved && fs.existsSync(resolved)),
    }
  })
  const existingLibraries = libraries.filter(library => library.exists)
  const limit = Number(args.limit || 10000)
  const items = existingLibraries.flatMap(library => discoverEagleItems(library.root, { limit }))
  const summary = summarizeEagleImport({ libraries, items })

  if (args.execute !== true) {
    if (close) db.close()
    return { dryRun: true, ...summary }
  }

  const imported = []
  db.exec('BEGIN')
  try {
    for (const item of items) {
      if (!item.assetPath || !fs.existsSync(item.assetPath)) continue
      const entry = buildAssetEntry(root, item.libraryRoot, item.assetPath, config)
      if (!entry) continue
      upsertAssetGraph(db, entry, config)
      const locationId = stableId('loc', entry.absolutePath)
      db.prepare(`
UPDATE asset_location
SET storage_kind = 'eagle',
    provider = 'eagle',
    provider_id = ?,
    repo = COALESCE(repo, 'eagle')
WHERE location_id = ?
`).run(item.id, locationId)

      const tags = uniq(['eagle', ...item.tags])
      annotateAsset(db, entry.assetId, {
        tags,
        note: item.annotation || undefined,
        actor: 'vis-eagle-adapter',
        execute: true,
      })

      const collections = []
      for (const folder of item.folders) {
        const collection = upsertCollection(db, {
          name: `Eagle / ${folder.name}`,
          type: 'eagle-folder',
          description: folder.description || null,
          metadata: {
            source: 'eagle',
            eagleFolderId: folder.id || null,
            libraryRoot: item.libraryRoot,
          },
        })
        const position = nextCollectionPosition(db, collection.collection_id)
        db.prepare(`
INSERT INTO collection_item (collection_id, asset_id, position, traits_json, readiness_score, notes)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(collection_id, asset_id) DO UPDATE SET
  traits_json = excluded.traits_json,
  notes = COALESCE(excluded.notes, collection_item.notes)
`).run(
          collection.collection_id,
          entry.assetId,
          position,
          JSON.stringify({ source: 'eagle', eagleItemId: item.id, folder }),
          null,
          item.annotation || null,
        )
        collections.push(collection.name)
      }

      recordProvenance(db, {
        assetId: entry.assetId,
        versionId: entry.versionId,
        eventType: 'eagle-metadata-imported',
        actor: 'vis-eagle-adapter',
        source: item.metadataPath,
        payload: {
          eagleItemId: item.id,
          libraryRoot: item.libraryRoot,
          itemFolder: item.itemFolder,
          tags: item.tags,
          folders: item.folders,
          annotation: item.annotation,
          sourceUrl: item.sourceUrl,
          metadataKeys: Object.keys(item.raw || {}).sort(),
        },
        eventId: stableId('prov', `${entry.assetId}:${item.id}:eagle-metadata-imported`),
      })

      imported.push({
        asset_id: entry.assetId,
        version_id: entry.versionId,
        eagle_item_id: item.id,
        path: entry.absolutePath,
        tags,
        collections,
      })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    if (close) db.close()
  }

  return {
    dryRun: false,
    ...summary,
    imported: imported.length,
    importedItems: imported.slice(0, 100),
  }
}

function normalizeLibraryInputs(args, config) {
  const fromArgs = [
    ...(Array.isArray(args.libraryRoots) ? args.libraryRoots : []),
    ...(Array.isArray(args.libraries) ? args.libraries : []),
    args.libraryRoot,
    args.library,
  ].filter(Boolean)
  return uniq(fromArgs.length ? fromArgs : (config.eagleLibraries || []))
}

function discoverEagleItems(libraryRoot, options = {}) {
  const metadataFiles = findEagleMetadataFiles(libraryRoot, options.limit || 10000)
  return metadataFiles
    .map(metadataPath => readEagleItem(libraryRoot, metadataPath))
    .filter(Boolean)
}

function findEagleMetadataFiles(libraryRoot, limit = 10000) {
  const files = []
  function walk(dir) {
    if (files.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    const hasMetadata = entries.some(entry => entry.isFile() && entry.name.toLowerCase() === 'metadata.json')
    if (hasMetadata && dir.toLowerCase().endsWith('.info')) {
      files.push(path.join(dir, 'metadata.json'))
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (['.git', 'node_modules', '.trash'].includes(entry.name.toLowerCase())) continue
      walk(path.join(dir, entry.name))
    }
  }
  walk(libraryRoot)
  return files.sort((a, b) => a.localeCompare(b))
}

function readEagleItem(libraryRoot, metadataPath) {
  let raw = null
  try {
    raw = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
  } catch {
    return null
  }
  const itemFolder = path.dirname(metadataPath)
  const assetPath = findEagleAssetPath(itemFolder, raw)
  const id = String(raw.id || raw.itemId || raw.item_id || path.basename(itemFolder, '.info')).trim()
  const folders = normalizeEagleFolders(raw)
  return {
    id,
    name: normalizeNullable(raw.name || raw.title || raw.filename || raw.fileName || null),
    assetPath,
    metadataPath,
    itemFolder,
    libraryRoot,
    tags: normalizeTagInput(raw.tags || raw.keywords || []),
    folders,
    annotation: normalizeNullable(raw.annotation || raw.notes || raw.note || raw.description || null),
    sourceUrl: normalizeNullable(raw.website || raw.url || raw.sourceUrl || raw.sourceURL || raw.originalUrl || raw.originalURL || null),
    importedAt: raw.importedAt || raw.createdAt || raw.createTime || null,
    modifiedAt: raw.modifiedAt || raw.mtime || raw.modificationTime || null,
    raw,
  }
}

function findEagleAssetPath(itemFolder, metadata) {
  const candidates = [
    metadata.filePath,
    metadata.path,
    metadata.name && metadata.ext ? `${metadata.name}.${String(metadata.ext).replace(/^\./, '')}` : null,
    metadata.filename,
    metadata.fileName,
  ].filter(Boolean)
  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(itemFolder, candidate)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved
  }

  let entries = []
  try {
    entries = fs.readdirSync(itemFolder, { withFileTypes: true })
  } catch {
    return null
  }
  const ignored = new Set(['metadata.json', 'metadata.backup.json', 'thumbnail.png', 'thumbnail.jpg'])
  const mediaExts = mediaExtensions(DEFAULT_CONFIG)
  const found = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => !ignored.has(name.toLowerCase()))
    .filter(name => mediaExts.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
  return found[0] ? path.join(itemFolder, found[0]) : null
}

function normalizeEagleFolders(raw) {
  const folderValues = raw.folders || raw.folderIds || raw.folder_ids || raw.folder || []
  const values = Array.isArray(folderValues) ? folderValues : [folderValues]
  return values
    .map(value => {
      if (!value) return null
      if (typeof value === 'object') {
        const id = normalizeNullable(value.id || value.folderId || value.folder_id || value.uuid || null)
        const name = normalizeNullable(value.name || value.title || id || null)
        if (!name) return null
        return { id, name, description: normalizeNullable(value.description || null) }
      }
      const name = normalizeNullable(value)
      return name ? { id: name, name, description: null } : null
    })
    .filter(Boolean)
}

function summarizeEagleImport({ libraries, items }) {
  const withAssets = items.filter(item => item.assetPath && fs.existsSync(item.assetPath))
  const folders = uniq(items.flatMap(item => item.folders.map(folder => folder.name))).sort((a, b) => a.localeCompare(b))
  const tags = uniq(items.flatMap(item => item.tags)).sort((a, b) => a.localeCompare(b))
  return {
    libraries,
    items: items.length,
    importableItems: withAssets.length,
    missingAssetFiles: items.length - withAssets.length,
    folders,
    tags,
    sample: items.slice(0, 25).map(item => ({
      id: item.id,
      name: item.name,
      assetPath: item.assetPath,
      metadataPath: item.metadataPath,
      tags: item.tags,
      folders: item.folders.map(folder => folder.name),
      annotation: item.annotation,
      sourceUrl: item.sourceUrl,
    })),
  }
}

function resolveProfilePaths(root, values = []) {
  const resolved = uniq(values.map(value => resolveProjectPath(root, value)).filter(Boolean))
  return {
    resolved,
    existing: pruneNestedPaths(resolved.filter(candidate => fs.existsSync(candidate))),
    missing: resolved.filter(candidate => !fs.existsSync(candidate)),
  }
}

function pruneNestedPaths(values = []) {
  const sorted = uniq(values.map(value => path.resolve(value))).sort((a, b) => a.length - b.length)
  const keep = []
  for (const candidate of sorted) {
    const nested = keep.some(parent => {
      const relative = path.relative(parent, candidate)
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    })
    if (!nested) keep.push(candidate)
  }
  return keep
}

export function walkMediaFiles(startDir, config = DEFAULT_CONFIG) {
  const mediaExts = mediaExtensions(config)
  const files = []
  function walk(dir) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, full, config)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!mediaExts.has(ext)) continue
      if ((config.skipSuffixes || []).some(suffix => entry.name.endsWith(suffix))) continue
      files.push(full)
    }
  }
  walk(startDir)
  return files.sort((a, b) => a.localeCompare(b))
}

export function buildAssetEntry(root, mediaRoot, filePath, config = DEFAULT_CONFIG) {
  const ext = path.extname(filePath).toLowerCase()
  const mediaType = detectMediaType(ext, config)
  if (!mediaType) return null

  const stats = fs.statSync(filePath)
  const hashes = hashFileSync(filePath, mediaType)
  const sha256 = hashes.sha256
  const versionHash = hashes.versionHash
  const versionId = `ver_${versionHash.slice(0, 32)}`
  const assetId = `asset_${sha256.slice(0, 24)}`
  const relRoot = slash(path.relative(root, filePath))
  const relMedia = slash(path.relative(mediaRoot, filePath))
  const publicPath = toPublicPath(root, filePath)
  const category = detectCategory(filePath, mediaRoot, root)
  const tags = detectTags(`${relRoot} ${category} ${path.basename(filePath)}`)
  const mood = detectMood(filePath, category, mediaType)
  const mediaRole = detectMediaRole(filePath, mediaType, tags)
  const workflow = detectWorkflow(filePath, category, mediaRole, tags)
  const dims = detectDimensions(filePath, readDimensionHeader(filePath, ext), ext)
  const sidecars = findPromptSidecars(filePath, config)

  return {
    assetId,
    versionId,
    sha256,
    sourceHash: sha256,
    mediaType,
    mimeType: detectMimeType(ext),
    extension: ext,
    byteSize: stats.size,
    sizeKB: Math.round(stats.size / 1024),
    width: dims.width,
    height: dims.height,
    durationSeconds: dims.durationSeconds,
    title: path.basename(filePath, ext),
    root,
    mediaRoot,
    absolutePath: path.resolve(filePath),
    relativePath: relRoot,
    mediaRelativePath: relMedia,
    publicPath,
    repo: path.basename(root),
    category,
    mood,
    mediaRole,
    workflow,
    tags,
    sidecars,
    createdAt: stats.birthtime?.toISOString?.() || stats.mtime.toISOString(),
    modifiedAt: stats.mtime.toISOString(),
  }
}

export function upsertAssetGraph(db, entry, config = DEFAULT_CONFIG) {
  const ts = nowIso()
  db.prepare(`
INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(asset_id) DO UPDATE SET
  media_type = excluded.media_type,
  title = COALESCE(asset.title, excluded.title),
  primary_path = COALESCE(asset.primary_path, excluded.primary_path),
  category = excluded.category,
  mood = excluded.mood,
  tags_json = excluded.tags_json,
  last_seen_at = excluded.last_seen_at
`).run(
    entry.assetId,
    entry.mediaType,
    entry.title,
    entry.relativePath,
    entry.sourceHash,
    entry.category,
    entry.mood,
    JSON.stringify(entry.tags),
    config.rightsDefault || 'unknown',
    config.approvalDefault || 'candidate',
    ts,
    ts,
  )

  db.prepare(`
INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(version_id) DO UPDATE SET
  byte_size = excluded.byte_size,
  width = excluded.width,
  height = excluded.height,
  duration_seconds = excluded.duration_seconds,
  metadata_json = excluded.metadata_json
`).run(
    entry.versionId,
    entry.assetId,
    entry.sha256,
    entry.mediaType,
    entry.mimeType,
    entry.extension,
    entry.byteSize,
    entry.width,
    entry.height,
    entry.durationSeconds,
    entry.createdAt || ts,
    JSON.stringify({ modifiedAt: entry.modifiedAt, title: entry.title, mediaRole: entry.mediaRole, workflow: entry.workflow }),
  )

  const locationId = stableId('loc', entry.absolutePath)
  db.prepare(`
INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, 1)
ON CONFLICT(location_id) DO UPDATE SET
  version_id = excluded.version_id,
  public_path = excluded.public_path,
  seen_at = excluded.seen_at,
  exists_now = 1
`).run(
    locationId,
    entry.assetId,
    entry.versionId,
    entry.root,
    entry.absolutePath,
    entry.relativePath,
    entry.publicPath,
    entry.repo,
    entry.relativePath === entry.mediaRelativePath ? 1 : 0,
    ts,
  )

  if (entry.sidecars.length) {
    for (const sidecar of entry.sidecars) {
      const promptId = stableId('prompt', `${entry.assetId}:${sidecar.path}:${sidecar.promptText}`)
      db.prepare(`
INSERT OR IGNORE INTO prompt (prompt_id, asset_id, source_path, prompt_text, negative_prompt, model_hint, settings_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
        promptId,
        entry.assetId,
        sidecar.path,
        sidecar.promptText,
        sidecar.negativePrompt || null,
        sidecar.modelHint || null,
        JSON.stringify(sidecar.settings || {}),
        ts,
      )
      recordProvenance(db, {
        assetId: entry.assetId,
        versionId: entry.versionId,
        eventType: 'prompt-linked',
        actor: 'vis-scanner',
        source: sidecar.path,
        payload: sidecar,
      })
      persistGenerationSidecar(db, entry, sidecar, { promptId, actor: 'vis-scanner', createdAt: ts })
    }
  }

  recordProvenance(db, {
    assetId: entry.assetId,
    versionId: entry.versionId,
    eventType: 'indexed',
    actor: 'vis-scanner',
    source: entry.relativePath,
    payload: {
      sha256: entry.sha256,
      mediaType: entry.mediaType,
      byteSize: entry.byteSize,
      width: entry.width,
      height: entry.height,
      mediaRole: entry.mediaRole,
      workflow: entry.workflow,
    },
    eventId: stableId('prov', `${entry.assetId}:${entry.versionId}:indexed:${entry.absolutePath}`),
  })
}

export function scanUsageEdges(db, root, config = loadConfig(root)) {
  const assets = listAssetLocations(db)
  if (!assets.length) return 0

  const byNeedle = new Map()
  for (const asset of assets) {
    const needles = new Set([
      asset.public_path,
      asset.relative_path,
      slash(asset.relative_path),
      path.basename(asset.relative_path),
    ].filter(Boolean))
    for (const needle of needles) {
      if (needle.length < 4) continue
      if (!byNeedle.has(needle)) byNeedle.set(needle, [])
      byNeedle.get(needle).push(asset)
    }
  }

  let count = 0
  const textFiles = walkUsageFiles(root, config)
  const ts = nowIso()
  const seen = new Set()
  const mediaRefPattern = buildMediaReferencePattern(config)
  for (const filePath of textFiles) {
    let content
    try {
      const stats = fs.statSync(filePath)
      if (stats.size > (config.maxUsageFileBytes || DEFAULT_CONFIG.maxUsageFileBytes)) continue
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    for (const needle of extractMediaReferences(content, mediaRefPattern)) {
      const matches = byNeedle.get(needle) || byNeedle.get(slash(needle)) || byNeedle.get(path.basename(needle)) || byNeedle.get(`/${slash(needle).replace(/^\/+/, '')}`)
      if (!matches) continue
      for (const asset of matches) {
        const sourceFile = slash(path.relative(root, filePath))
        const usageId = stableId('usage', `${asset.asset_id}:${sourceFile}`)
        if (seen.has(usageId)) continue
        seen.add(usageId)
        db.prepare(`
INSERT OR REPLACE INTO asset_usage (usage_id, asset_id, version_id, source_file, route, usage_context, reference_text, detected_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
          usageId,
          asset.asset_id,
          asset.version_id,
          sourceFile,
          inferRouteFromSource(sourceFile),
          inferUsageContext(content, needle),
          needle,
          ts,
        )
        count++
      }
    }
  }
  return count
}

export function walkUsageFiles(root, config = loadConfig(root)) {
  const exts = new Set([...(config.documentExtensions || []), '.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.html'])
  const broadUsageMode = Boolean(config.usageRoots?.length)
  const rootCandidates = broadUsageMode ? config.usageRoots : (config.contentDirs || DEFAULT_CONFIG.contentDirs)
  const usageIncludeDirs = new Set((config.usageIncludeDirs || DEFAULT_CONFIG.usageIncludeDirs).map(segment => segment.toLowerCase()))
  const usageSkipDirs = new Set(['data', '_generated', '_visual-qa', '.codex-scratch', '.codex-verify', '.codex-worktrees', 'tmp', 'vendor'])
  const roots = rootCandidates
    .map(dir => resolveProjectPath(root, dir))
    .filter(dir => dir && fs.existsSync(dir))
  const files = []
  for (const start of roots) {
    function walk(dir) {
      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (shouldSkipDir(entry.name, full, config)) continue
          if (broadUsageMode && usageSkipDirs.has(entry.name.toLowerCase())) continue
          walk(full)
          continue
        }
        if (!entry.isFile()) continue
        if (!exts.has(path.extname(entry.name).toLowerCase())) continue
        if (broadUsageMode && !hasUsageSegment(full, start, usageIncludeDirs)) continue
        files.push(full)
      }
    }
    walk(start)
  }
  return uniq(files).sort((a, b) => a.localeCompare(b))
}

function hasUsageSegment(filePath, start, usageIncludeDirs) {
  const segments = slash(path.relative(start, filePath)).toLowerCase().split('/').filter(Boolean)
  return segments.some(segment => usageIncludeDirs.has(segment))
}

export function buildMediaReferencePattern(config = DEFAULT_CONFIG) {
  const extensions = [...mediaExtensions(config)].map(ext => ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const source = "(?:[A-Za-z]:[\\\\/])?[^\\\"'()\\]\\\\s<>]+\\.(" + extensions.join('|') + ')'
  return new RegExp(source, 'gi')
}

export function extractMediaReferences(content, pattern) {
  const refs = new Set()
  for (const match of content.matchAll(pattern)) {
    const raw = match[0].trim().replace(/^["'(`]+|["')`,;]+$/g, '')
    if (!raw || raw.length < 4) continue
    refs.add(raw)
    refs.add(slash(raw))
    refs.add(path.basename(raw))
    if (!raw.startsWith('/') && raw.includes('/')) refs.add('/' + slash(raw).replace(/^\/+/, ''))
  }
  return refs
}

export function exportLegacyRegistry(dbOrRoot, rootMaybe, configMaybe) {
  const { db, root, config, close } = resolveDbArgs(dbOrRoot, rootMaybe, configMaybe)
  try {
    const rows = listAssets(db, { limit: 100000 })
    const registry = rows.map(asset => ({
      asset_id: asset.asset_id,
      version_id: asset.version_id,
      path: asset.public_path || asset.relative_path,
      localPath: asset.absolute_path,
      directory: path.basename(path.dirname(asset.relative_path || '')),
      category: asset.category,
      filename: path.basename(asset.relative_path || ''),
      sizeKB: Math.round((asset.byte_size || 0) / 1024),
      width: asset.width,
      height: asset.height,
      mediaType: asset.media_type,
      mediaRole: asset.media_role,
      workflow: asset.workflow,
      tags: parseJson(asset.tags_json, []),
      mood: asset.mood,
      theme: detectTheme(asset.category, asset.relative_path || ''),
      suitableFor: detectSuitability(
        parseJson(asset.tags_json, []),
        asset.mood,
        Math.round((asset.byte_size || 0) / 1024),
        asset.media_type,
        asset.media_role,
      ),
      rightsStatus: asset.rights_status,
      approvalStatus: asset.approval_status,
    }))
    const outPath = resolveProjectPath(root, config.registryPath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(registry, null, 2))
    return { path: outPath, count: registry.length }
  } finally {
    if (close) db.close()
  }
}

export function exportAtlasJson(dbOrRoot, rootMaybe, configMaybe) {
  const { db, root, config, close } = resolveDbArgs(dbOrRoot, rootMaybe, configMaybe)
  try {
    const assets = listAssets(db, { limit: 100000 })
    const duplicates = findDuplicates(db, { limit: 200 })
    const orphans = findOrphans(db, { limit: 500 })
    const summary = getSummary(db)
    const payload = {
      generatedAt: nowIso(),
      product: 'Visual Intelligence OS',
      version: VIS_VERSION,
      root,
      summary,
      assets,
      duplicates,
      orphans,
    }
    const outPath = resolveProjectPath(root, config.atlasPath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
    return { path: outPath, count: assets.length }
  } finally {
    if (close) db.close()
  }
}

export function listAssets(db, options = {}) {
  const limit = Number(options.limit || 100)
  const sql = `
SELECT
  a.*,
  v.version_id,
  v.sha256,
  v.byte_size,
  v.mime_type,
  v.extension,
  v.width,
  v.height,
  v.duration_seconds,
  v.metadata_json,
  l.absolute_path,
  l.relative_path,
  l.public_path,
  l.root,
  l.repo,
  an.rating,
  an.color_label,
  an.curation_status,
  an.notes AS annotation_notes,
  an.custom_tags_json,
  an.updated_at AS annotated_at,
  COALESCE(u.usage_count, 0) AS usage_count,
  COALESCE(p.prompt_count, 0) AS prompt_count,
  COALESCE(gen.generation_count, 0) AS generation_count,
  COALESCE(ar.agent_run_count, 0) AS agent_run_count,
  COALESCE(sr.skill_run_count, 0) AS skill_run_count,
  COALESCE(pub.publication_count, 0) AS publication_count,
  COALESCE(ev.eval_count, 0) AS eval_count
FROM asset a
LEFT JOIN asset_location l ON l.asset_id = a.asset_id AND l.exists_now = 1
LEFT JOIN asset_version v ON v.version_id = l.version_id
LEFT JOIN asset_annotation an ON an.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS usage_count FROM asset_usage GROUP BY asset_id) u ON u.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS prompt_count FROM prompt GROUP BY asset_id) p ON p.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS generation_count FROM generation_event GROUP BY asset_id) gen ON gen.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS agent_run_count FROM agent_run GROUP BY asset_id) ar ON ar.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS skill_run_count FROM skill_run GROUP BY asset_id) sr ON sr.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS publication_count FROM publication GROUP BY asset_id) pub ON pub.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS eval_count FROM eval_record GROUP BY asset_id) ev ON ev.asset_id = a.asset_id
WHERE l.location_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM asset_location lx WHERE lx.asset_id = a.asset_id AND lx.exists_now = 1)
GROUP BY a.asset_id
ORDER BY a.last_seen_at DESC, a.primary_path ASC
LIMIT ?`
  return db.prepare(sql).all(limit).map(normalizeAssetRow)
}

export function searchAssets(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const query = String(options.query || '').trim().toLowerCase()
    const maxResults = Number(options.maxResults || options.limit || 20)
    const candidates = listAssets(db, { limit: Number(options.poolLimit || 10000) })
    const words = query.split(/\s+/).filter(Boolean)
    const scored = []
    for (const asset of candidates) {
      if (options.mediaType && asset.media_type !== options.mediaType) continue
      if (options.category && asset.category !== options.category) continue
      if (options.mood && asset.mood !== options.mood) continue
      const tags = parseJson(asset.tags_json, [])
      if (options.tag && !tags.includes(options.tag)) continue
      const hay = `${asset.asset_id} ${asset.title || ''} ${asset.relative_path || ''} ${asset.public_path || ''} ${asset.category || ''} ${asset.mood || ''} ${tags.join(' ')}`.toLowerCase()
      let score = words.length ? 0 : 1
      for (const word of words) {
        if (hay.includes(word)) score += 10
      }
      if (options.rightsStatus && asset.rights_status === options.rightsStatus) score += 3
      if (score > 0) scored.push({ ...asset, score })
    }
    scored.sort((a, b) => b.score - a.score || String(a.relative_path).localeCompare(String(b.relative_path)))
    return scored.slice(0, maxResults)
  } finally {
    if (close) db.close()
  }
}

export function getAsset(dbOrRoot, assetRef, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assetId = resolveAssetId(db, assetRef)
    if (!assetId) return null
    const asset = normalizeAssetRow(db.prepare('SELECT * FROM asset WHERE asset_id = ?').get(assetId))
    if (!asset) return null
    if (options.compact) return asset
    return {
      ...asset,
      versions: db.prepare('SELECT * FROM asset_version WHERE asset_id = ? ORDER BY created_at DESC').all(assetId),
      locations: db.prepare('SELECT * FROM asset_location WHERE asset_id = ? ORDER BY exists_now DESC, seen_at DESC').all(assetId),
      annotation: db.prepare('SELECT * FROM asset_annotation WHERE asset_id = ?').get(assetId) || null,
      collections: db.prepare(`
SELECT c.*, ci.position, ci.traits_json, ci.readiness_score, ci.notes AS item_notes
FROM collection_item ci
JOIN collection c ON c.collection_id = ci.collection_id
WHERE ci.asset_id = ?
ORDER BY c.updated_at DESC`).all(assetId),
      usage: db.prepare('SELECT * FROM asset_usage WHERE asset_id = ? ORDER BY detected_at DESC').all(assetId),
      prompts: db.prepare('SELECT * FROM prompt WHERE asset_id = ? ORDER BY created_at DESC').all(assetId),
      generation_events: db.prepare('SELECT * FROM generation_event WHERE asset_id = ? ORDER BY created_at DESC').all(assetId)
        .map(row => ({ ...row, settings: parseJson(row.settings_json, {}) })),
      agent_runs: db.prepare('SELECT * FROM agent_run WHERE asset_id = ? ORDER BY created_at DESC').all(assetId)
        .map(row => ({ ...row, metadata: parseJson(row.metadata_json, {}) })),
      skill_runs: db.prepare('SELECT * FROM skill_run WHERE asset_id = ? ORDER BY created_at DESC').all(assetId)
        .map(row => ({ ...row, metadata: parseJson(row.metadata_json, {}) })),
      publications: db.prepare('SELECT * FROM publication WHERE asset_id = ? ORDER BY created_at DESC').all(assetId),
      rights: db.prepare('SELECT * FROM rights_record WHERE asset_id = ? ORDER BY created_at DESC').all(assetId),
      evals: db.prepare('SELECT * FROM eval_record WHERE asset_id = ? ORDER BY created_at DESC').all(assetId),
    }
  } finally {
    if (close) db.close()
  }
}

export function traceAsset(dbOrRoot, assetRef) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const asset = getAsset(db, assetRef)
    if (!asset) return null
    const provenance = db.prepare('SELECT * FROM provenance_event WHERE asset_id = ? ORDER BY created_at DESC').all(asset.asset_id)
    return {
      asset,
      provenance: provenance.map(event => ({ ...event, payload: parseJson(event.payload_json, {}) })),
      curationPacket: createCurationPacket(db, asset.asset_id),
    }
  } finally {
    if (close) db.close()
  }
}

export function mapUsage(dbOrRoot, assetRef = null) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assetId = assetRef ? resolveAssetId(db, assetRef) : null
    const rows = assetId
      ? db.prepare('SELECT * FROM asset_usage WHERE asset_id = ? ORDER BY source_file').all(assetId)
      : db.prepare('SELECT * FROM asset_usage ORDER BY source_file LIMIT 1000').all()
    return {
      assetId,
      total: rows.length,
      routes: groupCount(rows, 'route'),
      sourceFiles: groupCount(rows, 'source_file'),
      usage: rows,
    }
  } finally {
    if (close) db.close()
  }
}

export function findDuplicates(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const limit = Number(options.limit || 50)
    const groups = db.prepare(`
SELECT sha256, COUNT(DISTINCT asset_id) AS asset_count, COUNT(*) AS version_count
FROM asset_version
GROUP BY sha256
HAVING COUNT(DISTINCT asset_id) > 1 OR COUNT(*) > 1
ORDER BY asset_count DESC, version_count DESC
LIMIT ?`).all(limit)
    return groups.map(group => ({
      ...group,
      assets: db.prepare(`
SELECT a.asset_id, a.title, l.relative_path, l.absolute_path, l.public_path, v.version_id, v.byte_size
FROM asset_version v
JOIN asset a ON a.asset_id = v.asset_id
LEFT JOIN asset_location l ON l.version_id = v.version_id
WHERE v.sha256 = ?
ORDER BY l.relative_path`).all(group.sha256),
    }))
  } finally {
    if (close) db.close()
  }
}

export function findOrphans(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const limit = Number(options.limit || 100)
    return db.prepare(`
SELECT a.asset_id, a.title, a.media_type, a.category, a.mood, a.rights_status, a.approval_status,
       l.relative_path, l.absolute_path, l.public_path, v.byte_size, v.width, v.height
FROM asset a
LEFT JOIN asset_usage u ON u.asset_id = a.asset_id
LEFT JOIN asset_location l ON l.asset_id = a.asset_id AND l.exists_now = 1
LEFT JOIN asset_version v ON v.version_id = l.version_id
WHERE u.asset_id IS NULL
GROUP BY a.asset_id
ORDER BY a.last_seen_at DESC
LIMIT ?`).all(limit).map(normalizeAssetRow)
  } finally {
    if (close) db.close()
  }
}

export function findSimilarAssets(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const limit = Number(options.limit || 20)
    const poolLimit = Number(options.poolLimit || options.pool_limit || 10000)
    const minScore = Number(options.minScore || options.min_score || 58)
    const ref = options.assetRef || options.asset_ref || options.asset_id || options.assetId || options.uri || options.path || null
    const query = String(options.query || '').trim()
    const mediaType = options.mediaType || options.media_type || null
    const allAssets = listAssets(db, { limit: poolLimit }).filter(asset => !mediaType || asset.media_type === mediaType)

    if (ref || query) {
      const targetId = ref ? resolveAssetId(db, ref) : searchAssets(db, { query, mediaType, maxResults: 1, poolLimit })[0]?.asset_id
      const target = allAssets.find(asset => asset.asset_id === targetId)
      if (!target) return { mode: 'asset', target: null, matches: [] }

      const matches = allAssets
        .filter(asset => asset.asset_id !== target.asset_id)
        .map(asset => similarityMatch(target, asset))
        .filter(match => match.score >= minScore)
        .sort((a, b) => b.score - a.score || a.asset.title.localeCompare(b.asset.title))
        .slice(0, limit)

      return {
        mode: 'asset',
        min_score: minScore,
        target: similarAssetSummary(target),
        matches,
      }
    }

    const buckets = new Map()
    for (const asset of allAssets) {
      for (const key of similarityBucketKeys(asset)) {
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(asset)
      }
    }

    const seen = new Set()
    const groups = []
    for (const [key, members] of buckets) {
      if (members.length < 2) continue
      const seed = members[0]
      const matches = members
        .slice(1)
        .map(asset => similarityMatch(seed, asset))
        .filter(match => match.score >= minScore)
        .sort((a, b) => b.score - a.score || a.asset.title.localeCompare(b.asset.title))
      if (!matches.length) continue
      const ids = [seed.asset_id, ...matches.map(match => match.asset.asset_id)].sort()
      const signature = stableId('similar', ids.join('|'))
      if (seen.has(signature)) continue
      seen.add(signature)
      groups.push({
        group_id: signature,
        key,
        score: Math.round(matches.reduce((sum, match) => sum + match.score, 0) / matches.length),
        reason: uniq(matches.flatMap(match => match.reasons)).slice(0, 8),
        assets: [similarAssetSummary(seed), ...matches.map(match => match.asset)],
      })
    }

    groups.sort((a, b) => b.score - a.score || b.assets.length - a.assets.length)
    return {
      mode: 'groups',
      min_score: minScore,
      groups: groups.slice(0, limit),
    }
  } finally {
    if (close) db.close()
  }
}

export function assetPublishGate(asset = {}, options = {}) {
  const intendedUse = options.intendedUse || options.intended_use || 'public use'
  const use = String(intendedUse || '').toLowerCase()
  const rightsStatus = asset.rights_status || 'unknown'
  const approvalStatus = asset.approval_status || 'candidate'
  const mediaType = asset.media_type || 'unknown'
  const byteSize = Number(asset.byte_size || (asset.sizeKB ? asset.sizeKB * 1024 : 0) || asset.versions?.[0]?.byte_size || 0)
  const promptCount = Array.isArray(asset.prompts) ? asset.prompts.length : Number(asset.prompt_count || 0)
  const evalCount = Array.isArray(asset.evals) ? asset.evals.length : Number(asset.eval_count || 0)
  const blockers = []
  const warnings = []
  const allowedRights = new Set(['owned', 'generated-owned', 'licensed'])

  if (rightsStatus === 'blocked') blockers.push('rights status is blocked')
  else if (rightsStatus === 'unknown' || rightsStatus === 'needs-review') blockers.push('rights status requires human review')
  else if (!allowedRights.has(rightsStatus)) blockers.push(`rights status is not public-ready: ${rightsStatus}`)

  if (approvalStatus === 'rejected') blockers.push('approval status is rejected')
  else if (approvalStatus !== 'approved') blockers.push(`approval status must be approved before public use: ${approvalStatus}`)

  if (use.includes('website') && mediaType === 'image') {
    if (byteSize > 4 * 1024 * 1024) warnings.push('large master file; create an optimized derivative before website use')
    if (!asset.width && !asset.versions?.[0]?.width) warnings.push('image dimensions missing; verify crop and responsive fit')
  }
  if (use.includes('social') && !['image', 'video', 'audio'].includes(mediaType)) warnings.push(`social use needs image, video, or audio media, not ${mediaType}`)
  if ((use.includes('nft') || use.includes('mint')) && mediaType !== 'image') blockers.push(`NFT metadata export expects image assets, not ${mediaType}`)
  if (promptCount === 0) warnings.push('prompt/provenance sidecar missing')
  if (evalCount === 0) warnings.push('quality evaluation missing')

  const allowed = blockers.length === 0
  const status = allowed ? (warnings.length ? 'review' : 'ready') : 'blocked'
  const nextAction = allowed
    ? warnings[0] || 'Ready for human-approved derivative, publication, or handoff.'
    : blockers[0] === 'rights status requires human review'
      ? 'Run VIS rights review and set rights to owned, generated-owned, or licensed before public use.'
      : blockers[0] === 'approval status is rejected'
        ? 'Replace the asset or reopen a human approval review before public use.'
        : blockers[0] || 'Resolve public-use blockers before exporting.'

  return {
    status,
    allowed,
    intended_use: intendedUse,
    rights_status: rightsStatus,
    approval_status: approvalStatus,
    blockers,
    warnings,
    next_action: nextAction,
    human_gate: true,
  }
}

export function scoreAsset(dbOrRoot, assetRef) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const asset = getAsset(db, assetRef)
    if (!asset) return null
    let score = 100
    const flags = []
    const latest = asset.versions[0] || {}
    if (asset.rights_status === 'unknown' || asset.rights_status === 'needs-review') {
      score -= 20
      flags.push('rights status needs review')
    }
    if (asset.rights_status === 'blocked') {
      score -= 60
      flags.push('blocked rights status')
    }
    if (asset.approval_status !== 'approved') {
      score -= 10
      flags.push(`approval is ${asset.approval_status}`)
    }
    if (latest.byte_size > 4 * 1024 * 1024) {
      score -= 10
      flags.push('large master file; create derivative before web/social use')
    }
    if (asset.media_type === 'image' && (!latest.width || !latest.height)) {
      score -= 8
      flags.push('missing image dimensions')
    }
    if (asset.media_type === 'audio' && !latest.duration_seconds) {
      score -= 4
      flags.push('audio duration not detected; verify in Music IS proof folder')
    }
    if (!asset.prompts.length) {
      score -= 8
      flags.push('no prompt/provenance sidecar linked')
    }
    if (!asset.usage.length) {
      score -= 5
      flags.push('no route/social/collection usage recorded')
    }
    if (!asset.evals.length) {
      score -= 8
      flags.push('no visual quality eval recorded')
    }
    score = Math.max(0, Math.min(100, score))
    return {
      assetId: asset.asset_id,
      score,
      verdict: score >= 90 ? 'approved-ready' : score >= 70 ? 'usable-with-notes' : score >= 50 ? 'needs-curation' : 'blocked-or-unknown',
      flags,
      nextAction: recommendNextAction(asset, flags),
    }
  } finally {
    if (close) db.close()
  }
}

export function scoreCollection(dbOrRoot, collectionRef = null) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    let assets = []
    if (collectionRef) {
      assets = db.prepare(`
SELECT a.asset_id FROM collection_item ci
JOIN asset a ON a.asset_id = ci.asset_id
WHERE ci.collection_id = ? OR ci.collection_id IN (SELECT collection_id FROM collection WHERE name = ?)
ORDER BY ci.position`).all(collectionRef, collectionRef)
    } else {
      assets = db.prepare('SELECT asset_id FROM asset ORDER BY last_seen_at DESC LIMIT 250').all()
    }
    const scores = assets.map(row => scoreAsset(db, row.asset_id)).filter(Boolean)
    const average = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : 0
    return {
      collection: collectionRef || 'latest-assets',
      assets: scores.length,
      averageScore: average,
      verdict: average >= 90 ? 'ready' : average >= 70 ? 'needs-polish' : 'needs-curation',
      weakest: scores.sort((a, b) => a.score - b.score).slice(0, 10),
    }
  } finally {
    if (close) db.close()
  }
}

export function listMusicReleasePackets(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const limit = Number(options.limit || 50)
    const query = String(options.query || '').trim().toLowerCase()
    const packets = buildMusicReleasePackets(db)
      .filter(packet => {
        if (!query) return true
        const hay = `${packet.release_id} ${packet.title} ${packet.release_path} ${packet.tags.join(' ')}`.toLowerCase()
        return hay.includes(query)
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title))
      .slice(0, limit)
    return packets
  } finally {
    if (close) db.close()
  }
}

export function createMusicReleasePacket(dbOrRoot, releaseRef = null, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const packets = buildMusicReleasePackets(db)
    let packet = null
    if (releaseRef) {
      const assetId = resolveAssetId(db, releaseRef)
      if (assetId) {
        const asset = getAsset(db, assetId)
        const primary = asset?.locations?.find(loc => loc.exists_now) || asset?.locations?.[0]
        const releasePath = primary ? inferMusicReleasePath(primary.relative_path || primary.absolute_path || '') : null
        packet = packets.find(item => item.release_path === releasePath)
      }
      if (!packet) {
        const ref = String(releaseRef).toLowerCase()
        packet = packets.find(item =>
          item.release_id.toLowerCase() === ref ||
          item.title.toLowerCase() === ref ||
          item.release_path.toLowerCase() === ref ||
          item.release_path.toLowerCase().includes(ref))
      }
    } else {
      packet = packets[0] || null
    }
    if (!packet) return null
    return {
      ...packet,
      intended_use: options.intendedUse || options.intended_use || null,
      codex_prompt: musicReleaseCodexPrompt(packet, options),
    }
  } finally {
    if (close) db.close()
  }
}

function buildMusicReleasePackets(db) {
  const assets = listAssets(db, { limit: 100000 }).filter(isMusicAssetRow)
  const groups = new Map()
  for (const asset of assets) {
    const releasePath = inferMusicReleasePath(asset.relative_path || asset.absolute_path || asset.primary_path || '')
    if (!groups.has(releasePath)) groups.set(releasePath, [])
    groups.get(releasePath).push(asset)
  }

  return [...groups.entries()].map(([releasePath, group]) => {
    const title = titleFromReleasePath(releasePath)
    const releaseId = stableId('music_release', releasePath)
    const assetsByRole = groupAssetsByMusicRole(group)
    const docs = collectMusicReleaseDocs(group)
    const tags = uniq(group.flatMap(asset => asset.tags || parseJson(asset.tags_json, [])))
    const prompts = group.reduce((sum, asset) => sum + Number(asset.prompt_count || 0), 0)
    const usageEdges = group.reduce((sum, asset) => sum + Number(asset.usage_count || 0), 0)
    const publications = group.reduce((sum, asset) => sum + Number(asset.publication_count || 0), 0)
    if (!isMusicReleasePacketGroup(releasePath, group, assetsByRole, docs, prompts)) return null
    const gate = musicReleaseGate({ group, assetsByRole, docs, prompts })
    const updatedAt = group.map(asset => asset.last_seen_at || '').sort().at(-1) || nowIso()
    return {
      release_id: releaseId,
      title,
      release_path: releasePath,
      canonical_system: 'Music IS',
      vis_role: 'media discovery, provenance, cross-usage trace, and agent handoff',
      gate_status: gate.status,
      gate_verdict: gate.verdict,
      publish_gate: gate.publishGate,
      missing: gate.missing,
      warnings: gate.warnings,
      next_action: gate.nextAction,
      counts: {
        assets: group.length,
        audio: assetsByRole.audio.length,
        song_masters: assetsByRole.songMasters.length,
        stems: assetsByRole.stems.length,
        covers: assetsByRole.covers.length,
        canvas: assetsByRole.canvas.length,
        videos: assetsByRole.videos.length,
        documents: docs.length,
        prompts,
        usage_edges: usageEdges,
        publications,
      },
      tags,
      assets: group.map(musicAssetSummary),
      documents: docs,
      updated_at: updatedAt,
    }
  }).filter(Boolean)
}

function isMusicAssetRow(asset) {
  const tags = asset.tags || parseJson(asset.tags_json, [])
  return asset.workflow === 'music-release' ||
    asset.media_role === 'cover-art' ||
    asset.media_role === 'music-canvas' ||
    asset.media_type === 'audio' ||
    asset.category === 'music-releases' ||
    tags.includes('music')
}

function inferMusicReleasePath(value) {
  const rel = slash(value)
  const dir = slash(path.dirname(rel))
  const parts = dir.split('/').filter(Boolean)
  if (!parts.length) return dir || 'music-release'
  const releaseMarkers = ['proof', 'proof-folders', 'releases', 'release', 'music-is', 'songs', 'catalog']
  const markerIndex = parts.findLastIndex(part => releaseMarkers.includes(part.toLowerCase()))
  if (markerIndex >= 0 && parts.length > markerIndex + 1) return parts.slice(0, Math.min(parts.length, markerIndex + 4)).join('/')
  return dir
}

function titleFromReleasePath(releasePath) {
  const parts = slash(releasePath).split('/').filter(Boolean)
  return parts.at(-1)?.replace(/[-_]+/g, ' ') || 'music release'
}

function groupAssetsByMusicRole(group) {
  const by = {
    audio: [],
    songMasters: [],
    stems: [],
    covers: [],
    canvas: [],
    videos: [],
    social: [],
  }
  for (const asset of group) {
    if (asset.media_type === 'audio') by.audio.push(asset)
    if (asset.media_role === 'song-master') by.songMasters.push(asset)
    if (asset.media_role === 'music-stem') by.stems.push(asset)
    if (asset.media_role === 'cover-art') by.covers.push(asset)
    if (asset.media_role === 'music-canvas') by.canvas.push(asset)
    if (asset.media_type === 'video') by.videos.push(asset)
    if (asset.media_role === 'social-video') by.social.push(asset)
  }
  return by
}

function isMusicReleasePacketGroup(releasePath, group, assetsByRole, docs, prompts) {
  if (assetsByRole.audio.length || assetsByRole.songMasters.length) return true

  const normalizedPath = slash(releasePath).toLowerCase()
  const canonicalReleasePath = /(^|\/)(06_music_releases|music|music-is|music_is|catalog|proof|proof-folders|release|releases|songs?|singles?|albums?)(\/|$)/.test(normalizedPath)
  if (!canonicalReleasePath) return false

  const releaseDocKinds = new Set([
    'lyrics',
    'prompt-source',
    'credits',
    'rights-disclosure',
    'release-checklist',
    'canvas-brief',
    'launch-copy',
  ])
  const hasReleaseDocs = docs.some(doc => releaseDocKinds.has(doc.kind))
  const hasReleaseMedia = assetsByRole.covers.length || assetsByRole.canvas.length || assetsByRole.videos.length || assetsByRole.stems.length
  const hasReleaseRole = group.some(asset => ['cover-art', 'music-canvas', 'music-stem', 'social-video'].includes(asset.media_role))

  return Boolean(hasReleaseMedia || hasReleaseDocs || prompts > 0 || hasReleaseRole)
}

function collectMusicReleaseDocs(group) {
  const dirs = uniq(group.map(asset => path.dirname(asset.absolute_path || '')).filter(Boolean))
  const docs = []
  const wanted = /\.(md|mdx|txt|json|yaml|yml|csv)$/i
  const useful = /(lyrics?|prompt|suno|source|credits?|split|rights?|disclosure|checklist|release|distrokid|canvas|copy|notes?)/i
  for (const dir of dirs) {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!wanted.test(entry.name) || !useful.test(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      docs.push({
        path: fullPath,
        name: entry.name,
        kind: classifyMusicDoc(entry.name),
      })
    }
  }
  return docs.sort((a, b) => a.path.localeCompare(b.path))
}

function classifyMusicDoc(name) {
  const lower = name.toLowerCase()
  if (lower.includes('lyric')) return 'lyrics'
  if (lower.includes('prompt') || lower.includes('suno') || lower.includes('source')) return 'prompt-source'
  if (lower.includes('credit') || lower.includes('split')) return 'credits'
  if (lower.includes('right') || lower.includes('disclosure')) return 'rights-disclosure'
  if (lower.includes('checklist') || lower.includes('distrokid') || lower.includes('release')) return 'release-checklist'
  if (lower.includes('canvas')) return 'canvas-brief'
  if (lower.includes('copy')) return 'launch-copy'
  return 'note'
}

function musicReleaseGate({ group, assetsByRole, docs, prompts }) {
  const missing = []
  const warnings = []
  const docKinds = new Set(docs.map(doc => doc.kind))
  const publishGates = group.map(asset => assetPublishGate(asset, { intendedUse: 'Music IS release packet' }))
  const blocked = group.filter(asset => asset.rights_status === 'blocked')
  const rightsUnknown = group.filter(asset => ['unknown', 'needs-review'].includes(asset.rights_status))
  const approved = group.filter(asset => asset.approval_status === 'approved')
  const publicUseBlocked = publishGates.filter(gate => !gate.allowed)

  if (!assetsByRole.audio.length) missing.push('source audio file')
  if (!assetsByRole.songMasters.length) warnings.push('no explicit song-master role detected; verify master in Music IS')
  if (!assetsByRole.covers.length) missing.push('cover master')
  if (!assetsByRole.canvas.length && !assetsByRole.videos.length) missing.push('Spotify Canvas or vertical video candidate')
  if (!docKinds.has('lyrics')) warnings.push('lyrics or instrumental note not found nearby')
  if (!docKinds.has('prompt-source') && prompts === 0) missing.push('Suno/prompt/source provenance')
  if (!docKinds.has('credits')) missing.push('credits/splits note')
  if (!docKinds.has('rights-disclosure')) missing.push('rights and AI disclosure note')
  if (!docKinds.has('release-checklist')) missing.push('Music IS release checklist')
  if (rightsUnknown.length) missing.push('rights status review for media assets')
  if (!approved.length) missing.push('approved media asset')
  if (publicUseBlocked.length) missing.push('public-use gate for release media assets')
  if (blocked.length) warnings.push('blocked rights asset present')

  const status = blocked.length ? 'refuse' : missing.length ? 'revise' : 'green-light'
  return {
    status,
    verdict: status === 'green-light'
      ? 'VIS preflight complete. Music IS still owns final release approval and distribution.'
      : status === 'refuse'
        ? 'Release unsafe until blocked rights are resolved.'
        : 'Release packet needs curation before Music IS distribution gate.',
    missing,
    warnings,
    publishGate: {
      status: publicUseBlocked.length ? 'blocked' : 'ready',
      blocked_assets: publicUseBlocked.length,
      warnings: uniq(publishGates.flatMap(gate => gate.warnings)),
    },
    nextAction: status === 'green-light'
      ? 'Open Music IS release checklist and prepare human-approved distribution packet.'
      : `Resolve: ${missing[0] || warnings[0] || 'Music IS review'}`,
  }
}

function musicAssetSummary(asset) {
  return {
    asset_id: asset.asset_id,
    visual_uri: `visual://asset/${asset.asset_id}`,
    title: asset.title,
    media_type: asset.media_type,
    media_role: asset.media_role,
    workflow: asset.workflow,
    local_path: asset.absolute_path,
    relative_path: asset.relative_path,
    rights_status: asset.rights_status,
    approval_status: asset.approval_status,
    publish_gate: assetPublishGate(asset, { intendedUse: 'Music IS release packet' }),
    dimensions: asset.width && asset.height ? `${asset.width}x${asset.height}` : null,
    duration_seconds: asset.duration_seconds || null,
    size_kb: asset.sizeKB,
  }
}

function musicReleaseCodexPrompt(packet, options = {}) {
  return [
    `Use this VIS music release packet: ${packet.release_id}`,
    `Title: ${packet.title}`,
    `Release path: ${packet.release_path}`,
    `Canonical release system: ${packet.canonical_system}`,
    `VIS role: ${packet.vis_role}`,
    options.intendedUse || options.intended_use ? `Intended use: ${options.intendedUse || options.intended_use}` : null,
    `Gate status: ${packet.gate_status}`,
    `Gate verdict: ${packet.gate_verdict}`,
    packet.publish_gate ? `Public-use gate: ${packet.publish_gate.status}; blocked assets ${packet.publish_gate.blocked_assets || 0}` : null,
    packet.missing.length ? `Missing: ${packet.missing.join(', ')}` : null,
    packet.warnings.length ? `Warnings: ${packet.warnings.join(', ')}` : null,
    `Assets: ${packet.counts.assets}; audio ${packet.counts.audio}; covers ${packet.counts.covers}; canvas/video ${packet.counts.canvas + packet.counts.videos}; docs ${packet.counts.documents}`,
    `Next action: ${packet.next_action}`,
    'Do not publish, distribute, upload, or schedule externally without human approval and Music IS release gate.',
  ].filter(Boolean).join('\n')
}

function similarityMatch(a, b) {
  const reasons = []
  let score = 0
  if (a.sha256 && b.sha256 && a.sha256 === b.sha256) {
    score += 100
    reasons.push('same SHA-256 content')
  }
  if (a.media_type && a.media_type === b.media_type) {
    score += 18
    reasons.push(`same media type: ${a.media_type}`)
  }
  if (a.category && a.category === b.category) {
    score += 12
    reasons.push(`same category: ${a.category}`)
  }
  if (a.media_role && a.media_role === b.media_role) {
    score += 12
    reasons.push(`same role: ${a.media_role}`)
  }
  if (a.workflow && a.workflow === b.workflow) score += 5
  if (a.mood && a.mood === b.mood) score += 5

  const aspect = aspectDistance(a, b)
  if (aspect !== null && aspect <= 0.02) {
    score += 12
    reasons.push('matching aspect ratio')
  } else if (aspect !== null && aspect <= 0.08) {
    score += 6
    reasons.push('near aspect ratio')
  }

  if (a.width && a.height && b.width && b.height) {
    if (a.width === b.width && a.height === b.height) {
      score += 10
      reasons.push(`same dimensions: ${a.width}x${a.height}`)
    } else if (Math.abs(a.width - b.width) <= 64 && Math.abs(a.height - b.height) <= 64) {
      score += 5
      reasons.push('near dimensions')
    }
  }

  const tagScore = jaccard(assetTags(a), assetTags(b))
  if (tagScore >= 0.5) {
    score += Math.round(tagScore * 12)
    reasons.push('overlapping tags')
  }

  const titleScore = jaccard(titleTokens(a), titleTokens(b))
  if (titleScore >= 0.34) {
    score += Math.round(titleScore * 12)
    reasons.push('similar title tokens')
  }

  if (folderLabelForSimilarity(a) && folderLabelForSimilarity(a) === folderLabelForSimilarity(b)) {
    score += 7
    reasons.push('same folder lane')
  }

  if (sizeBucket(a.byte_size) && sizeBucket(a.byte_size) === sizeBucket(b.byte_size)) score += 3

  return {
    score: Math.min(100, Math.round(score)),
    reasons: uniq(reasons),
    asset: similarAssetSummary(b),
  }
}

function similarAssetSummary(asset) {
  return {
    asset_id: asset.asset_id,
    visual_uri: asset.visual_uri || `visual://asset/${asset.asset_id}`,
    title: asset.title || asset.asset_id,
    media_type: asset.media_type,
    media_role: asset.media_role || null,
    workflow: asset.workflow || null,
    category: asset.category || null,
    mood: asset.mood || null,
    tags: assetTags(asset),
    dimensions: asset.width && asset.height ? `${asset.width}x${asset.height}` : null,
    size_kb: asset.sizeKB || (asset.byte_size ? Math.round(asset.byte_size / 1024) : null),
    relative_path: asset.relative_path || asset.primary_path || null,
    local_path: asset.absolute_path || null,
    rights_status: asset.rights_status,
    approval_status: asset.approval_status,
  }
}

function similarityBucketKeys(asset) {
  const tags = assetTags(asset).slice(0, 4)
  const keys = [
    ['media', asset.media_type, asset.category, asset.media_role || asset.workflow, aspectBucket(asset)].filter(Boolean).join('|'),
    ['folder', folderLabelForSimilarity(asset), asset.media_type, aspectBucket(asset)].filter(Boolean).join('|'),
  ]
  for (const tag of tags) keys.push(['tag', tag, asset.media_type, asset.category, aspectBucket(asset)].filter(Boolean).join('|'))
  return uniq(keys.filter(key => key.split('|').length >= 3))
}

function assetTags(asset) {
  return asset.tags || parseJson(asset.tags_json, [])
}

function aspectDistance(a, b) {
  if (!a.width || !a.height || !b.width || !b.height) return null
  const arA = a.width / a.height
  const arB = b.width / b.height
  return Math.abs(arA - arB) / Math.max(arA, arB)
}

function aspectBucket(asset) {
  if (!asset.width || !asset.height) return null
  const ratio = asset.width / asset.height
  if (ratio > 1.68) return 'wide'
  if (ratio < 0.72) return 'vertical'
  if (ratio >= 0.92 && ratio <= 1.08) return 'square'
  return ratio > 1 ? 'landscape' : 'portrait'
}

function sizeBucket(bytes) {
  const kb = Number(bytes || 0) / 1024
  if (!kb) return null
  if (kb < 100) return 'tiny'
  if (kb < 500) return 'small'
  if (kb < 2000) return 'medium'
  if (kb < 8000) return 'large'
  return 'huge'
}

function folderLabelForSimilarity(asset) {
  const rel = slash(asset.relative_path || asset.primary_path || '')
  const parts = rel.split('/').filter(Boolean)
  if (parts.length > 2) return parts.slice(0, 2).join('/')
  if (parts.length > 1) return parts[0]
  return asset.category || null
}

function titleTokens(asset) {
  return uniq(String(asset.title || asset.relative_path || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && !['png', 'jpg', 'jpeg', 'webp', 'svg', 'mp4', 'final', 'copy'].includes(token)))
}

function jaccard(a, b) {
  const left = new Set(a.filter(Boolean))
  const right = new Set(b.filter(Boolean))
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection++
  return intersection / new Set([...left, ...right]).size
}

export function createCurationPacket(dbOrRoot, assetRef, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const asset = getAsset(db, assetRef)
    if (!asset) return null
    const score = scoreAsset(db, asset.asset_id)
    const primaryLocation = asset.locations.find(loc => loc.exists_now) || asset.locations[0] || {}
    const latestVersion = asset.versions[0] || {}
    const versionMetadata = parseJson(latestVersion.metadata_json, {})
    const mediaRole = versionMetadata.mediaRole || null
    const workflow = versionMetadata.workflow || null
    const customTags = parseJson(asset.annotation?.custom_tags_json, [])
    const uri = `visual://asset/${asset.asset_id}`
    const isMusic = workflow === 'music-release' || asset.media_type === 'audio' || mediaRole === 'cover-art' || mediaRole === 'music-canvas'
    const publishGate = assetPublishGate(asset, { intendedUse: options.intendedUse || 'agent handoff' })
    const latestGeneration = asset.generation_events?.[0] || null
    const latestAgentRun = asset.agent_runs?.[0] || null
    const latestSkillRun = asset.skill_runs?.[0] || null
    return {
      asset_id: asset.asset_id,
      visual_uri: uri,
      title: asset.title,
      media_type: asset.media_type,
      media_role: mediaRole,
      workflow,
      curation: asset.annotation ? {
        rating: asset.annotation.rating ?? null,
        color_label: asset.annotation.color_label || null,
        curation_status: asset.annotation.curation_status || 'uncurated',
        notes: asset.annotation.notes || null,
        custom_tags: customTags,
        collections: (asset.collections || []).map(collection => collection.name),
      } : null,
      local_path: primaryLocation.absolute_path,
      relative_path: primaryLocation.relative_path,
      public_path: primaryLocation.public_path,
      version_id: latestVersion.version_id,
      sha256: latestVersion.sha256,
      dimensions: latestVersion.width && latestVersion.height ? `${latestVersion.width}x${latestVersion.height}` : null,
      duration_seconds: latestVersion.duration_seconds || null,
      rights_status: asset.rights_status,
      approval_status: asset.approval_status,
      publish_gate: publishGate,
      tags: uniq([...parseJson(asset.tags_json, []), ...customTags]),
      prompt: asset.prompts[0]?.prompt_text || null,
      provenance_summary: {
        prompts: asset.prompts.length,
        generation_events: asset.generation_events.length,
        agent_runs: asset.agent_runs.length,
        skill_runs: asset.skill_runs.length,
        usage_edges: asset.usage.length,
        publications: asset.publications.length,
        evals: asset.evals.length,
        latest_generation: latestGeneration ? {
          model: latestGeneration.model || null,
          provider: latestGeneration.provider || null,
          seed: latestGeneration.seed || null,
          created_at: latestGeneration.created_at,
        } : null,
        latest_agent: latestAgentRun ? {
          coding_agent: latestAgentRun.coding_agent || null,
          repo: latestAgentRun.repo || null,
          thread_ref: latestAgentRun.thread_ref || null,
          session_ref: latestAgentRun.session_ref || null,
        } : null,
        latest_skill: latestSkillRun ? {
          skill_name: latestSkillRun.skill_name || null,
        } : null,
      },
      music_handoff: isMusic ? {
        canonical_system: 'Music IS',
        vis_role: 'index, provenance, cover/canvas/audio discovery, and agent packet handoff',
        release_gate: 'Use Music IS proof folder and release checklist before distribution.',
      } : null,
      score,
      intended_use: options.intendedUse || null,
      next_recommended_action: score?.nextAction,
      codex_prompt: [
        `Use this VIS asset: ${uri}`,
        primaryLocation.absolute_path ? `Local path: ${primaryLocation.absolute_path}` : null,
        mediaRole ? `Media role: ${mediaRole}` : null,
        workflow ? `Workflow: ${workflow}` : null,
        asset.annotation?.rating ? `Rating: ${asset.annotation.rating}/5` : null,
        asset.annotation?.curation_status ? `Curation: ${asset.annotation.curation_status}` : null,
        options.intendedUse ? `Intended use: ${options.intendedUse}` : null,
        isMusic ? 'Music handoff: keep Music IS as the release source of truth; use VIS for provenance, discovery, and linked asset packets.' : null,
        latestGeneration?.model ? `Generation model: ${latestGeneration.provider ? `${latestGeneration.provider}/` : ''}${latestGeneration.model}` : null,
        latestAgentRun?.coding_agent ? `Agent run: ${latestAgentRun.coding_agent}${latestAgentRun.thread_ref ? `; thread ${latestAgentRun.thread_ref}` : ''}` : null,
        latestSkillRun?.skill_name ? `Skill used: ${latestSkillRun.skill_name}` : null,
        `Rights: ${asset.rights_status}; Approval: ${asset.approval_status}`,
        `Public-use gate: ${publishGate.status}; ${publishGate.allowed ? 'allowed after human approval' : 'blocked until review'}`,
        publishGate.blockers.length ? `Gate blockers: ${publishGate.blockers.join('; ')}` : null,
        publishGate.warnings.length ? `Gate warnings: ${publishGate.warnings.join('; ')}` : null,
        score?.nextAction ? `Next action: ${score.nextAction}` : null,
      ].filter(Boolean).join('\n'),
    }
  } finally {
    if (close) db.close()
  }
}

export function annotateAsset(dbOrRoot, assetRef, args = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const ref = assetRef || args.assetId || args.asset_id || args.asset || args.uri || args.path
    const assetId = resolveAssetId(db, ref)
    if (!assetId) throw new Error('Asset not found for annotation')

    const current = db.prepare('SELECT * FROM asset_annotation WHERE asset_id = ?').get(assetId)
    const incomingTags = normalizeTagInput(args.tags ?? args.tag ?? [])
    const currentTags = parseJson(current?.custom_tags_json, [])
    const customTags = args.replaceTags || args.replace_tags ? incomingTags : uniq([...currentTags, ...incomingTags])
    const rating = normalizeRating(args.rating ?? current?.rating ?? null)
    const colorLabel = normalizeNullable(args.colorLabel ?? args.color_label ?? args.color ?? current?.color_label ?? null)
    const curationStatus = normalizeNullable(args.curationStatus ?? args.curation_status ?? args.status ?? current?.curation_status ?? 'curated') || 'curated'
    const notes = normalizeNullable(args.notes ?? args.note ?? current?.notes ?? null)
    const collectionName = normalizeNullable(args.collection || args.collectionName || args.collection_name || null)
    const actor = args.actor || 'vis-cli'
    const updatedAt = nowIso()
    const annotation = {
      asset_id: assetId,
      rating,
      color_label: colorLabel,
      curation_status: curationStatus,
      notes,
      custom_tags: customTags,
      collection: collectionName,
      updated_by: actor,
      updated_at: updatedAt,
    }

    if (args.execute !== true) {
      return { dryRun: true, annotation }
    }

    db.prepare(`
INSERT INTO asset_annotation (asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(asset_id) DO UPDATE SET
  rating = excluded.rating,
  color_label = excluded.color_label,
  curation_status = excluded.curation_status,
  notes = excluded.notes,
  custom_tags_json = excluded.custom_tags_json,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at
`).run(assetId, rating, colorLabel, curationStatus, notes, JSON.stringify(customTags), actor, updatedAt)

    let collection = null
    if (collectionName) {
      collection = upsertCollection(db, {
        name: collectionName,
        type: args.collectionType || args.collection_type || 'curation',
        description: args.collectionDescription || args.collection_description || null,
        metadata: { source: 'asset_annotation' },
      })
      const position = nextCollectionPosition(db, collection.collection_id)
      db.prepare(`
INSERT INTO collection_item (collection_id, asset_id, position, traits_json, readiness_score, notes)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(collection_id, asset_id) DO UPDATE SET
  traits_json = excluded.traits_json,
  readiness_score = COALESCE(excluded.readiness_score, collection_item.readiness_score),
  notes = COALESCE(excluded.notes, collection_item.notes)
`).run(
        collection.collection_id,
        assetId,
        position,
        JSON.stringify({ tags: customTags, colorLabel, curationStatus }),
        args.readinessScore || args.readiness_score || null,
        notes,
      )
    }

    recordProvenance(db, {
      assetId,
      eventType: 'annotated',
      actor,
      source: 'vis-annotation',
      payload: { ...annotation, collection },
    })

    return { dryRun: false, annotation: { ...annotation, collection } }
  } finally {
    if (close) db.close()
  }
}

export function annotateAssets(dbOrRoot, assetRefs = [], args = {}) {
  const providedRefs = assetRefs === null || assetRefs === undefined ? [] : assetRefs
  const refs = normalizeAssetRefs(providedRefs.length ? providedRefs : args.assetRefs || args.asset_refs || args.assets || args.asset_ids || args.assetIds || [])
  if (!refs.length) throw new Error('Batch annotation requires at least one asset reference')

  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const execute = args.execute === true
    const actor = args.actor || 'vis-cli'
    const batchId = args.batchId || args.batch_id || stableId('batch_annotation', `${actor}:${refs.join('|')}:${JSON.stringify({
      tags: normalizeTagInput(args.tags ?? args.tag ?? []),
      rating: args.rating || null,
      color: args.color || args.colorLabel || args.color_label || null,
      status: args.curationStatus || args.curation_status || args.status || null,
      collection: args.collection || null,
    })}`)
    const items = []
    const errors = []

    for (const ref of refs) {
      try {
        const result = annotateAsset(db, ref, {
          ...args,
          actor,
          execute,
        })
        items.push({
          ref,
          asset_id: result.annotation.asset_id,
          annotation: result.annotation,
        })
      } catch (error) {
        errors.push({ ref, error: error.message })
      }
    }

    return {
      dryRun: !execute,
      batch_id: batchId,
      requested: refs.length,
      annotated: items.length,
      failed: errors.length,
      operation: {
        tags: normalizeTagInput(args.tags ?? args.tag ?? []),
        replace_tags: args.replaceTags === true || args.replace_tags === true,
        rating: normalizeRating(args.rating ?? null),
        color_label: normalizeNullable(args.color || args.colorLabel || args.color_label || null),
        curation_status: normalizeNullable(args.curationStatus || args.curation_status || args.status || null),
        collection: normalizeNullable(args.collection || null),
      },
      items,
      errors,
      note: execute
        ? 'Batch curation saved. Each asset records its own annotation provenance event.'
        : 'Dry run only. Pass execute: true or CLI --execute after human review to persist.',
    }
  } finally {
    if (close) db.close()
  }
}

export function reviewAssets(dbOrRoot, assetRefs = [], args = {}) {
  const providedRefs = assetRefs === null || assetRefs === undefined ? [] : assetRefs
  const refs = normalizeAssetRefs(providedRefs.length ? providedRefs : args.assetRefs || args.asset_refs || args.assets || args.asset_ids || args.assetIds || [])
  if (!refs.length) throw new Error('Asset review requires at least one asset reference')

  const rightsStatus = normalizeRightsStatus(args.rightsStatus ?? args.rights_status ?? args.rights)
  const approvalStatus = normalizeApprovalStatus(args.approvalStatus ?? args.approval_status ?? args.approval)
  if (!rightsStatus && !approvalStatus) throw new Error('Asset review requires rightsStatus and/or approvalStatus')

  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const execute = args.execute === true
    const actor = args.actor || 'vis-cli'
    const reason = normalizeNullable(args.reason || args.note || args.notes || null)
    const batchId = args.batchId || args.batch_id || stableId('asset_review', `${actor}:${refs.join('|')}:${rightsStatus || ''}:${approvalStatus || ''}:${reason || ''}`)
    const reviewedAt = nowIso()
    const items = []
    const errors = []

    for (const ref of refs) {
      try {
        const assetId = resolveAssetId(db, ref)
        if (!assetId) throw new Error('Asset not found for review')
        const current = db.prepare('SELECT asset_id, title, media_type, rights_status, approval_status FROM asset WHERE asset_id = ?').get(assetId)
        if (!current) throw new Error('Asset not found for review')
        const next = {
          rights_status: rightsStatus || current.rights_status,
          approval_status: approvalStatus || current.approval_status,
        }

        if (execute) {
          db.prepare('UPDATE asset SET rights_status = ?, approval_status = ?, last_seen_at = ? WHERE asset_id = ?')
            .run(next.rights_status, next.approval_status, reviewedAt, assetId)
          recordProvenance(db, {
            assetId,
            eventType: 'asset-governance-reviewed',
            actor,
            source: 'vis-review',
            payload: {
              batch_id: batchId,
              reason,
              previous: {
                rights_status: current.rights_status,
                approval_status: current.approval_status,
              },
              next,
            },
            createdAt: reviewedAt,
          })
        }

        items.push({
          ref,
          asset_id: assetId,
          title: current.title,
          media_type: current.media_type,
          previous: {
            rights_status: current.rights_status,
            approval_status: current.approval_status,
          },
          next,
        })
      } catch (error) {
        errors.push({ ref, error: error.message })
      }
    }

    return {
      dryRun: !execute,
      batch_id: batchId,
      requested: refs.length,
      reviewed: items.length,
      failed: errors.length,
      operation: {
        rights_status: rightsStatus,
        approval_status: approvalStatus,
        reason,
      },
      items,
      errors,
      note: execute
        ? 'Asset governance review saved with provenance events.'
        : 'Dry run only. Pass execute: true or CLI --execute after human review to persist rights/approval changes.',
    }
  } finally {
    if (close) db.close()
  }
}

export function listAssetActionRecipes() {
  return Object.entries(ACTION_RECIPES).map(([id, recipe]) => ({
    id,
    label: recipe.label,
    description: recipe.description,
    default_collection: recipe.collection,
    default_tags: recipe.tags,
    default_curation_status: recipe.curationStatus,
    default_color_label: recipe.color,
    write_model: 'dry-run-first annotation/review/provenance',
  }))
}

export function runAssetActionRecipe(dbOrRoot, args = {}) {
  const recipeId = normalizeRecipeId(args.recipe || args.name || args.action || args.action_recipe || 'designer-inbox')
  const recipe = ACTION_RECIPES[recipeId]
  if (!recipe) {
    throw new Error(`Unknown asset action recipe: ${recipeId}. Known recipes: ${Object.keys(ACTION_RECIPES).join(', ')}`)
  }

  const refs = normalizeAssetRefs(args.assetRefs || args.asset_refs || args.assets || args.asset_ids || args.assetIds || args.refs || [])
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const execute = args.execute === true
    const actor = args.actor || 'vis-cli'
    const limit = Number(args.limit || 50)
    const poolLimit = Number(args.poolLimit || args.pool_limit || Math.max(limit * 5, 1000))
    const context = buildRecipeContext(db, recipeId)
    const pool = listAssets(db, { limit: poolLimit })
    const byId = new Map(pool.map(asset => [asset.asset_id, asset]))
    const candidates = refs.length
      ? refs.map(ref => byId.get(resolveAssetId(db, ref))).filter(Boolean)
      : pool.filter(asset => assetMatchesActionFilters(asset, args)).filter(asset => recipe.matcher(asset, context))
    const selected = candidates.slice(0, limit)
    const selectedIds = selected.map(asset => asset.asset_id)

    const annotationArgs = {
      tags: uniq([...recipe.tags, ...normalizeTagInput(args.tags ?? args.tag ?? [])]),
      note: normalizeNullable(args.note ?? args.notes ?? recipe.note),
      rating: args.rating ?? recipe.rating ?? null,
      color: args.color || args.colorLabel || args.color_label || recipe.color,
      curationStatus: args.curationStatus || args.curation_status || args.status || recipe.curationStatus,
      collection: args.collection || recipe.collection,
      replaceTags: args.replaceTags === true || args.replace_tags === true,
      actor,
      execute,
    }
    const reviewArgs = {
      rightsStatus: args.rightsStatus || args.rights_status || args.rights,
      approvalStatus: args.approvalStatus || args.approval_status || args.approval,
      reason: args.reason || args.reviewReason || args.review_reason || null,
      actor,
      execute,
    }
    const shouldReview = Boolean(reviewArgs.rightsStatus || reviewArgs.approvalStatus)
    const annotation = selectedIds.length
      ? annotateAssets(db, selectedIds, annotationArgs)
      : {
          dryRun: !execute,
          requested: 0,
          annotated: 0,
          failed: 0,
          items: [],
          errors: [],
          operation: annotationArgs,
        }
    const review = shouldReview && selectedIds.length ? reviewAssets(db, selectedIds, reviewArgs) : null

    if (execute && selectedIds.length) {
      for (const assetId of selectedIds) {
        recordProvenance(db, {
          assetId,
          eventType: 'asset-action-recipe-applied',
          actor,
          source: 'vis-action-recipe',
          payload: {
            recipe: recipeId,
            filters: recipeFilterSummary(args),
            annotation: annotationArgs,
            review: shouldReview ? reviewArgs : null,
          },
        })
      }
    }

    return {
      dryRun: !execute,
      recipe: {
        id: recipeId,
        label: recipe.label,
        description: recipe.description,
        default_collection: recipe.collection,
      },
      filters: recipeFilterSummary(args),
      requested: refs.length || candidates.length,
      selected: selectedIds.length,
      limit,
      actions: {
        annotation,
        review,
      },
      items: selected.map(asset => recipeAssetSummary(asset, recipeId, context)),
      command: buildRecipeCommand(recipeId, selectedIds, args),
      note: execute
        ? 'Asset action recipe applied with annotation/review provenance events.'
        : 'Dry run only. Review selected assets and pass execute:true or CLI --execute to persist.',
    }
  } finally {
    if (close) db.close()
  }
}

export function listSavedSearches(dbOrRoot) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    return db.prepare('SELECT * FROM saved_search ORDER BY updated_at DESC, name ASC').all()
      .map(row => ({ ...row, filters: parseJson(row.filters_json, {}) }))
  } finally {
    if (close) db.close()
  }
}

export function saveSearch(dbOrRoot, args = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const name = normalizeNullable(args.name)
    if (!name) throw new Error('Saved search requires a name')
    const filters = {
      ...(args.filters || {}),
      query: args.query || args.filters?.query || '',
      tag: args.tag || args.filters?.tag || null,
      category: args.category || args.filters?.category || null,
      mediaType: args.mediaType || args.media_type || args.filters?.mediaType || null,
      mood: args.mood || args.filters?.mood || null,
      curationStatus: args.curationStatus || args.curation_status || args.filters?.curationStatus || null,
      minRating: normalizeRating(args.minRating || args.min_rating || args.filters?.minRating || null),
    }
    const savedSearch = {
      saved_search_id: args.savedSearchId || args.saved_search_id || stableId('search', name),
      name,
      query: filters.query || '',
      filters,
      created_by: args.actor || 'vis-cli',
      updated_at: nowIso(),
    }
    if (args.execute !== true) return { dryRun: true, savedSearch }

    const existing = db.prepare('SELECT created_at FROM saved_search WHERE saved_search_id = ? OR name = ?').get(savedSearch.saved_search_id, name)
    db.prepare(`
INSERT INTO saved_search (saved_search_id, name, query, filters_json, created_by, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(saved_search_id) DO UPDATE SET
  name = excluded.name,
  query = excluded.query,
  filters_json = excluded.filters_json,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at
`).run(
      savedSearch.saved_search_id,
      name,
      savedSearch.query,
      JSON.stringify(filters),
      savedSearch.created_by,
      existing?.created_at || savedSearch.updated_at,
      savedSearch.updated_at,
    )
    return { dryRun: false, savedSearch }
  } finally {
    if (close) db.close()
  }
}

export function recordPublication(dbOrRoot, args = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assetId = resolveAssetId(db, args.assetId || args.asset_id || args.asset || args.path || args.uri)
    if (!assetId) throw new Error('Asset not found for publication record')
    const asset = getAsset(db, assetId, { compact: true })
    const publishGate = assetPublishGate(asset, { intendedUse: `${args.platform || 'unknown'} publication record` })
    const payload = {
      publicationId: args.publicationId || stableId('pub', `${assetId}:${args.platform}:${args.url || args.route}:${Date.now()}`),
      assetId,
      versionId: args.versionId || args.version_id || null,
      platform: args.platform || 'unknown',
      url: args.url || null,
      route: args.route || null,
      caption: args.caption || null,
      campaign: args.campaign || null,
      status: args.status || 'planned',
      metrics: args.metrics || {},
      publishedAt: args.publishedAt || args.published_at || null,
      createdAt: nowIso(),
      publishGate,
    }
    const dryRun = args.execute !== true && args.dryRun !== false
    if (dryRun) {
      return {
        dryRun: true,
        wouldRecord: payload,
        publish_gate: publishGate,
        note: publishGate.allowed
          ? 'Pass execute: true to persist this publication record.'
          : 'Publication can be recorded for traceability, but public use remains blocked until the gate is resolved.',
      }
    }
    db.prepare(`
INSERT INTO publication (publication_id, asset_id, version_id, platform, url, route, caption, campaign, status, metrics_json, published_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
      payload.publicationId,
      payload.assetId,
      payload.versionId,
      payload.platform,
      payload.url,
      payload.route,
      payload.caption,
      payload.campaign,
      payload.status,
      JSON.stringify(payload.metrics),
      payload.publishedAt,
      payload.createdAt,
    )
    recordProvenance(db, {
      assetId,
      versionId: payload.versionId,
      eventType: 'publication-recorded',
      actor: args.actor || 'vis-mcp',
      source: payload.url || payload.route || payload.platform,
      payload,
    })
    return { dryRun: false, recorded: payload }
  } finally {
    if (close) db.close()
  }
}

export function exportCloudinaryManifest(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assets = searchAssets(db, {
      query: options.query || '',
      category: options.category,
      mediaType: options.mediaType,
      maxResults: options.limit || 500,
    })
    const manifestAssets = assets.map(asset => {
      const publishGate = assetPublishGate(asset, { intendedUse: 'Cloudinary production delivery' })
      return {
        asset_id: asset.asset_id,
        local_path: asset.absolute_path,
        public_id: `${options.folder || 'visual-intelligence'}/${slugify(asset.category || 'asset')}/${slugify(asset.title || asset.asset_id)}`,
        tags: parseJson(asset.tags_json, []),
        publish_gate: publishGate,
        upload_ready: publishGate.allowed,
        context: {
          rights_status: asset.rights_status,
          approval_status: asset.approval_status,
          publish_gate_status: publishGate.status,
          visual_uri: `visual://asset/${asset.asset_id}`,
        },
      }
    })
    const guarded = manifestAssets.filter(asset => !asset.upload_ready)
    const exportable = manifestAssets.filter(asset => asset.upload_ready || options.includeUnsafe === true || options.include_unsafe === true)
    return {
      dryRun: true,
      provider: 'cloudinary',
      folder: options.folder || 'visual-intelligence',
      generatedAt: nowIso(),
      guard: {
        candidates: manifestAssets.length,
        exportable: exportable.length,
        guarded: guarded.length,
        note: 'Unsafe assets are excluded from the Cloudinary upload manifest by default. Review rights and approval before upload.',
      },
      assets: exportable,
      guarded,
    }
  } finally {
    if (close) db.close()
  }
}

export function exportNftMetadataReport(dbOrRoot, options = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assets = searchAssets(db, {
      query: options.query || 'nft collection character mascot arcanea anime',
      category: options.category,
      mediaType: 'image',
      maxResults: options.limit || 200,
    })
    const items = assets.map((asset, index) => {
      const publishGate = assetPublishGate(asset, { intendedUse: 'NFT metadata and mint readiness' })
      return {
        name: asset.title || `Asset ${index + 1}`,
        description: `VIS-curated asset ${asset.asset_id}`,
        image: asset.public_path || asset.relative_path,
        external_url: null,
        mint_ready: publishGate.allowed,
        attributes: [
          { trait_type: 'Category', value: asset.category || 'unknown' },
          { trait_type: 'Mood', value: asset.mood || 'unknown' },
          { trait_type: 'Rights', value: asset.rights_status || 'unknown' },
          ...parseJson(asset.tags_json, []).map(tag => ({ trait_type: 'Tag', value: tag })),
        ],
        vis: {
          asset_id: asset.asset_id,
          visual_uri: `visual://asset/${asset.asset_id}`,
          local_path: asset.absolute_path,
          version_id: asset.version_id,
          sha256: asset.sha256,
          publish_gate: publishGate,
        },
      }
    })
    const guarded = items.filter(item => !item.mint_ready)
    return {
      dryRun: true,
      collection: options.collection || options.category || 'draft-collection',
      generatedAt: nowIso(),
      readiness: scoreCollection(db, options.collection || null),
      guard: {
        candidates: items.length,
        mint_ready: items.length - guarded.length,
        guarded: guarded.length,
        note: 'Minting remains human-gated. Unknown, blocked, or unapproved assets are marked not mint-ready.',
      },
      items,
      guarded_items: guarded.map(item => ({
        name: item.name,
        asset_id: item.vis.asset_id,
        visual_uri: item.vis.visual_uri,
        publish_gate: item.vis.publish_gate,
      })),
      gates: [
        'Human approval required before minting.',
        'Rights status must be owned, generated-owned, or licensed.',
        'IPFS/R2 locations should be recorded before contract/drop activation.',
      ],
    }
  } finally {
    if (close) db.close()
  }
}

export function getSummary(dbOrRoot) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const assets = countRows(db, 'asset')
    const versions = countRows(db, 'asset_version')
    const locations = countRows(db, 'asset_location', 'exists_now = 1')
    const usageEdges = countRows(db, 'asset_usage')
    const prompts = countRows(db, 'prompt')
    const generationEvents = countRows(db, 'generation_event')
    const agentRuns = countRows(db, 'agent_run')
    const skillRuns = countRows(db, 'skill_run')
    const publications = countRows(db, 'publication')
    const evals = countRows(db, 'eval_record')
    const annotations = countRows(db, 'asset_annotation')
    const savedSearches = countRows(db, 'saved_search')
    const byMediaType = db.prepare('SELECT media_type, COUNT(*) AS count FROM asset GROUP BY media_type ORDER BY count DESC').all()
    const byCategory = db.prepare('SELECT category, COUNT(*) AS count FROM asset GROUP BY category ORDER BY count DESC LIMIT 25').all()
    const byRights = db.prepare('SELECT rights_status, COUNT(*) AS count FROM asset GROUP BY rights_status ORDER BY count DESC').all()
    const byCurationStatus = db.prepare('SELECT curation_status, COUNT(*) AS count FROM asset_annotation GROUP BY curation_status ORDER BY count DESC').all()
    return { assets, versions, locations, usageEdges, prompts, generationEvents, agentRuns, skillRuns, publications, evals, annotations, savedSearches, byMediaType, byCategory, byRights, byCurationStatus }
  } finally {
    if (close) db.close()
  }
}

export function recordGenerationProvenance(dbOrRoot, assetRef, args = {}) {
  const { db, close } = resolveDbArgs(dbOrRoot)
  try {
    const ref = assetRef || args.assetId || args.asset_id || args.asset || args.uri || args.path
    const assetId = resolveAssetId(db, ref)
    if (!assetId) throw new Error('Asset not found for generation provenance')
    const asset = getAsset(db, assetId)
    const primaryLocation = asset.locations.find(loc => loc.exists_now) || asset.locations[0] || {}
    const latestVersion = asset.versions[0] || {}
    const sidecarPath = args.sidecarPath || args.sidecar || defaultProvenanceSidecarPath(primaryLocation.absolute_path)
    const loaded = sidecarPath && fs.existsSync(sidecarPath) ? readGenerationSidecar(sidecarPath) : {}
    const sidecar = buildGenerationSidecar({
      ...loaded,
      ...args,
      assetId,
      versionId: latestVersion.version_id,
      mediaType: asset.media_type,
      sha256: latestVersion.sha256,
      localPath: primaryLocation.absolute_path,
      relativePath: primaryLocation.relative_path,
      outputPaths: uniq([
        ...(Array.isArray(loaded.outputPaths) ? loaded.outputPaths : []),
        ...(Array.isArray(loaded.output_paths) ? loaded.output_paths : []),
        ...(Array.isArray(loaded.generation?.output_paths) ? loaded.generation.output_paths : []),
        ...(Array.isArray(loaded.generation?.outputs) ? loaded.generation.outputs : []),
        ...(Array.isArray(loaded.asset?.output_paths) ? loaded.asset.output_paths : []),
        ...(Array.isArray(args.outputPaths) ? args.outputPaths : []),
        ...(Array.isArray(args.output_paths) ? args.output_paths : []),
        ...(primaryLocation.absolute_path ? [primaryLocation.absolute_path] : []),
      ]),
      explicitGeneration: true,
    }, sidecarPath)
    const dryRun = args.execute !== true
    const result = {
      dryRun,
      asset_id: assetId,
      version_id: latestVersion.version_id || null,
      sidecar_path: sidecarPath || null,
      would_write_sidecar: Boolean(args.writeSidecar || args.write_sidecar),
      provenance: sidecar,
      records: {
        prompt: Boolean(sidecar.promptText),
        generation_event: hasGenerationEvidence(sidecar),
        agent_run: hasAgentEvidence(sidecar),
        skill_run: hasSkillEvidence(sidecar),
      },
    }
    if (dryRun) return result

    let promptId = null
    const ts = sidecar.createdAt || nowIso()
    if (sidecar.promptText) {
      promptId = stableId('prompt', `${assetId}:${sidecarPath || 'inline'}:${sidecar.promptText}`)
      db.prepare(`
INSERT OR IGNORE INTO prompt (prompt_id, asset_id, source_path, prompt_text, negative_prompt, model_hint, settings_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
        promptId,
        assetId,
        sidecarPath || null,
        sidecar.promptText,
        sidecar.negativePrompt || null,
        sidecar.model || sidecar.modelHint || null,
        JSON.stringify(sidecar.settings || {}),
        ts,
      )
    }
    const ids = persistGenerationSidecar(db, {
      assetId,
      versionId: latestVersion.version_id || null,
    }, sidecar, {
      promptId,
      actor: args.actor || sidecar.codingAgent || 'vis-cli',
      createdAt: ts,
    })

    if ((args.writeSidecar || args.write_sidecar) && sidecarPath) {
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true })
      fs.writeFileSync(sidecarPath, JSON.stringify(formatGenerationSidecar(sidecar), null, 2))
    }

    return {
      ...result,
      dryRun: false,
      records: ids,
    }
  } finally {
    if (close) db.close()
  }
}

export function recordProvenance(db, event) {
  const eventId = event.eventId || stableId('prov', `${event.assetId}:${event.versionId || ''}:${event.eventType}:${event.source || ''}:${JSON.stringify(event.payload || {})}`)
  db.prepare(`
INSERT OR IGNORE INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
    eventId,
    event.assetId,
    event.versionId || null,
    event.eventType,
    event.actor || null,
    event.source || null,
    JSON.stringify(event.payload || {}),
    event.createdAt || nowIso(),
  )
  return eventId
}

function persistGenerationSidecar(db, entry, sidecarInput, options = {}) {
  const sidecar = buildGenerationSidecar(sidecarInput, sidecarInput.path || sidecarInput.sourcePath)
  const assetId = entry.assetId || entry.asset_id
  const versionId = entry.versionId || entry.version_id || null
  const ts = sidecar.createdAt || options.createdAt || nowIso()
  const ids = {}

  if (hasGenerationEvidence(sidecar)) {
    ids.generation_event = stableId('gen', `${assetId}:${versionId || ''}:${sidecar.path || ''}:${sidecar.model || ''}:${sidecar.seed || ''}:${options.promptId || sidecar.promptText || ''}`)
    db.prepare(`
INSERT OR IGNORE INTO generation_event (event_id, asset_id, version_id, prompt_id, model, provider, seed, settings_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
      ids.generation_event,
      assetId,
      versionId,
      options.promptId || null,
      sidecar.model || sidecar.modelHint || null,
      sidecar.provider || null,
      sidecar.seed || null,
      JSON.stringify({ ...(sidecar.settings || {}), output_paths: sidecar.outputPaths || [] }),
      ts,
    )
  }

  if (hasAgentEvidence(sidecar)) {
    ids.agent_run = stableId('agent', `${assetId}:${sidecar.codingAgent || ''}:${sidecar.repo || ''}:${sidecar.threadRef || ''}:${sidecar.sessionRef || ''}:${sidecar.path || ''}`)
    db.prepare(`
INSERT OR IGNORE INTO agent_run (agent_run_id, asset_id, coding_agent, repo, thread_ref, session_ref, summary, metadata_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
      ids.agent_run,
      assetId,
      sidecar.codingAgent || null,
      sidecar.repo || null,
      sidecar.threadRef || null,
      sidecar.sessionRef || null,
      sidecar.summary || null,
      JSON.stringify(sidecar.agentMetadata || {}),
      ts,
    )
  }

  if (hasSkillEvidence(sidecar)) {
    ids.skill_run = stableId('skill', `${assetId}:${sidecar.skillName}:${ids.agent_run || ''}:${sidecar.path || ''}`)
    db.prepare(`
INSERT OR IGNORE INTO skill_run (skill_run_id, asset_id, skill_name, agent_run_id, metadata_json, created_at)
VALUES (?, ?, ?, ?, ?, ?)
`).run(
      ids.skill_run,
      assetId,
      sidecar.skillName,
      ids.agent_run || null,
      JSON.stringify(sidecar.skillMetadata || {}),
      ts,
    )
  }

  if (ids.generation_event || ids.agent_run || ids.skill_run) {
    recordProvenance(db, {
      assetId,
      versionId,
      eventType: 'generation-provenance-recorded',
      actor: options.actor || sidecar.codingAgent || 'vis',
      source: sidecar.path || sidecar.sourcePath || null,
      payload: formatGenerationSidecar(sidecar),
      eventId: stableId('prov', `${assetId}:${versionId || ''}:generation-provenance-recorded:${sidecar.path || ''}:${sidecar.model || ''}:${sidecar.threadRef || ''}`),
      createdAt: ts,
    })
  }

  return ids
}

function readGenerationSidecar(sidecarPath) {
  return parseJson(fs.readFileSync(sidecarPath, 'utf-8'), {})
}

function defaultProvenanceSidecarPath(assetPath) {
  if (!assetPath) return null
  const dir = path.dirname(assetPath)
  const base = path.basename(assetPath, path.extname(assetPath))
  return path.join(dir, `${base}.vis.provenance.json`)
}

function buildGenerationSidecar(input = {}, sidecarPath = null) {
  const generation = isPlainObject(input.generation) ? input.generation : {}
  const agent = isPlainObject(input.agent) ? input.agent : {}
  const skill = isPlainObject(input.skill) ? input.skill : {}
  const asset = isPlainObject(input.asset) ? input.asset : {}
  const settings = parseSettings(firstPresent(
    input.settings,
    input.settings_json,
    input.parameters,
    generation.settings,
    generation.parameters,
    {},
  ))
  const outputPaths = asArray(firstPresent(
    input.outputPaths,
    input.output_paths,
    input.outputs,
    generation.output_paths,
    generation.outputs,
    asset.output_paths,
    [],
  )).map(String)
  const promptText = firstPresent(
    input.promptText,
    input.prompt_text,
    input.prompt,
    generation.prompt,
    generation.prompt_text,
    input.input,
    input.description,
    '',
  )
  const negativePrompt = firstPresent(
    input.negativePrompt,
    input.negative_prompt,
    generation.negativePrompt,
    generation.negative_prompt,
    null,
  )
  const model = firstPresent(
    input.model,
    input.modelHint,
    input.model_hint,
    generation.model,
    generation.model_hint,
    null,
  )
  const provider = firstPresent(
    input.provider,
    input.model_provider,
    generation.provider,
    null,
  )
  const pathHint = input.path || input.sourcePath || input.source_path || sidecarPath || null

  return {
    schema: input.schema || input.$schema || 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json',
    schemaVersion: input.schemaVersion || input.schema_version || '1.0.0',
    explicitGeneration: Boolean(input.explicitGeneration || input.explicit_generation),
    provenanceKind: Boolean(
      input.provenanceKind ||
      input.provenance_kind ||
      input.schema_version ||
      input.schemaVersion ||
      (pathHint && fs.existsSync(pathHint) && /(?:\.vis\.provenance|\.provenance)\.(json|md|txt)$/i.test(pathHint)),
    ),
    path: pathHint,
    sourcePath: input.sourcePath || input.source_path || pathHint,
    assetId: input.assetId || input.asset_id || asset.asset_id || null,
    versionId: input.versionId || input.version_id || asset.version_id || null,
    mediaType: input.mediaType || input.media_type || asset.media_type || null,
    sha256: input.sha256 || asset.sha256 || null,
    localPath: input.localPath || input.local_path || asset.local_path || null,
    relativePath: input.relativePath || input.relative_path || asset.relative_path || null,
    promptText: String(promptText || '').slice(0, 8000),
    negativePrompt: negativePrompt ? String(negativePrompt).slice(0, 8000) : null,
    model: model ? String(model) : null,
    modelHint: model ? String(model) : null,
    provider: provider ? String(provider) : null,
    seed: firstPresent(input.seed, generation.seed, settings.seed, null),
    settings,
    outputPaths: uniq(outputPaths),
    codingAgent: firstPresent(input.codingAgent, input.coding_agent, agent.codingAgent, agent.coding_agent, agent.name, typeof input.agent === 'string' ? input.agent : null, null),
    repo: firstPresent(input.repo, input.repository, agent.repo, agent.repository, null),
    threadRef: firstPresent(input.threadRef, input.thread_ref, input.thread, agent.threadRef, agent.thread_ref, agent.thread, null),
    sessionRef: firstPresent(input.sessionRef, input.session_ref, input.session, agent.sessionRef, agent.session_ref, agent.session, null),
    summary: firstPresent(input.summary, agent.summary, null),
    agentMetadata: parseSettings(firstPresent(input.agentMetadata, input.agent_metadata, agent.metadata, {})),
    skillName: firstPresent(input.skillName, input.skill_name, skill.name, skill.skill_name, agent.skillName, agent.skill_name, null),
    skillMetadata: parseSettings(firstPresent(input.skillMetadata, input.skill_metadata, skill.metadata, {})),
    createdAt: firstPresent(input.createdAt, input.created_at, generation.created_at, agent.created_at, null),
  }
}

function formatGenerationSidecar(sidecarInput) {
  const sidecar = buildGenerationSidecar(sidecarInput, sidecarInput.path || sidecarInput.sourcePath)
  return {
    $schema: sidecar.schema,
    schema_version: sidecar.schemaVersion,
    asset: {
      asset_id: sidecar.assetId,
      version_id: sidecar.versionId,
      media_type: sidecar.mediaType,
      sha256: sidecar.sha256,
      local_path: sidecar.localPath,
      relative_path: sidecar.relativePath,
    },
    generation: {
      provider: sidecar.provider,
      model: sidecar.model,
      prompt: sidecar.promptText || null,
      negative_prompt: sidecar.negativePrompt,
      seed: sidecar.seed,
      settings: sidecar.settings || {},
      output_paths: sidecar.outputPaths || [],
      created_at: sidecar.createdAt || nowIso(),
    },
    agent: {
      coding_agent: sidecar.codingAgent,
      repo: sidecar.repo,
      thread_ref: sidecar.threadRef,
      session_ref: sidecar.sessionRef,
      summary: sidecar.summary,
      metadata: sidecar.agentMetadata || {},
    },
    skill: sidecar.skillName ? {
      name: sidecar.skillName,
      metadata: sidecar.skillMetadata || {},
    } : null,
  }
}

function hasGenerationEvidence(sidecar) {
  return Boolean(sidecar.provenanceKind || (sidecar.explicitGeneration && sidecar.promptText) || sidecar.model || sidecar.provider || sidecar.seed || Object.keys(sidecar.settings || {}).length || sidecar.outputPaths?.length || sidecar.codingAgent || sidecar.skillName)
}

function hasAgentEvidence(sidecar) {
  return Boolean(sidecar.codingAgent || sidecar.repo || sidecar.threadRef || sidecar.sessionRef || sidecar.summary || Object.keys(sidecar.agentMetadata || {}).length)
}

function hasSkillEvidence(sidecar) {
  return Boolean(sidecar.skillName)
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function parseSettings(value) {
  if (typeof value === 'string') return parseJson(value, {})
  if (isPlainObject(value)) return value
  return {}
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function resolveAssetId(db, assetRef) {
  if (!assetRef) return null
  const ref = String(assetRef).replace(/^visual:\/\/asset\//, '').trim()
  if (ref.startsWith('asset_')) {
    const row = db.prepare('SELECT asset_id FROM asset WHERE asset_id = ?').get(ref)
    if (row) return row.asset_id
  }
  const byPath = db.prepare(`
SELECT asset_id FROM asset_location
WHERE absolute_path = ? OR relative_path = ? OR public_path = ?
ORDER BY exists_now DESC, seen_at DESC
LIMIT 1`).get(ref, slash(ref), ref)
  if (byPath) return byPath.asset_id
  const normalizedAbs = path.resolve(ref)
  const abs = db.prepare('SELECT asset_id FROM asset_location WHERE absolute_path = ? LIMIT 1').get(normalizedAbs)
  if (abs) return abs.asset_id
  const like = db.prepare(`
SELECT a.asset_id FROM asset a
LEFT JOIN asset_location l ON l.asset_id = a.asset_id
WHERE a.title LIKE ? OR l.relative_path LIKE ? OR l.public_path LIKE ?
ORDER BY a.last_seen_at DESC
LIMIT 1`).get(`%${ref}%`, `%${slash(ref)}%`, `%${ref}%`)
  return like?.asset_id || null
}

export function listAssetLocations(db) {
  return db.prepare(`
SELECT a.asset_id, l.version_id, l.absolute_path, l.relative_path, l.public_path
FROM asset a
JOIN asset_location l ON l.asset_id = a.asset_id
WHERE l.exists_now = 1`).all()
}

export function resolveDbArgs(dbOrRoot, rootMaybe, configMaybe) {
  if (dbOrRoot && typeof dbOrRoot.prepare === 'function') {
    return {
      db: dbOrRoot,
      root: rootMaybe || getMetadata(dbOrRoot, 'last_index_root') || process.cwd(),
      config: configMaybe || loadConfig(rootMaybe || process.cwd()),
      close: false,
    }
  }
  const root = path.resolve(typeof dbOrRoot === 'string' ? dbOrRoot : (rootMaybe || findProjectRoot()))
  const config = configMaybe || loadConfig(root)
  return { db: openVisDatabase(root, config), root, config, close: true }
}

export function countRows(db, table, where = null) {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ''}`
  return db.prepare(sql).get().count
}

export function normalizeAssetRow(row) {
  if (!row) return row
  const versionMetadata = parseJson(row.metadata_json, {})
  const baseTags = parseJson(row.tags_json, [])
  const customTags = parseJson(row.custom_tags_json, [])
  return {
    ...row,
    tags: uniq([...baseTags, ...customTags]),
    base_tags: baseTags,
    custom_tags: customTags,
    annotation: row.curation_status || row.rating || row.color_label || row.annotation_notes || customTags.length
      ? {
          rating: row.rating ?? null,
          color_label: row.color_label || null,
          curation_status: row.curation_status || 'uncurated',
          notes: row.annotation_notes || null,
          custom_tags: customTags,
          updated_at: row.annotated_at || null,
        }
      : null,
    version_metadata: versionMetadata,
    media_role: versionMetadata.mediaRole || null,
    workflow: versionMetadata.workflow || null,
    sizeKB: row.byte_size ? Math.round(row.byte_size / 1024) : null,
    visual_uri: row.asset_id ? `visual://asset/${row.asset_id}` : null,
    file_url: row.absolute_path ? pathToFileURL(row.absolute_path).href : null,
  }
}

export function mediaExtensions(config = DEFAULT_CONFIG) {
  return new Set([
    ...(config.imageExtensions || []),
    ...(config.videoExtensions || []),
    ...(config.audioExtensions || []),
  ].map(lowerExt))
}

export function detectMediaType(ext, config = DEFAULT_CONFIG) {
  const lower = lowerExt(ext)
  if ((config.imageExtensions || []).map(lowerExt).includes(lower)) return 'image'
  if ((config.videoExtensions || []).map(lowerExt).includes(lower)) return 'video'
  if ((config.audioExtensions || []).map(lowerExt).includes(lower)) return 'audio'
  return null
}

export function detectMimeType(ext) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
  }
  return map[lowerExt(ext)] || 'application/octet-stream'
}

function hashFileSync(filePath, mediaType) {
  const fileHash = crypto.createHash('sha256')
  const versionHash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const fd = fs.openSync(filePath, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead > 0) {
        const chunk = buffer.subarray(0, bytesRead)
        fileHash.update(chunk)
        versionHash.update(chunk)
      }
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(fd)
  }
  return {
    sha256: fileHash.digest('hex'),
    versionHash: versionHash.update('\0').update(mediaType).digest('hex'),
  }
}

function readDimensionHeader(filePath, ext) {
  if (ext === '.svg') return Buffer.alloc(0)
  const maxBytes = ext === '.jpg' || ext === '.jpeg' ? 1024 * 1024 : 256 * 1024
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    fs.closeSync(fd)
  }
}

export function detectDimensions(filePath, bytes, ext) {
  try {
    if (ext === '.png' && bytes.toString('ascii', 1, 4) === 'PNG') {
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), durationSeconds: null }
    }
    if (ext === '.gif' && bytes.length >= 10) {
      return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), durationSeconds: null }
    }
    if (ext === '.jpg' || ext === '.jpeg') return readJpegDimensions(bytes)
    if (ext === '.webp') return readWebpDimensions(bytes)
    if (ext === '.svg') return readSvgDimensions(filePath)
  } catch {
    return { width: null, height: null, durationSeconds: null }
  }
  return { width: null, height: null, durationSeconds: null }
}

function readJpegDimensions(buffer) {
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), durationSeconds: null }
    }
    offset += 2 + length
  }
  return { width: null, height: null, durationSeconds: null }
}

function readWebpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return { width: null, height: null, durationSeconds: null }
  }
  const chunk = buffer.toString('ascii', 12, 16)
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
      durationSeconds: null,
    }
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      durationSeconds: null,
    }
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const b0 = buffer[21]
    const b1 = buffer[22]
    const b2 = buffer[23]
    const b3 = buffer[24]
    const width = 1 + (((b1 & 0x3f) << 8) | b0)
    const height = 1 + ((b3 << 6) | (b2 >> 2) | ((b1 & 0xc0) << 6))
    return { width, height, durationSeconds: null }
  }
  return { width: null, height: null, durationSeconds: null }
}

function readSvgDimensions(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8').slice(0, 4000)
  const width = parseSvgNumber(text.match(/\bwidth=["']([^"']+)["']/)?.[1])
  const height = parseSvgNumber(text.match(/\bheight=["']([^"']+)["']/)?.[1])
  if (width && height) return { width, height, durationSeconds: null }
  const viewBox = parseSvgViewBox(text.match(/\bviewBox=["']([^"']+)["']/)?.[1])
  if (viewBox) return { width: viewBox.width, height: viewBox.height, durationSeconds: null }
  return { width: null, height: null, durationSeconds: null }
}

function parseSvgNumber(value) {
  if (!value) return null
  const match = String(value).match(/-?(?:\d+\.?\d*|\.\d+)/)
  const parsed = match ? Number(match[0]) : null
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function parseSvgViewBox(value) {
  if (!value) return null
  const parts = String(value)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null
  const width = parts[2]
  const height = parts[3]
  if (width <= 0 || height <= 0) return null
  return { width: Math.round(width), height: Math.round(height) }
}

export function detectCategory(filePath, mediaRoot, root) {
  const rel = slash(path.relative(root, filePath)).toLowerCase()
  const parts = slash(path.relative(mediaRoot, filePath)).split('/').filter(Boolean)
  if (/\b(music-is|music_os|music-os|suno|song|track|audio|stems?|release|lyrics|distrokid|spotify|bandcamp|canvas)\b/.test(rel)) {
    return 'music-releases'
  }
  if (rel.includes('animelegends')) return rel.includes('mascot') ? 'animelegends-mascots' : 'animelegends'
  if (rel.includes('arcanea')) {
    if (rel.includes('guardian')) return 'arcanea-guardians'
    if (rel.includes('luminor')) return 'arcanea-luminors'
    return 'arcanea'
  }
  if (rel.includes('nft') || rel.includes('web3') || rel.includes('mint')) return 'nft-web3'
  if (rel.includes('brand') || rel.includes('logo')) return 'brand'
  if (rel.includes('character') || rel.includes('mascot') || rel.includes('avatar')) return 'characters'
  if (parts.length > 1) return parts[0]
  return path.basename(path.dirname(filePath)) || 'assets'
}

export function detectMediaRole(filePath, mediaType, tags = []) {
  const rel = slash(filePath).toLowerCase()
  const taggedMusic = tags.includes('music') || /\b(music-is|music_os|music-os|suno|song|track|audio|release|lyrics)\b/.test(rel)
  if (mediaType === 'audio') {
    if (/\b(stem|stems|vox|vocal|drum|bass|guitar|piano|instrumental)\b/.test(rel)) return 'music-stem'
    if (/\b(master|final|release|distrokid|spotify|bandcamp)\b/.test(rel)) return 'song-master'
    if (/\b(demo|draft|sketch|idea|scratch)\b/.test(rel)) return 'song-demo'
    if (/\b(loop|sample|one-shot|oneshot|pack)\b/.test(rel)) return 'music-sample'
    if (/\b(voice|vo|narration|spoken)\b/.test(rel)) return 'voice-audio'
    return 'song-audio'
  }
  if (mediaType === 'video') {
    if (/\b(canvas|spotify-canvas|visualizer)\b/.test(rel)) return 'music-canvas'
    if (/\b(reel|short|tiktok|youtube-short|story)\b/.test(rel)) return 'social-video'
    return 'motion-asset'
  }
  if (mediaType === 'image') {
    if (taggedMusic && /\b(cover|album|artwork|single|ep)\b/.test(rel)) return 'cover-art'
    if (/\b(hero|og|banner|social|thumbnail|poster)\b/.test(rel)) return 'campaign-visual'
    if (tags.includes('web3')) return 'nft-trait-or-master'
    if (tags.includes('brand')) return 'brand-asset'
  }
  return `${mediaType || 'unknown'}-asset`
}

export function detectWorkflow(filePath, category, mediaRole, tags = []) {
  const rel = slash(filePath).toLowerCase()
  if (
    category === 'music-releases' ||
    tags.includes('music') ||
    ['song-master', 'song-demo', 'song-audio', 'music-stem', 'music-canvas', 'cover-art'].includes(mediaRole)
  ) return 'music-release'
  if (category === 'nft-web3' || tags.includes('web3')) return 'nft-collection'
  if (/\b(app|pages|components|public|website|landing|hero|og)\b/.test(rel) || tags.includes('hero')) return 'website'
  if (/\b(social|post|reel|short|story|thumbnail)\b/.test(rel) || tags.includes('distribution')) return 'social'
  if (category === 'brand' || tags.includes('brand')) return 'brand-system'
  return 'asset-library'
}

export function detectTags(text) {
  return uniq(TAG_RULES.filter(rule => rule.pattern.test(text)).map(rule => rule.tag))
}

export function detectMood(filePath, category, mediaType = 'image') {
  const name = path.basename(filePath).toLowerCase()
  if (mediaType === 'audio') return 'sonic'
  if (mediaType === 'video') return 'motion'
  if (name.includes('infographic') || name.includes('diagram') || name.includes('flowchart')) return 'informational'
  if (name.includes('poster') || name.includes('flywheel') || name.includes('workflow')) return 'branded'
  if (category?.includes('arcanea') || name.includes('eldrian') || name.includes('conclave')) return 'cinematic'
  if (category?.includes('design') || name.includes('style')) return 'artistic'
  if (category?.includes('mascot') || category === 'characters') return 'branded'
  if (name.includes('hero') || name.includes('v3-pro') || name.includes('v2')) return 'atmospheric'
  return 'atmospheric'
}

export function detectTheme(category, filename) {
  const name = String(filename || '').toLowerCase()
  if (name.includes('light') || name.includes('white')) return 'light'
  if (name.includes('aurora') || name.includes('gradient')) return 'gradient'
  if (String(category || '').includes('consciousness')) return 'dark'
  return 'dark'
}

export function detectSuitability(tags, mood, sizeKB, mediaType = 'image', mediaRole = '') {
  const suitable = []
  if (mediaType === 'audio') {
    if (mediaRole === 'song-master') suitable.push('release-master')
    if (mediaRole === 'music-stem') suitable.push('production-stem')
    if (mediaRole === 'song-demo') suitable.push('music-review')
    suitable.push('music-is-handoff')
    return uniq(suitable)
  }
  if (mediaRole === 'music-canvas') suitable.push('spotify-canvas')
  if (mediaRole === 'cover-art') suitable.push('release-art')
  if (tags.includes('hero') && sizeKB > 100) suitable.push('hero')
  if (mood === 'atmospheric' && sizeKB > 200) suitable.push('website-showcase')
  if (sizeKB > 30 && sizeKB < 900) suitable.push('card-thumbnail')
  if (mood === 'branded') suitable.push('social-og')
  if (tags.includes('mascot') || tags.includes('portrait') || tags.includes('character')) suitable.push('character-card')
  if (mood === 'cinematic') suitable.push('banner')
  if (tags.includes('infographic') || tags.includes('technical')) suitable.push('documentation')
  if (tags.includes('web3')) suitable.push('nft-metadata')
  if (tags.includes('music')) suitable.push('release-art')
  return uniq(suitable)
}

export function findPromptSidecars(filePath, config = DEFAULT_CONFIG) {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath, path.extname(filePath))
  const candidates = []
  for (const ext of ['.json', '.md', '.txt']) {
    candidates.push(path.join(dir, `${base}${ext}`))
    candidates.push(path.join(dir, `${base}.prompt${ext}`))
    candidates.push(path.join(dir, `${base}.provenance${ext}`))
    candidates.push(path.join(dir, `${base}.vis.provenance${ext}`))
    candidates.push(path.join(dir, `${base}.metadata${ext}`))
  }
  const found = []
  for (const candidate of uniq(candidates)) {
    if (!fs.existsSync(candidate)) continue
    try {
      const raw = fs.readFileSync(candidate, 'utf-8')
      const parsed = path.extname(candidate).toLowerCase() === '.json' ? parseJson(raw, null) : null
      const sidecar = buildGenerationSidecar(parsed || { prompt: extractPromptText(raw) }, candidate)
      if (!sidecar.promptText) sidecar.promptText = String(raw.slice(0, 4000))
      found.push(sidecar)
    } catch {
      continue
    }
  }
  return found.filter(item => item.promptText)
}

function extractPromptText(raw) {
  const promptMatch = raw.match(/prompt\s*:\s*([\s\S]+)/i)
  if (promptMatch) return promptMatch[1].trim().slice(0, 8000)
  return raw.trim().slice(0, 4000)
}

export function inferRouteFromSource(sourceFile) {
  const file = slash(sourceFile)
  if (file.startsWith('app/')) {
    return '/' + file
      .replace(/^app\//, '')
      .replace(/\/(page|layout)\.(tsx|ts|jsx|js|mdx)$/, '')
      .replace(/\([^)]*\)\//g, '')
      .replace(/\/index$/, '')
  }
  if (file.startsWith('pages/')) {
    return '/' + file.replace(/^pages\//, '').replace(/\.(tsx|ts|jsx|js|mdx)$/, '').replace(/\/index$/, '')
  }
  if (file.startsWith('content/')) return '/' + file.replace(/^content\//, '').replace(/\.(mdx|md|json)$/, '')
  return null
}

export function inferUsageContext(content, needle) {
  const i = content.indexOf(needle)
  if (i === -1) return null
  const start = Math.max(0, i - 120)
  const end = Math.min(content.length, i + needle.length + 120)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

function toPublicPath(root, filePath) {
  const publicDir = path.join(root, 'public')
  const rel = path.relative(publicDir, filePath)
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return '/' + slash(rel)
  return null
}

function shouldSkipDir(name, fullPath, config) {
  const normalized = slash(fullPath).toLowerCase()
  return (config.privateDirPatterns || []).some(pattern => {
    const p = String(pattern).toLowerCase()
    if (p.endsWith('*')) return name.toLowerCase().startsWith(p.slice(0, -1))
    return name.toLowerCase() === p || normalized.includes(`/${p}/`) || normalized.endsWith(`/${p}`)
  })
}

function lowerExt(ext) {
  return ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
}

function nowIso() {
  return new Date().toISOString()
}

export function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
}

export function slash(value) {
  return String(value || '').replace(/\\/g, '/')
}

export function uniq(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))]
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const CREATIVE_VAULT_FOLDERS = [
  {
    path: '00_INBOX_MOBILE',
    label: 'Mobile inbox',
    purpose: 'Phone exports and intentional Google Drive uploads from Google Photos, iOS, Android, and mobile apps.',
    owner: 'Frank',
    scan_role: 'inbox',
  },
  {
    path: '01_Eagle_Library',
    label: 'Eagle library',
    purpose: 'Eagle.cool visual browsing library. VIS reads this as an adapter, not as provenance truth.',
    owner: 'Eagle + VIS adapter',
    scan_role: 'eagle-library',
  },
  {
    path: '02_APPROVED_MASTERS',
    label: 'Approved masters',
    purpose: 'Human-approved originals and generated masters ready for R2/Cloudinary/website/social derivatives.',
    owner: 'VIS rights gate',
    scan_role: 'approved-master',
  },
  {
    path: '03_WEBSITE_ASSETS',
    label: 'Website assets',
    purpose: 'Website-ready exports and route-specific derivatives for owned properties.',
    owner: 'VIS website workflow',
    scan_role: 'website',
  },
  {
    path: '04_SOCIAL_EXPORTS',
    label: 'Social exports',
    purpose: 'Platform variants, captions, thumbnails, and Postiz/manual publishing handoff packets.',
    owner: 'VIS social workflow',
    scan_role: 'social',
  },
  {
    path: '05_NFT_COLLECTIONS',
    label: 'NFT collections',
    purpose: 'Collection images, trait maps, metadata JSON, rights notes, and IPFS/R2 readiness reports.',
    owner: 'VIS Web3 workflow',
    scan_role: 'nft-web3',
  },
  {
    path: '06_MUSIC_RELEASES',
    label: 'Music releases',
    purpose: 'Audio, cover, Canvas, visualizer, lyrics, proof exports, and Music IS handoff material.',
    owner: 'Music IS canonical, VIS media index',
    scan_role: 'music-release',
  },
  {
    path: '07_PROMPTS_AND_PROVENANCE',
    label: 'Prompts and provenance',
    purpose: 'Prompt logs, .vis.provenance.json sidecars, agent notes, evals, and rights evidence.',
    owner: 'VIS provenance ledger',
    scan_role: 'provenance',
  },
  {
    path: '08_AGENT_OUTPUTS',
    label: 'Agent outputs',
    purpose: 'Generated candidates from Codex, Claude, Grok, image/video/audio models, and future agent teams before approval.',
    owner: 'Agentic generation workflows',
    scan_role: 'agent-output',
  },
  {
    path: '99_ARCHIVE',
    label: 'Archive',
    purpose: 'Retired, rejected, superseded, and legacy assets kept for evidence or later review.',
    owner: 'Frank',
    scan_role: 'archive',
  },
  {
    path: '_MANIFESTS',
    label: 'Manifests',
    purpose: 'VIS setup manifest, scan reports, import dry-runs, and cross-laptop status snapshots.',
    owner: 'VIS',
    scan_role: 'manifest',
  },
]

function creativeVaultCandidates(root, config = DEFAULT_CONFIG, args = {}) {
  const explicit = args.vaultRoot || args.vault_root || args.root || config.creativeVaultRoot || config.creative_vault_root
  const fromEagle = (config.eagleLibraries || []).map(library => {
    const resolved = resolveProjectPath(root, library)
    const normalized = slash(resolved)
    return /\/01_Eagle_Library\/?$/.test(normalized)
      ? path.dirname(resolved)
      : resolved
  })
  const defaults = [
    '%USERPROFILE%\\Google Drive\\Starlight Creative Vault',
    '%USERPROFILE%\\My Drive\\Starlight Creative Vault',
    '%USERPROFILE%\\OneDrive\\Starlight Creative Vault',
    '%USERPROFILE%\\Drive\\Starlight Creative Vault',
    '%USERPROFILE%\\Starlight Creative Vault',
  ].map(candidate => resolveProjectPath(root, candidate))
  return uniq([explicit ? resolveProjectPath(root, explicit) : null, ...fromEagle, ...defaults])
    .map(candidate => ({
      path: candidate,
      exists: fs.existsSync(candidate),
      manifest_exists: fs.existsSync(path.join(candidate, '_MANIFESTS', 'vis-vault-manifest.json')),
    }))
}

function selectCreativeVaultRoot(root, config, args, candidates) {
  const explicit = args.vaultRoot || args.vault_root || args.root || config.creativeVaultRoot || config.creative_vault_root
  if (explicit) return resolveProjectPath(root, explicit)
  const withManifest = candidates.find(candidate => candidate.manifest_exists)
  if (withManifest) return withManifest.path
  const existing = candidates.find(candidate => candidate.exists)
  if (existing) return existing.path
  return candidates[0]?.path || path.join(path.dirname(root), 'Starlight Creative Vault')
}

function buildCreativeVaultManifest(plan) {
  return {
    $schema: 'https://frankx.ai/schemas/creative-vault-manifest.schema.json',
    schema_version: '1.0.0',
    product: 'Visual Intelligence OS',
    generated_at: nowIso(),
    vault_root: plan.vault_root,
    folders: plan.folders.map(folder => ({
      path: folder.path,
      label: folder.label,
      purpose: folder.purpose,
      owner: folder.owner,
      scan_role: folder.scan_role,
    })),
    rules: {
      local_first: true,
      google_photos_boundary: 'Camera backup only; export intentional creative assets into 00_INBOX_MOBILE.',
      eagle_boundary: 'Eagle is the visual browsing inbox; VIS is provenance, usage, rights, and agent source of truth.',
      music_boundary: 'Music IS remains canonical for release state; VIS indexes and links media assets.',
      human_gates: ['publishing', 'minting', 'deletion', 'paid uploads', 'rights approval'],
    },
    commands: plan.commands,
    mcp_allowed_roots: plan.mcp_allowed_roots,
  }
}

function renderCreativeVaultReadme(plan) {
  const folderLines = plan.folders.map(folder => `- ${folder.path}: ${folder.purpose}`).join('\n')
  return `# Starlight Creative Vault

This folder is the cross-device media inbox and approved asset vault for VIS, Eagle, Google Drive, Google Photos exports, Music IS media, website assets, social exports, and NFT/Web3 collection work.

## Folders

${folderLines}

## Operating Rules

- Google Photos stays the phone camera backup. Export product-relevant assets into 00_INBOX_MOBILE.
- Eagle lives in 01_Eagle_Library and is used for fast visual browsing.
- VIS remains the provenance, rights, usage, publication, and agent packet source of truth.
- Music IS remains canonical for release state, credits, AI disclosure, rights, and distribution gates.
- Use one active Eagle writer at a time and wait for Drive sync before switching laptops.
- Do not delete, publish, mint, upload paid assets, or approve rights without human review.

## Useful Commands

\`\`\`powershell
${plan.commands.scan}
${plan.commands.eagle_import}
${plan.commands.dashboard}
\`\`\`
`
}

const ACTION_RECIPES = {
  'designer-inbox': {
    label: 'Designer inbox',
    description: 'Queue image and motion assets for Eagle-style visual library triage without changing rights.',
    collection: 'VIS Designer Inbox',
    tags: ['designer-inbox', 'needs-curation'],
    curationStatus: 'needs-review',
    color: 'violet',
    note: 'Review for design library fit, source, rights, and website/social use.',
    matcher: asset => ['image', 'video'].includes(asset.media_type) && asset.approval_status !== 'rejected',
  },
  'music-release-inbox': {
    label: 'Music release inbox',
    description: 'Queue audio, cover, Canvas, and music proof assets for Music IS release packet work.',
    collection: 'Music IS Media Review',
    tags: ['music-is', 'release-review'],
    curationStatus: 'needs-review',
    color: 'mint',
    note: 'Route through Music IS proof folder with audio, cover, Canvas, lyrics, credits, rights, and release gate status.',
    matcher: asset => isMusicActionAsset(asset),
  },
  'prompt-gap-review': {
    label: 'Prompt gap review',
    description: 'Find generated-looking media without prompt links and queue sidecar/provenance capture.',
    collection: 'VIS Prompt Gap Review',
    tags: ['prompt-gap', 'provenance-needed'],
    curationStatus: 'needs-review',
    color: 'gold',
    note: 'Attach prompt, model, provider, seed/settings, and agent/skill sidecar before public reuse.',
    matcher: asset => Number(asset.prompt_count || 0) === 0 && ['image', 'video', 'audio'].includes(asset.media_type),
  },
  'provenance-gap-review': {
    label: 'Generation provenance gap',
    description: 'Queue assets with no generation/agent/skill run evidence for sidecar repair.',
    collection: 'VIS Provenance Gap Review',
    tags: ['provenance-gap', 'agent-log-needed'],
    curationStatus: 'needs-review',
    color: 'gold',
    note: 'Record generation, agent run, skill run, and output paths before agent teams reuse this asset.',
    matcher: asset => Number(asset.generation_count || 0) === 0 && Number(asset.agent_run_count || 0) === 0 && ['image', 'video', 'audio'].includes(asset.media_type),
  },
  'website-candidates': {
    label: 'Website candidates',
    description: 'Queue small approved image assets that are safe candidates for owned website routes.',
    collection: 'Website Candidate Assets',
    tags: ['website-candidate'],
    curationStatus: 'curated',
    color: 'blue',
    note: 'Candidate for route placement; create derivative, record route usage, then record publication URL.',
    matcher: asset => asset.media_type === 'image' && assetPublishGate(asset, { intendedUse: 'website' }).allowed === true && Number(asset.sizeKB || 0) <= 2000,
  },
  'social-candidates': {
    label: 'Social candidates',
    description: 'Queue approved image/video assets for channel variants and Postiz/manual publishing handoff.',
    collection: 'Social Candidate Assets',
    tags: ['social-candidate'],
    curationStatus: 'curated',
    color: 'blue',
    note: 'Create channel variant, queue human-approved post, then record platform URL and metrics.',
    matcher: asset => ['image', 'video'].includes(asset.media_type) && assetPublishGate(asset, { intendedUse: 'social' }).allowed === true,
  },
  'nft-trait-review': {
    label: 'NFT trait review',
    description: 'Queue NFT/Web3-like assets for trait, rights, metadata, storage, and mint-readiness review.',
    collection: 'NFT Trait Review',
    tags: ['nft-trait-review', 'web3-review'],
    curationStatus: 'needs-review',
    color: 'rose',
    note: 'Map traits, rights, metadata JSON, IPFS/R2 locations, and human mint approval before any drop.',
    matcher: asset => asset.category === 'nft-web3' || (asset.tags || []).includes('web3'),
  },
  'orphan-review': {
    label: 'Orphan review',
    description: 'Queue assets with no detected website/content usage so they can be used, archived, or ignored.',
    collection: 'VIS Orphan Review',
    tags: ['orphan-review'],
    curationStatus: 'needs-review',
    color: 'slate',
    note: 'Choose a target use, attach context, or leave archived as unused.',
    matcher: asset => Number(asset.usage_count || 0) === 0,
  },
  'duplicate-review': {
    label: 'Duplicate review',
    description: 'Queue duplicate content groups for merge/delete/archive decisions without deleting files.',
    collection: 'VIS Duplicate Review',
    tags: ['duplicate-review'],
    curationStatus: 'needs-review',
    color: 'slate',
    note: 'Compare locations, keep best master, and never delete without a separate human-approved cleanup.',
    matcher: (asset, context) => context.duplicateIds.has(asset.asset_id),
  },
  'similar-review': {
    label: 'Similarity review',
    description: 'Queue visually adjacent assets for curation, series grouping, or derivative selection.',
    collection: 'VIS Similarity Review',
    tags: ['similar-review'],
    curationStatus: 'needs-review',
    color: 'slate',
    note: 'Review similar assets as a set; choose hero/master/variant and record the decision.',
    matcher: (asset, context) => context.similarIds.has(asset.asset_id),
  },
}

function normalizeRecipeId(value) {
  const id = slugify(value || 'designer-inbox')
  const aliases = {
    action: 'designer-inbox',
    inbox: 'designer-inbox',
    design: 'designer-inbox',
    designer: 'designer-inbox',
    music: 'music-release-inbox',
    'music-is': 'music-release-inbox',
    'prompt-gap': 'prompt-gap-review',
    'prompt-gaps': 'prompt-gap-review',
    provenance: 'provenance-gap-review',
    'provenance-gap': 'provenance-gap-review',
    website: 'website-candidates',
    social: 'social-candidates',
    nft: 'nft-trait-review',
    web3: 'nft-trait-review',
    orphan: 'orphan-review',
    orphans: 'orphan-review',
    duplicate: 'duplicate-review',
    duplicates: 'duplicate-review',
    similar: 'similar-review',
  }
  return aliases[id] || id
}

function buildRecipeContext(db, recipeId) {
  const duplicateIds = new Set()
  const similarIds = new Set()
  if (recipeId === 'duplicate-review') {
    for (const group of findDuplicates(db, { limit: 500 })) {
      for (const asset of group.assets || []) duplicateIds.add(asset.asset_id)
    }
  }
  if (recipeId === 'similar-review') {
    const groups = findSimilarAssets(db, { limit: 100, minScore: 58 })
    for (const group of groups.groups || []) {
      for (const asset of group.assets || []) similarIds.add(asset.asset_id)
    }
  }
  return { duplicateIds, similarIds }
}

function assetMatchesActionFilters(asset, args = {}) {
  const query = normalizeNullable(args.query)
  const mediaType = args.mediaType || args.media_type
  const category = args.category
  const mood = args.mood
  const tag = args.filterTag || args.filter_tag || args.requiredTag || args.required_tag
  const curationStatus = args.curationStatus || args.curation_status
  const rightsStatus = args.filterRightsStatus || args.filter_rights_status
  const approvalStatus = args.filterApprovalStatus || args.filter_approval_status
  if (mediaType && asset.media_type !== mediaType) return false
  if (category && asset.category !== category) return false
  if (mood && asset.mood !== mood) return false
  if (tag && !(asset.tags || []).includes(String(tag).toLowerCase())) return false
  if (curationStatus && asset.curation_status !== curationStatus) return false
  if (rightsStatus && asset.rights_status !== rightsStatus) return false
  if (approvalStatus && asset.approval_status !== approvalStatus) return false
  if (query && !assetMatchesQuery(asset, query)) return false
  return true
}

function assetMatchesQuery(asset, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [
    asset.asset_id,
    asset.title,
    asset.relative_path,
    asset.absolute_path,
    asset.public_path,
    asset.category,
    asset.mood,
    asset.media_role,
    asset.workflow,
    asset.annotation_notes,
    asset.rights_status,
    asset.approval_status,
    ...(asset.tags || []),
  ].join(' ').toLowerCase()
  return words.every(word => hay.includes(word))
}

function recipeFilterSummary(args = {}) {
  return {
    query: args.query || null,
    media_type: args.mediaType || args.media_type || null,
    category: args.category || null,
    mood: args.mood || null,
    tag: args.filterTag || args.filter_tag || null,
    curation_status: args.curationStatus || args.curation_status || null,
    rights_status: args.filterRightsStatus || args.filter_rights_status || null,
    approval_status: args.filterApprovalStatus || args.filter_approval_status || null,
  }
}

function recipeAssetSummary(asset, recipeId, context = {}) {
  return {
    asset_id: asset.asset_id,
    visual_uri: asset.visual_uri,
    title: asset.title,
    media_type: asset.media_type,
    media_role: asset.media_role,
    workflow: asset.workflow,
    category: asset.category,
    rights_status: asset.rights_status,
    approval_status: asset.approval_status,
    curation_status: asset.curation_status || null,
    prompt_count: Number(asset.prompt_count || 0),
    generation_count: Number(asset.generation_count || 0),
    usage_count: Number(asset.usage_count || 0),
    path: asset.absolute_path || asset.relative_path || asset.primary_path,
    match_reason: recipeMatchReason(asset, recipeId, context),
  }
}

function recipeMatchReason(asset, recipeId, context = {}) {
  if (recipeId === 'designer-inbox') return `${asset.media_type} asset ready for visual curation`
  if (recipeId === 'music-release-inbox') return asset.workflow === 'music-release' ? 'Music IS release workflow asset' : `${asset.media_type} music-related asset`
  if (recipeId === 'prompt-gap-review') return `${Number(asset.prompt_count || 0)} prompt records`
  if (recipeId === 'provenance-gap-review') return `${Number(asset.generation_count || 0)} generation events and ${Number(asset.agent_run_count || 0)} agent runs`
  if (recipeId === 'website-candidates') return 'Approved small image candidate for owned route'
  if (recipeId === 'social-candidates') return 'Approved image/video candidate for channel variant'
  if (recipeId === 'nft-trait-review') return 'NFT/Web3 category or tag'
  if (recipeId === 'orphan-review') return `${Number(asset.usage_count || 0)} usage edges`
  if (recipeId === 'duplicate-review') return context.duplicateIds?.has(asset.asset_id) ? 'Duplicate SHA-256 review group member' : 'Duplicate review candidate'
  if (recipeId === 'similar-review') return context.similarIds?.has(asset.asset_id) ? 'Similarity review group member' : 'Similarity review candidate'
  return 'Recipe match'
}

function buildRecipeCommand(recipeId, assetIds, args = {}) {
  const parts = ['node', 'bin\\vis.mjs', 'action-recipe', recipeId]
  if (assetIds.length) parts.push(...assetIds)
  if (args.query) parts.push('--query', args.query)
  if (args.mediaType || args.media_type) parts.push('--media-type', args.mediaType || args.media_type)
  if (args.category) parts.push('--category', args.category)
  if (args.collection) parts.push('--collection', args.collection)
  if (args.limit) parts.push('--limit', String(args.limit))
  return parts.map(shellToken).join(' ')
}

function shellToken(value) {
  const text = String(value)
  return /^[A-Za-z0-9_./:\\-]+$/.test(text) ? text : `"${text.replace(/"/g, '\\"')}"`
}

function isMusicActionAsset(asset) {
  return asset.workflow === 'music-release' ||
    asset.media_type === 'audio' ||
    ['cover-art', 'music-canvas', 'music-stem', 'song-master', 'song-demo', 'song-audio', 'music-sample'].includes(asset.media_role) ||
    asset.category === 'music-releases' ||
    (asset.tags || []).includes('music')
}

function groupCount(rows, key) {
  const grouped = {}
  for (const row of rows) {
    const value = row[key] || 'unknown'
    grouped[value] = (grouped[value] || 0) + 1
  }
  return Object.fromEntries(Object.entries(grouped).sort((a, b) => b[1] - a[1]))
}

function recommendNextAction(asset, flags) {
  const latest = asset.versions?.[0] || {}
  const metadata = parseJson(latest.metadata_json, {})
  const workflow = metadata.workflow || asset.workflow
  if (asset.rights_status === 'blocked') return 'Do not publish. Replace or resolve rights.'
  if (flags.some(flag => flag.includes('rights'))) return 'Set rights status before public use.'
  if (workflow === 'music-release') return 'Open or create the Music IS proof folder and attach cover, Canvas, lyrics, credits, and release gate status.'
  if (!asset.prompts.length) return 'Attach prompt or provenance sidecar before using as a generated master.'
  if (!asset.evals.length) return 'Run visual quality eval and approve/reject.'
  if (!asset.usage.length) return 'Choose a target website/social/collection usage and record it.'
  return 'Ready for curation packet or derivative export.'
}

function upsertCollection(db, args = {}) {
  const name = normalizeNullable(args.name)
  if (!name) throw new Error('Collection requires a name')
  const ts = nowIso()
  const collectionId = args.collectionId || args.collection_id || stableId('collection', name)
  db.prepare(`
INSERT INTO collection (collection_id, name, type, description, status, metadata_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(collection_id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  description = COALESCE(excluded.description, collection.description),
  metadata_json = excluded.metadata_json,
  updated_at = excluded.updated_at
`).run(
    collectionId,
    name,
    args.type || 'curation',
    args.description || null,
    args.status || 'draft',
    JSON.stringify(args.metadata || {}),
    ts,
    ts,
  )
  return db.prepare('SELECT * FROM collection WHERE collection_id = ?').get(collectionId)
}

function nextCollectionPosition(db, collectionId) {
  const row = db.prepare('SELECT MAX(position) AS position FROM collection_item WHERE collection_id = ?').get(collectionId)
  return Number(row?.position || 0) + 1
}

function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(1, Math.min(5, Math.round(parsed)))
}

function normalizeTagInput(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  return uniq(raw.flatMap(item => String(item || '').split(','))
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))
}

function normalizeAssetRefs(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  return uniq(raw.flatMap(item => Array.isArray(item) ? item : String(item || '').split(/[,\n]+/))
    .map(item => String(item || '').trim())
    .filter(Boolean))
}

function normalizeRightsStatus(value) {
  const status = normalizeNullable(value)?.toLowerCase()
  if (!status) return null
  const allowed = new Set(['owned', 'generated-owned', 'licensed', 'unknown', 'blocked', 'needs-review'])
  if (!allowed.has(status)) throw new Error(`Invalid rights status: ${status}`)
  return status
}

function normalizeApprovalStatus(value) {
  const status = normalizeNullable(value)?.toLowerCase()
  if (!status) return null
  const allowed = new Set(['candidate', 'approved', 'rejected', 'needs-review'])
  if (!allowed.has(status)) throw new Error(`Invalid approval status: ${status}`)
  return status
}

function normalizeNullable(value) {
  if (value === null || value === undefined) return null
  const next = String(value).trim()
  return next ? next : null
}

function slugify(value) {
  return String(value || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'asset'
}
