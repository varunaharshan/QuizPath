import {
  ensurePaperAttemptStarted,
  ensureSubTopicAttemptStarted,
  finalizePaperAttempt,
  finalizeSubTopicAttempt,
  saveQuizAnswer,
  type SubmitQuizResult,
} from "@/lib/quiz";

// Test scaffolding only: most tests just need "a fully completed attempt"
// as setup, not the incremental save/resume/partial-submit behavior itself
// (that's what tests/quiz-flow.test.ts and tests/paper-flow.test.ts exercise
// directly). These wrap the real ensure -> save-each-answer -> finalize
// sequence a real quiz-taking session goes through, so callers don't need to
// repeat that plumbing everywhere a full attempt is just incidental setup.

export async function submitFullSubTopicQuiz(params: {
  studentId: string;
  subTopicId: string;
  answers: Record<string, number>;
}): Promise<SubmitQuizResult> {
  const { studentId, subTopicId, answers } = params;
  const attemptId = await ensureSubTopicAttemptStarted(studentId, subTopicId);
  for (const [mcqId, selectedOption] of Object.entries(answers)) {
    await saveQuizAnswer({ studentId, attemptId, mcqId, selectedOption });
  }
  return finalizeSubTopicAttempt({ studentId, attemptId });
}

export async function submitFullPaperQuiz(params: {
  studentId: string;
  paperId: string;
  answers: Record<string, number>;
}): Promise<SubmitQuizResult> {
  const { studentId, paperId, answers } = params;
  const attemptId = await ensurePaperAttemptStarted(studentId, paperId);
  for (const [mcqId, selectedOption] of Object.entries(answers)) {
    await saveQuizAnswer({ studentId, attemptId, mcqId, selectedOption });
  }
  return finalizePaperAttempt({ studentId, attemptId });
}
