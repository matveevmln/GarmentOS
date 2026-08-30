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

  async upload(key: string, data: Uint8Array, _contentType: string): Promise<{ url: string }> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
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
      return { data: new Uint8Array(data), contentType: "application/pdf" };
    } catch {
      return null;
    }
  }
}
