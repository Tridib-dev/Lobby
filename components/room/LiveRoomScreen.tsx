"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ParticipantsAudio,
  ParticipantView,
  StreamCall,
  StreamTheme,
  hasAudio,
  hasScreenShare,
  hasVideo,
  isPinned,
  useCallStateHooks,
  type Call,
  type StreamVideoParticipant,
} from "@stream-io/video-react-sdk";
import {
  HelpCircle,
  Mic,
  MicOff,
  MessageSquare,
  MonitorUp,
  PhoneOff,
  PictureInPicture2,
  Pin,
  Shield,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Smile,
} from "lucide-react";
import { toast } from "sonner";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import { RoomMorphStage } from "./morph-nav/RoomMorphStage";
import type { MorphNavItem } from "./morph-nav/MorphNav";
import { describeMediaDeviceError } from "@/lib/room/media-error";

export interface LiveRoomScreenProps {
  call: Call;
  onLeave: () => void;
  eventId: string;
  showDeviceControls?: boolean;
  canModerate?: boolean;
  eventTitle?: string;
  bannerUrl?: string;
}

type RoomTab = "participants" | "chat" | "qa" | null;

type VoteState = {
  upvotes: number;
  downvotes: number;
  myVote: "up" | "down" | null;
};

type StageEvent = {
  id: string;
  kind: "emoji" | "hand";
  emoji?: string;
  displayName: string;
  role: string;
  createdAt: number;
  isRaised?: boolean;
  participantId?: string;
};

type StageViewMode = "normal" | "fit";

type MessageItem = {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: number;
  votes: VoteState;
};

type QuestionItem = {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: number;
  answered: boolean;
  answerBody?: string;
  answeredAt?: number;
  answeredByClerkId?: string;
  votes: VoteState;
};

type DiscussionMessageApiItem = {
  id?: string;
  authorName?: string;
  authorRole?: string;
  body?: string;
  createdAt?: string;
  upvotes?: number;
  downvotes?: number;
  myVote?: "up" | "down" | null;
};

type DiscussionQuestionApiItem = {
  id?: string;
  authorName?: string;
  authorRole?: string;
  body?: string;
  createdAt?: string;
  answered?: boolean;
  answerBody?: string;
  answeredAt?: string;
  answeredByClerkId?: string;
  upvotes?: number;
  downvotes?: number;
  myVote?: "up" | "down" | null;
};

const STAGE_REACTION_OPTIONS = ["👍", "❤️", "🎉", "😂", "🙌"] as const;
const STAGE_REACTION_CODE_MAP: Record<(typeof STAGE_REACTION_OPTIONS)[number], string> = {
  "👍": ":like:",
  "❤️": ":heart:",
  "🎉": ":fireworks:",
  "😂": ":smile:",
  "🙌": ":raise-hand:",
};
const REACTION_CODE_TO_EMOJI: Record<string, string> = {
  ":like:": "👍",
  ":heart:": "❤️",
  ":fireworks:": "🎉",
  ":smile:": "😂",
  ":dislike:": "👎",
  ":raise-hand:": "✋",
};

// TrackType is present in the SDK declarations but is not exported by the
// browser runtime bundle used by Next/Turbopack. This is the SDK enum value
// for a screen-share track.
const SCREEN_SHARE_TRACK_TYPE = 3;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function reactionDisplayEmoji(emojiCode?: string) {
  if (!emojiCode) return "✨";
  return REACTION_CODE_TO_EMOJI[emojiCode] ?? emojiCode;
}

function participantHasRaisedHand(participant: StreamVideoParticipant) {
  const reaction = participant.reaction;
  if (!reaction) return false;
  if (reaction.type !== "raised-hand" && reaction.emoji_code !== ":raise-hand:") return false;
  return reaction.custom?.status !== "off";
}

function InitialsAvatar({ name }: { name?: string }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#1B1F27]">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#262B35] text-xl font-semibold text-[#8891A3]">
        {initial}
      </div>
    </div>
  );
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function participantLabel(participant?: StreamVideoParticipant) {
  return participant?.name?.trim() || participant?.userId || "Unknown";
}

function participantRoleLabel(participant: StreamVideoParticipant) {
  if (participant.roles?.includes("admin")) return "organizer";
  if (participant.roles?.includes("host")) return "host";
  if (participant.roles?.includes("speaker")) return "speaker";
  return "attendee";
}

function participantRoleBadge(role: string) {
  if (role === "organizer" || role === "co-organizer") return "host";
  return role;
}

// "Admin tier" = organizers and co-organizers. Stream's call-level "admin" role
// maps to organizer; "host" is used as the co-organizer tier elsewhere in this
// file (see participantRoleBadge), so it's treated as admin tier here too.
function isAdminParticipant(participant: StreamVideoParticipant) {
  const role = participantRoleLabel(participant);
  return role === "organizer" || role === "host";
}

function voteKey(kind: "message" | "question", targetId: string, direction: "up" | "down") {
  return `${kind}:${targetId}:${direction}`;
}

function VoteBar({
  kind,
  targetId,
  votes,
  onToggleVote,
  sendingVoteKey,
}: {
  kind: "message" | "question";
  targetId: string;
  votes: VoteState;
  onToggleVote: (kind: "message" | "question", targetId: string, direction: "up" | "down") => void;
  sendingVoteKey: string | null;
}) {
  const upKey = voteKey(kind, targetId, "up");
  const downKey = voteKey(kind, targetId, "down");

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onToggleVote(kind, targetId, "up")}
        disabled={sendingVoteKey !== null && sendingVoteKey !== upKey}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
          votes.myVote === "up"
            ? "border-[#4f46e5]/40 bg-[#4f46e5]/15 text-[#F3F5F8]"
            : "border-[#262B35] bg-[#0A0C10] text-[#8891A3] hover:border-[#4f46e5]/40 hover:text-[#F3F5F8]"
        }`}
      >
        <span>▲</span>
        <span>{votes.upvotes}</span>
      </button>
      <button
        type="button"
        onClick={() => onToggleVote(kind, targetId, "down")}
        disabled={sendingVoteKey !== null && sendingVoteKey !== downKey}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
          votes.myVote === "down"
            ? "border-[#FF5468]/40 bg-[#FF5468]/15 text-[#F3F5F8]"
            : "border-[#262B35] bg-[#0A0C10] text-[#8891A3] hover:border-[#FF5468]/40 hover:text-[#F3F5F8]"
        }`}
      >
        <span>▼</span>
        <span>{votes.downvotes}</span>
      </button>
    </div>
  );
}

