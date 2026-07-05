"use server";

import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { finalizeSubTopicAttempt, saveQuizAnswer } from "@/lib/quiz";

export async function saveSubTopicAnswer(attemptId: string, mcqId: string, selectedOption: number) {
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

export async function submitSubTopicQuiz(subTopicId: string, attemptId: string) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const result = await finalizeSubTopicAttempt({ studentId: appUser.id, attemptId });

  redirect(`/quiz/${subTopicId}/results/${result.attemptId}`);
}
