export type Rule = "starts" | "contains";
export type Category = "euroleague" | "general";

export interface Question {
  id: string;
  letter: string;
  rule: Rule;
  category: Category;
  question: string;
  answer: string;
  alternates: string[];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  euroleague: "EuroLeague",
  general: "Genel basketbol",
};

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function ruleLabel(letter: string, rule: Rule) {
  return rule === "starts" ? `${letter} ile başlar` : `İçinde ${letter} geçer`;
}
