import { getBulkUploadReferenceData } from "@/lib/admin-questions";
import { BulkUploadForm } from "@/components/bulk-upload-form";

export default async function BulkUploadQuestionsPage() {
  const referenceData = await getBulkUploadReferenceData();

  return (
    <>
      <h1 className="m-0 mb-1 text-xl font-bold text-navy-900">Questions — Bulk Upload</h1>
      <p className="m-0 mb-4.5 text-[13px] text-ink-secondary">
        Bulk-upload questions to the question bank using the predefined CSV format.
      </p>
      <BulkUploadForm referenceData={referenceData} />
    </>
  );
}
