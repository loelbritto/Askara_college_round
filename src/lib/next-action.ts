import type { Finding } from "./contracts";

export function nextAction(finding: Finding) {
  if(finding.validation!=="verified" || finding.verdict===null) return {kind:"extraction_failure",title:"Check the original text",description:"A reference or claim location could not be validated. Inspect the original answer and document, then run a fresh check. This is an incomplete finding, not a policy judgment."};
  if(finding.verdict==="supported")return {kind:"review",title:"Confirm applicability",description:"Check that the cited rule applies to this customer and situation. A supporting quotation does not confirm missing customer facts."};
  if(finding.verdict==="contradicted")return {kind:"correction",title:"Correct this statement",description:"Read the contradicting passage and revise the answer to preserve its conditions. Check the revised answer before using it."};
  if(finding.strength==="conflicting" || finding.uncertainty?.reason==="conflicting_policies")return {kind:"conflicting_policies",title:"Resolve the policy conflict",description:finding.uncertainty?.question??"Which policy applies to this case, or explicitly supersedes the other? A newer date alone does not establish precedence."};
  if(finding.uncertainty?.reason==="missing_context")return {kind:"missing_context",title:"Add the missing context",description:finding.uncertainty.question};
  if(finding.verdict==="insufficient")return {kind:"missing_policy",title:"Find support or remove the promise",description:finding.uncertainty?.question??"Does an applicable policy establish this statement? Add the relevant policy if available, or remove the unsupported promise."};
  return {kind:"unclear_interpretation",title:"Clarify the rule",description:finding.uncertainty?.question??"Confirm the rule's meaning and scope with the policy owner before using this statement."};
}
