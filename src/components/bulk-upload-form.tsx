"use client";

import { useMemo, useRef, useState } from "react";
import {
  generateTemplateCsv,
  parseBulkCsv,
  validateBulkRows,
  type BulkUploadReferenceData,
  type ValidatedBulkRow,
} from "@/lib/bulk-upload";
import { bulkImportQuestions } from "@/app/admin/questions/bulk-upload/actions";

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Upload File",
  2: "Review & Validate",
  3: "Confirm Import",
};

export function BulkUploadForm({ referenceData }: { referenceData: BulkUploadReferenceData }) {
  const [step, setStep] = useState<Step>(1);
  const [rows, setRows] = useState<ValidatedBulkRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(generateTemplateCsv())}`,
    [],
  );

  async function handleFile(file: File) {
    setParseError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }
    const text = await file.text();
    const parsedRows = parseBulkCsv(text);
    if (parsedRows.length === 0) {
      setParseError("No rows found in this file — check it has a header row plus at least one data row.");
      return;
    }
    setFileName(file.name);
    setRows(validateBulkRows(parsedRows, referenceData));
    setStep(2);
  }

  function resetToStep1() {
    setStep(1);
    setRows([]);
    setFileName(null);
    setParseError(null);
    setImportError(null);
    setImportedCount(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConfirmImport() {
    setIsImporting(true);
    setImportError(null);
    try {
      const resolved = rows.map((r) => r.resolved!);
      const result = await bulkImportQuestions(resolved);
      setImportedCount(result.importedCount);
      setStep(3);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  const totalRows = rows.length;
  const errorRows = rows.filter((r) => r.errors.length > 0).length;
  const validRows = totalRows - errorRows;
  const canImport = totalRows > 0 && errorRows === 0 && !isImporting;

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        {([1, 2, 3] as Step[]).map((s, index) => (
          <div key={s} className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold ${
                  s < step
                    ? "bg-mastered text-white"
                    : s === step
                      ? "bg-navy-900 text-white"
                      : "bg-app-surface-muted text-ink-muted"
                }`}
              >
                {s}
              </span>
              <span className={`text-[12.5px] font-semibold ${s === step ? "text-navy-900" : "text-ink-secondary"}`}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {index < 2 && <div className="h-px w-[30px] bg-app-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="max-w-[640px] rounded-[10px] border border-app-border bg-white p-5">
          <h3 className="m-0 mb-1 text-[14.5px] font-bold text-navy-900">Step 1 — Upload Questions File</h3>
          <p className="m-0 mb-3.5 text-[12.5px] text-ink-secondary">
            Use our template to make sure columns line up correctly with the question bank schema.
          </p>
          <a
            href={templateHref}
            download="quizpath-question-template.csv"
            className="mb-4 inline-block rounded-md border border-app-border bg-white px-3.5 py-2 text-[12.5px] font-semibold hover:bg-app-surface-muted"
          >
            ⬇ Download CSV Template
          </a>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`rounded-[14px] border-2 border-dashed p-8 text-center ${
              isDragOver ? "border-navy-900 bg-app-surface-muted" : "border-app-border bg-app-surface-muted/40"
            }`}
          >
            <div className="mb-2.5 text-[28px]">📤</div>
            <h4 className="m-0 mb-1 text-[14px] font-semibold text-navy-900">Drag &amp; drop your file here</h4>
            <p className="m-0 mb-3.5 text-[12px] text-ink-secondary">Supports .csv — max 2,000 rows per upload</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              Choose File to Upload
            </button>
          </div>

          {parseError && <p className="mt-3 text-[12.5px] font-semibold text-red-600">{parseError}</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-4 flex flex-wrap gap-6 rounded-xl bg-progress-bg px-4.5 py-3.5">
            <div>
              <div className="text-[20px] font-bold text-navy-900">{totalRows}</div>
              <div className="text-[11.5px] text-ink-secondary">Total rows</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-mastered">{validRows}</div>
              <div className="text-[11.5px] text-ink-secondary">Valid rows</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-red-600">{errorRows}</div>
              <div className="text-[11.5px] text-ink-secondary">Rows with errors</div>
            </div>
          </div>

          {fileName && <p className="mb-2 text-[12px] text-ink-secondary">File: {fileName}</p>}

          <div className="mb-4 overflow-hidden rounded-[10px] border border-app-border bg-white">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0">
                  <tr className="bg-app-surface-muted text-left text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                    <th className="px-3 py-2.5">Row</th>
                    <th className="px-3 py-2.5">Question</th>
                    <th className="px-3 py-2.5">Grade</th>
                    <th className="px-3 py-2.5">Topic</th>
                    <th className="px-3 py-2.5">Sub-topic</th>
                    <th className="px-3 py-2.5">Correct Answer</th>
                    <th className="px-3 py-2.5">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((validated) => (
                    <tr
                      key={validated.row.rowNumber}
                      className={`border-b border-app-border last:border-b-0 ${
                        validated.errors.length > 0 ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 text-ink-secondary">{validated.row.rowNumber}</td>
                      <td className="px-3 py-2.5 max-w-[260px] font-medium text-navy-900">
                        {validated.row.questionText || <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-secondary">{validated.row.grade || "—"}</td>
                      <td className="px-3 py-2.5 text-ink-secondary">{validated.row.topic || "—"}</td>
                      <td className="px-3 py-2.5 text-ink-secondary">{validated.row.subTopic || "—"}</td>
                      <td className="px-3 py-2.5 text-ink-secondary">{validated.row.correctAnswer || "—"}</td>
                      <td className="px-3 py-2.5">
                        {validated.errors.length === 0 ? (
                          <span className="font-semibold text-mastered">✓ Valid</span>
                        ) : (
                          <span className="font-semibold text-red-600">✕ {validated.errors.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {errorRows > 0 && (
            <p className="mb-3.5 text-[12.5px] text-ink-secondary">
              This file can&apos;t be imported until every row is valid — fix the {errorRows} row(s) with errors in
              your source file and re-upload. Partial imports aren&apos;t supported.
            </p>
          )}

          {importError && <p className="mb-3.5 text-[12.5px] font-semibold text-red-600">{importError}</p>}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!canImport}
              className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isImporting ? "Importing…" : `Import ${totalRows} Row${totalRows === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={resetToStep1}
              className="rounded-md border border-app-border bg-white px-4.5 py-2 text-[13px] font-semibold hover:bg-app-surface-muted"
            >
              Cancel &amp; Re-upload
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-[520px] rounded-[10px] border border-app-border bg-white p-6 text-center">
          <div className="mb-2 text-[38px]">✅</div>
          <h3 className="m-0 mb-1.5 text-[16px] font-bold text-navy-900">Import Complete</h3>
          <p className="m-0 mb-4 text-[13px] text-ink-secondary">
            {importedCount} question{importedCount === 1 ? " was" : "s were"} added to the question bank as{" "}
            <strong>Unverified</strong> — ready for review.
          </p>
          <button
            type="button"
            onClick={resetToStep1}
            className="rounded-md bg-navy-900 px-4.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
          >
            Upload Another File
          </button>
        </div>
      )}
    </div>
  );
}
