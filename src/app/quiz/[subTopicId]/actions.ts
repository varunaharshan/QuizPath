"use server";

import { redirect } from "next/navigation";
import { getOrCreateAppUser, getStudentProfile } from "@/lib/current-app-user";
import { submitQuizAttempt } from "@/lib/quiz";

export async function submitQuiz(subTopicId: string, formData: FormData) {
  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  const profile = await getStudentProfile(appUser.id);
  if (!profile) {
    redirect("/onboarding");
  }

  const answers: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("mcq:")) {
      answers[key.slice(4)] = Number(value);
    }
  }

  const result = await submitQuizAttempt({
    studentId: appUser.id,
    subTopicId,
    answers,
  });

  redirect(`/quiz/${subTopicId}/results/${result.attemptId}`);
}
