import type { HistoryAnswer, QuestionnaireItemDef } from "@/ehr";

// The agent sends every answer as the patient's words; the Questionnaire types some items. Convert
// when the words are clear and keep the words as a string when they are not: a fuzzy parse must
// never turn what the patient said into a different clinical fact.
export function coerceAnswer(item: QuestionnaireItemDef, text: string): HistoryAnswer["value"] {
  const words = text.trim();
  if (item.type === "integer") {
    const digits = words.match(/\d+/);
    if (digits) return Number(digits[0]);
    if (/^(no|nada|ning[uú]n[ao]?|cero|sin)\b/i.test(words)) return 0;
  }
  if (item.type === "boolean") {
    if (/^(s[ií]|claro|correcto|afirmativo|as[ií] es)\b/i.test(words)) return true;
    if (/^(no|nada|ning[uú]n[ao]?|negativo)\b/i.test(words)) return false;
  }
  return words;
}

// Answered means non-blank: "no sabe" counts, an empty string does not. Numbers and booleans always count.
export const isAnswered = (a: HistoryAnswer) => typeof a.value !== "string" || a.value.trim() !== "";

export function missingRequired(items: QuestionnaireItemDef[], answers: HistoryAnswer[]): QuestionnaireItemDef[] {
  const have = new Set(answers.filter(isAnswered).map((a) => a.linkId));
  return items.filter((i) => i.required && !have.has(i.linkId));
}
