// Разделение списка документов на «актуальные» и «предыдущие редакции»
// (владелец проекта, 2026-09-22, вынесено в общее место). Единственный
// корректный признак — doc.isCurrentVersion, который сервер гасит только
// среди документов ОДНОГО docType (DocumentService фильтрует
// supersedesDocumentIds по своему типу перед генерацией новой версии) — у
// заказа может быть одновременно текущая спецификация И текущий акт, оба
// isCurrentVersion=true, и оба должны показываться как "Актуальная".
//
// "Первый по дате" — неверный признак: он был использован в паспорте
// партии до аудита 2026-09-21 и признан ошибочным (при появлении второго
// типа документа рядом с первым один из двух текущих документов ошибочно
// помечался бы "Предыдущая редакция"), затем независимо обнаружен ещё раз
// в DocumentsPage.tsx, которая не была обновлена вместе с паспортом.

export interface VersionedDocument {
  isCurrentVersion: boolean;
  createdAt: string | Date;
}

export interface SplitDocumentVersions<T extends VersionedDocument> {
  /** Все документы с isCurrentVersion=true, среди них может быть несколько
   *  разных docType одновременно — это не ошибка. */
  current: T[];
  /** Документы, помеченные неактуальными (супсеснуты более новой версией
   *  того же docType). */
  previous: T[];
}

export function splitDocumentVersions<T extends VersionedDocument>(documents: T[]): SplitDocumentVersions<T> {
  const sorted = [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    current: sorted.filter((doc) => doc.isCurrentVersion),
    previous: sorted.filter((doc) => !doc.isCurrentVersion),
  };
}
