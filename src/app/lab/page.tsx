import type { Metadata } from "next";
import { EvidenceLab } from "@/components/evidence-lab";
export const metadata:Metadata={title:"Evidence lab — Second Opinion",description:"Test your policy-review judgment with four fictional evidence challenges."};
export default function Page(){return <EvidenceLab/>;}
