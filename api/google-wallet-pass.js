import { createSign } from "crypto";
import {
  buildWalletCardContentFromPayload,
  getWalletPayloadFieldValue,
  WALLET_CARD_ORGANIZATION_NAME,
} from "./shared/walletPassModel.js";

const UPSTREAM_GOOGLE_WALLET_ENDPOINT =
  "https://hushh-wallet.vercel.app/api/passes/google/create";
const GOOGLE_WALLET_SCOPE =
  "https://www.googleapis.com/auth/wallet_object.issuer";
const GOOGLE_WALLET_UNAVAILABLE_MESSAGE =
  "Google Wallet is temporarily unavailable while we finish the wallet issuer setup.";

let upstreamAvailabilityCache = null;

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

const normalizeGoogleWalletId = (value) =>
  String(value || "hushh-investor")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "hushh-investor";

const getLocalGoogleWalletConfig = () => {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const clientEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const classSuffix =
    process.env.GOOGLE_WALLET_CLASS_SUFFIX?.trim() || "hushh_gold_investor_v1";
  const origins = (process.env.GOOGLE_WALLET_ALLOWED_ORIGINS || "https://hushhtech.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!issuerId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    issuerId,
    clientEmail,
    privateKey,
    classSuffix,
    origins,
  };
};

const createSignedJwt = (claims, privateKey) => {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const payload = `${encodedHeader}.${encodedClaims}`;

  const signer = createSign("RSA-SHA256");
  signer.update(payload);
  signer.end();

  const signature = signer.sign(privateKey).toString("base64url");
  return `${payload}.${signature}`;
};

const buildGenericClass = (classId) => ({
  id: classId,
  issuerName: WALLET_CARD_ORGANIZATION_NAME,
  reviewStatus: "UNDER_REVIEW",
  hexBackgroundColor: "#D4AF37",
  logo: {
    sourceUri: {
      uri: "https://hushhtech.com/images/hushh-logo-new.png",
    },
  },
  classTemplateInfo: {
    cardTemplateOverride: {
      cardRowTemplateInfos: [
        {
          twoItems: {
            startItem: {
              firstValue: {
                fields: [{ fieldPath: "object.textModulesData['status']" }],
              },
            },
            endItem: {
              firstValue: {
                fields: [{ fieldPath: "object.textModulesData['class']" }],
              },
            },
          },
        },
        {
          oneItem: {
            item: {
              firstValue: {
                fields: [{ fieldPath: "object.textModulesData['memberId']" }],
              },
            },
          },
        },
      ],
    },
  },
});

const buildGenericObject = (objectId, classId, payload) => {
  const content = buildWalletCardContentFromPayload(payload);

  return {
    id: objectId,
    classId,
    state: "ACTIVE",
    genericType: "GENERIC_TYPE_UNSPECIFIED",
    hexBackgroundColor: "#D4AF37",
    logo: {
      sourceUri: {
        uri: "https://hushhtech.com/images/hushh-logo-new.png",
      },
    },
    cardTitle: {
      defaultValue: {
        language: "en-US",
        value: content.title,
      },
    },
    subheader: {
      defaultValue: {
        language: "en-US",
        value: content.organizationName,
      },
    },
    header: {
      defaultValue: {
        language: "en-US",
        value: content.holderName,
      },
    },
    barcode: {
      type: "QR_CODE",
      value: content.passUrl,
      alternateText: payload?.barcode?.altText || "Hushh Gold Pass QR",
    },
    textModulesData: [
      {
        id: "status",
        header: "Status",
        body: content.status,
      },
      {
        id: "class",
        header: "Investor",
        body: content.investmentLabel,
      },
      {
        id: "memberId",
        header: "Membership ID",
        body: content.membershipId,
      },
      {
        id: "email",
        header: "Email",
        body: content.email,
      },
    ],
    linksModuleData: {
      uris: [
        {
          id: "profile",
          description: "Investor Profile",
          uri: content.passUrl,
        },
      ],
    },
  };
};

const isNotFoundError = (error) =>
  error?.code === 404 ||
  error?.response?.status === 404 ||
  error?.status === 404;

const getGoogleErrorMessage = (error) =>
  error?.response?.data?.error?.message ||
  error?.errors?.[0]?.message ||
  error?.message ||
  "Google Wallet pass generation failed";

const ensureGenericClass = async (walletobjects, classId) => {
  const requestBody = buildGenericClass(classId);

  try {
    await walletobjects.genericclass.get({ resourceId: classId });
    await walletobjects.genericclass.update({ resourceId: classId, requestBody });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    await walletobjects.genericclass.insert({ requestBody });
  }
};

const ensureGenericObject = async (walletobjects, objectId, classId, payload) => {
  const requestBody = buildGenericObject(objectId, classId, payload);

  try {
    await walletobjects.genericobject.get({ resourceId: objectId });
    await walletobjects.genericobject.update({ resourceId: objectId, requestBody });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    await walletobjects.genericobject.insert({ requestBody });
  }

  return requestBody;
};

