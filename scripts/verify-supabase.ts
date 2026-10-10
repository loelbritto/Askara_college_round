import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { accountConfiguration } from "../src/lib/server/account-config";

// Explicit opt-in only. Dedicated existing test users; no admin account creation or emails.
const live = process.argv.includes("--live");
const reset = process.argv.includes("--check-limit-reset");
const config = accountConfiguration();
const credentials = ["A","B"].map(label => ({
  label,email:process.env[`SUPABASE_TEST_${label}_EMAIL`] ?? "",password:process.env[`SUPABASE_TEST_${label}_PASSWORD`] ?? "",
}));
const missing = [
  ...(!config.configured ? ["Supabase configuration and Free-tier confirmation"] : []),
  ...credentials.filter(user => !user.email || !user.password).map(user => `Dedicated test user ${user.label} credentials`),
  ...(credentials[0].email && credentials[0].email.toLowerCase() === credentials[1].email.toLowerCase() ? ["Two different test users"] : []),
];
if(!live || missing.length) {
  console.log(JSON.stringify({status:live?"blocked":"dry-run",missing,networkRequests:0,
    intendedChanges:"Synthetic workspace versions for two existing empty test accounts; private quota rows; test sessions. No accounts, emails, migrations or model calls.",
    checks:["Anonymous RPC denial","Owner isolation through RPC and RLS","Concurrent immutable-version writes","Concurrent quota admission","Stale deletion and cascade","Copied-token revocation"],
    quotaResetCheck:reset?"requested":"not selected; add --check-limit-reset for the additional 61-second check",
    limitations:"Does not verify application-instance routing, provider billing/retention settings or hosted browser behavior."},null,2));
  if(live)process.exitCode=2;
} else {
  const origin=process.env.SUPABASE_URL!.replace(/\/$/,"");
  const publishable=process.env.SUPABASE_PUBLISHABLE_KEY!,secret=process.env.SUPABASE_SECRET_KEY!;
  const runId=randomUUID(),checks:{name:string;outcome:"passed"}[]=[];
  const tokens:string[]=[];
  let workspaceId:string|undefined,workspaceVersion=0,ownerToken:string|undefined,calls=0;
  let failed=false,cleanupFailed=false,creationAttempted=false;
  // Keep raw responses/tokens in memory only. Errors expose operation labels and status, never bodies.
  async function call(path:string,body?:unknown,token?:string,privileged=false,method=body===undefined?"GET":"POST") {
    if(++calls>80)throw new Error("REQUEST_BUDGET_REACHED");
    const response=await fetch(`${origin}${path}`,{method,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
      headers:{apikey:privileged?secret:publishable,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data:unknown=null;
    if(response.status!==204){try{data=await response.json();}catch{throw new Error("UNREADABLE_RESPONSE");}}
    return {status:response.status,data};
  }
  const rpc=(name:string,body:unknown,token?:string,privileged=false)=>call(`/rest/v1/rpc/${name}`,body,token,privileged);
  async function settle<T>(tasks:Promise<T>[]):Promise<T[]> {
    // Wait for every dispatched mutation before inspecting state or cleaning up.
    const results=await Promise.allSettled(tasks);
    if(results.some(result=>result.status==="rejected"))throw new Error("INTEGRATION_REQUEST_FAILED");
    return results.map(result=>(result as PromiseFulfilledResult<T>).value);
  }
  function requireCheck(condition:unknown,name:string):asserts condition {
    if(!condition)throw new Error(`CHECK_FAILED: ${name}`);
    checks.push({name,outcome:"passed"});
  }
  const object=(data:unknown):Record<string,unknown> => data && typeof data==="object" && !Array.isArray(data)?data as Record<string,unknown>:{};
  async function signIn(index:number) {
    const user=credentials[index];
    const response=await call("/auth/v1/token?grant_type=password",{email:user.email,password:user.password});
    const token=object(response.data).access_token;
    if(response.status!==200 || typeof token!=="string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw new Error("TEST_SIGN_IN_FAILED");
    tokens.push(token); return token;
  }
  const payload=(revision:number)=>({format:"second-opinion-workspace",version:1,savedAt:new Date().toISOString(),draft:{sources:[],selectedIds:[],answer:`Synthetic integration ${runId}, revision ${revision}`,context:"",sampleMode:false,setupStep:1},reports:[],baselineId:null,comparisonId:null,showComparison:false,history:[],reviews:{},ruleReviews:{}});
  async function save(token:string,expected:number,revision:number) {
    return rpc("so_save_workspace",{p_title:`Integration ${runId}`,p_payload:payload(revision),p_workspace_id:workspaceId??null,p_expected_version:expected},token);
  }
  try {
    ownerToken=await signIn(0); const otherToken=await signIn(1);
    const identities=await Promise.all([ownerToken,otherToken].map(token=>rpc("so_current_session",{},token)));
    requireCheck(identities.every(result=>result.status===200&&typeof object(result.data).userId==="string")&&object(identities[0].data).userId!==object(identities[1].data).userId,"Two different active gateway identities");
    const lists=await Promise.all([ownerToken,otherToken].map(token=>rpc("so_list_workspaces",{},token)));
    requireCheck(lists.every(result=>result.status===200&&Array.isArray(result.data)&&result.data.length===0),"Dedicated test accounts have no existing saved work");
    const anonymous=await rpc("so_list_workspaces",{});
    requireCheck([401,403].includes(anonymous.status),"Anonymous saved-work RPC is denied");

    creationAttempted=true;
    const initial=await save(ownerToken,0,1),initialData=object(initial.data);
    if(initial.status===200&&typeof initialData.id==="string"&&/^[0-9a-f-]{36}$/.test(initialData.id)){workspaceId=initialData.id;workspaceVersion=Number(initialData.version);}
    requireCheck(workspaceId&&workspaceVersion===1,"Owner creates one synthetic version");
    const races=await settle([save(ownerToken,1,2),save(ownerToken,1,3)]);
    const winner=races.find(result=>result.status===200);
    if(winner)workspaceVersion=Number(object(winner.data).version);
    requireCheck(races.filter(result=>result.status===200).length===1&&races.filter(result=>result.status===409).length===1&&workspaceVersion===2,"Concurrent same-version saves have exactly one winner");
    const old=await rpc("so_load_workspace",{p_workspace_id:workspaceId,p_version:1},ownerToken);
    requireCheck(old.status===200&&object(object(old.data).draft).answer===`Synthetic integration ${runId}, revision 1`,"Previous saved version remains unchanged");
    const otherList=await rpc("so_list_workspaces",{},otherToken);
    const otherLoad=await rpc("so_load_workspace",{p_workspace_id:workspaceId,p_version:1},otherToken);
    const otherSave=await save(otherToken,2,4);
    const otherDelete=await rpc("so_delete_workspace",{p_workspace_id:workspaceId,p_expected_version:2},otherToken);
    requireCheck(otherList.status===200&&Array.isArray(otherList.data)&&otherList.data.length===0&&otherLoad.status===200&&otherLoad.data===null&&otherSave.status===404&&otherDelete.status===200&&otherDelete.data===false,"Other account cannot list, load, overwrite or delete owner work");
    const direct=await call(`/rest/v1/so_workspace_versions?workspace_id=eq.${workspaceId}&select=version`,undefined,otherToken);
    requireCheck(direct.status===200&&Array.isArray(direct.data)&&direct.data.length===0,"Direct table reads enforce row isolation");
    const directUpdate=await call(`/rest/v1/so_workspaces?id=eq.${workspaceId}`,{title:"Unauthorized direct write"},ownerToken,false,"PATCH");
    requireCheck([401,403].includes(directUpdate.status),"Direct table update is denied even to the owner");

    const quotaKey=randomBytes(32).toString("hex");
    const userQuota=await rpc("so_take_limit",{p_key:quotaKey,p_limit:3},ownerToken);
    requireCheck([401,403].includes(userQuota.status),"User token cannot invoke privileged quota reservation");
    const reservations=await settle(Array.from({length:12},()=>rpc("so_take_limit",{p_key:quotaKey,p_limit:3},undefined,true)));
    requireCheck(reservations.every(result=>result.status===200&&typeof result.data==="boolean")&&reservations.filter(result=>result.data===true).length===3,"Twelve concurrent gateway reservations admit exactly three");
    if(reset){
      const quotaStarted=Date.now();
      while(Date.now()-quotaStarted<61000)await new Promise(resolve=>setTimeout(resolve,Math.min(30000,61000-(Date.now()-quotaStarted))));
      const afterExpiry=await rpc("so_take_limit",{p_key:quotaKey,p_limit:3},undefined,true);
      requireCheck(afterExpiry.status===200&&afterExpiry.data===true,"Quota reservation resets after expiry");
    }

    const signedOut=await call("/auth/v1/logout?scope=local",{},ownerToken);
    requireCheck(signedOut.status===204,"Owner test session signs out");
    const revoked=await rpc("so_current_session",{},ownerToken);
    const revokedRead=await call(`/rest/v1/so_workspace_versions?workspace_id=eq.${workspaceId}&select=version`,undefined,ownerToken);
    const revokedSave=await save(ownerToken,2,5);
    requireCheck((revoked.status===200&&revoked.data===null)||revoked.status===401,"Copied signed-out token has no active session");
    requireCheck((revokedRead.status===200&&Array.isArray(revokedRead.data)&&revokedRead.data.length===0)||revokedRead.status===401,"Copied signed-out token cannot read existing saved versions");
    requireCheck(revokedSave.status===401,"Copied signed-out token cannot save");
    const otherSession=await rpc("so_current_session",{},otherToken);
    requireCheck(otherSession.status===200&&object(otherSession.data).userId===object(identities[1].data).userId,"Local sign-out preserves the other account session");
    ownerToken=await signIn(0);
    const stale=await rpc("so_delete_workspace",{p_workspace_id:workspaceId,p_expected_version:1},ownerToken);
    requireCheck(stale.status===409,"Stale deletion is rejected");
    const removed=await rpc("so_delete_workspace",{p_workspace_id:workspaceId,p_expected_version:workspaceVersion},ownerToken);
    requireCheck(removed.status===200&&removed.data===true,"Owner deletes the synthetic workspace");
    const versions=await call(`/rest/v1/so_workspace_versions?workspace_id=eq.${workspaceId}&select=version`,undefined,ownerToken);
    requireCheck(versions.status===200&&Array.isArray(versions.data)&&versions.data.length===0,"Deletion removes all saved versions");
    workspaceId=undefined;
    creationAttempted=false;
  } catch(error) {
    failed=true;
    const message=error instanceof Error&&/^(CHECK_FAILED: |REQUEST_BUDGET_REACHED$|UNREADABLE_RESPONSE$|TEST_SIGN_IN_FAILED$)/.test(error.message)?error.message:"INTEGRATION_REQUEST_FAILED";
    console.error(message);
  } finally {
    // A timeout on the first save may leave a committed row without a returned ID.
    // Report that uncertainty; do not claim cleanup or delete a guessed row.
    if(creationAttempted&&!workspaceId)cleanupFailed=true;
    // Only delete the ID created by this run. Never enumerate or delete existing user work.
    if(workspaceId){
      try{
        ownerToken=await signIn(0);
        const list=await rpc("so_list_workspaces",{},ownerToken);
        const item=Array.isArray(list.data)?list.data.map(object).find(row=>row.id===workspaceId):undefined;
        if(item){const result=await rpc("so_delete_workspace",{p_workspace_id:workspaceId,p_expected_version:item.version},ownerToken);if(result.status!==200||result.data!==true)cleanupFailed=true;}
        else if(list.status!==200)cleanupFailed=true;
      }catch{cleanupFailed=true;}
    }
    for(const token of tokens){try{const response=await call("/auth/v1/logout?scope=local",{},token);if(![204,401].includes(response.status))cleanupFailed=true;}catch{cleanupFailed=true;}}
    const record={status:failed||cleanupFailed?"incomplete":"passed",runId,createdAt:new Date().toISOString(),scope:"Actual configured Supabase gateway; synthetic data; no model calls",networkRequests:calls,checks,quotaReset:reset?"requested; inspect completed checks":"not tested",cleanup:cleanupFailed?"needs operator review":"completed",...(cleanupFailed&&workspaceId?{syntheticWorkspaceNeedingCleanup:workspaceId}:{}),limitations:["Does not verify application instance routing or hosted UI","Does not verify provider billing, backup retention, ban/expiry policy or outage behavior","Concurrent HTTP requests do not prove a specific backend connection count"]};
    await mkdir("artifacts",{recursive:true});await writeFile(`artifacts/supabase-integration-${runId}.json`,JSON.stringify(record,null,2)+"\n");
    console.log(JSON.stringify(record,null,2));
    if(failed||cleanupFailed)process.exitCode=2;
  }
}
