# Human evaluation and demo protocol

This protocol implements the human gates in [the approved roadmap](ROADMAP-SCOPE.md). No participants, independent labels, completion times, or accuracy measurements have been collected yet. Agent-written examples are candidate material, not human evidence.

## Prepare the independent annotation packet

Run `node node_modules/tsx/dist/cli.mjs scripts/prepare-evaluation.ts` with Node 24. The script writes two separate blank reviewer packets, a separately stored candidate-label file, an adjudication template, and five blank usability observation records under ignored `evaluation-results/annotation-packet/`. Keep the candidate-label file away from reviewers until they finish independently.

Both real human reviewers inspect every answer and source. They may split, reject, or add candidate claims. They record each verdict, exact supporting/contradicting passages, preserved conditions, and rationale. Neither reviewer sees the other's answers. An adjudicator records disagreements and the final decision. Preserve the packet hash with all results. Any material policy/answer change requires a new packet and review. Do not change held-out labels simply to fit the model's output.

## Five unfamiliar users

Ask for consent to take anonymous task notes. Participation is voluntary; no names, contact details, screen recording, real customer information, or sensitive documents are required. Use only the fictional example packet. A participant must not have helped build the interface or received a walkthrough beforehand.

Read this task without pointing at controls:

> You are reviewing a draft customer-support answer. Use this website to check the example answer against its policies. Find a promise that the policies do not establish, open evidence for another statement, and tell me what you would change before sending the answer.

Start timing when the landing page is visible. Record the first chosen action, time to first action, whether the task completed unaided, time to completion, hesitation points, errors, and any assistance. Ask the participant to explain why an absent refund deadline is insufficient evidence rather than proof of falsity. Record the explanation without coaching. Stop if the participant wishes or after ten minutes; record incomplete rather than inventing a completion time.

The initial formative target is four out of five completing unaided and explaining the distinction. Report actual counts and observations. Five people do not establish general productivity or statistical superiority. Fix recurring observed problems, then recruit fresh participants for a follow-up rather than measuring familiar users as first-time users.

## Timed manual-versus-assisted review

Use two different, comparable synthetic policy packets, allocated in counterbalanced order across participants. One task uses source text alone; the other uses Second Opinion. Have independent evaluators score detected mistakes, false flags, conditions preserved, and final-answer correctness. Record task time and assistance. Do not show the same case twice to the same participant, and do not merge model accuracy with UI productivity. Report sample size and limitations.

## Three-minute demonstration

1. Explain the customer-support problem in one sentence and disclose whether this is a live run or authored sample.
2. Open the filled-in example and complete policies → answer → results.
3. Show one supported claim and its exact quotation. Open its policy conditions and point out the membership/receipt requirements.
4. Show the prohibited CVV recommendation and unsupported 48-hour promise. Explain why the two judgments differ.
5. Exclude the premium exception and compare the unchanged claims. Explain that this is a hypothetical evidence assessment.
6. If live access is verified, restore the packet, inspect a correction, and request a separate audit. Show the preserved original and the new report. If live access is unavailable, show the draft and clearly state that it has not been rechecked.
7. Present actual evaluation counts, observed latency, one genuine failure, and the remaining boundary. No paper's benchmark result is an application accuracy score.

## Live evaluation evidence

Use a verified unpaid Gemini project and explicit call budgets. Run development first; fix observed failures there. Run untouched held-out, paired and repeated-input suites afterward. Preserve incomplete runs, quotas and malformed outputs. Record source/case hash, prompt version, model, request usage and elapsed time. Manually inspect semantic citation relevance, missing claims and condition preservation. Report simple-prompt and application results separately. Do not tune on a held-out case while continuing to call it held-out.
