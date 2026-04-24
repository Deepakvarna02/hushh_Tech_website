import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import generateInvestorProfileHandler, {
  resolveInvestorProfileRequestBody,
} from "../api/generate-investor-profile.js";

const createResponse = () => {
  let statusCode = 200;
  let body;
  let ended = false;
  const headers = new Map();

  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get ended() {
      return ended;
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
    },
    end() {
      ended = true;
      return this;
    },
  };
};

describe("generate investor profile route", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("rejects malformed raw JSON bodies", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = createResponse();

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: "{invalid-json}",
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects primitive raw JSON bodies", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = createResponse();

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: JSON.stringify(true),
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request payload" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects null and array payloads after parsing", () => {
    expect(resolveInvestorProfileRequestBody(JSON.stringify(null))).toEqual({
      error: "Invalid request payload",
    });
    expect(resolveInvestorProfileRequestBody(JSON.stringify([]))).toEqual({
      error: "Invalid request payload",
    });
  });

  it("iteratively unwraps nested raw JSON strings", () => {
    const nestedBody = JSON.stringify(
      JSON.stringify({
        input: {
          name: "Deepak",
        },
        context: {
          country: "India",
        },
      })
    );

    expect(resolveInvestorProfileRequestBody(nestedBody)).toEqual({
      body: {
        input: {
          name: "Deepak",
        },
        context: {
          country: "India",
        },
      },
    });
  });

  it("rejects excessively nested raw JSON strings", () => {
    let nestedBody = JSON.stringify({
      input: {
        name: "Deepak",
      },
      context: {
        country: "India",
      },
    });

    for (let index = 0; index < 11; index += 1) {
      nestedBody = JSON.stringify(nestedBody);
    }

    expect(resolveInvestorProfileRequestBody(nestedBody)).toEqual({
      error: "Payload is nested too deeply",
    });
  });

  it("returns 400 when parsed payload is missing input or context", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = createResponse();

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: JSON.stringify({
          input: {
            name: "Deepak",
          },
        }),
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Missing required fields: input and context",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when input or context are not objects", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const res = createResponse();

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: JSON.stringify({
          input: true,
          context: {
            country: "India",
          },
        }),
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid request payload: input and context must be objects",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts raw JSON string bodies and returns the generated profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                investor_profile: {
                  primary_goal: { value: "long_term_growth", confidence: 0.8, rationale: "test" },
                  investment_horizon_years: { value: ">10_years", confidence: 0.8, rationale: "test" },
                  risk_tolerance: { value: "moderate", confidence: 0.7, rationale: "test" },
                  liquidity_need: { value: "low", confidence: 0.7, rationale: "test" },
                  experience_level: { value: "beginner", confidence: 0.6, rationale: "test" },
                  typical_ticket_size: { value: "small_1k_10k", confidence: 0.6, rationale: "test" },
                  annual_investing_capacity: { value: "5k_20k", confidence: 0.6, rationale: "test" },
                  asset_class_preference: {
                    value: ["mutual_funds_etfs", "public_equities"],
                    confidence: 0.6,
                    rationale: "test",
                  },
                  sector_preferences: {
                    value: ["technology", "fintech"],
                    confidence: 0.6,
                    rationale: "test",
                  },
                  volatility_reaction: { value: "hold_and_wait", confidence: 0.6, rationale: "test" },
                  sustainability_preference: { value: "nice_to_have", confidence: 0.6, rationale: "test" },
                  engagement_style: {
                    value: "collaborative_discuss_key_decisions",
                    confidence: 0.6,
                    rationale: "test",
                  },
                },
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock;
    const res = createResponse();

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: JSON.stringify({
          input: {
            name: "Deepak",
            email: "deepak@example.com",
            age: 25,
            phone_country_code: "+91",
            phone_number: "9876543210",
            organisation: "Hushh",
          },
          context: {
            country: "India",
            region: "APAC",
            currency: "INR",
            email_type: "work",
            company_industry: "technology",
            life_stage: "early_career",
            org_type: "startup",
          },
        }),
      },
      res
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      profile: {
        primary_goal: { value: "long_term_growth" },
        engagement_style: { value: "collaborative_discuss_key_decisions" },
      },
    });
  });

  it("accepts nested raw JSON string bodies and returns the generated profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                investor_profile: {
                  primary_goal: { value: "long_term_growth", confidence: 0.8, rationale: "test" },
                  investment_horizon_years: { value: ">10_years", confidence: 0.8, rationale: "test" },
                  risk_tolerance: { value: "moderate", confidence: 0.7, rationale: "test" },
                  liquidity_need: { value: "low", confidence: 0.7, rationale: "test" },
                  experience_level: { value: "beginner", confidence: 0.6, rationale: "test" },
                  typical_ticket_size: { value: "small_1k_10k", confidence: 0.6, rationale: "test" },
                  annual_investing_capacity: { value: "5k_20k", confidence: 0.6, rationale: "test" },
                  asset_class_preference: {
                    value: ["mutual_funds_etfs", "public_equities"],
                    confidence: 0.6,
                    rationale: "test",
                  },
                  sector_preferences: {
                    value: ["technology", "fintech"],
                    confidence: 0.6,
                    rationale: "test",
                  },
                  volatility_reaction: { value: "hold_and_wait", confidence: 0.6, rationale: "test" },
                  sustainability_preference: { value: "nice_to_have", confidence: 0.6, rationale: "test" },
                  engagement_style: {
                    value: "collaborative_discuss_key_decisions",
                    confidence: 0.6,
                    rationale: "test",
                  },
                },
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock;
    const res = createResponse();

    const nestedBody = JSON.stringify(
      JSON.stringify({
        input: {
          name: "Deepak",
          email: "deepak@example.com",
          age: 25,
          phone_country_code: "+91",
          phone_number: "9876543210",
          organisation: "Hushh",
        },
        context: {
          country: "India",
          region: "APAC",
          currency: "INR",
          email_type: "work",
          company_industry: "technology",
          life_stage: "early_career",
          org_type: "startup",
        },
      })
    );

    await generateInvestorProfileHandler(
      {
        method: "POST",
        body: nestedBody,
      },
      res
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      profile: {
        risk_tolerance: { value: "moderate" },
      },
    });
  });
});
