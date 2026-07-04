"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { studentProfiles } from "@/db/schema";
import { getOrCreateAppUser } from "@/lib/current-app-user";

export async function setGrade(formData: FormData) {
  const grade = formData.get("grade");
  if (grade !== "10" && grade !== "11") {
    throw new Error("Invalid grade selection.");
  }

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  await db
    .insert(studentProfiles)
    .values({ userId: appUser.id, grade })
    .onConflictDoUpdate({ target: studentProfiles.userId, set: { grade } });

  redirect("/dashboard");
}
