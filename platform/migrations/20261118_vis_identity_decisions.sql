-- Staging only. Apply after 20261105_vis_catalog.sql on the owning platform.
BEGIN;
CREATE TABLE public.vis_identity_decisions (
  decision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  source_id text NOT NULL,
  brand text NOT NULL,
  identity_id text NOT NULL,
  variant text NOT NULL,
  intended_use text NOT NULL,
  channel text NOT NULL,
  asset_id text NOT NULL,
  version_id text NOT NULL,
  parent_asset_id text NOT NULL,
  parent_version_id text NOT NULL,
  object_key text NOT NULL CHECK(length(object_key) BETWEEN 1 AND 1024),
  parent_object_key text NOT NULL CHECK(length(parent_object_key) BETWEEN 1 AND 1024),
  action text NOT NULL CHECK(action IN ('approve_use','request_revision','reject','revoke','archive')),
  reviewer text NOT NULL CHECK(length(trim(reviewer)) > 0),
  evidence_ref text NOT NULL CHECK(length(trim(evidence_ref)) > 0),
  rights_basis text NOT NULL CHECK(length(trim(rights_basis)) > 0),
  expires_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,source_id,asset_id,version_id) REFERENCES public.vis_catalog_versions,
  FOREIGN KEY (workspace_id,source_id,parent_asset_id,parent_version_id) REFERENCES public.vis_catalog_versions
);
CREATE INDEX vis_identity_scope ON public.vis_identity_decisions
(workspace_id,source_id,brand,identity_id,variant,intended_use,channel,decision_id DESC);
ALTER TABLE public.vis_identity_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vis_identity_decisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.vis_identity_decisions TO service_role;
-- The human operator owns insertion. Agents have no mutation policy, including DELETE.
CREATE FUNCTION public.vis_identity_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append a superseding identity decision'; END;
$$;
CREATE TRIGGER vis_identity_history BEFORE UPDATE OR DELETE ON public.vis_identity_decisions
FOR EACH ROW EXECUTE FUNCTION public.vis_identity_append_only();
CREATE VIEW public.vis_current_identity_use WITH (security_invoker=true) AS
WITH latest AS (
 SELECT DISTINCT ON (workspace_id,source_id,brand,identity_id,variant,intended_use,channel) *
 FROM public.vis_identity_decisions
 ORDER BY workspace_id,source_id,brand,identity_id,variant,intended_use,channel,decision_id DESC
)
SELECT d.workspace_id,d.source_id,d.brand,d.identity_id,d.variant,d.intended_use,d.channel,
       d.asset_id,d.version_id,d.object_key,d.parent_object_key,d.reviewer,d.decision_id,d.rights_basis,
       v.sha256,p.sha256 AS parent_sha256,d.expires_at
FROM latest d
JOIN public.vis_catalog_versions v USING(workspace_id,source_id,asset_id,version_id)
JOIN public.vis_catalog_versions p ON (p.workspace_id,p.source_id,p.asset_id,p.version_id)=
 (d.workspace_id,d.source_id,d.parent_asset_id,d.parent_version_id)
JOIN public.vis_catalog_assets a ON (a.workspace_id,a.source_id,a.asset_id)=(d.workspace_id,d.source_id,d.asset_id)
JOIN public.vis_catalog_assets parent ON (parent.workspace_id,parent.source_id,parent.asset_id)=(d.workspace_id,d.source_id,d.parent_asset_id)
WHERE d.identity_id=ANY(parent.characters) AND d.action='approve_use' AND d.expires_at>now() AND a.brand=d.brand AND d.identity_id=ANY(a.characters)
 AND v.approval_status='approved' AND p.approval_status='approved'
 AND v.rights_status IN ('owned','licensed','generated-owned') AND p.rights_status IN ('owned','licensed','generated-owned');
REVOKE ALL ON public.vis_current_identity_use FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vis_current_identity_use TO service_role;
COMMIT;
