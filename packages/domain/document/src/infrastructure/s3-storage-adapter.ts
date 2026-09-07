import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter, StoredFile } from "../application/ports";

export interface S3StorageAdapterConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  // MinIO (docs/INFRASTRUCTURE.md, раздел 3) отдаёт объекты по адресу
  // отличному от endpoint, если он не выставлен наружу напрямую — публичный
  // базовый URL для чтения задаётся отдельно от endpoint записи.
  publicBaseUrl: string;
  forcePathStyle?: boolean;
}

// S3-совместимое хранилище за интерфейсом (docs/INFRASTRUCTURE.md, раздел 2.3)
// — MinIO на старте (infra/docker-compose.yml), любой S3-совместимый провайдер
// без изменений в домене при росте.
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageAdapterConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(key: string, data: Uint8Array, contentType: string): Promise<{ url: string }> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    return { url: `${this.config.publicBaseUrl.replace(/\/$/, "")}/${this.config.bucket}/${key}` };
  }

  async download(fileUrl: string): Promise<StoredFile | null> {
    const key = this.toKey(fileUrl);
    if (key === null) return null;
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return { data: bytes, contentType: response.ContentType ?? "application/octet-stream" };
    } catch (error) {
      // Файла нет в бакете — не ошибка приложения, а отсутствие объекта:
      // вызывающая сторона отвечает 404, а не 500.
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  // Адрес, выданный upload(): <publicBaseUrl>/<bucket>/<key>. Формат знает
  // только адаптер — документ хранит непрозрачную строку и не разбирает её.
  private toKey(fileUrl: string): string | null {
    const prefix = `${this.config.publicBaseUrl.replace(/\/$/, "")}/${this.config.bucket}/`;
    if (!fileUrl.startsWith(prefix)) return null;
    return fileUrl.slice(prefix.length);
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}
