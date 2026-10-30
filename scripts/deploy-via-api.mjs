#!/usr/bin/env node
/**
 * Full deploy (Worker + static assets) using CLOUDFLARE_API_TOKEN.
 * Used when Wrangler OAuth is unavailable; MCP uses the same Cloudflare API.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? "5c12c35da9d17d2012e0b82feff79470";
const token = process.env.CLOUDFLARE_API_TOKEN;
const scriptName = "padel-availability";

if (!token) {
  console.error("Set CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

const api = (method, p, body, headers = {}) =>
  fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body:
      body instanceof FormData
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
  }).then(async (r) => {
    const j = await r.json();
    if (!j.success) {
      throw new Error(`${method} ${p}: ${JSON.stringify(j.errors ?? j)}`);
    }
    return j.result;
  });

function assetHash(buf, ext) {
  return crypto
    .createHash("sha256")
    .update(buf.toString("base64") + ext)
    .digest("hex")
    .slice(0, 32);
}

async function main() {
  const workerCode = fs.readFileSync(
    path.join(root, "deploy/worker.js"),
    "utf8",
  );
  const html = fs.readFileSync(path.join(root, "public/index.html"));
  const hash = assetHash(html, "html");
  const manifest = { "/index.html": { hash, size: html.length } };

  const session = await api(
    "POST",
    `/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`,
    { manifest },
  );

  let completionJwt = session.jwt;
  for (const bucket of session.buckets ?? []) {
    const form = new FormData();
    for (const h of bucket) {
      if (h === hash) {
        form.append(
          h,
          new Blob([html], { type: "text/html" }),
          "index.html",
        );
      }
    }
    const uploadRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/assets/upload?base64=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.jwt}` },
        body: form,
      },
    );
    const uploadJson = await uploadRes.json();
    if (!uploadJson.success) {
      throw new Error(JSON.stringify(uploadJson.errors));
    }
    if (uploadJson.result?.jwt) completionJwt = uploadJson.result.jwt;
  }

  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2025-10-30",
    bindings: [
      { type: "assets", name: "ASSETS" },
      { type: "plain_text", name: "WEEKS_AHEAD", text: "3" },
      { type: "plain_text", name: "TIMEZONE", text: "Europe/London" },
      { type: "plain_text", name: "WEEKENDS_ONLY", text: "false" },
      { type: "plain_text", name: "VENUE_NAME", text: "Your club" },
    ],
    assets: {
      jwt: completionJwt,
      config: {
        html_handling: "auto-trailing-slash",
        not_found_handling: "none",
      },
    },
  };

  const boundary = "deploy" + Date.now();
  const mpBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    "Content-Type: application/json",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    "Content-Type: application/javascript+module",
    "",
    workerCode,
    `--${boundary}--`,
  ].join("\r\n");

  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: mpBody,
    },
  ).then(async (r) => {
    const j = await r.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    return j.result;
  });

  console.log("Deployed", scriptName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
