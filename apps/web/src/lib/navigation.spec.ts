import { describe,it,expect } from "vitest";
import { navigationFor } from "./navigation";
import type { SessionData } from "./domain";
export const investorSession:SessionData={user:{id:"sample",name:"Sample investor",email:"sample@example.invalid",walletAddress:"0x1111111111111111111111111111111111111111",onboarded:true,timezone:"Africa/Nairobi"},organization:{id:"org",name:"Sample organization",kind:"investor",role:"investor",verificationStatus:"PENDING",eligibilityStatus:"PENDING",contactEmail:null,contactPhone:null,registrationNumber:"",discloseName:false,isOwner:true},organizations:[],scopes:[],expiresAt:"2027-01-01T00:00:00Z"};
describe("role-scoped navigation",()=>{
 it("shows investor paths but no admin or SME actions",()=>{const labels=navigationFor(investorSession).map(item=>item.label);expect(labels).toContain("Marketplace");expect(labels).toContain("My investments");expect(labels).not.toContain("Verification queue");expect(labels).not.toContain("Submit invoice");});
 it("shows SME operations for the selected SME organization",()=>{const user={...investorSession,organization:{...investorSession.organization!,role:"sme",kind:"sme"}};const labels=navigationFor(user).map(item=>item.label);expect(labels).toContain("Submit invoice");expect(labels).not.toContain("My investments");});
 it("separates verifier, lister, settler and auditor permissions",()=>{const verifier=navigationFor({...investorSession,organization:null,scopes:["verifier"]}).map(item=>item.label);expect(verifier).toContain("Verification queue");expect(verifier).toContain("Financing approvals");expect(verifier).not.toContain("Settlement operations");expect(verifier).not.toContain("Audit logs");});
});
