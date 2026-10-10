"use client";
import { LandingExperience } from "./access";
import { useWorkspaceMemory } from "./workspace-memory";

export function HomeExperience() {
  const {state,openExample,launching}=useWorkspaceMemory();
  return <LandingExperience hasDraft={!!(state.answer||state.sources.length)} busy={launching} onSample={()=>openExample("returns",true)}/>;
}
