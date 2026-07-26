import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "@garmentos/domain-document";

// Fallback-реализация StorageAdapter для окружений без настроенного S3/MinIO
// (тот же принцип, что LoggingTelegramClient/RuleBasedAIClassifier — код
// собран заранее под реальный адаптер, локальный диск подключается только
// пока S3_ENDPOINT не настроен). Не для продакшена — там S3StorageAdapter
// (docs/INFRASTRUCTURE.md, cloud-agnostic объектное хранилище за адаптером).
export class LocalFileStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  async upload(key: string, data: Uint8Array, _contentType: string): Promise<{ url: string }> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { url: `file://${filePath}` };
  }
}
