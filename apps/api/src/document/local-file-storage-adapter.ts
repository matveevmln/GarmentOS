import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageAdapter, StoredFile } from "@garmentos/domain-document";

// Fallback-реализация StorageAdapter для окружений без настроенного S3/MinIO
// (тот же принцип, что LoggingTelegramClient/RuleBasedAIClassifier — код
// собран заранее под реальный адаптер, локальный диск подключается только
// пока S3_ENDPOINT не настроен). Не для продакшена — там S3StorageAdapter
// (docs/INFRASTRUCTURE.md, cloud-agnostic объектное хранилище за адаптером).
export class LocalFileStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  // Каталог приводится к абсолютному пути: адреса файлов абсолютные, и
  // проверка «файл лежит внутри нашего каталога» на относительном значении
  // (`./.local-storage`) не срабатывала бы никогда.
  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  // contentType хранится рядом, в sidecar-файле "<key>.meta.json" — раньше
  // download() всегда возвращал жёстко "application/pdf" (единственное, что
  // когда-либо загружалось до фото модели, Этап 2 — «Паспорт модели»).
  // Загруженное фото (image/jpeg и т.п.) отдавалось бы браузеру под чужим
  // MIME-типом — найдено e2e-тестом при добавлении docType=photo_product.
  private metaPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async upload(key: string, data: Uint8Array, contentType: string): Promise<{ url: string }> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    await writeFile(this.metaPath(filePath), JSON.stringify({ contentType }));
    return { url: `file://${filePath}` };
  }

  async download(fileUrl: string): Promise<StoredFile | null> {
    if (!fileUrl.startsWith("file://")) return null;
    const filePath = fileUrl.slice("file://".length);
    // Чужие адреса (например, оставшиеся от прежнего S3-хранилища) не
    // читаются с диска — вызывающая сторона получит null и ответит 404,
    // вместо попытки открыть произвольный путь файловой системы.
    if (!filePath.startsWith(this.baseDir)) return null;
    try {
      const data = await readFile(filePath);
      // Файлы, загруженные до появления sidecar-метаданных, остаются PDF —
      // единственным типом, существовавшим до этого изменения.
      let contentType = "application/pdf";
      try {
        const meta = JSON.parse(await readFile(this.metaPath(filePath), "utf-8")) as { contentType?: string };
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        // sidecar отсутствует — старый файл, оставляем запасной PDF.
      }
      return { data: new Uint8Array(data), contentType };
    } catch {
      return null;
    }
  }
}
