import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { AppError } from "./http.ts";
let client: S3Client | undefined;
const bucket = () => {
  if (!process.env.S3_BUCKET)
    throw new AppError(503, "Private document storage has not been configured");
  return process.env.S3_BUCKET;
};
function storage() {
  if (
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY ||
    !process.env.S3_ENDPOINT
  )
    throw new AppError(503, "Private document storage is unavailable");
  return (client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  }));
}
let initialized: Promise<void> | undefined;
async function ensureBucket() {
  if (process.env.ALLOW_LOCAL_STORAGE_BOOTSTRAP !== "true") return;
  const host = new URL(process.env.S3_ENDPOINT!).hostname;
  if (!["127.0.0.1", "localhost", "objectstore"].includes(host))
    throw new AppError(
      503,
      "Storage bootstrap is restricted to local development",
    );
  initialized ??= storage()
    .send(new HeadBucketCommand({ Bucket: bucket() }))
    .then(() => undefined)
    .catch(async (error) => {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
      await storage().send(new CreateBucketCommand({ Bucket: bucket() }));
    });
  try {
    await initialized;
  } catch (error) {
    initialized = undefined;
    throw error;
  }
}
export const MAX_UPLOAD = 5 * 1024 * 1024;
export function validatedFile(bytes: Buffer, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD)
    throw new AppError(413, "Use a non-empty file up to 5 MB");
  const actual =
    bytes.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? "image/jpeg"
          : null;
  if (!actual || actual !== declaredType)
    throw new AppError(
      415,
      "Use a valid PDF, PNG or JPEG file matching its content type",
    );
  return actual;
}
export async function putPrivateObject(
  key: string,
  bytes: Buffer,
  mimeType: string,
) {
  await ensureBucket();
  await storage().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: mimeType,
    }),
  );
}
export async function deletePrivateObject(key: string) {
  await storage().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function getPrivateObject(key: string) {
  const result = await storage().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!result.Body) throw new AppError(404, "Document not found");
  return result.Body.transformToByteArray();
}
