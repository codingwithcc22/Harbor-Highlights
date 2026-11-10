import { z } from "zod";
import { CITY_DISH } from "../city";

export const MIN_CONFIDENCE = 0.7;

export const DishVerdict = z.object({
  isMatch: z.boolean().describe("Whether the photo clearly shows Maryland crab cakes."),
  confidence: z.number().min(0).max(1).describe("Confidence in this assessment, from 0 to 1."),
  whatISee: z.string().trim().min(1).max(240).describe("One short sentence describing the visible image."),
});

export type DishVerdict = z.infer<typeof DishVerdict>;

// Keep the approval rule in code, not just in the model's instructions.
export function decideVerdict(input: DishVerdict) {
  const verdict = DishVerdict.parse(input);
  if (verdict.isMatch && verdict.confidence >= MIN_CONFIDENCE) {
    return {
      approved: true as const,
      verdict,
      note: `Inspector: looks like ${CITY_DISH.shortName} (${Math.round(verdict.confidence * 100)}% sure)`,
      error: null,
      reason: null,
    };
  }

  return {
    approved: false as const,
    verdict,
    note: null,
    error: "Only crab cake photos can be uploaded!",
    reason: `The inspector saw: ${verdict.whatISee}`,
  };
}
