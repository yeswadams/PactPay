import { describe,it,expect } from "vitest";
import { parseAmount,formatAmount,formatKes,onboardingSchema,invoiceInputSchema,offerSchema } from "./domain";
const address="0x1111111111111111111111111111111111111111";
describe("integer financial values",()=>{
 it("preserves cents and six-decimal base units without floating point",()=>{expect(parseAmount("0.01",2)).toBe("1");expect(parseAmount("450.000001",6)).toBe("450000001");expect(parseAmount("9007199254740993.000001",6)).toBe("9007199254740993000001");expect(formatAmount("9007199254740993000001")).toBe("MOCK 9,007,199,254,740,993.000001");expect(formatKes("50000000")).toBe("KES 500,000.00");});
 it.each(["1e6","-10","0.0000001","NaN","2.5.1","01.00"])("rejects invalid token amount %s",value=>{expect(()=>parseAmount(value,6)).toThrow();});
 it("rejects invalid invoice principal and settlement fee",()=>{expect(invoiceInputSchema.safeParse({invoiceNumber:"INV-1",customerName:"Sample customer",description:"Sample delivery invoice",faceValueCents:"100",advanceCents:"101",dueDate:"2027-01-01",idempotencyKey:"11111111-1111-4111-8111-111111111111"}).success).toBe(false);expect(offerSchema.safeParse({token:address,beneficiary:address,treasury:address,target:"450",repayment:"500",fee:"51",fundingDeadline:"1000",maturity:"2000"}).success).toBe(false);});
 it("does not permit administrator onboarding",()=>{expect(onboardingSchema.safeParse({name:"Sample owner",email:"sample@example.invalid",organizationName:"Sample org",kind:"administrator"}).success).toBe(false);});
});
