import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

export type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
};

export function ConfirmDialog({ request, onClose }: { request: Confirmation | null; onClose: () => void }) {
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(request?.tone === "danger" && buttonVariants({ variant: "destructive" }))}
            onClick={() => {
              request?.onConfirm();
              onClose();
            }}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
