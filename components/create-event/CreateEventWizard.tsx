'use client';

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

import "./styles/create-event-wizard.css";

import WizardShell from "./WizardShell";
import WizardSkeleton from "./WizardSkeleton";
import StepNav from "@/components/create-event/StepNav";
import { StepStatus } from "@/components/create-event/WizardTopBar";
import { useEventDraft } from "./useEventDraft";
import { WIZARD_STEPS, WizardStepKey, validateStep } from "./types";

import Step1Spark from "./steps/Step1Spark";
import Step2TimePlace from "./steps/Step2TimePlace";
import Step3Story from "./steps/Step3Story";
import Step4Details from "./steps/Step4Details";
import Step5Tickets from "./steps/Step5Tickets";
import Step6Organizer from "./steps/Step6Organizer";
import Step7Review from "./steps/Step7Review";
import EventCancellationModal from "./fields/EventCancellation";

const stepIndex = (key: WizardStepKey) => WIZARD_STEPS.findIndex((s) => s.key === key);

const buildFormData = (draft: ReturnType<typeof useEventDraft>["draft"]): FormData => {
  const fd = new FormData();

  fd.append("title", draft.title);
  fd.append("description", draft.tagline);
  fd.append("overview", draft.overview);
  fd.append("venue", draft.venue);
  fd.append("address", draft.address);
  fd.append("country", draft.location.country);
  fd.append("state", draft.location.state);
  fd.append("city", draft.location.city);
  fd.append("location", `${draft.location.city}, ${draft.location.state}`);
  fd.append("category", draft.category);
  fd.append("date", draft.date);
fd.append("time", draft.time);
   fd.append("timezone", draft.timezone);
   fd.append("mode", draft.mode);
  fd.append("organizer", draft.organizer);
  fd.append("price", String(draft.isFree ? 0 : draft.price));
  if (draft.hasCapacityLimit && draft.capacity) {
    fd.append("capacity", String(draft.capacity));
  }
  const validSponsors = draft.sponsors.filter((s) => s.name.trim() && s.website.trim());
  fd.append("sponsors", JSON.stringify(validSponsors.map((s) => ({ name: s.name, website: s.website }))));
  fd.append("agenda", JSON.stringify(draft.agenda.map((a) => ({ startTime: a.startTime, endTime: a.endTime, keynote: a.keynote }))));
  fd.append("coOrganizerClerkIds", JSON.stringify((draft.coOrganizers ?? []).map((u) => u.clerkId)));

  draft.tags.forEach((tag) => fd.append("tags", tag));
draft.audience.forEach((a) => fd.append("audience", a));
draft.organizerEmails.forEach((email) => fd.append("organizerEmails", email));



  if (draft.imageFile) {
    fd.append("image", draft.imageFile);
  }
  draft.slideshowImageFiles.forEach((file) => fd.append("slideshowImages", file));

  return fd;
};

const CreateEventWizard = () => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const router = useRouter();
  const { user } = useUser();
  const { draft, updateDraft, resetDraft, isHydrated } = useEventDraft();
  const [currentStep, setCurrentStep] = useState<WizardStepKey>("spark");
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    document.body.setAttribute("data-create-event-wizard", "true");
    return () => {
      document.body.removeAttribute("data-create-event-wizard");
    };
  }, []);

  if (!isHydrated) {
    return <WizardSkeleton />;
  }

  const currentIndex = stepIndex(currentStep);
  const isLastStep = currentStep === "review";
  const isFirstStep = currentStep === "spark";
  const canAdvance = validateStep(draft, currentStep);

  const stepStatuses = WIZARD_STEPS.reduce((acc, s, i) => {
    acc[s.key] = s.key === currentStep ? "current" : i < currentIndex ? "completed" : "upcoming";
    return acc;
  }, {} as Record<WizardStepKey, StepStatus>);

  const handleClose = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    router.back();
    setIsConfirmOpen(false);
  };

  const handleStepClick = (step: WizardStepKey) => {
    const targetIndex = stepIndex(step);
    // Only allow jumping to steps already reached — no skipping ahead via the bar.
    if (targetIndex <= currentIndex) {
      goTo(step);
    }
  };

  const goTo = (step: WizardStepKey) => {
    setCurrentStep(step);
    // Keep step transitions feeling instant on mobile without fighting the keyboard.
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const handleBack = () => {
    if (isFirstStep) return;
    goTo(WIZARD_STEPS[currentIndex - 1].key);
  };

  const handlePublish = async () => {
    if (isPublishing) return;

    // Final full-draft validation gate, not just the current step.
    const firstInvalid = WIZARD_STEPS.find((s) => s.key !== "review" && !validateStep(draft, s.key));
    if (firstInvalid) {
      toast.error(`Please finish "${firstInvalid.label}" before publishing.`);
      goTo(firstInvalid.key);
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        body: buildFormData(draft),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Event creation failed.");
      }

      toast.success("Event created — it's live now.");
      resetDraft();
      const slug = data?.event?.slug;
      router.push(slug ? `/events/${slug}` : "/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleContinue = () => {
    if (!canAdvance) {
      toast.error("Fill in the required fields to continue.");
      return;
    }
    if (isLastStep) {
      handlePublish();
      return;
    }
    goTo(WIZARD_STEPS[currentIndex + 1].key);
  };
  const organizerUser = user
  ? {
      clerkId: user.id,
      photo: user.imageUrl ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      username: user.username ?? "",
    }
  : null;
  const renderStep = () => {
    switch (currentStep) {
      case "spark":
        return <Step1Spark draft={draft} onUpdate={updateDraft} />;
      case "time-place":
        return <Step2TimePlace draft={draft} onUpdate={updateDraft} />;
      case "story":
        return <Step3Story draft={draft} onUpdate={updateDraft} />;
      case "details":
        return <Step4Details draft={draft} onUpdate={updateDraft} />;
      case "tickets":
        return <Step5Tickets draft={draft} onUpdate={updateDraft} />;
      case "organizer":
        return <Step6Organizer draft={draft} onUpdate={updateDraft} viewerClerkId={user?.id ?? ""} />;
      case "review":
        return <Step7Review draft={draft} onJumpToStep={goTo} organizerUser={organizerUser} />;
      default:
        return null;
    }
  };

  return (
    <WizardShell
      currentStep={currentStep}
      stepStatuses={stepStatuses}
      onClose={handleClose}
      onStepClick={handleStepClick}
    >
      {renderStep()}
      <EventCancellationModal
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        onConfirm={handleConfirmClose}
        title="Leave event creation?"
        description="Your progress is saved, but you'll need to review any unfinished step."
      />
      <StepNav
        onBack={handleBack}
        onContinue={handleContinue}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isContinueDisabled={!canAdvance}
        isLoading={isPublishing}
      />
    </WizardShell>
  );
};

export default CreateEventWizard;