-- Additive staging migration after 20261105_vis_catalog.sql. No production backfill.
BEGIN;
ALTER TABLE public.vis_catalog_versions ADD CONSTRAINT vis_review_version_digest
  UNIQUE(workspace_id,source_id,asset_id,version_id,sha256);
CREATE TABLE public.vis_review_receipts (
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  sha256 text NOT NULL,
  nonce uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('comment','approve_use','approve_identity','approve_canon',
    'authorize_publication','replace_canonical','archive','delete','restore','revoke_rights')),
  state text NOT NULL CHECK (state IN ('candidate','archived','quarantined','restricted')),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope)='object' AND envelope ?& ARRAY['decision','signature']),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY(workspace_id,nonce),
  UNIQUE(workspace_id,source_id,asset_id,revision),
  FOREIGN KEY(workspace_id,source_id,asset_id,version_id,sha256)
    REFERENCES public.vis_catalog_versions(workspace_id,source_id,asset_id,version_id,sha256)
);
ALTER TABLE public.vis_review_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vis_review_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.vis_review_receipts TO service_role;
COMMIT;
