import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BlobStore } from "./repository.js";

export interface S3BlobStoreOptions {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3BlobStore implements BlobStore {
  readonly client: S3Client;

  constructor(private options: S3BlobStoreOptions) {
    this.client = new S3Client({
      region: options.region ?? "us-east-1",
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    });
  }

  async putImmutable(key: string, content: Uint8Array, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: { immutable: "true" },
        IfNoneMatch: "*",
      }));
      return;
    } catch (error) {
      const existing = await this.get(key);
      if (!existing || Buffer.compare(existing, content) !== 0) {
        if (existing) throw new Error(`immutable blob collision at ${key}`);
        throw error;
      }
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return result.Body ? result.Body.transformToByteArray() : null;
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (failure.name === "NoSuchKey" || failure.name === "NotFound" || failure.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
