import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import careerApplicationHandler from "../api/career-application.js";

const createResponse = () => {
  let statusCode = 200;
  let body;

  return {
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
  };
};

describe("career application route", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/example/exec";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.GOOGLE_APPS_SCRIPT_URL;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects non-POST requests", async () => {
    const res = createResponse();

    await careerApplicationHandler({ method: "GET" }, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });

  it("returns a clear error for malformed JSON and preserves the parse cause", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createResponse();

    await careerApplicationHandler(
      {
        method: "POST",
        body: "{not-valid-json}",
      },
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Internal server error",
      message: "Invalid JSON payload",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error processing application:",
      expect.objectContaining({
        message: "Invalid JSON payload",
        cause: expect.any(SyntaxError),
      })
    );
  });

  it("fails validation before calling the Apps Script when required fields are missing", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = createResponse();

    await careerApplicationHandler(
      {
        method: "POST",
        body: {
          firstName: "Deepak",
        },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Missing required field: lastName",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits sanitized applications to the configured Apps Script", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('{"success":true,"row":12}'),
    });
    global.fetch = fetchMock;
    const res = createResponse();

    await careerApplicationHandler(
      {
        method: "POST",
        body: {
          firstName: " Deepak ",
          lastName: " Varma ",
          email: "deepak@example.com",
          collegeEmail: "deepak@college.edu",
          officialEmail: "deepak@company.com",
          phone: " 9876543210 ",
          resumeLink: "https://example.com/resume.pdf",
          college: "MIT",
          collegeValue: "MIT",
          jobTitle: "Frontend Intern",
          jobLocation: "Remote",
          submittedAt: "2026-04-24T10:30:00.000Z",
        },
      },
      res
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://script.google.com/macros/s/example/exec",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "Deepak",
          lastName: "Varma",
          email: "deepak@example.com",
          collegeEmail: "deepak@college.edu",
          officialEmail: "deepak@company.com",
          phone: "9876543210",
          resumeLink: "https://example.com/resume.pdf",
          college: "MIT",
          collegeValue: "MIT",
          jobTitle: "Frontend Intern",
          jobLocation: "Remote",
          submittedAt: "2026-04-24T10:30:00.000Z",
        }),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Application received and saved",
      data: expect.objectContaining({
        firstName: "Deepak",
        lastName: "Varma",
        appsScript: {
          success: true,
          row: 12,
        },
      }),
    });
  });

  it("surfaces upstream Apps Script failures to the caller", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("Apps Script is down"),
    });
    const res = createResponse();

    await careerApplicationHandler(
      {
        method: "POST",
        body: {
          firstName: "Deepak",
          lastName: "Varma",
          email: "deepak@example.com",
          collegeEmail: "deepak@college.edu",
          officialEmail: "deepak@company.com",
          phone: "9876543210",
          resumeLink: "https://example.com/resume.pdf",
          college: "MIT",
          collegeValue: "MIT",
        },
      },
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Internal server error",
      message: "Apps Script is down",
    });
  });
});
