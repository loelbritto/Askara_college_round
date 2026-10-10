# Second Opinion design

The current design prioritizes a clear first review. A new visitor should understand the required inputs and the next action without learning the dashboard or choosing between six pages.

## Entry and guidance

The homepage restores the cinematic headline “Confidence is easy. Proof is different.” Gradient typography and layered policy cards establish the visual identity, while a plain-language description explains what to provide and what the review returns. One prominent **Try with an example** action starts a filled-in walkthrough; **I have my own documents** starts an empty review. Returning visitors can continue their existing draft.

The page progresses from the hero to three starting steps, an interactive evidence story, four verdict explanations, optional examples and learning pages, and a final guided-example action. The starting steps appear before the longer product story so visitors can understand the process without exploring every section. The story illustrates how claims, citations, and source selection relate; its sample labels distinguish the illustration from a live audit.

Primary navigation contains **Start here**, **Examples**, and **How it works**, plus the review action. The evidence lab remains accessible from the footer and example library. Research, presentation, and other secondary features are available when relevant to the user's task.

## Three-step review

1. **Add policies:** explains what a policy means, provides upload and paste actions, lists selected documents, and allows text inspection. The next button is enabled when at least one policy is selected.
2. **Add the answer:** shows a single labelled text area. The original question is optional. Example text is explicitly read-only; custom answers are editable.
3. **Check & review:** summarizes the selected documents and answer. Back and change controls preserve input. Live-service unavailability is explained before submission, with an explicit option to try the example without silently replacing the draft.

Step changes focus the current heading. Progress survives client navigation in memory. Refresh and explicit reset remove it. The setup view does not display empty results, comparisons, notes, or evidence panels.

## Results and supporting pages

A result guide counts statements needing attention and offers **Review first issue**. It selects the first non-supported or unresolved finding and brings its evidence into view; on mobile it opens the evidence tab. Existing verdict filters, exact citations, comparisons, annotations, presentation controls, and exports remain available.

The example library also offers the guided start before its three scenario cards. The evidence lab explains four authored verdict challenges. The method page separates code validation, model assessment, and human judgment. Presentation uses the current report and citations rather than separate demonstration data.

## Visuals, access, and cost

The near-black canvas, blue accents, and locally hosted Inter identity are retained. Inputs and next actions receive larger text and more space. The landing story supports scrolling on tall desktop screens and direct chapter buttons; mobile, short laptop, and reduced-motion layouts use normal document flow. The active three-step setup has no scroll-driven controls. Mobile, short laptop, keyboard, and reduced-motion paths are tested.

Automated axe checks cover the start page, setup, example library, evidence lab, method page, presentation, workspace, and editor. These checks do not establish complete accessibility conformance or replace testing with real first-time users.

No paid service, new dependency, tracking script, or external image was added. Existing Lucide icons and authored HTML/CSS supply the visuals. The font's SIL Open Font License remains in `public/fonts/OFL-Inter.txt`.

## Current visual records

- [Desktop landing page](../artifacts/landing-desktop.png)
- [Mobile landing page](../artifacts/landing-mobile.png)
- [Interactive evidence story](../artifacts/evidence-story.png)
- [Guided policies step](../artifacts/guided-policies.png)
- [Mobile review step](../artifacts/guided-mobile.png)
- [Example library](../artifacts/examples-desktop.png)
- [Results workspace](../artifacts/sample-workspace.png)
- [Presentation](../artifacts/presentation-desktop.png)

See [release status](RELEASE.md) for live-service and deployment verification.
