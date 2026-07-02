import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getQuizForSubTopic } from "@/lib/quiz";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subTopicId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subTopicId } = await params;
  const { subTopic, questions } = await getQuizForSubTopic(subTopicId);

  if (!subTopic) {
    return NextResponse.json({ error: "Sub-topic not found" }, { status: 404 });
  }

  return NextResponse.json({ subTopic, questions });
}
