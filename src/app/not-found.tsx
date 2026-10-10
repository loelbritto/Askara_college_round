import Link from "next/link";
import { PageFrame } from "@/components/site-chrome";
export default function NotFound(){return <PageFrame><div className="page-wrap page-empty not-found"><span className="page-eyebrow">404 · NO MATCHING PAGE</span><h1>This trail ends here.</h1><p>Your next clue is a working example or the audit workspace.</p><Link className="cinema-button" href="/examples">Explore the examples</Link><Link className="cinema-link" href="/workspace">Return to workspace</Link></div></PageFrame>;}
