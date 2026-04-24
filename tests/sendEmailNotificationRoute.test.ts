import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendMail,
  createTransport,
  maybeSingle,
  createClient,
} = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn();
  const selectMock = vi.fn();
  const fromMock = vi.fn();
  const createClientMock = vi.fn();
  const createTransportMock = vi.fn(() => ({
    sendMail: sendMailMock,
  }));

  eqMock.mockImplementation(() => ({ eq: eqMock, maybeSingle: maybeSingleMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  fromMock.mockImplementation(() => ({ select: selectMock }));
  createClientMock.mockImplementation(() => ({ from: fromMock }));

  return {
    sendMail: sendMailMock,
    createTransport: createTransportMock,
    maybeSingle: maybeSingleMock,
    createClient: createClientMock,
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

import sendEmailNotificationHandler from "../api/send-email-notification.js";

const createResponse = () => {
  const headers = new Map();
  let statusCode = 200;
  let body;

  const response = {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, value);
      return this;
    },
  };

  return response;
};

describe("send email notification route", () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = "https://hushhtech.com,https://kai.hushh.ai";
    process.env.GMAIL_USER = "notifications@hushh.ai";
    process.env.GMAIL_APP_PASSWORD = "app-password";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    maybeSingle.mockResolvedValue({
      data: {
        email: "owner@hushh.ai",
        name: "Owner Profile",
      },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.clearAllMocks();
  });

  it("returns CORS headers for preflight requests", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "OPTIONS",
        headers: {
          origin: "https://hushhtech.com",
        },
        body: {},
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hushhtech.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });

  it("returns CORS headers for rejected non-POST requests", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "GET",
        headers: {
          origin: "https://kai.hushh.ai",
        },
        body: {},
      },
      res
    );

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://kai.hushh.ai");
  });

  it("rejects unsupported notification types before sending mail", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "POST",
        headers: {
          origin: "https://hushhtech.com",
        },
        body: {
          type: "unknown",
          slug: "owner-profile",
          profileOwnerEmail: "owner@hushh.ai",
        },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Unsupported notification type" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a profile view notification with the expected email metadata", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-123" });
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "POST",
        headers: {
          origin: "https://hushhtech.com",
        },
        body: {
          type: "profile_view",
          slug: "owner-profile",
          profileOwnerEmail: "owner@hushh.ai",
          profileName: "Owner Profile",
        },
      },
      res
    );

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@hushh.ai",
        subject: expect.stringContaining("Owner Profile"),
        html: expect.stringContaining("Someone is viewing your profile"),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, emailSent: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hushhtech.com");
  });

  it("returns a generic 500 error without leaking internal details", async () => {
    sendMail.mockRejectedValue(new Error("smtp handshake failed"));
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "POST",
        headers: {
          origin: "https://hushhtech.com",
        },
        body: {
          type: "profile_view",
          slug: "owner-profile",
          profileOwnerEmail: "owner@hushh.ai",
          profileName: "Owner Profile",
        },
      },
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to send email" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hushhtech.com");
  });

  it("does not echo disallowed origins in CORS headers", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.example",
        },
        body: {},
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Origin not allowed" });
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("rejects POST requests from disallowed origins before sending email", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "POST",
        headers: {
          origin: "https://evil.example",
        },
        body: {
          type: "profile_view",
          slug: "owner-profile",
          profileOwnerEmail: "owner@hushh.ai",
          profileName: "Owner Profile",
        },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Origin not allowed" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("rejects POST requests without an origin header", async () => {
    const res = createResponse();

    await sendEmailNotificationHandler(
      {
        method: "POST",
        headers: {},
        body: {
          type: "profile_view",
          slug: "owner-profile",
          profileOwnerEmail: "owner@hushh.ai",
          profileName: "Owner Profile",
        },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Origin not allowed" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
