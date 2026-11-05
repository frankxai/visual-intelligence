-- Staging proposal for the existing Starlight Platform database.
-- Requires its canonical public.tenants table. No new identity or tenant authority.
-- These are hosted VIS records with the same local asset/version IDs, not new IDs.
BEGIN;

CREATE TABLE public.vis_catalog_sources (
  workspace_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 160),
  kind text NOT NULL,
  state text NOT NULL DEFAULT 'not_configured' CHECK (state IN ('not_configured','ready','unavailable')),
  indexed_at timestamptz,
  asset_count integer CHECK (asset_count >= 0),
  PRIMARY KEY (workspace_id, source_id)
);
CREATE TABLE public.vis_catalog_assets (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL CHECK (length(asset_id) BETWEEN 1 AND 160),
  title text NOT NULL CHECK (length(title) <= 500),
  brand text,
  characters text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  media_type text NOT NULL CHECK (media_type IN ('image','video','audio','document')),
  PRIMARY KEY (workspace_id, source_id, asset_id),
  FOREIGN KEY (workspace_id, source_id) REFERENCES public.vis_catalog_sources(workspace_id,source_id)
);
CREATE TABLE public.vis_catalog_versions (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL CHECK (length(version_id) BETWEEN 1 AND 160),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2000),
  rights_status text NOT NULL DEFAULT 'unknown' CHECK (rights_status IN ('unknown','needs-review','owned','generated-owned','licensed','blocked')),
  approval_status text NOT NULL DEFAULT 'candidate' CHECK (approval_status IN ('candidate','approved','rejected','archived')),
  approved_at timestamptz,
  approved_by text,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id,source_id,asset_id,version_id),
  FOREIGN KEY (workspace_id,source_id,asset_id) REFERENCES public.vis_catalog_assets(workspace_id,source_id,asset_id),
  CHECK (approval_status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);

-- No anonymous/authenticated table reads. The owning service authenticates the caller,
-- resolves active platform membership, then includes workspace_id on every query.
ALTER TABLE public.vis_catalog_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_catalog_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vis_catalog_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vis_catalog_sources, public.vis_catalog_assets, public.vis_catalog_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vis_catalog_sources, public.vis_catalog_assets, public.vis_catalog_versions TO service_role;

CREATE VIEW public.vis_catalog_search WITH (security_invoker=true) AS
SELECT a.workspace_id,a.source_id,a.asset_id,v.version_id,a.title,a.brand,a.characters,a.tags,a.media_type,
       v.sha256,v.width,v.height,v.rights_status,v.approval_status,'version_record'::text AS approval_scope,v.observed_at,
       CASE WHEN v.width=v.height THEN 'square' WHEN v.width>v.height THEN 'landscape' WHEN v.height>v.width THEN 'portrait' END AS aspect,
       to_tsvector('simple',a.title || ' ' || array_to_string(a.tags,' ') || ' ' || v.caption) AS search_document
FROM public.vis_catalog_assets a JOIN public.vis_catalog_versions v USING (workspace_id,source_id,asset_id);
REVOKE ALL ON public.vis_catalog_search FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vis_catalog_search TO service_role;
CREATE INDEX vis_catalog_versions_workspace_observed ON public.vis_catalog_versions(workspace_id,source_id,observed_at DESC);
CREATE INDEX vis_catalog_assets_workspace_brand ON public.vis_catalog_assets(workspace_id,source_id,brand);

CREATE FUNCTION public.vis_catalog_immutable_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW.workspace_id,NEW.source_id,NEW.asset_id,NEW.version_id,NEW.sha256,NEW.width,NEW.height,NEW.caption,NEW.observed_at)
     IS DISTINCT FROM
     (OLD.workspace_id,OLD.source_id,OLD.asset_id,OLD.version_id,OLD.sha256,OLD.width,OLD.height,OLD.caption,OLD.observed_at)
  THEN RAISE EXCEPTION 'VIS version content is immutable; insert a new version'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vis_catalog_immutable_version BEFORE UPDATE ON public.vis_catalog_versions FOR EACH ROW EXECUTE FUNCTION public.vis_catalog_immutable_version();
COMMIT;
