-- Apply after the VIS decision ledger. Do not distribute service-role keys to the UI.
BEGIN;
ALTER TABLE public.vis_identity_decisions ADD COLUMN supersedes bigint UNIQUE REFERENCES public.vis_identity_decisions(decision_id);

CREATE FUNCTION public.vis_reviewer_id(tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.principals p
  JOIN public.tenant_memberships m ON m.principal_id=p.id
  JOIN public.tenants t ON t.id=m.tenant_id
  WHERE t.id=tenant AND t.status='active' AND m.status='active'
    AND m.role IN ('admin','owner') AND p.identity_provider='supabase'
    AND p.external_subject=(current_setting('request.jwt.claims',true)::jsonb ->> 'sub')
    AND current_setting('request.jwt.claims',true)::jsonb ->> 'aal' = 'aal2'
    AND current_setting('request.jwt.claims',true)::jsonb ->> 'role' = 'authenticated'
$$;
REVOKE ALL ON FUNCTION public.vis_reviewer_id(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.vis_review_history(placement bigint) RETURNS TABLE (
  decision_id text, identity_id text, brand text, variant text, intended_use text, channel text,
  version_id text, master_version text, sha256 text, parent_sha256 text, action text, reviewer text,
  rights_basis text, evidence_ref text, expires_at timestamptz, recorded_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT d.decision_id::text,d.identity_id,d.brand,d.variant,d.intended_use,d.channel,d.version_id,
         d.parent_version_id,v.sha256,p.sha256,d.action,d.reviewer,d.rights_basis,d.evidence_ref,d.expires_at,d.recorded_at
  FROM public.vis_identity_decisions anchor
  JOIN public.vis_identity_decisions d USING(workspace_id,source_id,brand,identity_id,variant,intended_use,channel)
  JOIN public.vis_catalog_versions v ON (v.workspace_id,v.source_id,v.asset_id,v.version_id)=(d.workspace_id,d.source_id,d.asset_id,d.version_id)
  JOIN public.vis_catalog_versions p ON (p.workspace_id,p.source_id,p.asset_id,p.version_id)=
    (d.workspace_id,d.source_id,d.parent_asset_id,d.parent_version_id)
  WHERE anchor.decision_id=placement AND public.vis_reviewer_id(d.workspace_id) IS NOT NULL
  ORDER BY d.decision_id DESC LIMIT 100
$$;

CREATE FUNCTION public.vis_review_decide(placement bigint, choice text, evidence text, expected_sha text, expected_parent_sha text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.vis_identity_decisions; actor uuid; next_id bigint; latest bigint;
BEGIN
  SELECT * INTO prior FROM public.vis_identity_decisions WHERE decision_id=placement FOR UPDATE;
  actor := public.vis_reviewer_id(prior.workspace_id);
  IF actor IS NULL THEN RAISE EXCEPTION 'human reviewer required'; END IF;
  SELECT max(d.decision_id) INTO latest FROM public.vis_identity_decisions d
    WHERE (d.workspace_id,d.source_id,d.brand,d.identity_id,d.variant,d.intended_use,d.channel)=
      (prior.workspace_id,prior.source_id,prior.brand,prior.identity_id,prior.variant,prior.intended_use,prior.channel);
  IF latest IS DISTINCT FROM placement THEN RAISE EXCEPTION 'review changed; reload'; END IF;
  IF choice IS NULL OR choice NOT IN ('approve_use','request_revision','reject','revoke','archive','recover')
     OR length(trim(coalesce(evidence,''))) NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'invalid review'; END IF;
  IF (prior.action='archive' AND choice NOT IN ('recover','revoke')) OR (choice='recover' AND prior.action<>'archive')
     THEN RAISE EXCEPTION 'explicit recovery requires an archived placement'; END IF;
  IF prior.action='revoke' THEN RAISE EXCEPTION 'enrol a new rights decision'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vis_review_history(placement) h WHERE h.decision_id=placement::text
     AND h.sha256=expected_sha AND h.parent_sha256=expected_parent_sha) THEN RAISE EXCEPTION 'version mismatch'; END IF;
  INSERT INTO public.vis_identity_decisions (workspace_id,source_id,brand,identity_id,variant,intended_use,channel,
    asset_id,version_id,parent_asset_id,parent_version_id,object_key,parent_object_key,action,reviewer,evidence_ref,rights_basis,expires_at,supersedes)
  VALUES (prior.workspace_id,prior.source_id,prior.brand,prior.identity_id,prior.variant,prior.intended_use,prior.channel,
    prior.asset_id,prior.version_id,prior.parent_asset_id,prior.parent_version_id,prior.object_key,prior.parent_object_key,
    choice,actor::text,evidence,prior.rights_basis,prior.expires_at,placement)
  RETURNING decision_id INTO next_id;
  IF choice IN ('approve_use','recover') AND NOT EXISTS (SELECT 1 FROM public.vis_current_identity_use v
      WHERE v.decision_id=next_id) THEN RAISE EXCEPTION 'rights, identity or approval unavailable'; END IF;
  RETURN next_id::text;
END;
$$;
REVOKE ALL ON FUNCTION public.vis_review_history(bigint),public.vis_review_decide(bigint,text,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.vis_review_history(bigint),public.vis_review_decide(bigint,text,text,text,text) TO authenticated;
COMMIT;
