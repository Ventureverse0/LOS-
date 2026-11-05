/* ============================================================================
 * STAGE 15: FSRS-COMPATIBLE SPACED REPETITION SCHEDULER & ANKI TSV INTERCHANGE
 * - Isolates scheduling behind ReviewScheduler interface
 * - Tracks dueAt, intervalDays, stability, difficulty, repetitions, lapses, state
 * - Supports bidirectional Anki-compatible .tsv import and export
 * ========================================================================== */

import type { FsrsRating, FsrsReviewState } from "../types/learningOS";
import type { Flashcard } from "../types/studyOS";

export interface ReviewScheduler {
  createInitialState(flashcardId: string, now?: Date): FsrsReviewState;
  schedule(
    current: FsrsReviewState,
    rating: FsrsRating,
    now?: Date
  ): FsrsReviewState;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export class FsrsLiteScheduler implements ReviewScheduler {
  createInitialState(flashcardId: string, now: Date = new Date()): FsrsReviewState {
    return {
      flashcardId,
      dueAt: now.toISOString(),
      intervalDays: 0,
      stability: 0,
      difficulty: 5.0,
      repetitions: 0,
      lapses: 0,
      cardState: "new",
      lastReviewed: null,
    };
  }

  schedule(
    current: FsrsReviewState,
    rating: FsrsRating,
    now: Date = new Date()
  ): FsrsReviewState {
    const ratingWeight: Record<FsrsRating, number> = {
      again: 1,
      hard: 2,
      good: 3,
      easy: 4,
    };
    const g = ratingWeight[rating];

    // Update difficulty (1.0 easiest .. 10.0 hardest)
    const nextDifficulty = clamp(
      Math.round((current.difficulty - 0.65 * (g - 3)) * 100) / 100,
      1.0,
      10.0
    );

    if (rating === "again") {
      const nextStability =
        current.stability > 0
          ? Math.max(0.2, Math.round(current.stability * 0.35 * 100) / 100)
          : 0.25;
      const dueMs = now.getTime() + 10 * 60 * 1000; // 10 minutes learning step
      return {
        flashcardId: current.flashcardId,
        dueAt: new Date(dueMs).toISOString(),
        intervalDays: 0,
        stability: nextStability,
        difficulty: nextDifficulty,
        repetitions: current.repetitions + 1,
        lapses: current.lapses + 1,
        cardState: "learning",
        lastReviewed: now.toISOString(),
      };
    }

    let nextStability: number;
    if (current.cardState === "new" || current.stability <= 0) {
      const initialStabilityMap: Record<Exclude<FsrsRating, "again">, number> = {
        hard: 1.2,
        good: 3.0,
        easy: 6.5,
      };
      nextStability = initialStabilityMap[rating];
    } else {
      const difficultyFactor = (11 - nextDifficulty) / 6;
      const multiplierMap: Record<Exclude<FsrsRating, "again">, number> = {
        hard: 1.25,
        good: 1.8 + 0.35 * difficultyFactor,
        easy: 2.6 + 0.55 * difficultyFactor,
      };
      nextStability = Math.round(current.stability * multiplierMap[rating] * 100) / 100;
    }

    const intervalDays = Math.max(
      1,
      Math.round(rating === "hard" ? Math.max(1, nextStability * 0.8) : nextStability)
    );
    const dueMs = now.getTime() + intervalDays * 24 * 60 * 60 * 1000;

    return {
      flashcardId: current.flashcardId,
      dueAt: new Date(dueMs).toISOString(),
      intervalDays,
      stability: nextStability,
      difficulty: nextDifficulty,
      repetitions: current.repetitions + 1,
      lapses: current.lapses,
      cardState: intervalDays <= 1 && rating === "hard" ? "learning" : "review",
      lastReviewed: now.toISOString(),
    };
  }
}

export const defaultFsrsScheduler: ReviewScheduler = new FsrsLiteScheduler();

export function deriveFsrsStateFromFlashcard(
  card: Flashcard,
  now: Date = new Date()
): FsrsReviewState {
  const reps = card.reviewCount ?? 0;
  const lapses = card.lapseCount ?? 0;
  if (reps === 0 && !card.lastReviewedAt) {
    return defaultFsrsScheduler.createInitialState(card.id, now);
  }
  const boxIntervals = [0, 1, 2, 5, 10, 21];
  const intervalDays = boxIntervals[clamp(card.box, 1, 5)] ?? 1;
  return {
    flashcardId: card.id,
    dueAt: card.nextReviewAt || now.toISOString(),
    intervalDays,
    stability: Math.max(0.5, intervalDays),
    difficulty: clamp(6.5 - card.box * 0.8 + lapses * 0.5, 1.0, 10.0),
    repetitions: reps,
    lapses,
    cardState: card.box <= 1 ? "learning" : "review",
    lastReviewed: card.lastReviewedAt || null,
  };
}

/**
 * Parses an Anki-compatible Tab-Separated Values (.tsv) file into StudyOS/LearningOS flashcards.
 * Supports `#separator:tab` comments and 2- or 3-column (`Question \t Answer \t Tags`) rows.
 */
export function parseAnkiTsvImport(
  rawTsv: string,
  defaultCourseId: string,
  defaultModuleId?: string
): Array<{ question: string; answer: string; tags: string[]; courseId: string; moduleId?: string }> {
  const lines = rawTsv
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const imported: Array<{
    question: string;
    answer: string;
    tags: string[];
    courseId: string;
    moduleId?: string;
  }> = [];

  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 2) continue;
    const question = cols[0].trim();
    const answer = cols[1].trim();
    if (!question || !answer) continue;
    const rawTags = cols[2] ? cols[2].trim().split(/\s+/).filter(Boolean) : [];
    imported.push({
      question,
      answer,
      tags: rawTags,
      courseId: defaultCourseId,
      moduleId: defaultModuleId,
    });
  }

  return imported;
}
