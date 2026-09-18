"use client";

import { useState } from "react";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";

import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
 } from "@/components/ui/v-alert-dialog-8-utils/alert-dialog";

interface EventCancellationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

const EventCancellationModal = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: EventCancellationModalProps) => {
  const [isLeaving, setIsLeaving] = useState(false);

  // Don't let Escape / overlay click cut off the leave action mid-flight.
  const handleOpenChange = (next: boolean) => {
    if (isLeaving) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      await onConfirm();
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="gap-0 rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl shadow-neutral-900/10 sm:max-w-sm">
        <div className="flex flex-col items-center gap-3 p-6 pb-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlertIcon className="size-6" />
          </div>
          <AlertDialogHeader className="items-center gap-0 sm:text-center">
            <AlertDialogTitle className="text-neutral-900">{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-500">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="flex-row items-center justify-between gap-3 px-6 pb-6 pt-2 sm:justify-between sm:space-x-0">
          <AlertDialogCancel
            disabled={isLeaving}
            className="mt-0 border-neutral-300 bg-white text-neutral-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 hover:shadow-slate-700 active:scale-[0.97] active:bg-neutral-100 disabled:opacity-50"
          >
            Stay
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLeaving}
            className="bg-destructive text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-lg hover:shadow-destructive/25 active:translate-y-0 active:scale-[0.97] active:bg-red-700 active:shadow-sm disabled:pointer-events-none disabled:opacity-70"
          >
            {isLeaving ? (
              <span className="flex items-center gap-1.5">
                <Loader2Icon className="size-4 animate-spin" />
                Leaving...
              </span>
            ) : (
              "Leave anyway"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default EventCancellationModal;