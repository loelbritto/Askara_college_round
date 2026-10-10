import type { Metadata } from "next";
import { ExampleLibrary } from "@/components/examples";
export const metadata:Metadata={title:"Example library — Second Opinion",description:"Explore authored policy-audit cases with exceptions, conflicts, and missing evidence."};
export default function Page(){return <ExampleLibrary/>;}
