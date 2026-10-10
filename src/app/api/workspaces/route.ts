import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuditError } from "@/lib/contracts";
import { ARCHIVE_BYTES, readArchive } from "@/lib/workspace-archive";
import { accountMode } from "@/lib/server/account-config";
import { ACCOUNT_COOKIE, accountRequest, requireSession, sharedLimit } from "@/lib/server/accounts";
import { assertOrigin, readJson } from "@/lib/server/security";
import { errorResponse, requestTrace } from "@/lib/server/response";

const inputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("list")}),
  z.object({action:z.literal("load"),id:z.uuid(),version:z.number().int().min(1).max(20)}),
  z.object({action:z.literal("delete"),id:z.uuid(),expectedVersion:z.number().int().min(1).max(20)}),
  z.object({action:z.literal("save"),title:z.string().trim().min(1).max(100),id:z.uuid().nullable().default(null),expectedVersion:z.number().int().min(0).max(20).default(0),archive:z.unknown()}),
]);
export async function POST(request:NextRequest){
  const trace = requestTrace("workspaces");
  try{
    assertOrigin(request);
    if(!accountMode())throw new AuditError("NOT_CONFIGURED","Cloud saving requires individual accounts. You can download a review file instead.",503);
    const session=await requireSession(undefined,request.cookies.get(ACCOUNT_COOKIE)?.value);
    await sharedLimit(`workspace:${session.userId}`,20,request.signal);
    const input=inputSchema.parse(await readJson(request,ARCHIVE_BYTES+8192));
    let result:unknown;
    const rpc=(name:string,body:unknown={})=>accountRequest(`/rest/v1/rpc/${name}`,{token:session.accessToken,body,signal:request.signal});
    if(input.action==="save"){
      let archive;
      try{archive=(await readArchive(input.archive)).archive;}catch{throw new AuditError("INVALID_INPUT","The review file is invalid or too large. Your current work is preserved.");}
      result=await rpc("so_save_workspace",{p_title:input.title,p_payload:archive,p_workspace_id:input.id,p_expected_version:input.expectedVersion});
    }else if(input.action==="list")result=await rpc("so_list_workspaces");
    else if(input.action==="delete"){
      result=await rpc("so_delete_workspace",{p_workspace_id:input.id,p_expected_version:input.expectedVersion});
      if(result!==true)throw new AuditError("NOT_FOUND","That saved review is unavailable.",404);
      result={deleted:true};
    }else{
      result=await rpc("so_load_workspace",{p_workspace_id:input.id,p_version:input.version});
      if(!result)throw new AuditError("NOT_FOUND","That saved review is unavailable.",404);
      try{result=(await readArchive(result)).archive;}catch{throw new AuditError("INVALID_OUTPUT","The saved review failed integrity checks. Your current work is preserved.",422);}
    }
    return trace.finish(NextResponse.json(result));
  }catch(error){return errorResponse(error,trace);}
}
