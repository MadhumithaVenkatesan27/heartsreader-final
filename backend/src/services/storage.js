const fs = require("fs");
const path = require("path");
const config = require("../config");

/**
 * Where chapter PDFs live.
 *   STORAGE_DRIVER=local (default)  -> the uploads folder on this server (fine on your computer; wiped on Render redeploys)
 *   STORAGE_DRIVER=r2               -> Cloudflare R2 bucket (permanent, free tier is enough to start)
 *   STORAGE_DRIVER=gdrive           -> a private folder in YOUR Google Drive (permanent, uses your free 15 GB)
 * The rest of the app only uses put / get / remove, so nothing else cares which one is active.
 */
const driver = String(process.env.STORAGE_DRIVER || "local").toLowerCase();
const keyOf = (name) => path.basename(String(name || ""));

let s3 = null;
let S3 = null;
function r2() {
  if (s3) return s3;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    throw new Error(
      "STORAGE_DRIVER=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.",
    );
  }
  S3 = require("@aws-sdk/client-s3");
  s3 = new S3.S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}
const bucket = () => process.env.R2_BUCKET;

// ───────────────────────── Google Drive (private folder, signs in as you with a refresh token) ─────────────────────────
// Needs: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN  (optional GDRIVE_FOLDER_NAME, default "crossedhearts-pdfs")
// The app only sees files it created itself (scope drive.file), inside a folder it creates on first use.
// Files are never shared publicly: readers only get them through your backend (watermarked, purchase-checked).
let gToken = null;
let gTokenExp = 0;
let gFolder = null;

async function gAccessToken() {
  if (gToken && Date.now() < gTokenExp - 60000) return gToken;
  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } =
    process.env;
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    throw new Error(
      "STORAGE_DRIVER=gdrive needs GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET and GDRIVE_REFRESH_TOKEN.",
    );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(
      `Google Drive sign-in failed (${res.status} ${j.error || ""} ${j.error_description || ""}). Re-create GDRIVE_REFRESH_TOKEN.`,
    );
  }
  gToken = j.access_token;
  gTokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return gToken;
}

async function gApi(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${await gAccessToken()}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) gToken = null; // stale token: next call signs in again
  return res;
}

const gq = (v) => String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function gFolderId() {
  if (gFolder) return gFolder;
  const name = process.env.GDRIVE_FOLDER_NAME || "crossedhearts-pdfs";
  const q = `name='${gq(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await gApi(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
  );
  if (!found.ok)
    throw new Error(`Google Drive folder lookup failed (${found.status}).`);
  const f = (await found.json()).files?.[0];
  if (f) return (gFolder = f.id);
  const made = await gApi(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );
  if (!made.ok)
    throw new Error(
      `Google Drive could not create the folder (${made.status}).`,
    );
  return (gFolder = (await made.json()).id);
}

async function gFindIds(key) {
  const folder = await gFolderId();
  const q = `name='${gq(key)}' and '${folder}' in parents and trashed=false`;
  const res = await gApi(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=10`,
  );
  if (!res.ok) throw new Error(`Google Drive lookup failed (${res.status}).`);
  return ((await res.json()).files || []).map((x) => x.id);
}

async function gPut(key, localPath) {
  const folder = await gFolderId();
  const data = await fs.promises.readFile(localPath);
  for (const id of await gFindIds(key))
    await gApi(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
    });
  const boundary = `ch${Date.now().toString(16)}`;
  const meta = JSON.stringify({
    name: key,
    parents: [folder],
    mimeType: "application/pdf",
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await gApi(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok)
    throw new Error(
      `Google Drive upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  await fs.promises.unlink(localPath).catch(() => {});
  return key;
}

async function gGet(key) {
  const [id] = await gFindIds(key);
  if (!id) return null;
  const res = await gApi(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Drive download failed (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

async function gRemove(key) {
  for (const id of await gFindIds(key).catch(() => []))
    await gApi(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
    }).catch(() => {});
}

/** Saves the file at `localPath` under `name`. With r2 the local temp copy is removed afterwards. */
async function put(name, localPath) {
  const key = keyOf(name);
  if (driver === "gdrive") return gPut(key, localPath);
  if (driver === "r2") {
    const client = r2();
    await client.send(
      new S3.PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: await fs.promises.readFile(localPath),
        ContentType: "application/pdf",
      }),
    );
    await fs.promises.unlink(localPath).catch(() => {});
    return key;
  }
  const dest = path.join(config.uploadsDir, key);
  if (path.resolve(localPath) !== path.resolve(dest)) {
    await fs.promises.copyFile(localPath, dest);
    await fs.promises.unlink(localPath).catch(() => {});
  }
  return key;
}

/** Returns the file as a Buffer, or null if it does not exist. */
async function get(name) {
  const key = keyOf(name);
  if (!key) return null;
  if (driver === "gdrive") return gGet(key);
  if (driver === "r2") {
    try {
      const out = await r2().send(
        new S3.GetObjectCommand({ Bucket: bucket(), Key: key }),
      );
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (err) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404)
        return null;
      throw err;
    }
  }
  return fs.promises
    .readFile(path.join(config.uploadsDir, key))
    .catch(() => null);
}

async function remove(name) {
  const key = keyOf(name);
  if (!key) return;
  if (driver === "gdrive") return gRemove(key);
  if (driver === "r2") {
    await r2()
      .send(new S3.DeleteObjectCommand({ Bucket: bucket(), Key: key }))
      .catch(() => {});
    return;
  }
  await fs.promises.unlink(path.join(config.uploadsDir, key)).catch(() => {});
}

if (!config.isTest) console.log(`✔ PDF storage: ${driver}`);

module.exports = { put, get, remove, driver };
