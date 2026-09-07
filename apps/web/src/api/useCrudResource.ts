import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./client";

// Общий паттерн "список + создание" для CRUD-экранов Итерации 11 — не
// подключаем React Query на 2 пользователях без доказанной необходимости
// (docs/PRINCIPLES.md, принцип 3): состояние обновляется вручную после
// каждой мутации, без фонового кэша/инвалидации.
export function useCrudResource<TItem, TCreateInput>(listPath: string) {
  const [items, setItems] = useState<TItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<TItem[]>(listPath);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    } finally {
      setIsLoading(false);
    }
  }, [listPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: TCreateInput): Promise<TItem> => {
      const created = await apiRequest<TItem>(listPath, { method: "POST", body: input });
      setItems((prev) => [...prev, created]);
      return created;
    },
    [listPath],
  );

  return { items, isLoading, error, reload, create };
}
