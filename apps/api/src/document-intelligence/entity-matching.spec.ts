import { describe, expect, it } from "vitest";
import { findEntityMatches } from "./entity-matching";

const CANDIDATES = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Плащевка" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Плащевка 210T" },
  { id: "33333333-3333-3333-3333-333333333333", name: "Подклад" },
];

describe("findEntityMatches", () => {
  it("точное совпадение названия (без учёта регистра) — kind exact, первым в списке", () => {
    const matches = findEntityMatches(CANDIDATES, "плащевка");

    expect(matches[0]).toEqual({ id: CANDIDATES[0].id, name: "Плащевка", kind: "exact" });
  });

  it("частичное совпадение подстроки — kind similar, не автоматически выбирается", () => {
    const matches = findEntityMatches(CANDIDATES, "Плащ");

    expect(matches.map((m) => m.id)).toEqual(expect.arrayContaining([CANDIDATES[0].id, CANDIDATES[1].id]));
    expect(matches.every((m) => m.kind === "exact" || m.kind === "similar")).toBe(true);
    expect(matches.find((m) => m.id === CANDIDATES[1].id)?.kind).toBe("similar");
  });

  it("нет совпадений — пустой массив (это тоже валидный результат: «создать новый материал»)", () => {
    const matches = findEntityMatches(CANDIDATES, "Стеганое полотно");

    expect(matches).toEqual([]);
  });

  it("ограничивает число предложений лимитом", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}`, name: `Ткань ${i}` }));

    const matches = findEntityMatches(many, "Ткань", 2);

    expect(matches).toHaveLength(2);
  });

  it("пустой запрос — пустой результат", () => {
    expect(findEntityMatches(CANDIDATES, "   ")).toEqual([]);
  });
});
