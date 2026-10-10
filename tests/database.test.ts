import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Real PostgreSQL SQL/roles/RLS in WASM. The auth schema below simulates the
// verified gateway claims; this does not test Supabase's hosted JWT gateway or
// concurrent network connections (PGlite has one exclusive connection).
let db:PGlite;
const alice="11111111-1111-4111-8111-111111111111",bob="22222222-2222-4222-8222-222222222222";
const aliceSession="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",bobSession="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const payload={format:"second-opinion-workspace",version:1,draft:{answer:"First version"}};
async function asUser(user=alice,sid=aliceSession){await db.exec("reset role; set role authenticated;");await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);}
async function scalar<T>(sql:string,params:unknown[]=[]):Promise<T>{return (await db.query<{result:T}>(sql,params)).rows[0].result;}
const save=(id:string|null=null,version=0,data:unknown=payload)=>scalar<{id:string;version:number}>("select public.so_save_workspace('Review',$1::jsonb,$2::uuid,$3) result",[JSON.stringify(data),id,version]);
beforeAll(async()=>{
  db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  for(const file of ["202610100001_identity_limits.sql","202610100002_saved_workspaces.sql"])await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
},30000);
beforeEach(async()=>{
  await db.exec("reset role; truncate public.so_workspaces cascade; truncate second_opinion_private.request_limits; truncate auth.sessions; truncate auth.users cascade;");
  await db.query("insert into auth.users(id) values($1),($2)",[alice,bob]);await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)",[aliceSession,alice,bobSession,bob]);await asUser();
});
afterAll(async()=>{await db?.close();});
describe("Postgres migrations and account boundaries",()=>{
  it("denies anonymous RPC access and direct access to private quotas",async()=>{
    await db.exec("reset role;set role anon;");await expect(save()).rejects.toMatchObject({code:"42501"});
    await expect(db.query("select public.so_current_session()")).rejects.toMatchObject({code:"42501"});
    await asUser();await expect(db.query("select * from second_opinion_private.request_limits")).rejects.toMatchObject({code:"42501"});
  });
  it("isolates lists, exact-ID reads, versions, saves and deletes between users",async()=>{
    const first=await save();await asUser(bob,bobSession);
    expect(await scalar("select public.so_list_workspaces() result")).toEqual([]);
    expect(await scalar("select public.so_load_workspace($1,1) result",[first.id])).toBe(null);
    expect((await db.query("select * from public.so_workspace_versions")).rows).toEqual([]);
    await expect(save(first.id,1)).rejects.toMatchObject({code:"PT404"});
    expect(await scalar("select public.so_delete_workspace($1,1) result",[first.id])).toBe(false);
    await asUser();expect(await scalar("select public.so_load_workspace($1,1) result",[first.id])).toEqual(payload);
  });
  it("revokes access immediately even while the copied JWT claims are unexpired",async()=>{
    const first=await save();await db.exec("reset role;");await db.query("delete from auth.sessions where id=$1",[aliceSession]);await asUser();
    expect(await scalar("select public.so_current_session() result")).toBe(null);
    expect(await scalar("select public.so_list_workspaces() result")).toEqual([]);
    expect(await scalar("select public.so_load_workspace($1,1) result",[first.id])).toBe(null);
    await expect(save()).rejects.toMatchObject({code:"PT401"});await expect(scalar("select public.so_delete_workspace($1,1) result",[first.id])).rejects.toMatchObject({code:"PT401"});
  });
  it("honors user bans and session deadlines",async()=>{
    await db.exec("reset role;");await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[alice]);await asUser();expect(await scalar("select public.so_current_session() result")).toBe(null);
    await db.exec("reset role;");await db.query("update auth.users set banned_until=null where id=$1",[alice]);await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[aliceSession]);await asUser();expect(await scalar("select public.so_current_session() result")).toBe(null);
  });
  it("preserves immutable versions and refuses stale writes and deletes",async()=>{
    const first=await save();const changed={...payload,draft:{answer:"Second version"}};expect((await save(first.id,1,changed)).version).toBe(2);
    expect(await scalar("select public.so_load_workspace($1,1) result",[first.id])).toEqual(payload);expect(await scalar("select public.so_load_workspace($1,2) result",[first.id])).toEqual(changed);
    await expect(save(first.id,1)).rejects.toMatchObject({code:"PT409"});await expect(scalar("select public.so_delete_workspace($1,1) result",[first.id])).rejects.toMatchObject({code:"PT409"});
    await expect(scalar("select public.so_delete_workspace($1,null) result",[first.id])).rejects.toMatchObject({code:"PT400"});
    await expect(scalar("select public.so_save_workspace('Review',$1::jsonb,$2,null) result",[JSON.stringify(payload),first.id])).rejects.toMatchObject({code:"PT400"});
    await expect(db.query("update public.so_workspace_versions set payload='{}'::jsonb where workspace_id=$1",[first.id])).rejects.toMatchObject({code:"42501"});
    await expect(db.query("delete from public.so_workspaces where id=$1",[first.id])).rejects.toMatchObject({code:"42501"});
    expect(await scalar("select public.so_delete_workspace($1,2) result",[first.id])).toBe(true);
    await db.exec("reset role;");expect(await scalar("select count(*)::int result from public.so_workspace_versions")).toBe(0);
  });
  it("enforces account, version and payload bounds",async()=>{
    const first=await save();for(let i=1;i<20;i++)await save(first.id,i);
    await expect(save(first.id,20)).rejects.toMatchObject({code:"PT413"});
    for(let i=1;i<5;i++)await save();await expect(save()).rejects.toMatchObject({code:"PT413"});
    await expect(save(null,0,{...payload,huge:"a".repeat(2097153)})).rejects.toMatchObject({code:"PT413"});
  });
  it("reserves limiter calls for the server and counts all submitted requests",async()=>{
    const key="a".repeat(64);await expect(scalar("select public.so_take_limit($1,3) result",[key])).rejects.toMatchObject({code:"42501"});
    await db.exec("reset role;set role service_role;");const attempts=await Promise.all(Array.from({length:12},()=>scalar<boolean>("select public.so_take_limit($1,3) result",[key])));expect(attempts.filter(Boolean)).toHaveLength(3);
    await expect(scalar("select public.so_take_limit($1,null) result",[key])).rejects.toMatchObject({code:"P0001"});
    await db.exec("reset role;update second_opinion_private.request_limits set expires_at=now()-interval '1 second';set role service_role;");expect(await scalar("select public.so_take_limit($1,3) result",[key])).toBe(true);
  });
});
