// Артикул модели больше не вводится пользователем (владелец проекта,
// 2026-09-21 — «скрыть артикул, он никому не нужен»): products.code
// остаётся NOT NULL UNIQUE в БД (products_company_code_idx), но заполняется
// автоматически из названия — та же логика "Zero Input", что уже применена
// к раскладке размеров и созданию вариантов по цвету. Не идеальная
// транслитерация, а достаточная для уникального читаемого технического
// идентификатора, который пользователь никогда не увидит.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("");
}

export function generateProductCode(name: string): string {
  const slug = transliterate(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return slug ? `${slug}-${suffix}` : suffix;
}

// Инициалы для карточки модели без фото (замена прежнему codePrefix из
// артикула — артикул больше не несёт смысла для пользователя, название
// несёт). Берёт первые буквы первых двух слов названия, максимум 2 буквы.
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return initials.join("") || "?";
}
