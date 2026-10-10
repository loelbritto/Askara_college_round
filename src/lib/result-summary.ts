import type { Report } from "./contracts";

export function resultSummary(report: Report) {
  const issues = report.findings.filter(f => f.verdict !== "supported" || f.validation !== "verified");
  const incomplete = !report.complete || report.warnings.length > 0 || !report.findings.length || report.findings.some(f => f.validation !== "verified" || !f.verdict);
  if (incomplete) return {
    attention: true,
    title: report.findings.length ? "This review is incomplete." : "No statements could be checked.",
    description: report.findings.length
      ? "Some statements or evidence could not be verified. Read the warnings and review the original answer before relying on any findings."
      : "No checkable claims were returned. Review the original answer manually, or edit the input and run a new check.",
    action: "Review available findings", selectedId: issues[0]?.id ?? report.findings[0]?.id ?? null,
  };
  return {
    attention: issues.length > 0,
    title: issues.length ? `${issues.length} of ${report.findings.length} statements need your attention.` : "Every checked statement has supporting evidence.",
    description: issues.length
      ? "Start with an issue below. Read why it was flagged, then open the policy passage to decide what to change."
      : "Select a statement to read its supporting policy text. A supported result still needs your judgment.",
    action: issues.length ? "Review first issue" : "Review the evidence",
    selectedId: issues[0]?.id ?? report.findings[0]?.id ?? null,
  };
}
