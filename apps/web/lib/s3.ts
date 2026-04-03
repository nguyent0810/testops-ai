import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export function getS3Bucket(): string {
  return requireEnv("S3_BUCKET");
}

export function getS3Region(): string {
  return requireEnv("AWS_REGION");
}

function getS3Client(): S3Client {
  const region = getS3Region();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  return new S3Client({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

/** Stable object key: no user-controlled path segments outside the UUID folders. */
export function buildDocumentStorageKey(
  projectId: string,
  documentId: string,
  safeFilename: string,
): string {
  return `projects/${projectId}/documents/${documentId}/${safeFilename}`;
}

export async function presignPutDocument(params: {
  storageKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: params.storageKey,
    ContentType: params.contentType,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: params.expiresInSeconds ?? 3600,
  });
}

export function newDocumentId(): string {
  return randomUUID();
}