const createLocalGoogleWalletPass = async (payload, config) => {
  const { google } = await import("googleapis");

  const auth = new google.auth.JWT(
    config.clientEmail,
    null,
    config.privateKey,
    [GOOGLE_WALLET_SCOPE]
  );

  const walletobjects = google.walletobjects({
    version: "v1",
    auth,
  });

  const classId = `${config.issuerId}.${normalizeGoogleWalletId(config.classSuffix)}`;
  const objectSuffix = normalizeGoogleWalletId(
    getWalletPayloadFieldValue(
      payload.auxiliaryFields,
      "memberId",
      payload.barcode?.message
    )
  );
  const objectId = `${config.issuerId}.${objectSuffix}`;

  await ensureGenericClass(walletobjects, classId);
  const genericObject = await ensureGenericObject(
    walletobjects,
    objectId,
    classId,
    payload
  );

  const token = createSignedJwt(
    {
      iss: config.clientEmail,
      aud: "google",
      origins: config.origins,
      typ: "savetowallet",
      payload: {
        genericObjects: [genericObject],
      },
    },
    config.privateKey
  );

  return {
    saveUrl: `https://pay.google.com/gp/v/save/${token}`,
    provider: "local",
  };
};

const forwardGoogleWalletPass = async (payload) => {
  const forward = await fetch(UPSTREAM_GOOGLE_WALLET_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!forward.ok) {
    if (forward.status === 404) {
      return {
        ok: false,
        status: 503,
        body: {
          error: "Google Wallet unavailable",
          detail: GOOGLE_WALLET_UNAVAILABLE_MESSAGE,
        },
      };
    }

    const text = await forward.text();
    return {
      ok: false,
      status: forward.status,
      body: {
        error: "Google Wallet pass generation failed",
        detail: text || GOOGLE_WALLET_UNAVAILABLE_MESSAGE,
      },
    };
  }

  const contentType = forward.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return {
      ok: true,
      status: 200,
      body: await forward.json(),
      contentType,
    };
  }

  return {
    ok: true,
    status: 200,
    body: Buffer.from(await forward.arrayBuffer()),
    contentType: contentType || "application/octet-stream",
    contentDisposition:
      forward.headers.get("content-disposition") ||
      'attachment; filename="hushh-profile-google.pkpass"',
  };
};

const getUpstreamGoogleWalletAvailability = async () => {
  const now = Date.now();
  if (
    upstreamAvailabilityCache &&
    now - upstreamAvailabilityCache.checkedAt < 5 * 60 * 1000
  ) {
    return upstreamAvailabilityCache.value;
  }

  try {
    const response = await fetch(UPSTREAM_GOOGLE_WALLET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passType: "storeCard", description: "healthcheck" }),
    });

    const availability = {
      available: response.status !== 404,
      provider: response.status === 404 ? "none" : "upstream",
      message:
        response.status === 404
          ? GOOGLE_WALLET_UNAVAILABLE_MESSAGE
          : "Google Wallet is ready.",
    };

    upstreamAvailabilityCache = {
      checkedAt: now,
      value: availability,
    };
    return availability;
  } catch {
    const availability = {
      available: false,
      provider: "none",
      message: GOOGLE_WALLET_UNAVAILABLE_MESSAGE,
    };

    upstreamAvailabilityCache = {
      checkedAt: now,
      value: availability,
    };
    return availability;
  }
};

const getGoogleWalletHealth = async () => {
  if (getLocalGoogleWalletConfig()) {
    return {
      available: true,
      provider: "local",
      message: "Google Wallet is ready.",
    };
  }

  return getUpstreamGoogleWalletAvailability();
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    const health = await getGoogleWalletHealth();
    return res.status(200).json(health);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = resolvePayload(req.body);
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid wallet pass payload" });
  }

  const localConfig = getLocalGoogleWalletConfig();

  if (localConfig) {
    try {
      const result = await createLocalGoogleWalletPass(payload, localConfig);
      return res.status(200).json(result);
    } catch (error) {
      console.error("google-wallet-pass local error:", error);
      return res.status(500).json({
        error: "Google Wallet pass generation failed",
        detail: getGoogleErrorMessage(error),
      });
    }
  }

  try {
    const forward = await forwardGoogleWalletPass(payload);

    if (!forward.ok) {
      return res.status(forward.status).json(forward.body);
    }

    if (forward.contentType?.includes("application/json")) {
      return res.status(forward.status).json(forward.body);
    }

    res.setHeader("Content-Type", forward.contentType);
    res.setHeader("Content-Disposition", forward.contentDisposition);
    return res.status(forward.status).send(forward.body);
  } catch (error) {
    console.error("google-wallet-pass proxy error:", error);
    return res.status(500).json({
      error: "Proxy failed",
      detail: error?.message || GOOGLE_WALLET_UNAVAILABLE_MESSAGE,
    });
  }
}
