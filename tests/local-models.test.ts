import { describe, expect, it } from "vitest";
import { excerptForModel, LOCAL_MODELS, relationFromLogits, voteSummary, type ModelVote, type Relation } from "../src/lib/screening/local-models";

function vote(model: 0 | 1, label: Relation = "entailment", confidence = 0.9): ModelVote {
  const scores = {entailment: (1 - confidence) / 2, contradiction: (1 - confidence) / 2, neutral: (1 - confidence) / 2};
  scores[label] = confidence;
  return {sourceId: "passage-1", modelId: LOCAL_MODELS[model].id, modelRevision: LOCAL_MODELS[model].revision, label, scores, elapsedMs: 20};
}

describe("local NLI score interpretation", () => {
  it("uses each model's numeric label mapping instead of assuming an order", () => {
    const relation = relationFromLogits([0, 0, 10], {"0": "contradiction", "1": "neutral", "2": "entailment"});
    expect(relation.label).toBe("entailment");
    expect(relation.scores.entailment).toBeGreaterThan(0.999);
    expect(Object.values(relation.scores).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    const otherOrder = relationFromLogits([10, 0, 0], {"0": "ENTAILMENT", "1": "CONTRADICTION", "2": "NEUTRAL"});
    expect(otherOrder.label).toBe("entailment");
  });

  it("uses stable softmax even for extreme logits", () => {
    const relation = relationFromLogits([10000, 10001, 9999], {"0": "entailment", "1": "neutral", "2": "contradiction"});
    expect(relation.label).toBe("neutral");
    expect(Object.values(relation.scores).every(Number.isFinite)).toBe(true);
  });

  it.each([[NaN, 0, 1], [Infinity, 0, 1], [-Infinity, 0, 1], [0, 1], [0, 1, 2, 3]].map((values) => ({values})))("rejects invalid or wrongly sized logits", ({values}) => {
    expect(() => relationFromLogits(values, {"0": "entailment", "1": "neutral", "2": "contradiction"})).toThrow();
  });

  it.each([
    {"0": "LABEL_0", "1": "LABEL_1", "2": "LABEL_2"},
    {"0": "entailment", "1": "neutral"},
    {"0": "entailment", "1": "entailment", "2": "neutral", "3": "contradiction"},
    {"1": "entailment", "2": "neutral", "3": "contradiction"},
  ] as Array<Record<string, string>>)("rejects missing, duplicate or unrecognized numeric labels", (labels) => {
    expect(() => relationFromLogits([1, 0, -1], labels)).toThrow();
  });
});

describe("conservative local-model aggregation", () => {
  it("distinguishes no run, missing model and wrong revision from agreement", () => {
    expect(voteSummary([])).toBe("not-run");
    expect(voteSummary([vote(0)])).toBe("incomplete");
    expect(voteSummary([vote(0), {...vote(1), modelRevision: "unrecognized-revision"}])).toBe("incomplete");
    expect(voteSummary([vote(0), vote(1)])).toBe("supports-passage");
    expect(voteSummary([vote(0, "contradiction"), vote(1, "contradiction")])).toBe("conflicts-passage");
  });

  it("abstains for disagreement, low score, and neutral agreement", () => {
    expect(voteSummary([vote(0), vote(1, "contradiction")])).toBe("disagreement");
    expect(voteSummary([vote(0, "entailment", 0.79), vote(1)])).toBe("unresolved");
    expect(voteSummary([vote(0, "neutral"), vote(1, "neutral")])).toBe("unresolved");
  });

  it("does not hide conflicting duplicate model outputs or mix different passages", () => {
    expect(voteSummary([vote(0), vote(0, "contradiction"), vote(1)])).toBe("incomplete");
    expect(voteSummary([vote(0), {...vote(1), sourceId: "another-passage"}])).toBe("incomplete");
  });

  it.each([NaN, Infinity, -1, 1.1, undefined])("fails closed on invalid model probabilities", (value) => {
    const invalid = vote(0);
    invalid.scores.entailment = value as number;
    expect(voteSummary([invalid, vote(1)])).toBe("incomplete");
  });

  it("rejects probabilities that do not sum to one or disagree with the selected label", () => {
    const invalid = vote(0);
    invalid.scores.neutral = 0.8;
    expect(voteSummary([invalid, vote(1)])).toBe("incomplete");
    const wrongLabel = vote(0, "contradiction");
    wrongLabel.label = "entailment";
    expect(voteSummary([wrongLabel, vote(1)])).toBe("incomplete");
  });
});

describe("explicit passage excerpt limits", () => {
  it("normalizes whitespace and keeps a short passage intact", () => {
    expect(excerptForModel("s1", "  A   small\npassage.  ")).toEqual({sourceId: "s1", text: "A small passage.", shortened: false});
  });

  it("labels an excerpt as shortened when it exceeds the 160-word window", () => {
    const value = excerptForModel("s1", Array.from({length: 161}, (_, i) => `word${i}`).join(" "));
    expect(value.shortened).toBe(true);
    expect(value.text.split(/\s+/)).toHaveLength(160);
    expect(value.text).not.toContain("word160");
  });

  it("also bounds long unbroken text to the worker's 3000-character ceiling", () => {
    const value = excerptForModel("s1", "x".repeat(4000));
    expect(value.text.length).toBeLessThanOrEqual(3000);
    expect(value.shortened).toBe(true);
  });
});
