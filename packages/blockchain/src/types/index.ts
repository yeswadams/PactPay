import type { ContractFunctionReturnType } from "viem";
import type { financingAbi } from "../abi/index.ts";
export type FinancingListing = ContractFunctionReturnType<
  typeof financingAbi,
  "view",
  "getListing"
>;
export type FinancingTerms = FinancingListing["terms"];
