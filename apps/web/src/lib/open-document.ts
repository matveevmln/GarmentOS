import { apiDownload, ApiError } from "../api/client";
import { toast } from "../design-system/Toast/Toast";

// Открыть сгенерированный/загруженный документ в новой вкладке
// (владелец проекта, 2026-09-22, вынесено в общее место) — раньше три
// независимые копии этой же логики жили в BatchPassportPage.tsx,
// SpecificationDetailPage.tsx и DocumentsPage.tsx. Поведение не изменено:
// скачивает файл через тот же GET /documents/:id/file, открывает blob-URL
// в новой вкладке, отзывает его через 30с, ошибку показывает тостом сам
// (вызывающая сторона не должна дублировать catch).
export async function openDocumentFile(docId: string, title: string): Promise<void> {
  try {
    const blob = await apiDownload(`/documents/${docId}/file`);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : `Не удалось открыть «${title}»`);
  }
}
