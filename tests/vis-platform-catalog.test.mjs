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
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT * FROM vis_catalog_search'),/permission denied/)
  await db.exec('RESET ROLE; SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM vis_catalog_versions'),/permission denied/)
  await db.exec('RESET ROLE')
  const security=await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('vis_catalog_assets','vis_catalog_versions','vis_catalog_sources')")
  assert.ok(security.rows.every(r=>r.relrowsecurity))
})
