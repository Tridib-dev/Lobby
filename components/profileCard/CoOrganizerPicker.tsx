"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  ProfileRowShell,
  type ProfileRowUser,
} from "./ProfileRow";
import { AddCoOrganizerModal } from "./AddCoOrganizerModal";

export interface CoOrganizerPickerProps {
  viewerClerkId: string;
  value: ProfileRowUser[];
  onChange: (next: ProfileRowUser[]) => void;
}

export function CoOrganizerPicker({
  viewerClerkId,
  value,
  onChange,
}: CoOrganizerPickerProps) {
  const [open, setOpen] = useState(false);

  const selectedClerkIds = new Set(
    value.map((u) => u.clerkId)
  );

  function handleToggle(user: ProfileRowUser) {
    if (selectedClerkIds.has(user.clerkId)) {
      onChange(
        value.filter(
          (u) => u.clerkId !== user.clerkId
        )
      );
    } else {
      onChange([...value, user]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((user) => (
        <ProfileRowShell
          key={user.clerkId}
          user={user}
          trailing={
            <button
              type="button"
              onClick={() => handleToggle(user)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition-all hover:bg-white hover:text-slate-800 hover:shadow"
              aria-label={`Remove ${user.firstName} ${user.lastName}`}
            >
              <X size={14} />
            </button>
          }
        />
      ))}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 hover:shadow-md"
      >
        <Plus size={16} />
        Invite co-organizer
      </button>

      <AddCoOrganizerModal
        open={open}
        onOpenChange={setOpen}
        viewerClerkId={viewerClerkId}
        selectedClerkIds={selectedClerkIds}
        onToggle={handleToggle}
      />
    </div>
  );
}