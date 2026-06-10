/**
 * Minimal Cloudflare R2 (S3-compatible) writer for the on-demand TTS cache.
 * Server-only. Signs requests with AWS SigV4 via node:crypto — no SDK
 * dependency. Reads the same R2_* env the upload script uses.
 */
import { createHash, createHmac } from "node:crypto";

export function hasR2(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

const SERVICE = "s3";
const REGION = "auto";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** YYYYMMDDTHHMMSSZ + YYYYMMDD from a Date. */
function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Signed S3 request to R2. `objectKey` is a bucket-relative path like
 * `tts/<hash>.mp3` (only `/` and url-safe chars — no per-segment encoding
 * needed for our keys). Returns the fetch Response.
 */
async function r2Request(
  method: "PUT" | "HEAD" | "GET",
  objectKey: string,
  body: Buffer | undefined,
  contentType: string | undefined,
  /** Optional Cache-Control stored as object metadata on PUT (SigV4-signed,
   *  like content-type). R2 then serves it on every GET — without it browsers
   *  fall back to heuristic freshness + conditional revalidation round-trips. */
  cacheControl?: string,
): Promise<Response> {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${objectKey}`;
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");
  const { amzDate, dateStamp } = amzDates(new Date());

  // Canonical headers (sorted by lowercased name). Include content-type only
  // when there's a body to type.
  const headerPairs: [string, string][] = [
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];
  if (contentType) headerPairs.push(["content-type", contentType]);
  if (cacheControl) headerPairs.push(["cache-control", cacheControl]);
  headerPairs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const canonicalHeaders =
    headerPairs.map(([k, v]) => `${k}:${v}`).join("\n") + "\n";
  const signedHeaders = headerPairs.map(([k]) => k).join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // no query
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (cacheControl) headers["Cache-Control"] = cacheControl;

  return fetch(`https://${host}${canonicalUri}`, {
    method,
    headers,
    body: body as BodyInit | undefined,
  });
}

/** True if the object already exists in the bucket. */
export async function r2Exists(objectKey: string): Promise<boolean> {
  try {
    const res = await r2Request("HEAD", objectKey, undefined, undefined);
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch an object's bytes, or null when it doesn't exist (or R2 errors —
 *  callers treat that as a cache miss and regenerate). */
export async function r2Get(objectKey: string): Promise<Buffer | null> {
  try {
    const res = await r2Request("GET", objectKey, undefined, undefined);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Upload an object. Throws on a non-2xx response. */
export async function r2Put(
  objectKey: string,
  body: Buffer,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  const res = await r2Request("PUT", objectKey, body, contentType, cacheControl);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`r2 put ${res.status}: ${detail.slice(0, 300)}`);
  }
}
