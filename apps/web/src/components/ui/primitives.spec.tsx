import { render,screen } from "@testing-library/react";
import { describe,it,expect,vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";
import { EmptyState,ErrorState,LoadingState } from "./states";
import { StatusBadge } from "./status";
import { ConfirmAction } from "./confirm-action";
describe("accessible application states",()=>{
 it("renders loading, empty and error states",()=>{const retry=vi.fn();render(<><LoadingState/><EmptyState description="No verified invoices yet."/><ErrorState message="RPC unavailable" retry={retry}/></>);expect(screen.getByRole("status")).toBeVisible();expect(screen.getByText("No verified invoices yet.")).toBeVisible();expect(screen.getByRole("alert")).toHaveTextContent("RPC unavailable");});
 it("labels verification status and disables blocked actions",()=>{render(<><StatusBadge status="submitted"/><Button disabled>Fund this invoice</Button></>);expect(screen.getByText("In review")).toBeVisible();expect(screen.getByRole("button",{name:"Fund this invoice"})).toBeDisabled();});
 it("requires explicit confirmation before a wallet action",async()=>{const action=vi.fn();render(<ConfirmAction label="Claim repayment" title="Confirm your claim" description="Claim MOCK 100." onConfirm={action}/>);await userEvent.click(screen.getByRole("button",{name:"Claim repayment"}));expect(action).not.toHaveBeenCalled();expect(screen.getByRole("dialog")).toBeVisible();await userEvent.click(screen.getByRole("button",{name:"Continue to wallet"}));expect(action).toHaveBeenCalledOnce();});
});
