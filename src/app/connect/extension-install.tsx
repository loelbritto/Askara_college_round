"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Download, FolderOpen, Globe, Pin, Puzzle } from "lucide-react";

export function ExtensionInstall({ version }: { version: string }) {
  const [downloaded, setDownloaded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      setCopyStatus("Copied. Paste it into Chrome’s address bar and press Enter.");
    } catch {
      setCopyStatus("Type chrome://extensions into Chrome’s address bar and press Enter.");
    }
  }

  return <section className="extension-install" aria-labelledby="extension-title">
    <div className="extension-intro">
      <div className="extension-label"><Globe size={17} /> CHROME EXTENSION <span>v{version} · Free</span></div>
      <h2 id="extension-title">From an AI answer<br />to sources you can inspect.</h2>
      <p>Select one claim in ChatGPT, Claude, or a webpage. Open Second Opinion, review the text, and choose <strong>Find evidence</strong>.</p>
      <a className="connect-cta" href={`/downloads/second-opinion-chrome.zip?v=${version}`} download onClick={() => setDownloaded(true)}><Download size={17} /> Download extension ZIP</a>
      <p className="extension-download-note">Downloading is step one. Install the extracted folder in Chrome using the steps alongside.</p>
      <div className="extension-preview" aria-label="Example extension workflow">
        <span className="extension-preview-brand"><Puzzle size={18} /> Second Opinion <span>Evidence screen</span></span>
        <div className="extension-preview-claim">Paste or select a claim from an AI answer…</div>
        <div className="extension-preview-action">Find evidence <ArrowUpRight size={15} /></div>
        <small>Review the claim → search → open original sources</small>
      </div>
      <Link className="connect-guide" href="/screen">Try it on the website first <ArrowUpRight size={14} /></Link>
    </div>
    <div className="extension-setup">
      <span className="extension-setup-eyebrow">ONE-TIME SETUP · CHROME ON A COMPUTER</span>
      <h3>Seeing files after downloading?<br />That’s the installation package.</h3>
      <p className="extension-setup-lead">Chrome loads the whole folder. You don’t need to open or run the individual code files.</p>
      <p className="extension-download-status" role="status">{downloaded ? "Download requested. Next: find the ZIP in Downloads and extract it." : "Follow these four steps to add it to your toolbar."}</p>
      <ol className="extension-steps">
        <li><span className="extension-step-icon"><FolderOpen size={19} /></span><div><h4>1. Extract the ZIP</h4><p>On Windows, right-click the download → <strong>Extract All</strong> → <strong>Extract</strong>. On Mac, double-click the ZIP. Keep the extracted folder.</p></div></li>
        <li><span className="extension-step-icon"><Globe size={19} /></span><div><h4>2. Open Chrome’s extensions page</h4><p>Paste this address into a new Chrome tab. Turn on <strong>Developer mode</strong> at the top right.</p><div className="extension-address"><code>chrome://extensions</code><button type="button" onClick={copyAddress} aria-label="Copy Chrome extensions address">{copyStatus.startsWith("Copied") ? <Check size={15} /> : <Copy size={15} />} Copy</button></div><span className="extension-copy-status" role="status">{copyStatus}</span></div></li>
        <li><span className="extension-step-icon"><Puzzle size={19} /></span><div><h4>3. Click “Load unpacked”</h4><p>Select the <strong>extracted folder containing <code>manifest.json</code></strong>, then choose <strong>Select Folder</strong>. Don’t select the ZIP or a single file.</p></div></li>
        <li><span className="extension-step-icon"><Pin size={19} /></span><div><h4>4. Pin it and check your first claim</h4><p>Click Chrome’s puzzle icon → pin <strong>Second Opinion</strong>. On a webpage, select a claim and click our icon. Review it, then choose <strong>Find evidence</strong>.</p></div></li>
      </ol>
      <details className="extension-help"><summary>Already installed, or stuck on a step?</summary><div>
        <p><strong>Updating:</strong> extract the new ZIP into the same installation folder, replace its old files, then click the reload icon on Second Opinion’s card at <code>chrome://extensions</code>. Check that it shows v{version}.</p>
        <p><strong>“Manifest missing”:</strong> choose the inner folder that has <code>manifest.json</code> directly inside it.</p>
        <p><strong>No selected text:</strong> paste your claim into the extension. Chrome settings pages and some PDF viewers don’t allow capture.</p>
        <p><strong>Managed school or work browser:</strong> if Developer mode is disabled by your administrator, use the <Link href="/screen">website claim checker</Link>.</p>
      </div></details>
      <small className="extension-footnote">Chrome 127+ · Manual installation · Not listed in the Chrome Web Store. <a href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked" target="_blank" rel="noopener noreferrer">Chrome’s installation guide ↗</a></small>
    </div>
  </section>;
}
