"use client";
import { Workbench } from "./workbench";
import { useWorkspaceMemory } from "./workspace-memory";
export function WorkspacePage(){const {state}=useWorkspaceMemory();return <Workbench key={state.revision}/>;}
