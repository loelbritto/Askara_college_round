import type { Metadata } from "next";
import { ClaimScreen } from "@/components/claim-screen";
import "./screen.css";
export const metadata:Metadata={title:"Check a claim for free — Second Opinion",description:"Find research evidence and compare two models on your own device. No paid API key required."};
export default function Page(){return <ClaimScreen/>;}
