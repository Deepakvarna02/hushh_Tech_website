import { describe, expect, it } from "vitest";

import {
  buildPublicInvestorProfilePayload,
  maskPublicEmail,
} from "../api/public-investor-profile.js";

describe("public investor profile API projection", () => {
  it("keeps only basic public data for unconfirmed profiles", () => {
    const payload = buildPublicInvestorProfilePayload({
      slug: "ankit-kumar-singh-2597e6b8",
      name: "Ankit Kumar Singh",
      email: "ankit@hushh.ai",
      age: 29,
      organisation: "Hushh",
      user_confirmed: false,
      investor_profile: {
        primary_goal: {
          value: "long_term_growth",
          confidence: 0.8,
        },
      },
      shadow_profile: {
        confidence: 0.7,
      },
      privacy_settings: {},
    });

    expect(payload).toMatchObject({
      slug: "ankit-kumar-singh-2597e6b8",
      is_confirmed: false,
      basic_info: {
        name: "Ankit Kumar Singh",
        email: "a***t@hushh.ai",
        age: null,
        organisation: null,
      },
      investor_profile: null,
      onboarding_data: null,
      shadow_profile: null,
    });
  });

  it("preserves confirmed profile sections while honoring privacy rules", () => {
    const payload = buildPublicInvestorProfilePayload(
      {
        slug: "neelesh-meena-4960f9fe",
        name: "Neelesh Meena",
        email: "neelesh@hushh.ai",
        age: 32,
        organisation: "Hushh",
        user_confirmed: true,
        investor_profile: {
          primary_goal: {
            value: "long_term_growth",
            confidence: 0.82,
          },
          engagement_style: {
            value: "collaborative_discuss_key_decisions",
            confidence: 0.55,
          },
        },
        shadow_profile: {
          confidence: 0.7,
        },
        privacy_settings: {
          investor_profile: {
            engagement_style: false,
          },
          basic_info: {
            email: true,
          },
          onboarding_data: {
            account_type: true,
            selected_fund: false,
            citizenship_country: true,
            residence_country: true,
          },
        },
      },
      {
        account_type: "individual",
        selected_fund: "Fund A",
        citizenship_country: "India",
        residence_country: "India",
      }
    );

    expect(payload.is_confirmed).toBe(true);
    expect(payload.basic_info.email).toBe("n***h@hushh.ai");
    expect(payload.investor_profile).toEqual({
      primary_goal: {
        value: "long_term_growth",
        confidence: 0.82,
      },
    });
    expect(payload.onboarding_data).toEqual({
      account_type: "individual",
      selected_fund: null,
      citizenship_country: "India",
      residence_country: "India",
    });
    expect(payload.shadow_profile).toEqual({
      confidence: 0.7,
    });
  });

  it("masks short usernames safely", () => {
    expect(maskPublicEmail("ab@example.com")).toBe("a***@example.com");
    expect(maskPublicEmail("abcdef@example.com")).toBe("a***f@example.com");
  });
});
