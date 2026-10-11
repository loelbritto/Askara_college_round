# Second Opinion extension privacy

The extension reads only the text you select after you open it or use its context menu. It does not read your full conversation, watch page changes, access cookies, collect browsing history, or store an API key.

A context-menu selection is kept in Chrome's session storage for the handoff into the review popup. It is removed when the popup reads it. Your current draft, subject, search status and results stay in Chrome's session storage so closing the popup does not lose your work. The extension's background worker continues a started search while the popup is closed. This is one current review, not a conversation history. The Clear button removes the current draft, results and pending handoff. Chrome clears session storage on browser restart, extension reload, disable or update.

**Find evidence** explicitly sends your edited claim and chosen subject to `https://secondopinion-ten.vercel.app/api/screen`. Second Opinion sends the search terms to its evidence providers. Do not enter private information. No account cookies are sent. Evidence providers may have their own access logging and privacy policies. The deployed service's provider status identifies which services were queried and whether they succeeded.

**Open full screen** places the claim and subject in a URL fragment for the Second Opinion website to import. A URL fragment is not part of the HTTP request, but the website's client code can read it and the browser may keep it in local navigation history until it is removed. This action does not itself search for evidence. The website has separate explicit actions for evidence discovery and model downloads.

Paper links and published fact-checks are candidates for review, not automatic proof that your claim is true or false. A publisher's rating applies to the claim that publisher actually reviewed.

No analytics, advertising, tracking pixels, third-party executable scripts, or monetization code are included in this extension. The extension is a locally installable build; it has not been published in the Chrome Web Store.
