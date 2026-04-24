import { describe, expect, it, vi } from "vitest";

import walletPassHandler from "../api/wallet-pass.js";
import googleWalletPassHandler from "../api/google-wallet-pass.js";

const createResponse = () => {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;

  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
    send(payload: unknown) {
      body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  };
};

describe("wallet proxy routes", () => {
  it("reports Google Wallet health as ready when local issuer config is set", async () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "issuer-123";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL =
      "wallet-service@hushh-tech-prod.iam.gserviceaccount.com";
    process.env.GOOGLE_WALLET_PRIVATE_KEY = "test-private-key";

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "GET",
      body: null,
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      available: true,
      provider: "local",
      message: "Google Wallet is ready.",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_WALLET_PRIVATE_KEY;
  });

  it("accepts Apple form payloads and preserves upstream pass headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": 'attachment; filename="upstream.pkpass"',
        "x-pass-serial": "serial-123",
        "x-pass-type": "storeCard",
      }),
      arrayBuffer: async () => new TextEncoder().encode("pkpass").buffer,
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: { payload: JSON.stringify({ passType: "storeCard" }) },
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/universal/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.apple.pkpass");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="upstream.pkpass"'
    );
    expect(res.headers.get("X-Pass-Serial")).toBe("serial-123");
    expect(res.headers.get("X-Pass-Type")).toBe("storeCard");
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("accepts raw JSON string bodies for the Apple Wallet proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "application/vnd.apple.pkpass",
      }),
      arrayBuffer: async () => new TextEncoder().encode("pkpass").buffer,
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: JSON.stringify({ passType: "storeCard", memberId: "raw-json" }),
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/universal/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard", memberId: "raw-json" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("accepts wrapped raw JSON string payload bodies for the Apple Wallet proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "application/vnd.apple.pkpass",
      }),
      arrayBuffer: async () => new TextEncoder().encode("pkpass").buffer,
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: JSON.stringify({
        payload: JSON.stringify({ passType: "storeCard", memberId: "wrapped-raw-json" }),
      }),
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/universal/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard", memberId: "wrapped-raw-json" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("returns Google Wallet save URLs from the same-origin proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saveUrl: "https://pay.google.com/gp/v/save/test" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: { passType: "storeCard" },
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/google/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      saveUrl: "https://pay.google.com/gp/v/save/test",
    });
  });

  it("accepts raw JSON string bodies for the Google Wallet proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saveUrl: "https://pay.google.com/gp/v/save/raw-json" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: JSON.stringify({ passType: "storeCard", memberId: "raw-json" }),
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/google/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard", memberId: "raw-json" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      saveUrl: "https://pay.google.com/gp/v/save/raw-json",
    });
  });

  it("accepts wrapped raw JSON string payload bodies for the Google Wallet proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saveUrl: "https://pay.google.com/gp/v/save/wrapped-raw-json" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: JSON.stringify({
        payload: JSON.stringify({ passType: "storeCard", memberId: "wrapped-raw-json" }),
      }),
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/google/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard", memberId: "wrapped-raw-json" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      saveUrl: "https://pay.google.com/gp/v/save/wrapped-raw-json",
    });
  });

  it("passes through Google Wallet binary responses when no save URL is returned", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="google-pass.pkpass"',
      }),
      arrayBuffer: async () => new TextEncoder().encode("google-pass").buffer,
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: { passType: "storeCard" },
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="google-pass.pkpass"'
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("reports Google Wallet health as unavailable when the upstream route is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 404,
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "GET",
      body: null,
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      available: false,
      provider: "none",
      message:
        "Google Wallet is temporarily unavailable while we finish the wallet issuer setup.",
    });
  });

  it("returns a friendly 503 when the upstream Google Wallet endpoint is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: { passType: "storeCard" },
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "Google Wallet unavailable",
      detail:
        "Google Wallet is temporarily unavailable while we finish the wallet issuer setup.",
    });
  });

  it("fails closed when the wallet proxy receives malformed JSON strings", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: "{invalid-json}",
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid wallet pass payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the Google Wallet proxy receives malformed JSON strings", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: "{invalid-json}",
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid wallet pass payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the wallet proxy receives JSON primitives", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      body: JSON.stringify(true),
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid wallet pass payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unwraps nested raw JSON strings without recursion for the Google Wallet proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ saveUrl: "https://pay.google.com/gp/v/save/nested-raw-json" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const nestedBody = JSON.stringify(
      JSON.stringify({
        payload: JSON.stringify({ passType: "storeCard", memberId: "nested-raw-json" }),
      })
    );
    const req = {
      method: "POST",
      body: nestedBody,
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hushh-wallet.vercel.app/api/passes/google/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ passType: "storeCard", memberId: "nested-raw-json" }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      saveUrl: "https://pay.google.com/gp/v/save/nested-raw-json",
    });
  });

  it("fails closed when Apple wallet payload unwrapping exceeds the maximum depth", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let nestedBody = JSON.stringify({ passType: "storeCard", memberId: "too-deep" });
    for (let index = 0; index < 6; index += 1) {
      nestedBody = JSON.stringify(nestedBody);
    }

    const req = {
      method: "POST",
      body: nestedBody,
    };
    const res = createResponse();

    await walletPassHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid wallet pass payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when Google wallet payload unwrapping exceeds the maximum depth", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let nestedBody = JSON.stringify({ passType: "storeCard", memberId: "too-deep" });
    for (let index = 0; index < 6; index += 1) {
      nestedBody = JSON.stringify(nestedBody);
    }

    const req = {
      method: "POST",
      body: nestedBody,
    };
    const res = createResponse();

    await googleWalletPassHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid wallet pass payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
