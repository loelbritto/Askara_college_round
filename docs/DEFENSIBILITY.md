# Defensibility without a copyproof promise

No implementation can make the product impossible for another company or person to reproduce. This repository is visible to anyone with repository access, and the selected research APIs and model weights are public. An API gateway, blockchain, hidden prompt, obfuscation, or model ensemble would not change that. We do not claim exclusive science, patent novelty, perfect factuality, or uncopyable software.

## Implemented protections and distinctions

- **Server-issued evidence receipts.** Research records are canonicalized, SHA-256 hashed, and signed with HMAC-SHA256 using a private server secret and an evidence-specific signing namespace. The existing session secret is never sent to the extension, browser, or MCP caller. `/api/screen/verify` checks the entire record, signature and 30-day expiry. Mutation of claim, source passage, URL, search status, order or receipt fields fails verification. Without a configured secret, no signature is claimed. Key rotation invalidates old receipts.
- **Honest signing boundary.** Signing establishes that this service issued these exact bytes while its key was uncompromised. It is not an independent timestamp, a portable public-key signature, a permanent registry, proof of source authenticity, or a truth certificate. Locally supplied passages, browser model output, and reviewer notes are outside the signed server record. Anyone can submit arbitrary public claims and supplied passages, so an issued receipt is not an endorsement.
- **Inspectability.** Retrieval source, DOI/link, date when present, lookup time, incomplete provider status and exact text remain visible. Fact-check publishers' reviewed claims are separate from evidence passages so a false claim cannot entail itself.
- **Reproducible model configuration.** Two different NLI architectures, full model revisions, exact shortened passages, per-model labels, incomplete runs and disagreement are visible/exportable. Shared training data means the models' mistakes can be correlated. Softmax outputs and the conservative display rule are not calibrated truth probabilities.
- **Review ownership.** Reviewer reasoning is saved only when explicitly exported; it is never silently treated as ground truth or harvested into training data. Original policy audits retain their separate fixed-claim comparison and signed baseline protections.
- **Service boundaries.** Public evidence tools cannot call paid model adapters, read private workspaces, accept arbitrary fetch destinations or carry account cookies. Request/result limits, timeouts, explicit search consent, strict origin handling and best-effort instance-local rate controls reduce misuse. These controls do not constitute a distributed quota guarantee.

## What could become hard to reproduce

The defensible asset would be a permissioned, independently adjudicated domain dataset with documented provenance and repeated, reproducible evaluation; trusted integrations into real review workflows; and a useful history of decisions and corrections. That asset does not exist merely because code was written. Build it with consent, separate development and held-out cases, and compare against published baselines before claiming superiority.

1. Evaluate retrieval relevance and missed evidence across each supported domain, including newer contradictory evidence and retractions.
2. Obtain two independent reviewers and adjudicate disagreements. Preserve dissent and evidence snapshots where redistribution is permitted.
3. Evaluate each model separately, then the combined abstention rule: false support, false conflict, coverage, subgroup/domain shifts and latency. Do not tune on held-out cases.
4. Add durable, authenticated review storage and distributed abuse limits when an actually free service/account is available. Do not pretend memory-only throttling or local exports provide this already.
5. Seek distribution, reviewer trust and quality improvements. These can create a practical advantage; none can guarantee competitors will never reproduce the system.

Research foundations and primary references are in [SCREENING-RESEARCH.md](SCREENING-RESEARCH.md) and [RESEARCH.md](RESEARCH.md). They motivate the design; no paper's benchmark score is presented as our measured accuracy.
