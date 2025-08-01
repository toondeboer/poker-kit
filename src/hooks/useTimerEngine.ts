// src/hooks/useTimerEngine.ts
import { useEffect, useRef, useState } from "react";
import { TimerState, TimerStorage } from "@/src/services/TimerStorage";
import {
  BlindLevel,
  TimerLiveActivity,
} from "@/src/services/TimerLiveActivity";

const DEFAULT_TIMER_DURATION = 600;

export interface TimerEngineCallbacks {
  onTimerComplete: () => void;
  onTimeUpdate?: (timeLeft: number) => void;
}

export function useTimerEngine(
  currentBlindIndex: number,
  blindLevels: BlindLevel[],
  callbacks: TimerEngineCallbacks,
) {
  const [timerDuration, setTimerDuration] = useState(DEFAULT_TIMER_DURATION);
  const [endTime, setEndTime] = useState<number>();
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIMER_DURATION);
  const [paused, setPaused] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const intervalRef = useRef<number | null>(null);

  // Calculate current time left based on end time
  const calculateTimeLeft = (endTime: number): number => {
    const now = Date.now();
    return Math.max(0, Math.ceil((endTime - now) / 1000));
  };

  // Update Live Activity with current state
  const updateLiveActivity = async () => {
    await TimerLiveActivity.updateLiveActivity({
      endTime,
      timeLeft,
      paused,
      currentBlindIndex,
      blindLevels,
    });
  };

  // Load timer state from storage
  const loadTimerState = async (): Promise<void> => {
    try {
      const savedState = await TimerStorage.loadTimerState();

      // Calculate current time left based on end time if timer was running
      let currentTimeLeft = savedState.timeLeft;
      let hasExpired = false;

      if (savedState.endTime && !savedState.paused) {
        currentTimeLeft = calculateTimeLeft(savedState.endTime);
        hasExpired = currentTimeLeft === 0;
      }

      if (hasExpired) {
        // Timer expired while app was closed
        callbacks.onTimerComplete();

        // Reset timer after completion
        const resetState: TimerState = {
          endTime: undefined,
          timerDuration: savedState.timerDuration,
          paused: true,
          timeLeft: savedState.timerDuration,
        };

        await TimerStorage.saveTimerState(resetState);

        setPaused(true);
        setEndTime(undefined);
        setTimeLeft(savedState.timerDuration);
        setTimerDuration(savedState.timerDuration);
      } else {
        // Restore normal state
        setTimerDuration(savedState.timerDuration);
        setEndTime(savedState.endTime);
        setTimeLeft(currentTimeLeft);
        setPaused(savedState.paused);
      }
    } catch (error) {
      console.error("Failed to load timer state:", error);
      // Use default values on error
      setTimerDuration(DEFAULT_TIMER_DURATION);
      setTimeLeft(DEFAULT_TIMER_DURATION);
      setPaused(true);
      setEndTime(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  // Save current state to storage
  const saveCurrentState = async (): Promise<void> => {
    const state: TimerState = {
      endTime,
      timerDuration,
      paused,
      timeLeft,
    };
    await TimerStorage.saveTimerState(state);
  };

  // Toggle pause/resume
  const togglePause = async (): Promise<void> => {
    const newPaused = !paused;

    if (newPaused) {
      // Pausing the timer
      setEndTime(undefined);
      setPaused(true);
    } else {
      // Resuming the timer
      const newEndTime = Date.now() + timeLeft * 1000;
      setEndTime(newEndTime);
      setPaused(false);
    }
  };

  // Reset timer
  const resetTimer = async (): Promise<void> => {
    setPaused(true);
    setEndTime(undefined);
    setTimeLeft(timerDuration);

    await saveCurrentState();
  };

  // Set timer duration
  const handleSetTimerDuration = async (duration: number): Promise<void> => {
    setTimerDuration(duration);

    // If timer is paused and we don't have an endTime (truly reset state), update time left
    if (paused && !endTime) {
      setTimeLeft(duration);
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (!paused && endTime && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        const newTimeLeft = calculateTimeLeft(endTime);
        setTimeLeft(newTimeLeft);

        // Call optional time update callback
        callbacks.onTimeUpdate?.(newTimeLeft);

        // Save updated time left periodically
        TimerStorage.saveTimerState({
          endTime,
          timerDuration,
          paused: false,
          timeLeft: newTimeLeft,
        });

        if (newTimeLeft === 0) {
          clearInterval(intervalRef.current!);
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [paused, endTime, timerDuration, callbacks]);

  // Handle timer completion
  useEffect(() => {
    if (timeLeft === 0 && !paused && endTime) {
      callbacks.onTimerComplete();
      resetTimer();
    }
  }, [timeLeft, paused, endTime]);

  // Save state whenever it changes
  useEffect(() => {
    if (!isLoading) {
      saveCurrentState();
    }
  }, [endTime, timerDuration, paused, timeLeft, isLoading]);

  // Update Live Activity when state changes
  useEffect(() => {
    if (!isLoading) {
      updateLiveActivity();
    }
  }, [endTime, timeLeft, paused, currentBlindIndex, blindLevels, isLoading]);

  // Reset time left when timer duration changes and timer is in reset state
  useEffect(() => {
    if (paused && endTime === undefined) {
      setTimeLeft(timerDuration);
    }
  }, [timerDuration, paused, endTime]);

  return {
    timerDuration,
    setTimerDuration: handleSetTimerDuration,
    endTime,
    timeLeft,
    paused,
    togglePause,
    resetTimer,
    isLoading,
    loadTimerState,
  };
}
