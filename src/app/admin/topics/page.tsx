import { getSubjectsForAdmin, getTopicsForSubjectGrade } from "@/lib/admin-topics";
import { isValidGrade } from "@/lib/papers";
import { AdminTopicsFilterForm } from "@/components/admin-topics-filter-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  createModule,
  createSubTopic,
  deleteModule,
  deleteSubTopic,
  renameModule,
  renameSubTopic,
  reorderModule,
  reorderSubTopic,
} from "./actions";

const GRADES = [
  { value: "10", label: "Grade 10" },
  { value: "11", label: "Grade 11" },
] as const;

const DELETE_BUTTON_CLASSES =
  "rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50";

// A free browsing choice, same as Papers/Progress — an admin managing
// content isn't tied to any particular grade/subject of their own, so
// invalid or missing query values just fall back to a sane default rather
// than 404ing.
export default async function AdminTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const subjects = await getSubjectsForAdmin();

  const params = await searchParams;
  const rawGrade = typeof params.grade === "string" ? params.grade : undefined;
  const rawSubjectId = typeof params.subjectId === "string" ? params.subjectId : undefined;

  const grade = rawGrade && isValidGrade(rawGrade) ? rawGrade : "10";
  const subjectId =
    rawSubjectId && subjects.some((s) => s.id === rawSubjectId) ? rawSubjectId : (subjects[0]?.id ?? null);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  const topics = subjectId ? await getTopicsForSubjectGrade(subjectId, grade) : [];

  return (
    <>
      <h1 className="m-0 mb-1 text-lg font-bold text-navy-900">Topics</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Manage the subject → topic → sub-topic hierarchy.
      </p>

      {!subjectId || !subject ? (
        <div className="max-w-[480px] rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
          No subjects exist yet.
        </div>
      ) : (
        <>
          <AdminTopicsFilterForm
            grades={GRADES.map((g) => ({ ...g }))}
            subjects={subjects}
            selected={{ grade, subjectId }}
          />

          <form action={createModule} className="mb-4.5 flex max-w-[480px] gap-2.5">
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="grade" value={grade} />
            <input
              type="text"
              name="name"
              placeholder="New topic name"
              required
              className="flex-1 rounded-md border border-app-border bg-white px-3 py-2 text-[13.5px] text-ink"
            />
            <button
              type="submit"
              className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              Add Topic
            </button>
          </form>

          {topics.length === 0 ? (
            <div className="rounded-[10px] border border-app-border bg-white p-4 text-sm text-ink-secondary">
              No topics yet for Grade {grade} {subject.name}.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {topics.map((topic, index) => (
                <div key={topic.id} className="overflow-hidden rounded-[10px] border border-app-border bg-white">
                  <div className="flex items-center gap-2.5 border-b border-app-border bg-app-surface-muted px-4.5 py-3">
                    <form className="flex flex-col gap-0.5">
                      <input type="hidden" name="moduleId" value={topic.id} />
                      <button
                        type="submit"
                        formAction={reorderModule}
                        name="direction"
                        value="up"
                        disabled={index === 0}
                        title="Move up"
                        className="block text-xs leading-none text-ink-secondary disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="submit"
                        formAction={reorderModule}
                        name="direction"
                        value="down"
                        disabled={index === topics.length - 1}
                        title="Move down"
                        className="block text-xs leading-none text-ink-secondary disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </form>

                    <form action={renameModule} className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="moduleId" value={topic.id} />
                      <input
                        type="text"
                        name="name"
                        defaultValue={topic.name}
                        className="flex-1 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-[13.5px] font-semibold text-navy-900"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-app-surface-muted"
                      >
                        Save
                      </button>
                    </form>

                    <span className="shrink-0 text-xs text-ink-secondary">
                      {topic.subTopics.length} sub-topic{topic.subTopics.length === 1 ? "" : "s"} · {topic.questionCount}{" "}
                      question{topic.questionCount === 1 ? "" : "s"}
                    </span>

                    <form action={deleteModule}>
                      <input type="hidden" name="moduleId" value={topic.id} />
                      <ConfirmSubmitButton
                        confirmMessage={
                          topic.questionCount > 0
                            ? `"${topic.name}" has ${topic.subTopics.length} sub-topic(s) and ${topic.questionCount} question(s) attached. Deleting it will permanently delete all of them too. Continue?`
                            : `Delete "${topic.name}"? This cannot be undone.`
                        }
                        className={DELETE_BUTTON_CLASSES}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>

                  <div className="p-4">
                    {topic.subTopics.length === 0 ? (
                      <p className="m-0 mb-3 text-sm text-ink-secondary">No sub-topics yet.</p>
                    ) : (
                      <div className="mb-3 flex flex-col gap-2">
                        {topic.subTopics.map((subTopic, subIndex) => (
                          <div
                            key={subTopic.id}
                            className="flex items-center gap-2.5 rounded-md border border-app-border p-2.5"
                          >
                            <form className="flex flex-col gap-0.5">
                              <input type="hidden" name="subTopicId" value={subTopic.id} />
                              <button
                                type="submit"
                                formAction={reorderSubTopic}
                                name="direction"
                                value="up"
                                disabled={subIndex === 0}
                                title="Move up"
                                className="block text-[10px] leading-none text-ink-secondary disabled:opacity-30"
                              >
                                ▲
                              </button>
                              <button
                                type="submit"
                                formAction={reorderSubTopic}
                                name="direction"
                                value="down"
                                disabled={subIndex === topic.subTopics.length - 1}
                                title="Move down"
                                className="block text-[10px] leading-none text-ink-secondary disabled:opacity-30"
                              >
                                ▼
                              </button>
                            </form>

                            <form action={renameSubTopic} className="flex flex-1 items-center gap-2">
                              <input type="hidden" name="subTopicId" value={subTopic.id} />
                              <input
                                type="text"
                                name="name"
                                defaultValue={subTopic.name}
                                className="flex-1 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-[13px] text-ink"
                              />
                              <button
                                type="submit"
                                className="rounded-md border border-app-border bg-white px-2.5 py-1 text-xs font-semibold hover:bg-app-surface-muted"
                              >
                                Save
                              </button>
                            </form>

                            <span className="shrink-0 text-xs text-ink-secondary">
                              {subTopic.questionCount} question{subTopic.questionCount === 1 ? "" : "s"}
                            </span>

                            <form action={deleteSubTopic}>
                              <input type="hidden" name="subTopicId" value={subTopic.id} />
                              <ConfirmSubmitButton
                                confirmMessage={
                                  subTopic.questionCount > 0
                                    ? `"${subTopic.name}" has ${subTopic.questionCount} question(s) attached. Deleting it will permanently delete them too. Continue?`
                                    : `Delete "${subTopic.name}"? This cannot be undone.`
                                }
                                className={DELETE_BUTTON_CLASSES}
                              >
                                Delete
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        ))}
                      </div>
                    )}

                    <form action={createSubTopic} className="flex gap-2.5">
                      <input type="hidden" name="moduleId" value={topic.id} />
                      <input
                        type="text"
                        name="name"
                        placeholder="New sub-topic name"
                        required
                        className="flex-1 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-[13px] text-ink"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-app-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-app-surface-muted"
                      >
                        Add Sub-topic
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