function StageReactionOverlay({ events }: { events: StageEvent[] }) {
  const visibleEvents = events.slice(0, 6);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="absolute bottom-8 right-4 flex justify-end sm:right-6 lg:right-8">
        <div className="flex w-fit flex-col items-end gap-2">
          {visibleEvents.map((event, index) => {
            const isHand = event.kind === "hand";
            const label = isHand ? (event.isRaised === false ? "lowered hand" : "raised hand") : event.emoji ?? "✨";

            return (
              <div
                key={event.id}
                className="shrink-0 drop-shadow-[0_10px_25px_rgba(0,0,0,0.35)]"
                style={
                  {
                    animation: "room-float-up 2.5s cubic-bezier(0.2, 0.9, 0.2, 1) forwards",
                    animationDelay: `${index * 95}ms`,
                  } as CSSProperties
                }
              >
                <div className="flex items-center gap-2 rounded-full border border-[#4f46e5]/35 bg-linear-to-r from-[#4f46e5]/30 via-[#11161D]/90 to-[#33D6A0]/25 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-white/10 backdrop-blur-md">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base leading-none shadow-inner shadow-white/10">
                    {isHand ? "✋" : reactionDisplayEmoji(event.emoji)}
                  </span>
                  <span className="max-w-32 truncate text-white/95">{event.displayName}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#D9F7FF]">
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes room-float-up {
          0% {
            transform: translate3d(0, 20px, 0) scale(0.9);
            opacity: 0;
          }
          12% {
            opacity: 1;
            transform: translate3d(0, 6px, 0) scale(1.03);
          }
          24% {
            transform: translate3d(0, -2px, 0) scale(1);
          }
          70% {
            transform: translate3d(0, -28px, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate3d(0, -76px, 0) scale(0.97);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function StageViewModeButton({
  mode,
  label,
  active,
  onClick,
  icon,
}: {
  mode: StageViewMode;
  label: string;
  active: boolean;
  onClick: (mode: StageViewMode) => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      title={label}
      className={`flex items-center justify-center gap-2 rounded-full border p-2.5 text-sm font-medium transition sm:px-3 sm:py-2 ${
        active
          ? "border-[#4f46e5]/40 bg-[#4f46e5]/20 text-[#F3F5F8] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          : "border-white/10 bg-[#11161D]/80 text-[#8891A3] hover:border-[#4f46e5]/30 hover:text-[#F3F5F8]"
      }`}
      aria-label={`Switch stage view to ${label.toLowerCase()}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ParticipantCard({
  participant,
  handRaised,
}: {
  participant: StreamVideoParticipant;
  handRaised: boolean;
}) {
  const label = participantLabel(participant);
  const role = participantRoleLabel(participant);

  // Attendees are never a valid pin target (see togglePin) — this card is
  // deliberately non-interactive, no pin affordance at all.
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#262B35] bg-[#14171D]/90 text-left">
      <div className="relative h-24">
        <ParticipantView
          participant={participant}
          muteAudio
          VideoPlaceholder={() => <InitialsAvatar name={label} />}
          ParticipantViewUI={null}
          className="h-full w-full"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#F3F5F8]">{label}</p>
          <p className="text-[11px] uppercase tracking-wide text-[#8891A3]">{role}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[#8891A3]">
          {handRaised && (
            <span className="rounded-full border border-[#F5A623]/25 bg-[#F5A623]/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#F5A623]">
              ✋ raised
            </span>
          )}
          {participant.isLocalParticipant && (
            <span className="rounded-full bg-[#1B1F27] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#4f46e5]">
              you
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminParticipantCard({
  participant,
  canModerate,
  onTogglePin,
  handRaised,
}: {
  participant: StreamVideoParticipant;
  canModerate: boolean;
  onTogglePin: (participant: StreamVideoParticipant) => void;
  handRaised: boolean;
}) {
  const pinned = isPinned(participant);
  const label = participantLabel(participant);
  const role = participantRoleLabel(participant);
  const micOn = hasAudio(participant);
  const cameraOn = hasVideo(participant);

  return (
    <button
      type="button"
      onClick={() => canModerate && onTogglePin(participant)}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        pinned
          ? "border-[#4f46e5]/70 bg-[#14171D]"
          : "border-[#262B35] bg-[#14171D]/90 hover:border-[#4f46e5]/50"
      } ${canModerate ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Deliberately no <ParticipantView> here — admin cards never show live
          video, even when the camera is on. Camera state is a badge, not a feed. */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B1F27] text-sm font-semibold text-[#8891A3]">
        {(label.trim()[0] ?? "?").toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#F3F5F8]">{label}</p>
        <p className="text-[11px] uppercase tracking-wide text-[#8891A3]">{participantRoleBadge(role)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {handRaised && (
          <span className="rounded-full border border-[#F5A623]/25 bg-[#F5A623]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#F5A623]">
            ✋
          </span>
        )}
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            micOn ? "bg-[#33D6A0]/15 text-[#33D6A0]" : "bg-[#262B35] text-[#8891A3]"
          }`}
          aria-label={micOn ? "Mic on" : "Mic off"}
        >
          {micOn ? <Mic size={12} /> : <MicOff size={12} />}
        </span>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            cameraOn ? "bg-[#33D6A0]/15 text-[#33D6A0]" : "bg-[#262B35] text-[#8891A3]"
          }`}
          aria-label={cameraOn ? "Camera on" : "Camera off"}
        >
          {cameraOn ? <Video size={12} /> : <VideoOff size={12} />}
        </span>
        {pinned && <Pin size={13} className="text-[#4f46e5]" />}
        {participant.isLocalParticipant && (
          <span className="rounded-full bg-[#1B1F27] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#4f46e5]">
            you
          </span>
        )}
      </div>
    </button>
  );
}

function ParticipantsPanel({
  canModerate,
  onTogglePin,
}: {
  canModerate: boolean;
  onTogglePin: (participant: StreamVideoParticipant) => void;
}) {
  const { useParticipants, usePinnedParticipants, useLocalParticipant } = useCallStateHooks();
  const participants = useParticipants();
  const pinnedParticipants = usePinnedParticipants();
  const localParticipant = useLocalParticipant();

  const orderParticipants = (list: StreamVideoParticipant[]) =>
    [...list].sort((a, b) => {
      const aRaisedHand = participantHasRaisedHand(a) ? 1 : 0;
      const bRaisedHand = participantHasRaisedHand(b) ? 1 : 0;
      if (aRaisedHand !== bRaisedHand) return bRaisedHand - aRaisedHand;
      const aPinned = isPinned(a) ? 1 : 0;
      const bPinned = isPinned(b) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      if (a.isLocalParticipant !== b.isLocalParticipant) return a.isLocalParticipant ? -1 : 1;
      return participantLabel(a).localeCompare(participantLabel(b));
    });

  const adminParticipants = useMemo(
    () => orderParticipants(participants.filter((participant) => isAdminParticipant(participant))),
    [participants]
  );
  const attendeeParticipants = useMemo(
    () => orderParticipants(participants.filter((participant) => !isAdminParticipant(participant))),
    [participants]
  );

  const [tab, setTab] = useState<"admins" | "attendees">("admins");
  const visibleParticipants = tab === "admins" ? adminParticipants : attendeeParticipants;
  const showingEmptyState = visibleParticipants.length === 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#262B35] bg-[#14171D] px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-[#8891A3]">{participants.length} in room</p>
        <Users size={16} className="text-[#4f46e5]" />
      </div>

      <div className="flex items-center gap-1 rounded-2xl border border-[#262B35] bg-[#14171D] p-1">
        <button
          type="button"
          onClick={() => setTab("admins")}
          className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition ${
            tab === "admins" ? "bg-[#4f46e5] text-[#081018]" : "text-[#8891A3] hover:text-[#F3F5F8]"
          }`}
        >
          Admins ({adminParticipants.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("attendees")}
          className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition ${
            tab === "attendees" ? "bg-[#4f46e5] text-[#081018]" : "text-[#8891A3] hover:text-[#F3F5F8]"
          }`}
        >
          Attendees ({attendeeParticipants.length})
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {showingEmptyState && (
          <div className="rounded-2xl border border-dashed border-[#262B35] bg-[#0A0C10] px-4 py-8 text-center text-sm text-[#8891A3]">
            {tab === "admins" ? "No organizers or co-organizers in the room yet." : "No attendees in the room yet."}
          </div>
        )}

        {tab === "admins"
          ? adminParticipants.map((participant) => (
              <AdminParticipantCard
                key={participant.sessionId}
                participant={participant}
                canModerate={canModerate}
                onTogglePin={onTogglePin}
                handRaised={participantHasRaisedHand(participant)}
              />
            ))
          : attendeeParticipants.map((participant) => (
              <ParticipantCard
                key={participant.sessionId}
                participant={participant}
                handRaised={participantHasRaisedHand(participant)}
              />
            ))}
      </div>

      <div className="rounded-2xl border border-[#262B35] bg-[#14171D] px-3 py-2 text-xs text-[#8891A3]">
        {canModerate && localParticipant ? (
          <>
            <span className="font-medium text-[#F3F5F8]">Host tools active.</span> Pinning and screen share are
            available to organizers.
          </>
        ) : (
          <>
            <span className="font-medium text-[#F3F5F8]">Attendee mode.</span> You can watch, chat, ask questions, and
            leave.
          </>
        )}
      </div>

      {pinnedParticipants.length > 0 && (
        <div className="rounded-2xl border border-[#262B35] bg-[#14171D] px-3 py-2 text-xs text-[#8891A3]">
          Pinned: {pinnedParticipants.map((p) => participantLabel(p)).join(", ")}
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  onVote,
  sendingVoteKey,
  sending,
  loading,
}: {
  messages: MessageItem[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onVote: (kind: "message" | "question", targetId: string, direction: "up" | "down") => void;
  sendingVoteKey: string | null;
  sending: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#262B35] bg-[#14171D] px-4 py-8 text-center text-sm text-[#8891A3]">
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#262B35] bg-[#14171D] px-4 py-8 text-center text-sm text-[#8891A3]">
            No chat messages yet.
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="rounded-2xl border border-[#262B35] bg-[#14171D] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#F3F5F8]">{message.author}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[#8891A3]">{participantRoleBadge(message.role)}</p>
                </div>
                <span className="text-[11px] text-[#8891A3]">{formatTime(message.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-[#D7DCE4]">{message.body}</p>
              <VoteBar
                kind="message"
                targetId={message.id}
                votes={message.votes}
                onToggleVote={onVote}
                sendingVoteKey={sendingVoteKey}
              />
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[#262B35] pt-3">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Write a message..."
          className="w-full rounded-xl border border-[#262B35] bg-[#0A0C10] px-3 py-2 text-sm text-[#F3F5F8] outline-none placeholder:text-[#8891A3] focus:border-[#4f46e5]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="shrink-0 rounded-xl bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-[#0A0C10]"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function QaPanel({
  questions,
  draft,
  onDraftChange,
  onAsk,
  onAnswer,
  onVote,
  sendingVoteKey,
  answerDrafts,
  onAnswerDraftChange,
  canModerate,
  sendingQuestion,
  sendingAnswerId,
  loading,
}: {
  questions: QuestionItem[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAsk: () => void;
  onAnswer: (questionId: string) => void;
  onVote: (kind: "message" | "question", targetId: string, direction: "up" | "down") => void;
  sendingVoteKey: string | null;
  answerDrafts: Record<string, string>;
  onAnswerDraftChange: (questionId: string, value: string) => void;
  canModerate: boolean;
  sendingQuestion: boolean;
  sendingAnswerId: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-[#262B35] bg-[#14171D] px-4 py-8 text-center text-sm text-[#8891A3]">
            Loading Q&A history...
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#262B35] bg-[#14171D] px-4 py-8 text-center text-sm text-[#8891A3]">
            No questions yet.
          </div>
        ) : (
          questions.map((question) => (
            <div key={question.id} className="rounded-2xl border border-[#262B35] bg-[#14171D] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#F3F5F8]">{question.author}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[#8891A3]">{participantRoleBadge(question.role)}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  question.answered ? "bg-[#33D6A0]/15 text-[#33D6A0]" : "bg-[#F5A623]/15 text-[#F5A623]"
                }`}>
                  {question.answered ? "answered" : "open"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#D7DCE4]">{question.body}</p>
              <VoteBar
                kind="question"
                targetId={question.id}
                votes={question.votes}
                onToggleVote={onVote}
                sendingVoteKey={sendingVoteKey}
              />
              {question.answered && question.answerBody && (
                <div className="mt-3 rounded-xl border border-[#33D6A0]/20 bg-[#33D6A0]/8 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-[#33D6A0]">Answer</p>
                  <p className="mt-1 text-sm text-[#EAFBF4]">{question.answerBody}</p>
                </div>
              )}
              {canModerate && !question.answered && (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea
                    rows={2}
                    value={answerDrafts[question.id] ?? ""}
                    onChange={(e) => onAnswerDraftChange(question.id, e.target.value)}
                    placeholder="Write an answer..."
                    className="w-full rounded-xl border border-[#262B35] bg-[#0A0C10] px-3 py-2 text-sm text-[#F3F5F8] outline-none placeholder:text-[#8891A3] focus:border-[#4f46e5]"
                  />
                  <button
                    type="button"
                    onClick={() => onAnswer(question.id)}
                    disabled={sendingAnswerId === question.id}
                    className="self-end rounded-xl bg-[#33D6A0] px-3 py-2 text-xs font-semibold text-[#0A0C10]"
                  >
                    {sendingAnswerId === question.id ? "Posting..." : "Mark answered"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[#262B35] pt-3">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Ask a question..."
          className="w-full rounded-xl border border-[#262B35] bg-[#0A0C10] px-3 py-2 text-sm text-[#F3F5F8] outline-none placeholder:text-[#8891A3] focus:border-[#4f46e5]"
        />
        <button
          type="button"
          onClick={onAsk}
          disabled={sendingQuestion}
          className="shrink-0 rounded-xl bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-[#0A0C10]"
        >
          {sendingQuestion ? "Asking..." : "Ask"}
        </button>
      </div>
    </div>
  );
}

function DeviceButtons({ setDeviceError }: { setDeviceError: (value: string | null) => void }) {
  const { useCameraState, useMicrophoneState, useHasPermissions } = useCallStateHooks();
  const { camera, isMute: camMuted, hasBrowserPermission: hasCamPermission } = useCameraState();
  const { microphone, isMute: micMuted, hasBrowserPermission: hasMicPermission } = useMicrophoneState();
  const canPublishVideo = useHasPermissions("send-video");

  async function toggleCamera() {
    setDeviceError(null);
    if (!canPublishVideo) {
      setDeviceError("Your Stream room role cannot publish video. Enable Send video for the organizer role in the event-room call type.");
      return;
    }
    try {
      await camera.toggle();
    } catch (error: unknown) {
      console.error("[LiveRoomScreen] camera toggle failed", error);
      setDeviceError(describeMediaDeviceError("camera", error));
    }
  }

  async function toggleMicrophone() {
    setDeviceError(null);
    try {
      await microphone.toggle();
    } catch (error: unknown) {
      console.error("[LiveRoomScreen] microphone toggle failed", error);
      setDeviceError(describeMediaDeviceError("microphone", error));
    }
  }

  return (
    <>
      <button
        onClick={toggleMicrophone}
        className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${
          micMuted || !hasMicPermission ? "bg-[#262B35] text-[#8891A3]" : "bg-[#1B1F27] text-[#F3F5F8]"
        }`}
        aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
      >
        {micMuted || !hasMicPermission ? <MicOff size={17} /> : <Mic size={17} />}
        <span className="hidden sm:inline">Mic</span>
      </button>
      <button
        onClick={toggleCamera}
        aria-disabled={!canPublishVideo}
        className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${
          camMuted || !hasCamPermission || !canPublishVideo
            ? "bg-[#262B35] text-[#8891A3]"
            : "bg-[#1B1F27] text-[#F3F5F8]"
        }`}
        aria-label={camMuted ? "Turn on camera" : "Turn off camera"}
      >
        {camMuted || !hasCamPermission ? <VideoOff size={17} /> : <Video size={17} />}
        <span className="hidden sm:inline">Camera</span>
      </button>
    </>
  );
}


function LeaveMeetingModal({
  open,
  onClose,
  onLeave,
  onEndMeeting,
  canModerate,
  ending,
  endError,
}: {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
  onEndMeeting: () => void;
  canModerate: boolean;
  ending: boolean;
  endError: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !ending) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, ending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end justify-center bg-black/60 px-3 pb-3 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={() => !ending && onClose()}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-3xl border border-[#262B35] bg-[#11161D] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center">
          <p className="text-base font-semibold text-[#F3F5F8]">Leave meeting?</p>
          <p className="mt-1 text-sm text-[#8891A3]">
            {canModerate
              ? "You can leave and let others continue, or end the meeting for everyone."
              : "You can rejoin anytime while the meeting is live."}
          </p>
        </div>

        {endError && <p className="text-center text-xs text-[#FF5468]">{endError}</p>}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onLeave}
            disabled={ending}
            className="flex h-11 items-center justify-center rounded-full bg-[#1B1F27] text-sm font-semibold text-[#F3F5F8] transition hover:bg-white/10 disabled:opacity-60"
          >
            Leave meeting
          </button>

          {canModerate && (
            <button
              type="button"
              onClick={onEndMeeting}
              disabled={ending}
              className="flex h-11 items-center justify-center rounded-full bg-[#FF5468] text-sm font-semibold text-[#0A0C10] transition hover:bg-[#FF5468]/90 disabled:opacity-60"
            >
              {ending ? "Ending…" : "End meeting for everyone"}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={ending}
            className="flex h-11 items-center justify-center rounded-full border border-[#262B35] text-sm font-medium text-[#8891A3] transition hover:text-[#F3F5F8] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlsBar({
  eventId,
  onLeave,
  onToggleScreenShare,
  onSendStageEmoji,
  onRaiseHand,
  showDeviceControls = true,
  canModerate = false,
  screenShareActive = false,
  handRaised = false,
  roomAudioMuted = false,
  onToggleRoomAudio,
}: {
  eventId: string;
  onLeave: () => void;
  onToggleScreenShare: () => void;
  onSendStageEmoji: (emoji: string) => void;
  onRaiseHand: () => void;
  showDeviceControls?: boolean;
  canModerate?: boolean;
  screenShareActive?: boolean;
  handRaised?: boolean;
  roomAudioMuted?: boolean;
  onToggleRoomAudio?: () => void;
}) {
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const reactionsRef = useRef<HTMLDivElement>(null);

  async function handleEndMeeting() {
    if (ending) return;
    setEnding(true);
    setEndError(null);
    try {
      const res = await fetch(`/api/rooms/${eventId}/end`, { method: "POST" });
      if (!res.ok) {
        setEndError("Couldn't end the meeting — try again.");
        return;
      }
      // Ending the meeting also leaves this client's own call.
      onLeave();
    } catch {
      setEndError("Network error — try again.");
    } finally {
      setEnding(false);
    }
  }

  useEffect(() => {
    if (!reactionsOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (reactionsRef.current && target && !reactionsRef.current.contains(target)) {
        setReactionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setReactionsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionsOpen]);

  function handlePickEmoji(emoji: string) {
    onSendStageEmoji(emoji);
    setReactionsOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-2 border-t border-[#262B35] bg-[#0A0C10] px-3 py-3">
      {deviceError && <p className="text-xs text-[#FF5468]">{deviceError}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <div ref={reactionsRef} className="relative">
          {reactionsOpen && (
            <div
              className="
                fixed inset-x-0 bottom-24 z-50 flex justify-center px-3
                sm:absolute sm:inset-x-auto sm:bottom-full sm:left-1/2 sm:mb-3
                sm:w-max sm:-translate-x-1/2 sm:px-0
              "
            >
              <Dock
                className="max-w-[calc(100vw-1.5rem)] items-end"
                panelHeight={52}
                magnification={56}
                distance={90}
              >
                {STAGE_REACTION_OPTIONS.map((emoji) => (
                  <DockItem
                    key={emoji}
                    className="aspect-square rounded-full bg-[#1B1F27]"
                    onClick={() => handlePickEmoji(emoji)}
                  >
                    <DockLabel>{emoji}</DockLabel>
                    <DockIcon>
                      <span className="select-none">{emoji}</span>
                    </DockIcon>
                  </DockItem>
                ))}
              </Dock>
            </div>
          )}

          <button
            type="button"
            onClick={() => setReactionsOpen((open) => !open)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-[#262B35] bg-[#14171D] text-[#F3F5F8] transition hover:bg-white/10 ${
              reactionsOpen ? "border-[#4f46e5]/40 bg-[#4f46e5]/20 text-[#4f46e5]" : ""
            }`}
            aria-label="Open reactions"
            aria-expanded={reactionsOpen}
            aria-haspopup="true"
          >
            <Smile size={18} />
          </button>
        </div>

        {/* Raise hand — own button, not inside the emoji pill */}
        <button
          type="button"
          onClick={onRaiseHand}
          className={`flex h-11 items-center gap-2 rounded-full border border-[#262B35] px-3 text-sm font-medium transition sm:px-4 ${
            handRaised
              ? "border-[#F5A623]/40 bg-[#F5A623]/20 text-[#FFD685]"
              : "bg-[#14171D] text-[#F3F5F8] hover:bg-white/10"
          }`}
        >
          <span>✋</span>
          <span className="hidden sm:inline">{handRaised ? "Lower hand" : "Raise hand"}</span>
        </button>

        {showDeviceControls && <DeviceButtons setDeviceError={setDeviceError} />}

        {canModerate && (
          <button
            onClick={onToggleScreenShare}
            className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${
              screenShareActive ? "bg-[#33D6A0] text-[#0A0C10]" : "bg-[#1B1F27] text-[#F3F5F8]"
            }`}
            aria-label={screenShareActive ? "Stop screen share" : "Start screen share"}
          >
            <MonitorUp size={17} />
            <span className="hidden sm:inline">{screenShareActive ? "Stop share" : "Share screen"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleRoomAudio}
          className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${
            roomAudioMuted ? "bg-[#FF5468] text-[#0A0C10]" : "bg-[#1B1F27] text-[#F3F5F8]"
          }`}
          aria-pressed={roomAudioMuted}
          aria-label={roomAudioMuted ? "Unmute room audio" : "Mute room audio"}
        >
          {roomAudioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          <span className="hidden sm:inline">{roomAudioMuted ? "Room muted" : "Mute room"}</span>
        </button>

        <button
          onClick={() => setLeaveModalOpen(true)}
          className="flex h-11 items-center gap-2 rounded-full bg-[#FF5468] px-4 text-sm font-semibold text-[#0A0C10]"
          aria-label="Leave meeting"
        >
          <PhoneOff size={17} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      <LeaveMeetingModal
        open={leaveModalOpen}
        onClose={() => {
          setLeaveModalOpen(false);
          setEndError(null);
        }}
        onLeave={onLeave}
        onEndMeeting={handleEndMeeting}
        canModerate={canModerate}
        ending={ending}
        endError={endError}
      />
    </div>
  );
}

function StagePanel({
  call,
  canModerate,
  viewMode,
  onViewModeChange,
  bannerUrl,
  eventTitle,
}: {
  call: Call;
  canModerate: boolean;
  viewMode: StageViewMode;
  onViewModeChange: (value: StageViewMode) => void;
  bannerUrl?: string;
  eventTitle?: string;
}) {
  const { useParticipants, usePinnedParticipants, useLocalParticipant, useHasOngoingScreenShare } =
    useCallStateHooks();
  const participants = useParticipants();
  const pinnedParticipants = usePinnedParticipants();
  const localParticipant = useLocalParticipant();
  const hasOngoingScreenShare = useHasOngoingScreenShare();

  const remoteParticipantsWithVideo = useMemo(
    () => participants.filter((participant) => !participant.isLocalParticipant && hasVideo(participant)),
    [participants]
  );

  const hasAdminParticipant = participants.some((participant) => isAdminParticipant(participant));

  const focusParticipant = useMemo(() => {
    const screenShareParticipant = participants.find((participant) => hasScreenShare(participant));
    if (screenShareParticipant) return screenShareParticipant;
    if (pinnedParticipants.length > 0) return pinnedParticipants[0];

    const visibleRemoteParticipant = remoteParticipantsWithVideo[0];
    if (visibleRemoteParticipant) return visibleRemoteParticipant;

    return null;
  }, [participants, pinnedParticipants, remoteParticipantsWithVideo]);

  const autoPinnedRef = useRef(false);

  // mainIsScreenSharing has to be computed here (before the effects below) rather
  // than after the early-return, because the PIP effect's dependency array needs
  // it and all hooks must run unconditionally, in the same order, every render.
  const mainIsScreenSharing = focusParticipant ? hasScreenShare(focusParticipant) : false;

  // Real browser Picture-in-Picture. Bound to the actual <video> element Stream
  // renders for the focused participant, so it pops the video out of the browser
  // tab entirely for multitasking.
  const stageVideoContainerRef = useRef<HTMLDivElement>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipSupported] = useState(() => typeof document !== "undefined" && document.pictureInPictureEnabled);

  useEffect(() => {
    const videoEl = stageVideoContainerRef.current?.querySelector("video");
    if (!videoEl) return;

    const handleEnter = () => setIsPipActive(true);
    const handleLeave = () => setIsPipActive(false);

    videoEl.addEventListener("enterpictureinpicture", handleEnter);
    videoEl.addEventListener("leavepictureinpicture", handleLeave);

    return () => {
      videoEl.removeEventListener("enterpictureinpicture", handleEnter);
      videoEl.removeEventListener("leavepictureinpicture", handleLeave);
    };
    // Re-bind whenever the underlying <video> element could have been swapped out
    // (new focus participant, or same participant flipping to/from screen share).
  }, [focusParticipant?.sessionId, mainIsScreenSharing]);

  useEffect(() => {
    // Exit PIP whenever this stage unmounts (e.g. leaving the call). Deliberately
    // exits whatever is currently in PIP rather than re-querying our own ref —
    // by the time a cleanup runs on unmount, React has already nulled the ref.
    return () => {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, []);

  const [pipNotice, setPipNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!pipNotice) return;
    const timeoutId = window.setTimeout(() => setPipNotice(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [pipNotice]);

  const handleTogglePip = useCallback(async () => {
    const videoEl = stageVideoContainerRef.current?.querySelector("video");
    if (!videoEl) return;

    try {
      if (document.pictureInPictureElement === videoEl) {
        await document.exitPictureInPicture();
        return;
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }

      // requestPictureInPicture() throws InvalidStateError if the video hasn't
      // loaded metadata yet (e.g. stage still black while a stream connects).
      // Check readiness up front instead of attempting a doomed call.
      if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
        setPipNotice("Video isn't loaded yet — try again in a moment.");
        return;
      }

      videoEl.disablePictureInPicture = false;
      await videoEl.requestPictureInPicture();
    } catch (err) {
      console.error("[LiveRoomScreen] picture-in-picture failed", err);
      setPipNotice("Couldn't pop out the video.");
    }
  }, []);

  useEffect(() => {
    if (!canModerate || !localParticipant) return;
    if (autoPinnedRef.current) return;
    if (pinnedParticipants.length > 0) {
      // Someone's already pinned room-wide (possibly by a co-organizer who
      // beat us to it) — leave it alone rather than stealing the pin.
      autoPinnedRef.current = true;
      return;
    }

    autoPinnedRef.current = true;
    call
      .pinForEveryone({ session_id: localParticipant.sessionId, user_id: localParticipant.userId })
      .catch((err: unknown) => {
        console.error("[LiveRoomScreen] auto pin failed", err);
        autoPinnedRef.current = false;
      });
  }, [canModerate, localParticipant, pinnedParticipants.length, call]);

  if (!focusParticipant) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-3xl border border-[#262B35] bg-[#11161D] px-6 text-center">
        {bannerUrl ? (
          <Image
            src={bannerUrl}
            alt={eventTitle ?? "Event"}
            fill
            unoptimized
            className="object-cover opacity-35"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(79,209,255,0.2),transparent_60%)]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#0A0C10] via-[#0A0C10]/70 to-transparent" />
        <div className="relative z-10 max-w-md space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1B1F27] text-[#4f46e5]">
            <Users size={22} />
          </div>
          <p className="text-lg font-semibold text-[#F3F5F8]">
            {hasAdminParticipant ? "Waiting for the room to populate" : "Waiting for the admins to join"}
          </p>
          <p className="max-w-sm text-sm text-[#8891A3]">
            {hasAdminParticipant
              ? "Once someone joins with video, the stage will appear here."
              : "The room is live, but no organizer or co-organizer is here yet. You can still chat, ask questions, react, and raise your hand."}
          </p>
        </div>
      </div>
    );
  }

  const label = participantLabel(focusParticipant);
  const role = participantRoleLabel(focusParticipant);

  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-[#262B35] bg-[#0A0C10]">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
        <Shield size={14} className={hasOngoingScreenShare ? "text-[#33D6A0]" : "text-[#4f46e5]"} />
        <span className="font-medium">{role}</span>
        <span className="text-white/70">•</span>
        <span>{label}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-black" ref={stageVideoContainerRef}>
        <div className={`flex h-full w-full items-center justify-center ${viewMode === "fit" ? "p-3" : "p-0"}`}>
          <ParticipantView
            participant={focusParticipant}
            trackType={mainIsScreenSharing ? "screenShareTrack" : "videoTrack"}
            mirror={focusParticipant.isLocalParticipant && !mainIsScreenSharing}
            muteAudio
            VideoPlaceholder={() => <InitialsAvatar name={label} />}
            ParticipantViewUI={null}
            className={`h-full w-full overflow-hidden bg-black [&_video]:h-full [&_video]:w-full [&_video]:bg-black [&_video]:object-center ${
              viewMode === "fit" ? "[&_video]:object-contain" : "[&_video]:object-cover"
            }`}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:bottom-10">
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          <StageViewModeButton
            mode="normal"
            label="Normal"
            active={viewMode === "normal"}
            onClick={onViewModeChange}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M4 12h16" />
              </svg>
            }
          />
          <StageViewModeButton
            mode="fit"
            label="Fit"
            active={viewMode === "fit"}
            onClick={onViewModeChange}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 5H5v5" />
                <path d="M14 19h5v-5" />
                <path d="M5 19l5-5" />
                <path d="M19 5l-5 5" />
              </svg>
            }
          />

          <button
            type="button"
            onClick={handleTogglePip}
            disabled={!pipSupported}
            title={
              !pipSupported
                ? "Picture-in-picture isn't supported in this browser"
                : isPipActive
                  ? "Exit pop-out"
                  : "Pop out"
            }
            className={`flex items-center justify-center gap-2 rounded-full border p-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 ${
              isPipActive
                ? "border-[#4f46e5]/40 bg-[#4f46e5]/20 text-[#F3F5F8] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                : "border-white/10 bg-[#11161D]/80 text-[#8891A3] hover:border-[#4f46e5]/30 hover:text-[#F3F5F8]"
            }`}
            aria-label={isPipActive ? "Exit picture-in-picture" : "Pop out video (picture-in-picture)"}
          >
            <PictureInPicture2 size={16} />
            <span className="hidden sm:inline">{isPipActive ? "Exit pop-out" : "Pop out"}</span>
          </button>

          {pipNotice && (
            <span className="hidden max-w-48 truncate rounded-full border border-[#F5A623]/30 bg-[#F5A623]/10 px-2.5 py-1 text-xs text-[#F5A623] sm:inline">
              {pipNotice}
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/70 to-transparent p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-white">{label}</p>
            <p className="text-sm text-white/70">
              {hasOngoingScreenShare ? "Screen share active" : viewMode === "fit" ? "Fit content to stage" : "Pinned stage view"}
            </p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
            {viewMode === "fit" ? "fit view" : "normal view"}
          </div>
        </div>
      </div>
    </div>
  );
}

type LiveRoomScreenContentProps = LiveRoomScreenProps & {
  activeTab: RoomTab;
  setActiveTab: (value: RoomTab) => void;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  qaDraft: string;
  setQaDraft: (value: string) => void;
  chatMessages: MessageItem[];
  questions: QuestionItem[];
  stageEvents: StageEvent[];
  drawerError: string | null;
  discussionLoading: boolean;
  sendingChat: boolean;
  sendingQuestion: boolean;
  sendingAnswerId: string | null;
  sendingVoteKey: string | null;
  answerDrafts: Record<string, string>;
  updateAnswerDraft: (questionId: string, value: string) => void;
  sendChat: () => void;
  askQuestion: () => void;
  answerQuestion: (questionId: string) => void;
  sendVote: (kind: "message" | "question", targetId: string, direction: "up" | "down") => void;
  sendStageEmoji: (emoji: string) => void;
  setDrawerError: (value: string | null) => void;
  chatUnseen: boolean;
  qaUnseen: boolean;
  chatPulsing: boolean;
  qaPulsing: boolean;
};

function LiveRoomScreenContent({
  call,
  onLeave,
  eventId,
  showDeviceControls = true,
  canModerate = false,
  eventTitle,
  bannerUrl,
  activeTab,
  setActiveTab,
  chatDraft,
  setChatDraft,
  qaDraft,
  setQaDraft,
  chatMessages,
  questions,
  stageEvents,
  drawerError,
  discussionLoading,
  sendingChat,
  sendingQuestion,
  sendingAnswerId,
  sendingVoteKey,
  answerDrafts,
  updateAnswerDraft,
  sendChat,
  askQuestion,
  answerQuestion,
  sendVote,
  sendStageEmoji,
  setDrawerError,
  chatUnseen,
  qaUnseen,
  chatPulsing,
  qaPulsing,
}: LiveRoomScreenContentProps) {
  const { useScreenShareState, useParticipants, usePinnedParticipants, useHasOngoingScreenShare, useCameraState, useMicrophoneState, useLocalParticipant } =
    useCallStateHooks();
  const { screenShare } = useScreenShareState();
  const { camera, isMute: camMuted } = useCameraState();
  const { microphone } = useMicrophoneState();
  const participants = useParticipants();
  const pinnedParticipants = usePinnedParticipants();
  const localParticipant = useLocalParticipant();
  const hasOngoingScreenShare = useHasOngoingScreenShare();
  const handRaised = Boolean(localParticipant && participantHasRaisedHand(localParticipant));
  const previousPinnedIdsRef = useRef<string[] | null>(null);
  const autoStartDevicesRef = useRef(false);
  const autoStopDevicesRef = useRef(false);
  const [stageViewMode, setStageViewMode] = useState<StageViewMode>("normal");

  const screenShareActive = hasOngoingScreenShare;

  useEffect(() => {
    const getParticipantName = (userId?: string, sessionId?: string) => {
      const participant = participants.find(
        (item) => (sessionId && item.sessionId === sessionId) || (userId && item.userId === userId),
      );
      return participant ? participantLabel(participant) : userId || "Someone";
    };

    const isLocalParticipant = (userId?: string, sessionId?: string) =>
      userId === call.currentUserId || sessionId === localParticipant?.sessionId;

    const unsubscribeJoined = call.on("participantJoined", (event) => {
      const participant = event.participant;
      if (!participant || isLocalParticipant(participant.userId, participant.sessionId)) return;
      toast.success(`${participant.name || participant.userId} joined the room`);
    });

    const unsubscribeLeft = call.on("participantLeft", (event) => {
      const participant = event.participant;
      if (!participant || isLocalParticipant(participant.userId, participant.sessionId)) return;
      toast.info(`${participant.name || participant.userId} left the room`);
    });

    const unsubscribeTrackPublished = call.on("trackPublished", (event) => {
      if (event.type !== SCREEN_SHARE_TRACK_TYPE || isLocalParticipant(event.userId, event.sessionId)) return;
      toast.info(`${getParticipantName(event.userId, event.sessionId)} started sharing their screen`);
    });

    const unsubscribeTrackUnpublished = call.on("trackUnpublished", (event) => {
      if (event.type !== SCREEN_SHARE_TRACK_TYPE || isLocalParticipant(event.userId, event.sessionId)) return;
      toast.info(`${getParticipantName(event.userId, event.sessionId)} stopped sharing their screen`);
    });

    const unsubscribeKicked = call.on("call.kicked_user", (event) => {
      if (event.user.id === call.currentUserId) return;
      toast.warning(`${event.user.name || event.user.id} was removed from the room`);
    });

    return () => {
      unsubscribeJoined?.();
      unsubscribeLeft?.();
      unsubscribeTrackPublished?.();
      unsubscribeTrackUnpublished?.();
      unsubscribeKicked?.();
    };
  }, [call, localParticipant?.sessionId, participants]);

  useEffect(() => {
    const nextPinnedIds = pinnedParticipants.map((participant) => participant.sessionId);
    const previousPinnedIds = previousPinnedIdsRef.current;
    previousPinnedIdsRef.current = nextPinnedIds;

    // The first snapshot describes the current room and should not create a toast.
    if (!previousPinnedIds) return;

    const addedId = nextPinnedIds.find((id) => !previousPinnedIds.includes(id));
    const removedId = previousPinnedIds.find((id) => !nextPinnedIds.includes(id));

    if (addedId) {
      toast.success(`${participantLabel(pinnedParticipants.find((participant) => participant.sessionId === addedId))} was pinned`);
    }
    if (removedId) {
      const participant = participants.find((item) => item.sessionId === removedId);
      toast.info(`${participantLabel(participant)} was unpinned`);
    }
  }, [participants, pinnedParticipants]);

  // --- Mute this tab's incoming audio ---
  // Deliberately browser-only: toggles the `.muted` flag on whatever <audio>
  // elements the SDK has rendered inside this container. Doesn't touch the
  // call, the SDK's participant/volume state, or anyone else's mic — it's
  // scoped to this one tab and nothing else.
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const [roomAudioMuted, setRoomAudioMuted] = useState(false);
  const roomAudioMutedRef = useRef(roomAudioMuted);

  useEffect(() => {
    roomAudioMutedRef.current = roomAudioMuted;
    audioContainerRef.current?.querySelectorAll("audio").forEach((el) => {
      el.muted = roomAudioMuted;
    });
  }, [roomAudioMuted]);

  useEffect(() => {
    const container = audioContainerRef.current;
    if (!container) return;

    // Late joiners get their own <audio> element mounted after the fact —
    // catch those too, so the tab stays muted for anyone who arrives later.
    const observer = new MutationObserver(() => {
      if (!roomAudioMutedRef.current) return;
      container.querySelectorAll("audio").forEach((el) => {
        el.muted = true;
      });
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canModerate) {
      if (autoStartDevicesRef.current) return;
      autoStartDevicesRef.current = true;

      // Preserve the organizer's pre-join camera choice. If they left the
      // camera off, do not issue a second automatic browser permission request
      // immediately after joining the call.
      if (!camMuted) {
        camera.enable().catch((err: unknown) => {
          console.warn("[LiveRoomScreen] auto camera enable failed", err);
        });
      }

      microphone.enable().catch((err: unknown) => {
        console.warn("[LiveRoomScreen] auto microphone enable failed", err);
      });
      return;
    }

    // Attendees are view-only. Explicitly force devices off — this is the real
    // enforcement point. `call.join()` has no audio/video option to prevent
    // publishing at join time, so this is the only client-side guarantee.
    if (autoStopDevicesRef.current) return;
    autoStopDevicesRef.current = true;

    camera.disable().catch((err: unknown) => {
      console.warn("[LiveRoomScreen] attendee camera disable failed", err);
    });

    microphone.disable().catch((err: unknown) => {
      console.warn("[LiveRoomScreen] attendee microphone disable failed", err);
    });
  }, [canModerate, camMuted, camera, microphone]);

  function handleToggleScreenShare() {
    screenShare
      .toggle()
      .catch((err: unknown) => {
        console.error("[LiveRoomScreen] screen share toggle failed", err);
      });
  }

  const onRaiseHand = useCallback(async () => {
    setDrawerError(null);
    try {
      await call.sendReaction({
        type: "raised-hand",
        emoji_code: ":raise-hand:",
        custom: {
          status: handRaised ? "off" : "on",
        },
      });
    } catch (err) {
      console.error("[LiveRoomScreen] raise hand failed", err);
      setDrawerError("Could not update your hand state. Please try again.");
    }
  }, [call, handRaised, setDrawerError]);

  // Pinning must be visible to everyone in the room, not just the person who
  // clicked — call.pin()/unpin() are LOCAL to the caller's own view only.
  // pinForEveryone()/unpinForEveryone() are the room-wide equivalents, and
  // require the "pin-for-everyone" capability to be granted to the
  // organizer/co-organizer role on this call type in the Stream dashboard.
  async function togglePin(participant: StreamVideoParticipant) {
    if (!canModerate) return;

    const alreadyPinned = isPinned(participant);

    // Attendees are never a valid pin target — they can't publish video, so
    // pinning one would just spotlight a blank tile. (Unpinning is always
    // safe regardless of role, in case this is ever reached in a stale state.)
    if (!alreadyPinned && !isAdminParticipant(participant)) {
      console.warn("[LiveRoomScreen] refusing to pin a non-admin participant", participant.userId);
      return;
    }

    try {
      if (alreadyPinned) {
        await call.unpinForEveryone({ session_id: participant.sessionId, user_id: participant.userId });
        return;
      }

      // Enforce single-pin exclusivity: release whoever's currently pinned
      // before pinning the new target, so ownership transfers cleanly
      // instead of stacking multiple simultaneous room-wide pins.
      await Promise.all(
        pinnedParticipants
          .filter((p) => p.sessionId !== participant.sessionId)
          .map((p) =>
            call.unpinForEveryone({ session_id: p.sessionId, user_id: p.userId }).catch((err: unknown) => {
              console.warn("[LiveRoomScreen] failed to release previous pin", err);
            })
          )
      );

      await call.pinForEveryone({ session_id: participant.sessionId, user_id: participant.userId });
    } catch (err) {
      console.error("[LiveRoomScreen] pin toggle failed", err);
    }
  }

  return (
    <StreamTheme className="flex h-dvh w-full flex-col overflow-hidden bg-[#0A0C10] text-[#F3F5F8]">
      <div ref={audioContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ParticipantsAudio participants={participants.filter((p) => !p.isLocalParticipant)} />
    
        {drawerError && (
          <div className="mx-3 mt-3 shrink-0 rounded-2xl border border-[#FF5468]/25 bg-[#FF5468]/10 px-4 py-3 text-sm text-[#FFB9C2]">
            {drawerError}
          </div>
        )}
  
        <div className="min-h-0 flex-1 overflow-hidden">
          <RoomMorphStage
            className="h-full"
            value={activeTab}
            onValueChange={(id) => setActiveTab(id as RoomTab)}
            items={
              [
                {
                  id: "participants",
                  label: "Participants",
                  icon: <Users size={20} />,
                  content: (
                    <ParticipantsPanel canModerate={canModerate} onTogglePin={togglePin} />
                  ),
                },
                {
                  id: "chat",
                  label: "Chat",
                  icon: <MessageSquare size={20} />,
                  badge: chatUnseen || chatPulsing,
                  content: (
                    <ChatPanel
                      messages={chatMessages}
                      draft={chatDraft}
                      onDraftChange={setChatDraft}
                      onSend={sendChat}
                      onVote={sendVote}
                      sendingVoteKey={sendingVoteKey}
                      sending={sendingChat}
                      loading={discussionLoading}
                    />
                  ),
                },
                {
                  id: "qa",
                  label: "Q&A",
                  icon: <HelpCircle size={20} />,
                  badge: qaUnseen || qaPulsing,
                  content: (
                    <QaPanel
                      questions={questions}
                      draft={qaDraft}
                      onDraftChange={setQaDraft}
                      onAsk={askQuestion}
                      onAnswer={answerQuestion}
                      onVote={sendVote}
                      sendingVoteKey={sendingVoteKey}
                      answerDrafts={answerDrafts}
                      onAnswerDraftChange={updateAnswerDraft}
                      canModerate={canModerate}
                      sendingQuestion={sendingQuestion}
                      sendingAnswerId={sendingAnswerId}
                      loading={discussionLoading}
                    />
                  ),
                },
              ] satisfies MorphNavItem[]
            }
            stageContent={
              <div className="relative h-full min-h-0 p-3">
                <StagePanel
                  call={call}
                  canModerate={canModerate}
                  viewMode={stageViewMode}
                  onViewModeChange={setStageViewMode}
                  bannerUrl={bannerUrl}
                  eventTitle={eventTitle}
                />
                <StageReactionOverlay events={stageEvents} />
              </div>
            }
          />
        </div>
          
        <ControlsBar
          eventId={eventId}
          onLeave={onLeave}
          onToggleScreenShare={handleToggleScreenShare}
          onSendStageEmoji={sendStageEmoji}
          onRaiseHand={onRaiseHand}
          showDeviceControls={showDeviceControls}
          canModerate={canModerate}
          screenShareActive={screenShareActive}
          handRaised={handRaised}
          roomAudioMuted={roomAudioMuted}
          onToggleRoomAudio={() => setRoomAudioMuted((current) => !current)}
        />
      </div>
    </StreamTheme>
  );
}

export default function LiveRoomScreen({ call, onLeave, eventId, showDeviceControls = true, canModerate = false, eventTitle, bannerUrl }: LiveRoomScreenProps) {
  const [activeTab, setActiveTab] = useState<RoomTab>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [qaDraft, setQaDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<MessageItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [discussionLoading, setDiscussionLoading] = useState(true);
  const [sendingChat, setSendingChat] = useState(false);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [sendingAnswerId, setSendingAnswerId] = useState<string | null>(null);
  const [sendingVoteKey, setSendingVoteKey] = useState<string | null>(null);
  const [stageEvents, setStageEvents] = useState<StageEvent[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const stageEventExpiryRef = useRef<Map<string, number>>(new Map());
  const discussionAccessRevokedRef = useRef(false);

  // --- New chat/Q&A notification dot ---
  // `Unseen` = persistent dot, cleared once that drawer is opened.
  // `Pulsing` = transient ~1.5s blink, fires on arrival regardless of
  // whether the drawer is open or closed.
  const [chatUnseen, setChatUnseen] = useState(false);
  const [qaUnseen, setQaUnseen] = useState(false);
  const [chatPulsing, setChatPulsing] = useState(false);
  const [qaPulsing, setQaPulsing] = useState(false);
  const activeTabRef = useRef<RoomTab>(null);
  const lastSeenChatIdRef = useRef<string | null>(null);
  const lastSeenQaIdRef = useRef<string | null>(null);
  const hasLoadedDiscussionRef = useRef(false);
  const chatPulseTimeoutRef = useRef<number | null>(null);
  const qaPulseTimeoutRef = useRef<number | null>(null);

  const firePulse = useCallback((kind: "chat" | "qa") => {
    const timeoutRef = kind === "chat" ? chatPulseTimeoutRef : qaPulseTimeoutRef;
    const setPulsing = kind === "chat" ? setChatPulsing : setQaPulsing;

    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setPulsing(true);
    timeoutRef.current = window.setTimeout(() => {
      setPulsing(false);
      timeoutRef.current = null;
    }, 1500);
  }, []);

  // Clearing the "unseen" dot is a response to the user opening a tab — an
  // explicit action, not something to derive via an effect. Wrapping the
  // setter here (instead of watching `activeTab` in a useEffect) avoids
  // setState-in-effect and keeps activeTabRef in sync at the same time.
  // The "participants" tab has no unseen state of its own, so it's just a
  // pass-through.
  const openTab = useCallback((kind: RoomTab) => {
    setActiveTab(kind);
    activeTabRef.current = kind;
    if (kind === "chat") setChatUnseen(false);
    if (kind === "qa") setQaUnseen(false);
  }, []);

  useEffect(() => {
    // These refs hold mutable timeout ids (not DOM nodes), so reading
    // `.current` at unmount time is intentional — we want whichever timeout
    // is pending *then*, not whatever was pending at mount. exhaustive-deps
    // assumes ref-in-cleanup means a stale DOM ref, which doesn't apply here.
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (chatPulseTimeoutRef.current !== null) window.clearTimeout(chatPulseTimeoutRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (qaPulseTimeoutRef.current !== null) window.clearTimeout(qaPulseTimeoutRef.current);
    };
  }, []);

  const pushStageEvent = useCallback((nextEvent: StageEvent) => {
    setStageEvents((current) => {
      const existingIndex = current.findIndex((item) => item.id === nextEvent.id);
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = nextEvent;
        return next.slice(-12);
      }
      return [...current, nextEvent].slice(-12);
    });

    const existing = stageEventExpiryRef.current.get(nextEvent.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timeoutId = window.setTimeout(() => {
      setStageEvents((current) => current.filter((item) => item.id !== nextEvent.id));
      stageEventExpiryRef.current.delete(nextEvent.id);
    }, 2800);

    stageEventExpiryRef.current.set(nextEvent.id, timeoutId);
  }, []);

  const syncDiscussion = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/rooms/${eventId}/discussion`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (res.status === 401 || res.status === 403) {
        // Access to this room's discussion has ended — the user left, was
        // removed, or the room no longer exists. This is an expected terminal
        // state (especially during the leave flow's brief unmount race), not
        // an app error, so stop polling quietly instead of logging/surfacing it.
        discussionAccessRevokedRef.current = true;
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? "Failed to load discussion.");
      }

      const nextMessages: MessageItem[] = Array.isArray(data.messages)
        ? (data.messages as DiscussionMessageApiItem[]).map((item) => ({
            id: String(item.id),
            author: String(item.authorName ?? "Unknown"),
            role: String(item.authorRole ?? "attendee"),
            body: String(item.body ?? ""),
            createdAt: new Date(String(item.createdAt)).getTime(),
            votes: {
              upvotes: Number(item.upvotes ?? 0),
              downvotes: Number(item.downvotes ?? 0),
              myVote: item.myVote === "up" || item.myVote === "down" ? item.myVote : null,
            },
          }))
        : [];

      const nextQuestions: QuestionItem[] = Array.isArray(data.questions)
        ? (data.questions as DiscussionQuestionApiItem[]).map((item) => ({
            id: String(item.id),
            author: String(item.authorName ?? "Unknown"),
            role: String(item.authorRole ?? "attendee"),
            body: String(item.body ?? ""),
            createdAt: new Date(String(item.createdAt)).getTime(),
            answered: Boolean(item.answered),
            answerBody: typeof item.answerBody === "string" ? item.answerBody : undefined,
            answeredAt: item.answeredAt ? new Date(String(item.answeredAt)).getTime() : undefined,
            answeredByClerkId: typeof item.answeredByClerkId === "string" ? item.answeredByClerkId : undefined,
            votes: {
              upvotes: Number(item.upvotes ?? 0),
              downvotes: Number(item.downvotes ?? 0),
              myVote: item.myVote === "up" || item.myVote === "down" ? item.myVote : null,
            },
          }))
        : [];

      const latestChatId = nextMessages.length ? nextMessages[nextMessages.length - 1].id : null;
      // room.discussion.actions sorts questions createdAt: -1, so index 0 is newest.
      const latestQaId = nextQuestions.length ? nextQuestions[0].id : null;

      if (!hasLoadedDiscussionRef.current) {
        // First load just establishes the baseline — nothing to notify about yet.
        hasLoadedDiscussionRef.current = true;
      } else {
        if (latestChatId && latestChatId !== lastSeenChatIdRef.current) {
          firePulse("chat");
          if (activeTabRef.current !== "chat") setChatUnseen(true);
        }
        if (latestQaId && latestQaId !== lastSeenQaIdRef.current) {
          firePulse("qa");
          if (activeTabRef.current !== "qa") setQaUnseen(true);
        }
      }
      lastSeenChatIdRef.current = latestChatId;
      lastSeenQaIdRef.current = latestQaId;

      setChatMessages(nextMessages);
      setQuestions(nextQuestions);
      setDrawerError(null);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[LiveRoomScreen] failed to load discussion", err);
      setDrawerError("Chat and Q&A could not be loaded right now.");
    } finally {
      if (!signal?.aborted) setDiscussionLoading(false);
    }
  }, [eventId, firePulse]);

  useEffect(() => {
    const controller = new AbortController();
    discussionAccessRevokedRef.current = false;
    // The initial fetch kicks off the first discussion load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncDiscussion(controller.signal);

    const intervalId = window.setInterval(() => {
      if (discussionAccessRevokedRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      syncDiscussion(controller.signal);
    }, 5_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [syncDiscussion]);

  const sendVote = useCallback(
    async (targetKind: "message" | "question", targetId: string, direction: "up" | "down") => {
      const key = voteKey(targetKind, targetId, direction);
      setSendingVoteKey(key);
      setDrawerError(null);

      try {
        const res = await fetch(`/api/rooms/${eventId}/discussion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "vote", targetKind, targetId, direction }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.message ?? "Failed to save vote.");
        }
        await syncDiscussion();
      } catch (err) {
        console.error("[LiveRoomScreen] vote failed", err);
        setDrawerError("Could not save your vote. Please try again.");
      } finally {
        setSendingVoteKey(null);
      }
    },
    [eventId, syncDiscussion]
  );

  const sendStageEmoji = useCallback(
    async (emoji: string) => {
      setDrawerError(null);
      const emojiCode = STAGE_REACTION_CODE_MAP[emoji as keyof typeof STAGE_REACTION_CODE_MAP];
      if (!emojiCode) return;

      try {
        await call.sendReaction({
          type: "reaction",
          emoji_code: emojiCode,
        });
      } catch (err) {
        console.error("[LiveRoomScreen] reaction failed", err);
        setDrawerError("Could not send the reaction. Please try again.");
      }
    },
    [call]
  );

  useEffect(() => {
    const stageEventExpiryMap = stageEventExpiryRef.current;
    const unsubscribe = call.on("call.reaction_new", (event) => {
      const reaction = event?.reaction;
      if (!reaction) return;

      const displayName = reaction.user?.name?.trim() || reaction.user?.id || "Someone";
      const role = reaction.custom?.role ? String(reaction.custom.role) : "attendee";
      const createdAt = new Date(String(event.created_at ?? Date.now())).getTime();

      if (reaction.type === "raised-hand" || reaction.emoji_code === ":raise-hand:") {
        if (reaction.custom?.status === "off") return;
        pushStageEvent({
          id: String(event.created_at ?? makeId()),
          kind: "hand",
          displayName,
          role,
          createdAt,
          isRaised: true,
          participantId: reaction.user?.id,
        });
        return;
      }

      pushStageEvent({
        id: String(event.created_at ?? makeId()),
        kind: "emoji",
        emoji: reaction.emoji_code,
        displayName,
        role,
        createdAt,
      });
    });

    return () => {
      unsubscribe?.();
      stageEventExpiryMap.forEach((timeoutId) => window.clearTimeout(timeoutId));
      stageEventExpiryMap.clear();
    };
  }, [call, pushStageEvent]);

  function sendChat() {
    const body = chatDraft.trim();
    if (!body) return;
    if (body.length > 500) {
      setDrawerError("Chat messages must be 500 characters or fewer.");
      return;
    }
    const clientMutationId = makeId();
    setSendingChat(true);
    setDrawerError(null);

    fetch(`/api/rooms/${eventId}/discussion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "message", body, clientMutationId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.message ?? "Failed to send message.");
        }
        setChatDraft("");
        return syncDiscussion();
      })
      .catch((err) => {
        console.error("[LiveRoomScreen] send chat failed", err);
        setDrawerError("Could not send the message. Please try again.");
      })
      .finally(() => {
        setSendingChat(false);
      });
  }

  function askQuestion() {
    const body = qaDraft.trim();
    if (!body) return;
    if (body.length > 500) {
      setDrawerError("Questions must be 500 characters or fewer.");
      return;
    }
    const clientMutationId = makeId();
    setSendingQuestion(true);
    setDrawerError(null);

    fetch(`/api/rooms/${eventId}/discussion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "question", body, clientMutationId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.message ?? "Failed to ask question.");
        }
        setQaDraft("");
        return syncDiscussion();
      })
      .catch((err) => {
        console.error("[LiveRoomScreen] ask question failed", err);
        setDrawerError("Could not post your question. Please try again.");
      })
      .finally(() => {
        setSendingQuestion(false);
      });
  }

  function answerQuestion(questionId: string) {
    const body = answerDrafts[questionId]?.trim();
    if (!body) return;
    if (body.length > 1000) {
      setDrawerError("Answers must be 1000 characters or fewer.");
      return;
    }

    const clientMutationId = makeId();
    setSendingAnswerId(questionId);
    setDrawerError(null);

    fetch(`/api/rooms/${eventId}/discussion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "answer", questionId, body, clientMutationId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.message ?? "Failed to answer question.");
        }
        setAnswerDrafts((current) => ({ ...current, [questionId]: "" }));
        return syncDiscussion();
      })
      .catch((err) => {
        console.error("[LiveRoomScreen] answer question failed", err);
        setDrawerError("Could not save the answer. Please try again.");
      })
      .finally(() => {
        setSendingAnswerId(null);
      });
  }

  function updateAnswerDraft(questionId: string, value: string) {
    setAnswerDrafts((current) => ({ ...current, [questionId]: value }));
  }

  return (
    <StreamCall call={call}>
      <LiveRoomScreenContent
        call={call}
        onLeave={onLeave}
        showDeviceControls={showDeviceControls}
        canModerate={canModerate}
        eventTitle={eventTitle}
        bannerUrl={bannerUrl}
        activeTab={activeTab}
        setActiveTab={openTab}
        chatDraft={chatDraft}
        setChatDraft={setChatDraft}
        qaDraft={qaDraft}
        setQaDraft={setQaDraft}
        chatMessages={chatMessages}
        questions={questions}
        stageEvents={stageEvents}
        drawerError={drawerError}
        discussionLoading={discussionLoading}
        sendingChat={sendingChat}
        sendingQuestion={sendingQuestion}
        sendingAnswerId={sendingAnswerId}
        sendingVoteKey={sendingVoteKey}
        answerDrafts={answerDrafts}
        updateAnswerDraft={updateAnswerDraft}
        sendChat={sendChat}
        askQuestion={askQuestion}
        answerQuestion={answerQuestion}
        sendVote={sendVote}
        sendStageEmoji={sendStageEmoji}
        setDrawerError={setDrawerError}
        eventId={eventId}
        chatUnseen={chatUnseen}
        qaUnseen={qaUnseen}
        chatPulsing={chatPulsing}
        qaPulsing={qaPulsing}
      />
    </StreamCall>
  );
}
