// @vitest-environment node
import { describe,it,expect,afterEach } from "vitest";
import { cookieHeader,tokenHash } from "./auth";
import { assertOrigin,AppError } from "./http";
import { validatedFile } from "./storage";
const prior=process.env.APP_ORIGIN;afterEach(()=>{if(prior===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=prior;});
describe("application security boundaries",()=>{
 it("uses HttpOnly, SameSite cookies and Secure on HTTPS",()=>{process.env.APP_ORIGIN="https://pactpay.example";const cookie=cookieHeader("session","opaque",300);expect(cookie).toContain("HttpOnly");expect(cookie).toContain("SameSite=Lax");expect(cookie).toContain("Secure");expect(cookie).toContain("Max-Age=300");});
 it("rejects cross-origin state changes",()=>{process.env.APP_ORIGIN="http://127.0.0.1:3001";expect(()=>assertOrigin(new Request("http://127.0.0.1:3001",{headers:{Origin:"https://attacker.example"}}))).toThrow(AppError);});
 it("hashes opaque tokens rather than storing their original value",()=>{expect(tokenHash("sample-token")).toHaveLength(64);expect(tokenHash("sample-token")).not.toBe("sample-token");});
 it("checks document contents rather than trusting MIME alone",()=>{expect(()=>validatedFile(Buffer.from("fake pdf"),"application/pdf")).toThrow();expect(validatedFile(Buffer.from("%PDF-1.4\n"),"application/pdf")).toBe("application/pdf");expect(()=>validatedFile(Buffer.from("%PDF-1.4\n"),"image/png")).toThrow();expect(()=>validatedFile(Buffer.alloc(5*1024*1024+1),"application/pdf")).toThrow();});
});
