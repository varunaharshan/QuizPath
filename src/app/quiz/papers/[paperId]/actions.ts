"use server";

import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { finalizePaperAttempt, saveQuizAnswer } from "@/lib/quiz";

export async function savePaperAnswer(attemptId: string, mcqId: string, selectedOption: number) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  await saveQuizAnswer({ studentId: appUser.id, attemptId, mcqId, selectedOption });
}

export async function submitPaperQuiz(paperId: string, attemptId: string) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const result = await finalizePaperAttempt({ studentId: appUser.id, attemptId });

  redirect(`/quiz/papers/${paperId}/results/${result.attemptId}`);
}
