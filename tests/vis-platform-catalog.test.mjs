import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createSupabaseCatalogRegistry, createSupabaseMembershipResolver, createSupabaseWorkspaceCatalog } from '../core/adapters/supabase-workspace-catalog.mjs'

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
const base = { url:'https://fixture.supabase.co', serviceKey:'synthetic-server-key-for-fixture-only', identityProvider:'fixture' }

test('hosted adapter scopes every source/asset read and never exposes its credential', async () => {
  const calls=[]
  const fetchImpl=async (url,init) => {
    calls.push({url,init})
    assert.equal(url.searchParams.get('workspace_id'),'eq.'+a)
    assert.equal(init.redirect,'error')
    assert.equal(init.headers.apikey,base.serviceKey)
    return Response.json(url.pathname.endsWith('vis_catalog_sources') ? [{ state:'ready',asset_count:1,indexed_at:'2026-11-05T12:00:00Z' }] : [{asset_id:'asset_1',version_id:'v1',title:'Fox',approval_scope:'version_record'}])
  }
  const adapter=createSupabaseWorkspaceCatalog({...base,workspaceId:a,sourceId:'owned',fetchImpl})
  await adapter.search({query:'fox',brand:'fixture',character:'orra',limit:2},{workspaceId:a})
  await adapter.get('asset_1','v1',{workspaceId:a})
  assert.equal(calls[1].url.searchParams.get('search_document'),'plfts(simple).fox')
  assert.equal(calls[1].url.searchParams.get('source_id'),'eq.owned')
  assert.equal(calls[1].url.searchParams.get('characters'),'cs.{"orra"}')
  assert.equal(calls[1].url.searchParams.get('limit'),'3')
  const before=calls.length
  await assert.rejects(adapter.get('asset_1','v1',{workspaceId:b}),/workspace_forbidden/)
  assert.equal(calls.length,before,'denied before network')
  assert.equal(await adapter.preview(),null,'unconfigured R2 resolver never invents a URL')
})

test('platform resolver requires one active membership and an active canonical tenant', async () => {
  const calls=[]
  const resolver=createSupabaseMembershipResolver({...base,fetchImpl:async url=>{
    calls.push(url)
    if(url.pathname.endsWith('principals'))return Response.json([{id:'principal_1'}])
    if(url.pathname.endsWith('tenant_memberships'))return Response.json([{tenant_id:a}])
    return Response.json([{id:a}])
  }})
  assert.equal(await resolver({subject:'alice',requestedWorkspaceId:a}),a)
  assert.equal(calls[0].searchParams.get('external_subject'),'eq.alice')
  assert.equal(calls[1].searchParams.get('status'),'eq.active')
  assert.equal(calls[2].searchParams.get('status'),'eq.active')
  const ambiguous=createSupabaseMembershipResolver({...base,fetchImpl:async url=>Response.json(url.pathname.endsWith('principals')?[{id:'p'}]:[{tenant_id:a},{tenant_id:b}])})
  assert.equal(await ambiguous({subject:'alice'}),null)
})

test('new users get their own discovered catalog; unconfigured source remains explicit', async () => {
  const registry=createSupabaseCatalogRegistry({...base,fetchImpl:async url=>{
    assert.equal(url.searchParams.get('workspace_id'),'eq.'+b)
    return Response.json([{source_id:'own-cloudinary',kind:'cloudinary',state:'not_configured'}])
  }})
  const sources=await registry({workspaceId:b})
  assert.equal(sources[0].adapter,null)
  assert.equal(sources[0].id,'own-cloudinary')
})

