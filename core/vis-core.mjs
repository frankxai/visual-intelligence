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
  COALESCE(pub.publication_count, 0) AS publication_count,
  COALESCE(ev.eval_count, 0) AS eval_count
FROM asset a
LEFT JOIN asset_location l ON l.asset_id = a.asset_id AND l.exists_now = 1
LEFT JOIN asset_version v ON v.version_id = l.version_id
LEFT JOIN asset_annotation an ON an.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS usage_count FROM asset_usage GROUP BY asset_id) u ON u.asset_id = a.asset_id
LEFT JOIN (SELECT asset_id, COUNT(*) AS prompt_count FROM prompt GROUP BY asset_id) p ON p.asset_id = a.asset_id
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
  const blocked = group.filter(asset => asset.rights_status === 'blocked')
  const rightsUnknown = group.filter(asset => ['unknown', 'needs-review'].includes(asset.rights_status))
  const approved = group.filter(asset => asset.approval_status === 'approved')

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
      tags: uniq([...parseJson(asset.tags_json, []), ...customTags]),
      prompt: asset.prompts[0]?.prompt_text || null,
      provenance_summary: {
        prompts: asset.prompts.length,
        usage_edges: asset.usage.length,
        publications: asset.publications.length,
        evals: asset.evals.length,
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
        `Rights: ${asset.rights_status}; Approval: ${asset.approval_status}`,
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
    }
    const dryRun = args.execute !== true && args.dryRun !== false
    if (dryRun) {
      return { dryRun: true, wouldRecord: payload, note: 'Pass execute: true to persist this publication record.' }
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
    return {
      dryRun: true,
      provider: 'cloudinary',
      folder: options.folder || 'visual-intelligence',
      generatedAt: nowIso(),
      assets: assets.map(asset => ({
        asset_id: asset.asset_id,
        local_path: asset.absolute_path,
        public_id: `${options.folder || 'visual-intelligence'}/${slugify(asset.category || 'asset')}/${slugify(asset.title || asset.asset_id)}`,
        tags: parseJson(asset.tags_json, []),
        context: {
          rights_status: asset.rights_status,
          approval_status: asset.approval_status,
          visual_uri: `visual://asset/${asset.asset_id}`,
        },
      })),
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
    return {
      dryRun: true,
      collection: options.collection || options.category || 'draft-collection',
      generatedAt: nowIso(),
      readiness: scoreCollection(db, options.collection || null),
      items: assets.map((asset, index) => ({
        name: asset.title || `Asset ${index + 1}`,
        description: `VIS-curated asset ${asset.asset_id}`,
        image: asset.public_path || asset.relative_path,
        external_url: null,
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
        },
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
    const publications = countRows(db, 'publication')
    const evals = countRows(db, 'eval_record')
    const annotations = countRows(db, 'asset_annotation')
    const savedSearches = countRows(db, 'saved_search')
    const byMediaType = db.prepare('SELECT media_type, COUNT(*) AS count FROM asset GROUP BY media_type ORDER BY count DESC').all()
    const byCategory = db.prepare('SELECT category, COUNT(*) AS count FROM asset GROUP BY category ORDER BY count DESC LIMIT 25').all()
    const byRights = db.prepare('SELECT rights_status, COUNT(*) AS count FROM asset GROUP BY rights_status ORDER BY count DESC').all()
    const byCurationStatus = db.prepare('SELECT curation_status, COUNT(*) AS count FROM asset_annotation GROUP BY curation_status ORDER BY count DESC').all()
    return { assets, versions, locations, usageEdges, prompts, publications, evals, annotations, savedSearches, byMediaType, byCategory, byRights, byCurationStatus }
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
    candidates.push(path.join(dir, `${base}.metadata${ext}`))
  }
  const found = []
  for (const candidate of uniq(candidates)) {
    if (!fs.existsSync(candidate)) continue
    try {
      const raw = fs.readFileSync(candidate, 'utf-8')
      const parsed = path.extname(candidate).toLowerCase() === '.json' ? parseJson(raw, null) : null
      const promptText = parsed
        ? (parsed.prompt || parsed.prompt_text || parsed.input || parsed.description || raw.slice(0, 4000))
        : extractPromptText(raw)
      found.push({
        path: candidate,
        promptText: String(promptText || '').slice(0, 8000),
        negativePrompt: parsed?.negative_prompt || parsed?.negativePrompt || null,
        modelHint: parsed?.model || parsed?.provider || null,
        settings: parsed?.settings || parsed?.parameters || parsed || {},
      })
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
