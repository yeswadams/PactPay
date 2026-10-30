import { afterEach, describe, expect, it, vi } from "vitest";
import { assertOrigin } from "./http";

afterEach(() => vi.unstubAllEnvs());
const request = (origin?: string) => new Request("http://127.0.0.1:3001/api/v1/auth/challenge", {
  method: "POST", headers: origin ? { origin } : {},
});

describe("application request origins", () => {
  it("accepts both exact loopback hosts on the configured protocol and port", () => {
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3001");
    for (const origin of ["http://127.0.0.1:3001", "http://localhost:3001"])
      expect(assertOrigin(request(origin)).origin).toBe(origin);
  });
  it("rejects other hosts, ports, protocols, malformed origins and absent origins", () => {
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3001");
    for (const origin of [undefined, "null", "invalid", "http://localhost:3000", "https://localhost:3001", "http://localhost.attacker.example:3001", "https://attacker.example", "http://localhost:3001/path", "http://user@localhost:3001"])
      expect(() => assertOrigin(request(origin))).toThrow("Request origin was not accepted");
  });
  it("keeps public deployments restricted to their exact configured origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://pactpay.example");
    expect(assertOrigin(request("https://pactpay.example")).origin).toBe("https://pactpay.example");
    for (const origin of ["http://localhost:3001", "http://127.0.0.1:3001", "https://other.pactpay.example", "https://pactpay.example:3001"])
      expect(() => assertOrigin(request(origin))).toThrow("Request origin was not accepted");
  });
});
