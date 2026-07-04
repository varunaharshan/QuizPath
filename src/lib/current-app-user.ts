import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studentProfiles, users } from "@/db/schema";

export type AppUser = typeof users.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;

/**
 * Ensures a `users` row exists for the signed-in Clerk user (first-login
 * upsert), mirroring what the Clerk webhook does asynchronously. Doing it
 * here too means onboarding/dashboard never race the webhook.
 */
export async function getOrCreateAppUser(): Promise<AppUser | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const joinedName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
  const name = clerkUser.fullName || joinedName || null;

  const existing = await db.query.users.findFirst({
    where: eq(users.authProviderId, clerkUser.id),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ authProviderId: clerkUser.id, email, name })
    .onConflictDoUpdate({ target: users.authProviderId, set: { email, name } })
    .returning();

  return created;
}

export async function getStudentProfile(userId: string): Promise<StudentProfile | null> {
  const profile = await db.query.studentProfiles.findFirst({
    where: eq(studentProfiles.userId, userId),
  });
  return profile ?? null;
}
