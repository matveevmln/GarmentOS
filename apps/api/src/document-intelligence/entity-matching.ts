import type { EntityMatchCandidateDto } from "@garmentos/shared-types";

// Сопоставление "название из документа -> уже существующая карточка" —
// предложение, не выбор (P6.4/P6.5). Тот же принцип, что и
// findSimilarProductNames (packages/domain/catalog) — простое сравнение
// подстрок в обе стороны, без отдельного generic-фреймворка нечёткого
// поиска: масштаб компании на пилоте тот же, что и у каталога моделей.
const DEFAULT_LIMIT = 3;

export function findEntityMatches(
  candidates: Array<{ id: string; name: string }>,
  query: string,
  limit = DEFAULT_LIMIT,
): EntityMatchCandidateDto[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const matches: EntityMatchCandidateDto[] = [];
  for (const candidate of candidates) {
    const normalizedName = candidate.name.trim().toLowerCase();
    if (normalizedName === normalizedQuery) {
      matches.push({ id: candidate.id, name: candidate.name, kind: "exact" });
    } else if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
      matches.push({ id: candidate.id, name: candidate.name, kind: "similar" });
    }
  }

  // Точные совпадения — первыми: если карточка с таким именем уже есть,
  // оператору её и нужно увидеть первой, а не где-то среди похожих.
  matches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "exact" ? -1 : 1));
  return matches.slice(0, limit);
}
