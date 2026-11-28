-- Additive DAM layers migration. Apply after:
--   20261105_vis_catalog.sql
--   20261118_vis_identity_decisions.sql
--   20261118_vis_human_review.sql
--   20261118_vis_review_receipts.sql
-- Zero production backfill. Enforces multi-tenant RLS, Issue #41 intake rights locks,
-- and content-addressed derivative cache constraints.

BEGIN;

-- 1. Structured Metadata Schema Definitions per Workspace
CREATE TABLE public.vis_structured_metadata_fields (
  workspace_id uuid NOT NULL REFERENCES public.tenants(id),
  field_id text NOT NULL CHECK (length(field_id) BETWEEN 1 AND 120),
  field_type text NOT NULL CHECK (field_type IN ('string', 'integer', 'boolean', 'date', 'enum', 'set')),
  required boolean NOT NULL DEFAULT false,
  allowed_values text[] NOT NULL DEFAULT '{}',
  validation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, field_id)
);

-- 2. Structured Metadata Values bound to exact Asset Versions
CREATE TABLE public.vis_asset_metadata (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_json) = 'object'),
  validation_status text NOT NULL DEFAULT 'valid' CHECK (validation_status IN ('valid', 'warning', 'invalid')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id, asset_id, version_id),
  FOREIGN KEY (workspace_id, source_id, asset_id, version_id)
    REFERENCES public.vis_catalog_versions(workspace_id, source_id, asset_id, version_id)
);
CREATE INDEX vis_asset_metadata_gin ON public.vis_asset_metadata USING GIN (metadata_json);

-- 3. Character Canon Registry per Workspace
CREATE TABLE public.vis_character_profiles (
  workspace_id uuid NOT NULL REFERENCES public.tenants(id),
  character_id text NOT NULL CHECK (length(character_id) BETWEEN 1 AND 120),
  brand text NOT NULL,
  display_name text NOT NULL,
  canon_summary text NOT NULL DEFAULT '',
  canonical_master_sha256 text CHECK (canonical_master_sha256 IS NULL OR canonical_master_sha256 ~ '^[a-f0-9]{64}$'),
  style_directives jsonb NOT NULL DEFAULT '{}'::jsonb,
  negative_taste_rules text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, character_id)
);

-- 4. Asset <-> Character Lineage Links
CREATE TABLE public.vis_asset_character_links (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  character_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('master_sheet', 'turnaround', 'portrait', 'scene', 'variant', 'rejected_drift')),
  outfit text NOT NULL DEFAULT 'default',
  expression text NOT NULL DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id, asset_id, version_id, character_id),
  FOREIGN KEY (workspace_id, source_id, asset_id, version_id)
    REFERENCES public.vis_catalog_versions(workspace_id, source_id, asset_id, version_id),
  FOREIGN KEY (workspace_id, character_id)
    REFERENCES public.vis_character_profiles(workspace_id, character_id)
);

-- 5. Cached Edge Derivative Registry (derived/ cache only; never masters/ or renditions/)
CREATE TABLE public.vis_asset_derivatives (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  parent_sha256 text NOT NULL CHECK (parent_sha256 ~ '^[a-f0-9]{64}$'),
  spec_hash text NOT NULL CHECK (spec_hash ~ '^[a-f0-9]{16}$'),
  transform_spec text NOT NULL CHECK (length(transform_spec) BETWEEN 1 AND 256),
  format text NOT NULL CHECK (format IN ('avif', 'webp', 'jpeg', 'png')),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  byte_size integer CHECK (byte_size >= 0),
  r2_object_key text NOT NULL CHECK (r2_object_key ~ '^derived/[a-f0-9]{2}/[a-f0-9]{64}\.[a-f0-9]{16}\.(avif|webp|jpeg|jpg|png)$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id, asset_id, version_id, spec_hash, format),
  FOREIGN KEY (workspace_id, source_id, asset_id, version_id, parent_sha256)
    REFERENCES public.vis_catalog_versions(workspace_id, source_id, asset_id, version_id, sha256)
);
CREATE INDEX vis_asset_derivatives_parent_sha ON public.vis_asset_derivatives (workspace_id, parent_sha256);

CREATE FUNCTION public.vis_derivative_immutable_key() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF (NEW.workspace_id, NEW.source_id, NEW.asset_id, NEW.version_id, NEW.parent_sha256, NEW.r2_object_key, NEW.spec_hash)
     IS DISTINCT FROM
     (OLD.workspace_id, OLD.source_id, OLD.asset_id, OLD.version_id, OLD.parent_sha256, OLD.r2_object_key, OLD.spec_hash)
  THEN
    RAISE EXCEPTION 'VIS derivative key identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vis_derivative_immutable_key
  BEFORE UPDATE ON public.vis_asset_derivatives
  FOR EACH ROW EXECUTE FUNCTION public.vis_derivative_immutable_key();

-- 6. Upload Presets with Issue #41 Non-Waivable Intake Locks
CREATE TABLE public.vis_upload_presets (
  workspace_id uuid NOT NULL REFERENCES public.tenants(id),
  preset_id text NOT NULL CHECK (length(preset_id) BETWEEN 1 AND 120),
  folder text NOT NULL,
  allowed_mime_types text[] NOT NULL CHECK (array_length(allowed_mime_types, 1) >= 1),
  max_bytes integer NOT NULL CHECK (max_bytes BETWEEN 1024 AND 524288000),
  rights_default text NOT NULL DEFAULT 'unknown' CHECK (rights_default = 'unknown'),
  approval_default text NOT NULL DEFAULT 'candidate' CHECK (approval_default = 'candidate'),
  auto_transforms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, preset_id)
);

