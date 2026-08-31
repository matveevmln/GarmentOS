-- Уникальность (модель, размер, цвет) на уровне базы (владелец проекта,
-- 2026-08-30). До сих пор инвариант жил только в коде
-- (create-product-variant.ts, findByProductSizeColor), а в базе был лишь
-- глобально уникальный sku_code. Массовое создание вариантов «размеры ×
-- цвета» на этапе 5 повышает шанс дублей, поэтому проверка переносится туда,
-- где её нельзя обойти.
--
-- Дубли НЕ удаляются и НЕ чинятся автоматически: миграция останавливается и
-- называет конкретные строки, разбирать их — решение человека.
DO $$
DECLARE
  dup record;
  msg text := '';
BEGIN
  FOR dup IN
    SELECT product_id, size, color, count(*) AS c
    FROM product_variants
    GROUP BY product_id, size, color
    HAVING count(*) > 1
  LOOP
    msg := msg || format('модель %s: размер "%s", цвет "%s" — %s строк; ',
                         dup.product_id, dup.size, dup.color, dup.c);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION
      'Нельзя добавить уникальность (модель, размер, цвет) — сначала разберите дубли: %', msg;
  END IF;
END $$;
--> statement-breakpoint
-- Индекс полный, а не частичный по deleted_at IS NULL: действующая проверка в
-- коде (findByProductSizeColor) удалённые не фильтрует, то есть уже сегодня
-- считает мягко удалённый вариант занимающим сочетание. Частичный индекс был
-- бы мягче кода и создал бы расхождение между базой и приложением.
CREATE UNIQUE INDEX "product_variants_product_size_color_idx"
  ON "product_variants" USING btree ("product_id","size","color");
