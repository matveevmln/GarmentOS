import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "../application/ports";

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
}
