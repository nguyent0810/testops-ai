import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export async function downloadObject(storageKey: string): Promise<Buffer> {
  const client = getS3Client();
  const out = await client.send(
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: storageKey,
    }),
  );
  if (!out.Body) {
    throw new Error("S3 GetObject returned empty body");
  }
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes);
}
