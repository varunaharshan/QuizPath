"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { studentProfiles } from "@/db/schema";
import { getOrCreateAppUser } from "@/lib/current-app-user";

export async function updateProfile(formData: FormData) {
  const grade = formData.get("grade");
  const medium = formData.get("medium");
  if (grade !== "10" && grade !== "11") {
    throw new Error("Invalid grade selection.");
  }
  if (medium !== "sinhala" && medium !== "tamil" && medium !== "english") {
    throw new Error("Invalid medium selection.");
  }

  const appUser = await getOrCreateAppUser();
  if (!appUser) {
    redirect("/");
  }

  await db
    .update(studentProfiles)
    .set({ grade, medium })
    .where(eq(studentProfiles.userId, appUser.id));

  revalidatePath("/profile");
}
