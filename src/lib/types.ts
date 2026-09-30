export type Rule = "starts" | "contains";

export interface Question {
  id: string;
  letter: string;
  rule: Rule;
  question: string;
  answer: string;
  alternates: string[];
}

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function ruleLabel(letter: string, rule: Rule) {
  return rule === "starts" ? `${letter} ile başlar` : `İçinde ${letter} geçer`;
}
