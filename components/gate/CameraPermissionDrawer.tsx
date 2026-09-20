"use client";

import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export interface CameraPermissionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
}

export default function CameraPermissionDrawer({
  open,
  onOpenChange,
  onRetry,
}: CameraPermissionDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent className="w-full border border-white/10 bg-[#11161d] text-white shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-0 flex flex-col sm:max-w-md sm:mx-auto data-[vaul-drawer-direction=bottom]:!rounded-t-3xl data-[vaul-drawer-direction=bottom]:!mt-0 data-[vaul-drawer-direction=bottom]:!h-[72vh] data-[vaul-drawer-direction=bottom]:!max-h-[72vh]">
        <DrawerHeader className="border-b border-white/10 px-4 py-3 text-left">
          <DrawerTitle className="text-sm font-semibold text-white/95">Camera access needed</DrawerTitle>
          <DrawerDescription className="text-xs leading-5 text-white/55">
            The scanner could not start the camera. Check the message above, then retry after fixing the browser or
            device setting.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[13px] font-medium text-white/90">What to do</p>
            <ul className="mt-2 space-y-2 text-[12px] leading-5 text-white/55">
              <li>1. Allow camera access when the browser asks.</li>
              <li>2. If you already blocked it, open the site camera permission in your browser.</li>
              <li>3. Tap Retry after changing the permission.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
            <p className="text-[12px] leading-5 text-cyan-100/90">
              Tip: if your browser shows a small camera icon in the address bar, use that to
              change permission for this site later.
            </p>
          </div>
        </div>

        <DrawerFooter className="border-t border-white/10 px-4 py-4">
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-[#081018] transition-colors hover:bg-cyan-300"
          >
            Retry camera access
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
