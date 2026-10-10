"use client";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}) {return <main className="fatal"><h1>Let’s take another look.</h1><p>The workspace encountered an unexpected error. Reloading may clear unsaved session data.</p><button className="button primary" onClick={reset}>Try again</button></main>;}
