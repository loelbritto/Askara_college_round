# Free evidence discovery: implementation and research basis

Reviewed 11 October 2026. This feature locates candidate sources for a claim. It does **not** implement a trained scientific verifier, issue a truth score, or claim research-level accuracy. It makes no paid language-model call and needs no model API key for its default research search.

## What is implemented

`POST /api/screen` accepts one English-first claim, a subject choice, explicit `discover: true`, and up to three optional passages. The service chooses research indexes with a transparent keyword heuristic; a person's subject choice overrides that heuristic. The original claim is kept in the result. Search terms may omit function words and negation to retrieve literature on the topic; that transformed query is never treated as the claim being evaluated.

| Source | Default use | Returned material | Limits and interpretation |
| --- | --- | --- | --- |
| Crossref | All subjects; no key | Up to four journal-article metadata records, DOI links, available abstracts | A DOI identifies a record. Indexing and relevance ranking do not certify its findings, quality, or relevance to the exact claim. |
| Europe PMC | Health and science; no key | Up to four publication records and available abstracts | Biomedical/life-science coverage is not comprehensive coverage of all science. Abstracts can omit critical methods and limitations. |
| Google Fact Check Tools | Optional `FACT_CHECK_API_KEY` | Up to three indexed claim reviews and their publishers' textual ratings | Disabled without a key. Reviews can concern a different claim/context. Quota and account terms must be checked by the operator; default operation does not depend on this service. |
| Supplied passages | Optional | The user's exact excerpt, title, and optional link | Labeled unverified; not sent to search providers; links are never fetched. |

DOI duplicates are merged case-insensitively, preferring Europe PMC's abstract when both indexes return the same paper. Provenance, dates, and missing-provider states remain visible. A failed provider does not turn the remaining sources into a verdict. Empty results mean that this search found no matches, not that the claim is false. Published fact-check ratings remain attributed to their original publishers. The original text of a fact-checked claim is stored separately as `reviewedClaim`; it is not an evidence abstract and must never be used as a passage supporting itself in NLI.

Crossref explicitly provides a public REST API without registration. Its public pool has a one-request concurrency limit; the implementation avoids simultaneous Crossref requests inside one running instance. Europe PMC documents JSON search and the `core` result type for fuller metadata. These are primary technical references: [Crossref access and authentication](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/), [Crossref request guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/), [Europe PMC REST service](https://europepmc.org/RestfulWebService), [Google claims search](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search), and [Google claim review fields](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims). Google's optional API key is passed in the documented `X-Goog-Api-Key` header, not placed in the query URL: [Google API system parameters](https://docs.cloud.google.com/apis/docs/system-parameters).

## Research that informs the design

**FEVER** separates evidence retrieval from claim classification and includes a not-enough-information outcome. We preserve that separation by stopping the free service at candidate retrieval. Success must be measured with relevant evidence, not just a plausible label. FEVER's Wikipedia-derived benchmark does not establish performance on today's web or business policies. [Thorne et al., NAACL 2018](https://aclanthology.org/N18-1074/).

**SciFact** frames scientific verification as finding abstracts, deciding whether they support or refute a claim, and identifying the rationale. Its key lesson for this product is that locating a paper is only the first step. This implementation does not run the paper's verification model or reproduce its benchmark results. A claim about treatment efficacy still needs domain-aware scrutiny of population, dose, intervention, and outcome. [Wadden et al., EMNLP 2020](https://aclanthology.org/2020.emnlp-main.609/).

**FActScore** evaluates long-form factuality through smaller atomic facts supported by a knowledge source. This motivates asking people to screen one specific assertion at a time. We do not report a FActScore, label an arbitrary keyword count as factual accuracy, or reuse the paper's results as evidence for our implementation. [Min et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.741/).

**ALCE** evaluates generated answers on fluency, correctness, and citation quality separately. A displayed citation therefore cannot be treated as proof of correctness. Our candidate list preserves source links and excerpts for inspection, but citation relevance and completeness have not been benchmarked. [Gao et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398/).

The defensible innovation is the workflow: quick subject routing, several independent source channels, visible uncertainty and outages, user-supplied context, and an inspectable evidence record. None of these makes the system scientifically novel on its own. A signed record, when configured, can reveal later modification; it cannot prevent copying or prove that a source or claim is true.

## Privacy and operational boundaries

- Pressing discovery explicitly sends the claim/search terms to the selected public indexes. Do not put confidential or identifying information into a public search claim. Attached passage text stays out of upstream requests.
- The route does not require cookies, pilot access, or cloud accounts. CORS permits the configured site and syntactically valid Chrome extension origins; server clients can call this intentionally public endpoint without an Origin header. CORS is not authentication.
- Only fixed HTTPS API endpoints are fetched. Redirects are rejected. Each upstream response is limited to 512 KiB and seven seconds. At most 14 sources are returned, with bounded plain-text metadata. No arbitrary page scraping, recursive browsing, or paid-provider fallback occurs.
- Request bodies are limited to 48 KiB. The schema caps claims at 800 characters and attached passages at three × 3,000 characters. Logs do not contain raw claims, passage text, API keys, or upstream response bodies.
- Rate limits are best effort per running instance: six requests per client per minute and 30 globally per minute for `/api/screen`. Serverless replicas do not share a limiter. Larger/public launches need a shared limiter and a Crossref egress queue before claiming reliable abuse prevention or availability.
- A free public API can rate-limit or become unavailable; no service-level guarantee is implied. Hosting/bandwidth limits still belong to the hosting account. Optional Google configuration must be reviewed against that account's quota terms.

## Validation and next evaluation

A bounded live check made one credential-free request to each default upstream on 11 October 2026. Both returned HTTP 200 and one publication record; Europe PMC returned an abstract, while the selected Crossref record had none. This verifies reachability and payload compatibility only. The returned papers were not evaluated or endorsed.

Mock tests cover explicit consent, schema bounds, fixed destinations, omission of supplied passage text from search requests, DOI deduplication, partial outages, malformed/oversized responses, cancellation, attributed optional ratings, CORS, body limits, and instance-local rate limiting. Before claiming retrieval quality, label a diverse claim set with independent reviewers, measure relevant-source recall at 4/8, record missing-evidence and irrelevant-source rates, and break results down by subject. Include contradictory findings, outdated studies, and claims requiring nonacademic evidence. A later verifier needs a separate held-out evaluation of evidence entailment and calibrated abstention; retrieval success is not verification accuracy.
