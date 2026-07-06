import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isValidGrade } from "@/lib/papers";
import { getKeywordSuggestions } from "@/lib/practice";

// Backs the keyword-tag autocomplete input's one-time (per grade, per short
// cache window) fetch of the full distinct-keyword list — see
// src/components/keyword-tag-input.tsx and src/lib/practice.ts
// getKeywordSuggestions for why this is a full-list load rather than a
// per-keystroke search endpoint at today's scale (low hundreds of distinct
// keywords).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const grade = new URL(req.url).searchParams.get("grade") ?? "";
  if (!isValidGrade(grade)) {
    return NextResponse.json({ error: "Invalid or missing grade" }, { status: 400 });
  }

  const keywords = await getKeywordSuggestions(grade);
  return NextResponse.json({ keywords });
}