test('Postgres migration executes, enforces tenant/version relationships and denies direct client reads', async t => {
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.tenants(id uuid PRIMARY KEY);')
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261105_vis_catalog.sql',import.meta.url),'utf8'))
  await db.query('INSERT INTO tenants VALUES ($1),($2)',[a,b])
  await db.query("INSERT INTO vis_catalog_sources(workspace_id,source_id,kind,state) VALUES ($1,'owned','vis_sqlite','ready')",[a])
  await db.query("INSERT INTO vis_catalog_assets(workspace_id,source_id,asset_id,title,media_type) VALUES ($1,'owned','asset_1','Copper Fox','image')",[a])
  await db.query("INSERT INTO vis_catalog_versions(workspace_id,source_id,asset_id,version_id,sha256,width,height,observed_at) VALUES ($1,'owned','asset_1','v1',$2,1200,800,now())",[a,'a'.repeat(64)])
  const found=await db.query("SELECT asset_id,version_id,approval_status,aspect FROM vis_catalog_search WHERE workspace_id=$1 AND search_document @@ plainto_tsquery('simple','Copper Fox')",[a])
  assert.equal(found.rows[0].approval_status,'candidate')
  assert.equal(found.rows[0].aspect,'landscape')
  assert.equal((await db.query('SELECT * FROM vis_catalog_search WHERE workspace_id=$1',[b])).rows.length,0)
  await assert.rejects(db.query("INSERT INTO vis_catalog_versions(workspace_id,source_id,asset_id,version_id,sha256,observed_at) VALUES ($1,'owned','asset_1','v2',$2,now())",[b,'b'.repeat(64)]),/foreign key/)
  await assert.rejects(db.query("UPDATE vis_catalog_versions SET approval_status='approved' WHERE version_id='v1'"),/check constraint/)
  await assert.rejects(db.query("UPDATE vis_catalog_versions SET sha256=$1 WHERE version_id='v1'",['b'.repeat(64)]),/immutable/)
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261118_vis_identity_decisions.sql',import.meta.url),'utf8'))
  await db.query("UPDATE vis_catalog_assets SET brand='fixture', characters=ARRAY['fox']")
  await db.query("UPDATE vis_catalog_versions SET rights_status='owned', approval_status='approved', approved_by='operator', approved_at=now()")
  await db.query("INSERT INTO vis_catalog_versions(workspace_id,source_id,asset_id,version_id,sha256,observed_at,rights_status,approval_status,approved_at,approved_by) VALUES ($1,'owned','asset_1','render',$2,now(),'licensed','approved',now(),'operator')",[a,'c'.repeat(64)])
  const decide = action => db.query(`INSERT INTO vis_identity_decisions
    (workspace_id,source_id,brand,identity_id,variant,intended_use,channel,asset_id,version_id,parent_asset_id,parent_version_id,object_key,parent_object_key,action,reviewer,evidence_ref,rights_basis,expires_at)
    VALUES ($1,'owned','fixture','fox','editorial-card','episode preview','unlisted-review','asset_1','render','asset_1','v1','fixture/card.jpg','fixture/master.png',$2,'reviewer','review-1','fixture licence',now()+interval '1 day')`,[a,action])
  const decisions = async () => (await db.query('SELECT * FROM vis_current_identity_use')).rows
  await decide('approve_use')
  assert.equal((await decisions())[0].parent_sha256,'a'.repeat(64))
  await decide('archive')
  assert.deepEqual(await decisions(),[])
  await decide('approve_use')
  assert.equal((await decisions()).length,1)
  await decide('revoke')
  assert.deepEqual(await decisions(),[])
  await assert.rejects(db.exec('DELETE FROM vis_identity_decisions'),/append a superseding/)
  await db.exec('SET ROLE service_role')
  await assert.rejects(decide('approve_use'),/permission denied/)
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await assert.rejects(db.query('SELECT * FROM vis_catalog_search'),/permission denied/)
  await db.exec('RESET ROLE; SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM vis_catalog_versions'),/permission denied/)
  await db.exec('RESET ROLE')
  await db.exec(`ALTER TABLE tenants ADD COLUMN status text DEFAULT 'active';
    CREATE TABLE principals (id uuid PRIMARY KEY,identity_provider text,external_subject text);
    CREATE TABLE tenant_memberships (tenant_id uuid,principal_id uuid,role text,status text);`)
  await db.query("INSERT INTO principals VALUES ($1,'supabase','human-reviewer')",[b])
  await db.query("INSERT INTO tenant_memberships VALUES ($1,$2,'owner','active')",[a,b])
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261118_vis_human_review.sql',import.meta.url),'utf8'))
  // Operator seeds a fresh placement review. Human RPCs can only supersede an existing scope.
  await decide('request_revision')
  const anchor=(await db.query('SELECT max(decision_id)::text AS id FROM vis_identity_decisions')).rows[0].id
  const claims=async (aal,sub='human-reviewer')=>db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,aal,role:'authenticated'})])
  const history=async id=>(await db.query('SELECT * FROM vis_review_history($1)',[id])).rows
  const vote=async(id,choice,sha='c'.repeat(64))=>(await db.query('SELECT vis_review_decide($1,$2,$3,$4,$5) AS id',[id,choice,'review evidence',sha,'a'.repeat(64)])).rows[0].id
  await db.exec('SET ROLE authenticated')
  await claims('aal1')
  assert.deepEqual(await history(anchor),[])
  await assert.rejects(vote(anchor,'approve_use'),/human reviewer/)
  await claims('aal2','other')
  assert.deepEqual(await history(anchor),[])
  await claims('aal2')
  assert.equal((await history(anchor))[0].action,'request_revision')
  await assert.rejects(vote(anchor,'promote'),/invalid review/)
  await assert.rejects(vote(anchor,'delete'),/invalid review/)
  await assert.rejects(vote(anchor,'approve_use','d'.repeat(64)),/version mismatch/)
  const approved=await vote(anchor,'approve_use')
  assert.equal((await history(approved))[0].reviewer,b)
  await assert.rejects(vote(anchor,'reject'),/review changed/)
  const archived=await vote(approved,'archive')
  await assert.rejects(vote(archived,'approve_use'),/explicit recovery/)
  const recovered=await vote(archived,'recover')
  assert.equal((await history(recovered))[0].action,'recover')
  const revoked=await vote(recovered,'revoke')
  await assert.rejects(vote(revoked,'request_revision'),/new rights decision/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  await assert.rejects(vote(revoked,'approve_use'),/permission denied/)
  await db.exec('RESET ROLE')
  const security=await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('vis_catalog_assets','vis_catalog_versions','vis_catalog_sources')")
  assert.ok(security.rows.every(r=>r.relrowsecurity))
})
