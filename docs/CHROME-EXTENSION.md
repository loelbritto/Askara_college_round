# Second Opinion Chrome extension

The extension helps a user check one selected AI claim from ChatGPT, Claude, or a regular webpage. It sends the reviewed text through Second Opinion's public evidence API. No language-model API key or pilot code belongs in the extension.

## Install the free ZIP download

Start at [the installation page](https://secondopinion-ten.vercel.app/connect). Downloading or opening the ZIP is not installation: seeing JavaScript and JSON files is normal. On Windows, right-click the ZIP and select **Extract All → Extract**. On Mac, double-click the ZIP. The package includes **00-START-HERE.html**, an offline guide you can open in a browser. Load the entire extracted folder into Chrome; do not run individual code files. Keep that folder after installation because Chrome loads the extension from it.

## Install locally for the demo

1. Use Chrome 127 or later.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository's `integrations/chrome-extension` folder. If using the ZIP, extract it first and select the folder containing `manifest.json`.
4. Pin **Second Opinion — Evidence Screen** in Chrome's extensions menu.
5. Select a complete claim in a ChatGPT or Claude answer. Right-click and choose **Review with Second Opinion**, or open the pinned extension.
6. Edit the claim if needed. Choose its subject, then click **Find evidence**. This sends the selected text to the service and its research search providers.
7. Read the source links. Choose **Open full screen for model comparison** to import the claim into the website. The user initiates searches and on-device model downloads there separately.

On restricted pages such as `chrome://extensions`, Chrome does not allow text capture. Pasting a claim still works. The extension does not scrape complete conversations, inject ongoing interface controls into ChatGPT/Claude, or depend on their internal page selectors.

## Update an existing installation

Unpacked extensions do not update themselves from our download link. Extract the new ZIP into the same installation folder, replace the old files, then click the reload icon on Second Opinion’s card at `chrome://extensions`. The card should show **1.1.0**. Extension reload clears the current session review. If loading a separate new folder instead, remove the old entry to avoid two copies.

## Build the distributable

From the repository root:

```sh
node scripts/package-extension.mjs
```

This creates `output/chrome-extension/second-opinion-chrome.zip`. To produce a website download instead:

```sh
node scripts/package-extension.mjs --out public/downloads/second-opinion-chrome.zip
```

The package contains a fixed allowlist of extension files. It excludes development tests, credentials, local environment files and application source. This packages an unpacked extension; it does not sign, install, or publish it to the Chrome Web Store. Store publication requires a separate developer account and review and may incur a registration fee. Local demo installation requires no store registration.

## Permissions and boundaries

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporarily read the selected text when the user opens the extension. |
| `scripting` | Execute one short selection-reading function after that user action. |
| `contextMenus` | Offer the selected-text review command. |
| `storage` | Keep the current draft, subject, search status, and results across popup closes; session-only, no persistent conversation history. |
| `https://secondopinion-ten.vercel.app/*` | Call only the deployed Second Opinion evidence API. |

There are no blanket host permissions, automatic content scripts, cookies, conversation observers, remotely hosted scripts, or API tokens. API requests explicitly omit credentials and reject redirects. The popup uses DOM text nodes for returned content and permits only HTTP(S) citation URLs without embedded credentials. Network responses are capped at 256 KiB and searches time out after 24 seconds.

The evidence endpoint is deliberately separate from authenticated, metered policy audits. Do not weaken `/api/audit` authentication or origin checks to support the extension. The extension's evidence search has no paid model call. Its background worker handles requests so opening a source or closing the popup does not erase the search; the next popup restores the current session review. Clear cancels work and removes the review. Browser restart or extension reload clears session data. Its full-screen link imports the claim and subject through a URL fragment; the website should remove that fragment immediately after reading it.

## Check it

```sh
node --test integrations/chrome-extension/tests/extension.test.mjs integrations/chrome-extension/tests/session.test.mjs
```

The tests cover the network contract, omitted credentials, safe citation URLs, bounded inputs and responses, provider failures, the fragment-based full-screen handoff, session restoration, immediate draft saves, cancellation/clear races, and worker interruption recovery. Validate the real extension manually in Chrome before store publication; unit tests do not prove Chrome installation or store approval.

An isolated browser smoke test also loads the actual MV3 extension in installed Edge, uses fictional evidence responses, and checks that opening a selection makes no API call, the explicit search makes exactly one call, untrusted titles cannot create HTML, unsafe source links are withheld, session handoff data is removed, draft/results survive closing, no duplicate search occurs, and Clear removes the draft and results:

```sh
node integrations/chrome-extension/tests/browser-smoke.mjs
```

It creates its own test profile under `output/chrome-extension`; it does not use or change the user's browser profile. Set `EXTENSION_TEST_CHANNEL=chromium` if a Playwright Chromium installation is available. A screenshot is written to `output/chrome-extension/extension-evidence.png`.

For the demo, try: “Antibiotics are effective against viral infections.” Expect research candidates, not an immediate medical verdict. Open the papers and check whether their exact populations and conclusions apply. The popup labels published ratings as the publisher's rating of its reviewed claim rather than automatically transferring that rating onto the user's wording.

A separate opt-in check opens the real toolbar popup in an isolated browser and sends one public test claim to the **live production API**, with no response mocks:

```sh
node integrations/chrome-extension/tests/live-smoke.mjs
```

This live check depends on network access and upstream research indexes. It verifies actual popup loading, source rendering, and restoration on popup document reload. It does not install anything in your personal Chrome profile.

## Official implementation references

- [Chrome activeTab access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): temporary access after a deliberate user gesture.
- [Chrome action API](https://developer.chrome.com/docs/extensions/reference/api/action): popup opening, available to normal extensions on Chrome 127+.
- [Cross-origin requests from extension pages](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): fixed host permission for the evidence service.
- [Manifest V3 remote code restrictions](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code): executable extension code remains bundled locally.

See `integrations/chrome-extension/PRIVACY.md` for the extension's data flow and privacy notice.
