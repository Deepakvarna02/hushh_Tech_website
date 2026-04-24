const UPSTREAM_APPLE_WALLET_ENDPOINT =
  "https://hushh-wallet.vercel.app/api/passes/universal/create";

const resolvePayload = (body) => {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body.payload === "string") {
    try {
      return JSON.parse(body.payload);
    } catch {
      return null;
    }
  }

  return body;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = resolvePayload(req.body);
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid wallet pass payload" });
  }

  try {
    const forward = await fetch(UPSTREAM_APPLE_WALLET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!forward.ok) {
      const text = await forward.text();
      return res.status(forward.status).json({ error: "Wallet pass generation failed", detail: text });
    }

    const buffer = Buffer.from(await forward.arrayBuffer());
    const contentDisposition =
      forward.headers.get("content-disposition") || 'attachment; filename="hushh-profile.pkpass"';
    const passSerial = forward.headers.get("x-pass-serial");
    const passType = forward.headers.get("x-pass-type");

    res.setHeader(
      "Content-Type",
      forward.headers.get("content-type") || "application/vnd.apple.pkpass"
    );
    res.setHeader("Content-Disposition", contentDisposition);
    if (passSerial) res.setHeader("X-Pass-Serial", passSerial);
    if (passType) res.setHeader("X-Pass-Type", passType);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("wallet-pass proxy error:", error);
    res.status(500).json({ error: "Proxy failed", detail: error?.message });
  }
}
