# Second Opinion research and evaluation

Second Opinion applies evidence-based review to customer-support answers. Its central feature freezes an answer and its claims, removes selected policies, and compares the resulting judgments. The defensible contribution is a practical review workflow with explicit provenance and uncertainty. It is not a newly proven factuality algorithm.

## Research foundations

| Primary source | Relevant finding or method | Consequence for this project |
| --- | --- | --- |
| [FActScore, Min et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.741/) | Evaluates support at the atomic-fact level because a long answer may mix supported and unsupported information. | Extract atomic propositions, preserve qualifications, and report per-claim judgments rather than one reassuring answer score. |
| [RAGTruth, Niu et al., ACL 2024](https://aclanthology.org/2024.acl-long.585/) | Provides manually annotated RAG hallucinations, including word-level annotations. | Evaluate location accuracy and missed claims, not only the labels on claims a model happened to extract. |
| [ALCE, Gao et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398/) | Evaluates generated answers and citation quality. | A citation is a checkable reference, not proof that the answer is correct. Separate quote existence from evidence relevance. |
| [RAGONITE, Roy et al., 2024](https://arxiv.org/html/2412.10571v1) | Removes evidence to compare regenerated answers, addresses redundant evidence through clustering, and repeats generations to account for variability. | Recheck the complete remaining packet, test redundant support, and measure identical-input instability. Our answer stays fixed; the changing object is the auditor's judgment. |
| [Correctness is not Faithfulness in RAG Attributions, 2024](https://arxiv.org/abs/2412.18004) | Distinguishes a plausible/correct citation from evidence that faithfully accounts for generation. | Never describe a post-hoc citation as proof of what caused the original answering model's output. |

The papers motivate the design; their benchmark results are not performance measurements of this application. No accuracy number is inherited from them.

## Innovation factors to demonstrate

**Frozen-claim comparison.** A signed baseline binds the original answer, context, document contents, and canonical claims to the session. A comparison may change source selection, not propositions. This prevents changing the question under evaluation while presenting a verdict change as meaningful.

**Evidence sensitivity with an unchanged-outcome control.** A source can be irrelevant, uniquely supporting, redundant, or conflicting. The interface shows both changes and unchanged verdicts. Removing support can yield insufficient evidence; it does not automatically establish contradiction. An applicable universal rule can establish contradiction when its exception is removed. The result is explicitly hypothetical.

**An inspectable evidence record.** Exact quotations, source content hashes, page references, computed answer spans, remaining passages, and excluded original passages accompany findings. Integrity checks detect invented references and stale inputs; they do not certify semantic correctness.

**Failure and uncertainty stay distinct.** Contradicted, insufficient, and ambiguous are different semantic outcomes. An invalid citation or missing sentence creates an incomplete/unresolved finding. Model failures do not become verdicts. Qualitative evidence descriptions avoid unsupported confidence percentages.

These are product and engineering differentiators. Demonstrating superiority requires evaluation; an industry-first or patent-level novelty claim would need a broader prior-art review.

## Testable hypotheses

1. Explicit conditions and conflict handling reduce false flags on correct policy claims relative to a simple whole-answer audit prompt.
2. Fixed claims and complete-packet reassessment produce the expected transitions when unique, redundant, irrelevant, or conflicting evidence changes.
3. Validation eliminates accepted nonexistent references in the tested fixtures, even when model output is malformed.
4. A reviewer can identify why an answer is unsafe or unsupported and locate the relevant policy without searching the document manually.

The first two hypotheses require live model measurements. The third is covered by deterministic adversarial tests. The fourth requires a timed user study; passing browser tests is not proof of reviewer productivity.

## Evaluation protocol

The fixture definitions are frozen before live evaluation: 12 development claims (3 per category), 24 held-out claims (6 per category), and 8 paired evidence scenarios. Labels and rationales are author-defined synthetic targets, not an independently adjudicated public benchmark.

The held-out domains cover travel reimbursement, subscriptions, warranties, and support policies. Conditions, explicit prohibitions, equivalent units, missing timelines, and same-scope conflicts are represented. Development cases use different domains. The paired set tests unique support, redundant support, removal of all evidence, irrelevant additions, policy conflicts, and an instruction-injection attachment.

For the prompt baseline, use the same Gemini model, source packet, JSON contract, and limits with a short whole-answer audit instruction. This isolates the detailed audit instructions and reviewer workflow; it is not a comparison of different foundation models. The script records model responses before interpreting them.

Record correct/total verdicts by category, false flags on supported claims, human-denominator missed claims, returned claim count, citation existence, latency, and token usage. Exact quotation alignment is conservative: unmatched or multiply matched targets count as incorrect and receive an alignment-review marker. A reviewer must independently check semantic claim coverage and evidence relevance. Do not treat mechanically matched quotations as correct reasoning.

Run three uncached identical-input trials on three cases to observe variability. Report all trials. Do not attribute a changed result solely to evidence removal if repeated unchanged inputs also fluctuate. No probabilistic calibration is claimed.

Do not tune on held-out outputs. Once a held-out case influences a change, relabel it as development material and create a fresh evaluation case before reporting final held-out performance. The small synthetic set supports a bounded demonstration, not a universal accuracy claim.

## Three minute demonstration

The expanded workflow and consent/annotation procedures are in [STUDY-PROTOCOL.md](STUDY-PROTOCOL.md). `evaluation/expanded-cases.ts` now provides 40 synthetic scenarios and 160 **candidate** claims, with 20 development and 20 held-out scenarios across ten categories. These agent-authored labels are not independent human ground truth. The original smaller suites remain separate.

`scripts/prepare-evaluation.ts` creates separate blank reviewer A/B packets, candidate labels, adjudication records and five blank usability records in a hash-named directory. It does not overwrite a completed packet. No participant results are fabricated. `scripts/evaluate.ts` accepts expanded suites, explicit offsets/limits and model-call budgets, recording the selected-case hash and whether the full suite ran.

`evaluation/metrics.ts` distinguishes exact-quote alignment from semantic coverage, calculates per-verdict precision/recall and false support with explicit denominators, reports latency/token usage, and excludes unresolved outputs from apparent stability agreement. Human relevance/condition checks remain explicitly unreviewed. No live accuracy, productivity improvement, or comparison superiority is established yet.

1. Load the fictional refund packet and run a live audit when free quota is available.
2. Inspect a supported claim and the prohibited CVV recommendation.
3. Show that the 48-hour refund promise is insufficiently evidenced, not automatically false.
4. Exclude the premium exception. Keep the claim text unchanged. Inspect the lost shipping support and remaining universal fourteen-day rule.
5. Restore the original report without another call, then show the conflict variant with both incompatible passages.
6. Present actual evaluation counts and one known limitation. If using authored sample results or a recording, label them explicitly.
