"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { studentProfiles } from "@/db/schema";
import { getOrCreateAppUser } from "@/lib/current-app-user";

export async function updateGrade(formData: FormData) {
  const grade = formData.get("grade");
  if (grade !== "10" && grade !== "11") {
    throw new Error("Invalid grade selection.");
  }

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  await db
    .update(studentProfiles)
    .set({ grade })
    .where(eq(studentProfiles.userId, appUser.id));

  revalidatePath("/profile");
}
