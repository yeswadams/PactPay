"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogClose, DialogTrigger } from "./dialog";
import { Button } from "./button";
export function ConfirmAction({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <p className="notice">
          Your wallet will show the final transaction and network fee. Review
          the amount and recipient before confirming.
        </p>
        <div className="dialog-actions">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            onClick={async () => {
              setOpen(false);
              await onConfirm();
            }}
          >
            Continue to wallet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