-- 7. Vector Embedding Store (double precision[] for PGlite/Postgres portability; upgrade to pgvector HNSW when enabled)
CREATE TABLE public.vis_asset_embeddings (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 120),
  dimensions integer NOT NULL CHECK (dimensions BETWEEN 1 AND 4096),
  embedding double precision[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id, asset_id, version_id, model_id),
  FOREIGN KEY (workspace_id, source_id, asset_id, version_id)
    REFERENCES public.vis_catalog_versions(workspace_id, source_id, asset_id, version_id),
  CHECK (array_length(embedding, 1) = dimensions)
);

-- Portable Cosine Similarity Helper (replaces cleanly with pgvector `<=>` operator when pgvector extension is active)
CREATE FUNCTION public.vis_cosine_similarity(a double precision[], b double precision[])
RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE
  len_a integer;
  len_b integer;
  i integer;
  dot_prod double precision := 0;
  norm_a double precision := 0;
  norm_b double precision := 0;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN NULL;
  END IF;
  len_a := array_length(a, 1);
  len_b := array_length(b, 1);
  IF len_a IS NULL OR len_b IS NULL OR len_a = 0 OR len_a <> len_b THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..len_a LOOP
    dot_prod := dot_prod + (a[i] * b[i]);
    norm_a := norm_a + (a[i] * a[i]);
    norm_b := norm_b + (b[i] * b[i]);
  END LOOP;
  IF norm_a = 0 OR norm_b = 0 THEN
    RETURN 0;
  END IF;
  RETURN dot_prod / (sqrt(norm_a) * sqrt(norm_b));
END;
$$;

-- Strict Row-Level Security on all new DAM tables
ALTER TABLE public.vis_structured_metadata_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_asset_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_character_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_asset_character_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_asset_derivatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_upload_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_asset_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.vis_structured_metadata_fields,
  public.vis_asset_metadata,
  public.vis_character_profiles,
  public.vis_asset_character_links,
  public.vis_asset_derivatives,
  public.vis_upload_presets,
  public.vis_asset_embeddings
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON
  public.vis_structured_metadata_fields,
  public.vis_asset_metadata,
  public.vis_character_profiles,
  public.vis_asset_character_links,
  public.vis_upload_presets,
  public.vis_asset_embeddings
TO service_role;

GRANT SELECT, INSERT, DELETE ON public.vis_asset_derivatives TO service_role;

-- Enriched Catalog Search & Character Canon Views (security_invoker=true)
CREATE VIEW public.vis_catalog_rich_search WITH (security_invoker=true) AS
SELECT
  s.workspace_id,
  s.source_id,
  s.asset_id,
  s.version_id,
  s.title,
  s.brand,
  s.characters,
  s.tags,
  s.media_type,
  s.sha256,
  s.width,
  s.height,
  s.rights_status,
  s.approval_status,
  s.aspect,
  s.observed_at,
  s.search_document,
  COALESCE(m.metadata_json, '{}'::jsonb) AS structured_metadata,
  COALESCE(m.validation_status, 'valid') AS metadata_status,
  (SELECT count(*)::integer FROM public.vis_asset_derivatives d
   WHERE d.workspace_id = s.workspace_id AND d.source_id = s.source_id AND d.asset_id = s.asset_id AND d.version_id = s.version_id) AS derivative_count
FROM public.vis_catalog_search s
LEFT JOIN public.vis_asset_metadata m USING (workspace_id, source_id, asset_id, version_id);

CREATE VIEW public.vis_character_canon_overview WITH (security_invoker=true) AS
SELECT
  p.workspace_id,
  p.character_id,
  p.brand,
  p.display_name,
  p.canonical_master_sha256,
  p.negative_taste_rules,
  count(l.asset_id)::integer AS linked_asset_count,
  count(l.asset_id) FILTER (WHERE l.role = 'master_sheet')::integer AS master_sheet_count,
  count(l.asset_id) FILTER (WHERE l.role = 'rejected_drift')::integer AS rejected_drift_count
FROM public.vis_character_profiles p
LEFT JOIN public.vis_asset_character_links l USING (workspace_id, character_id)
GROUP BY p.workspace_id, p.character_id, p.brand, p.display_name, p.canonical_master_sha256, p.negative_taste_rules;

REVOKE ALL ON public.vis_catalog_rich_search, public.vis_character_canon_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vis_catalog_rich_search, public.vis_character_canon_overview TO service_role;

COMMIT;
