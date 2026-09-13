"use client";

import React, { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";

const MotionNumberFlow = motion.create(NumberFlow);

interface CountdownProps {
  endDate: Date;
  startDate?: Date;
  onComplete?: () => void;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const EMPTY_TIME: TimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

export default function AnimatedNumberCountdown({
  endDate,
  startDate,
  onComplete,
  className,
}: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(EMPTY_TIME);

  useEffect(() => {
    let completed = false;

    const calculateTimeLeft = () => {
      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(endDate);
      const difference = end.getTime() - start.getTime();

      if (difference > 0) {
        const totalSeconds = Math.floor(difference / 1000);
        setTimeLeft({
          days: Math.floor(totalSeconds / 86400),
          hours: Math.floor((totalSeconds % 86400) / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60,
        });
        return;
      }

      setTimeLeft(EMPTY_TIME);
      if (!completed) {
        completed = true;
        onComplete?.();
      }
    };

    calculateTimeLeft();
    const timer = window.setInterval(calculateTimeLeft, 1000);

    return () => window.clearInterval(timer);
  }, [endDate, onComplete, startDate]);

  return (
    <div className={`flex w-full max-w-[30rem] items-center justify-center gap-1 sm:gap-3 ${className ?? ""}`}>
      {[
        [timeLeft.days, "Days"],
        [timeLeft.hours, "Hours"],
        [timeLeft.minutes, "Minutes"],
        [timeLeft.seconds, "Seconds"],
      ].map(([value, label], index) => (
        <React.Fragment key={label}>
          {index > 0 && <div className="mb-5 shrink-0 text-lg font-semibold text-indigo-300 sm:text-2xl">:</div>}
          <div className="flex min-w-0 flex-1 basis-0 flex-col items-center rounded-2xl border border-slate-200 bg-white px-1.5 py-2 shadow-sm sm:px-3 sm:py-3">
            <MotionNumberFlow
              value={value as number}
              className="whitespace-nowrap text-[clamp(1.5rem,7vw,3rem)] font-semibold leading-none tracking-tight text-slate-900"
              format={{ minimumIntegerDigits: 2 }}
            />
            <span className="mt-1 truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.14em]">
              {label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
