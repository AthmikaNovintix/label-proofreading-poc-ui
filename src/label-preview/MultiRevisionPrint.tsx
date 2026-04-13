/**
 * Multi-Revision Print Layout
 *
 * Renders the printable report for all three modes:
 *   A — Existing + Master  : side-by-side label comparison + requirements + discrepancies.
 *   B — Supportive + Master: revised label only + requirements + discrepancies.
 *   C — Full Comparison    : both labels + requirements + discrepancies.
 */

import { MissingChanges }                from '@/report/MissingChanges';
import { LabelComparison }               from '@/report/LabelComparison';
import { ReportInspectionSummary as InspectionSummary } from '@/report/InspectionSummary';
import { ReportDiscrepancyDetails as DiscrepancyDetails } from '@/report/DiscrepancyDetails';
import { ExpectedChanges }               from '@/label-preview/ExpectedChanges';
import { requirementsToExpectedChanges } from '@/utils/requirementsToExpectedChanges';
import type { MultiRevisionReport, LabelRevision } from '@/label-preview/types';
import type { Requirement } from '@/report/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZERO_SUMMARY = {
  deleted:   { text: 0, symbol: 0, barcode: 0, image: 0 },
  added:     { text: 0, symbol: 0, barcode: 0, image: 0 },
  modified:  { text: 0, symbol: 0, barcode: 0, image: 0 },
  misplaced: { text: 0, symbol: 0, barcode: 0, image: 0 },
};

function matchCount(rev: LabelRevision) {
  if (!rev.hasChanges) return { matched: 0, total: 0 };
  const matched = rev.requirements.filter(r => r.status === 'Match').length;
  return { matched, total: rev.requirements.length };
}

function computeSummaryData(requirements: Requirement[]) {
  const catMap: Record<string, string> = { Text: 'text', Symbol: 'symbol', Barcode: 'barcode', Image: 'image' };
  const ctMap: Record<string, string>  = {
    Deleted: 'deleted', Added: 'added', Modified: 'modified',
    Repositioned: 'misplaced', Misplaced: 'misplaced',
  };
  const empty = () => ({ text: 0, symbol: 0, barcode: 0, image: 0 });
  const data: Record<string, Record<string, number>> = {
    deleted: empty(), added: empty(), modified: empty(), misplaced: empty(),
  };
  for (const req of requirements) {
    const ck = ctMap[req.changeType];
    const ek = catMap[req.elementType as string];
    if (ck && ek) data[ck][ek]++;
  }
  return data as typeof ZERO_SUMMARY;
}

// ─── Per-revision page header ─────────────────────────────────────────────────

function PrintPageHeader({
  report, revision,
}: {
  report: MultiRevisionReport;
  revision: LabelRevision;
}) {
  const basePage = report.currentLabelPages[revision.pageIndex];
  const reportId = revision.reportId ?? report.reportId;

  return (
    <div>
      <div className="px-8 py-5 flex items-start justify-between" style={{ backgroundColor: '#D71500' }}>
        <div className="space-y-1">
          <h1 className="text-white text-2xl leading-tight">Label Proofing Report</h1>
          <div className="text-white text-xs">Report ID: {reportId}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <img src="/novintix-logo.png" alt="Novintix" className="h-7 w-auto" />
          <div className="text-white/70 text-xs">
            {report.currentRevision} → {revision.revisionName}
          </div>
        </div>
      </div>
      <div
        className="bg-white border border-gray-300 grid"
        style={{ gridTemplateColumns: '0.7fr 0.7fr 1fr 1.5fr 1.5fr' }}
      >
        {[
          { label: 'CR Number',             value: report.crNumber || '—' },
          { label: 'SKU',                   value: report.mode === 'A' ? report.sku : (revision.sku || '—') },
          { label: 'Label Revision',        value: `${report.currentRevision} → ${revision.revisionName}` },
          { label: 'Current Version Label', value: basePage?.name ?? report.currentLabelName },
          { label: 'New Version Label',     value: revision.labelName },
        ].map((cell, i, arr) => (
          <div key={i} className={`px-3 py-1.5 ${i < arr.length - 1 ? 'border-r border-gray-300' : ''}`}>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">{cell.label}</div>
            <div className="text-xs text-gray-900 break-all">{cell.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cover page (shown when downloading multiple labels) ──────────────────────

function PrintCoverPage({
  report, selectedRevisions,
}: {
  report: MultiRevisionReport;
  selectedRevisions: LabelRevision[];
}) {
  return (
    <div>
      <div className="px-8 py-5 flex items-start justify-between" style={{ backgroundColor: '#D71500' }}>
        <div className="space-y-1">
          <h1 className="text-white text-2xl leading-tight">Label Proofing Report</h1>
          <div className="text-white text-xs">
            Report ID: {report.reportId}
            {report.crNumber && <span className="ml-4 opacity-70">CR: {report.crNumber}</span>}
          </div>
        </div>
        <img src="/novintix-logo.png" alt="Novintix" className="h-7 w-auto" />
      </div>

      <div className="p-8">
        <div className="bg-white border border-gray-300">
          <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-300">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Label Summary</span>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-300">
                <th className="px-4 py-2.5 text-left text-[10px] uppercase text-gray-600 font-bold border-r border-gray-200 w-8">#</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase text-gray-600 font-bold border-r border-gray-200">Revised Label File</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase text-gray-600 font-bold border-r border-gray-200">SKU</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase text-gray-600 font-bold border-r border-gray-200">Label Revision</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase text-gray-600 font-bold">Change Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedRevisions.map((rev, i) => {
                const { matched, total } = matchCount(rev);
                const skuValue = report.mode === 'A' ? report.sku : (rev.sku || '—');
                return (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-400 border-r border-gray-200">{i + 1}</td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200 break-all">{rev.fileName}</td>
                    <td className="px-4 py-2.5 text-gray-900 border-r border-gray-200">{skuValue}</td>
                    <td className="px-4 py-2.5 text-gray-700 border-r border-gray-200">
                      {report.currentRevision} → {rev.revisionName}
                    </td>
                    <td className="px-4 py-2.5">
                      {rev.hasChanges ? (
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 ${
                          matched === total ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          Changes Made
                          {total > 0 && <span className="opacity-70">({matched}/{total} match)</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 bg-green-50 text-green-700">
                          No Changes
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Per-revision body sections ───────────────────────────────────────────────

function RevisionBody({ report, rev }: { report: MultiRevisionReport; rev: LabelRevision }) {
  const mode      = report.mode;
  const basePage  = report.currentLabelPages[rev.pageIndex];
  const baseUrl   = basePage?.url   ?? report.currentLabelUrl;
  const baseName  = basePage?.name  ?? report.currentLabelName;
  const baseBoxes = basePage?.boxes ?? report.currentBoxes;

  if (mode === 'A') {
    return (
      <>
        <div className="p-8">
          <LabelComparison
            show="both"
            currentLabelUrl={baseUrl || undefined}
            currentLabelName={baseName}
            newLabelUrl={rev.labelUrl || undefined}
            newLabelName={rev.labelName}
            currentBoxes={baseBoxes}
            newBoxes={rev.boxes}
          />
        </div>
        {rev.requirements.length > 0 && (
          <>
            <div className="print-break-before p-8">
              <MissingChanges requirements={rev.requirements} />
            </div>
            <div className="print-break-before p-8 space-y-6">
              <InspectionSummary data={computeSummaryData(rev.requirements)} />
              <DiscrepancyDetails categories={rev.discrepancyCategories} />
            </div>
          </>
        )}
        {!rev.requirements.length && (
          <div className="print-break-before p-8 space-y-6">
            <InspectionSummary data={ZERO_SUMMARY} />
            <DiscrepancyDetails categories={rev.discrepancyCategories} />
          </div>
        )}
      </>
    );
  }

  if (mode === 'B') {
    return (
      <>
        <div className="p-8">
          <MissingChanges requirements={rev.requirements} />
        </div>
        <div className="print-break-before p-8">
          <ExpectedChanges data={requirementsToExpectedChanges(rev.requirements)} />
        </div>
        <div className="print-break-before p-8">
          <LabelComparison
            show="master"
            currentLabelUrl={baseUrl || undefined}
            currentLabelName={baseName}
            newLabelUrl={rev.labelUrl || undefined}
            newLabelName={rev.labelName}
            currentBoxes={baseBoxes}
            newBoxes={rev.boxes}
          />
        </div>
        <div className="print-break-before p-8 space-y-6">
          <InspectionSummary data={computeSummaryData(rev.requirements)} />
          <DiscrepancyDetails categories={rev.discrepancyCategories} />
        </div>
      </>
    );
  }

  // Mode C — full comparison
  return (
    <>
      <div className="p-8">
        <MissingChanges requirements={rev.requirements} />
      </div>
      <div className="print-break-before p-8">
        <ExpectedChanges data={requirementsToExpectedChanges(rev.requirements)} />
      </div>
      <div className="print-break-before p-8">
        <LabelComparison
          show="both"
          currentLabelUrl={baseUrl || undefined}
          currentLabelName={baseName}
          newLabelUrl={rev.labelUrl || undefined}
          newLabelName={rev.labelName}
          currentBoxes={baseBoxes}
          newBoxes={rev.boxes}
        />
      </div>
      <div className="print-break-before p-8 space-y-6">
        <InspectionSummary data={computeSummaryData(rev.requirements)} />
        <DiscrepancyDetails categories={rev.discrepancyCategories} />
      </div>
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MultiRevisionPrint({ report }: { report: MultiRevisionReport }) {
  const changedRevs  = report.revisions.filter(r =>  r.hasChanges);
  const noChangeRevs = report.revisions.filter(r => !r.hasChanges);

  return (
    <div>
      {/* Cover page — only when more than one revision */}
      {report.revisions.length > 1 && (
        <PrintCoverPage report={report} selectedRevisions={report.revisions} />
      )}

      {/* Changed labels — one full section per label */}
      {changedRevs.map((rev) => (
        <div key={`${rev.fileIndex}-${rev.pageIndex}`} style={{ pageBreakBefore: 'always' }}>
          <PrintPageHeader report={report} revision={rev} />
          <RevisionBody report={report} rev={rev} />
        </div>
      ))}

      {/* No-change labels */}
      {noChangeRevs.map((rev) => {
        const basePage = report.currentLabelPages[rev.pageIndex];
        const baseUrl  = basePage?.url  ?? report.currentLabelUrl;
        const baseName = basePage?.name ?? report.currentLabelName;
        return (
          <div key={`${rev.fileIndex}-${rev.pageIndex}`} style={{ pageBreakBefore: 'always' }}>
            <PrintPageHeader report={report} revision={rev} />
            {report.mode === 'C' ? (
              <div className="p-8 grid grid-cols-2 gap-6">
                <div className="border border-gray-200 bg-white">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Current Version</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{baseName}</div>
                  </div>
                  <div className="p-4">
                    <img src={baseUrl} alt={baseName} className="w-full h-auto block" />
                  </div>
                </div>
                <div className="border border-gray-200 bg-white">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">New Version</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{rev.labelName}</div>
                  </div>
                  <div className="p-4">
                    <img src={rev.labelUrl} alt={rev.labelName} className="w-full h-auto block" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8">
                <div className="border border-gray-200 bg-white inline-block max-w-md w-full">
                  <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200 flex items-center justify-between gap-2">
                    <div className="text-[10px] text-gray-400 truncate">{rev.labelName}</div>
                    <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-green-600">
                      No Changes
                    </span>
                  </div>
                  <div className="p-4">
                    <img src={rev.labelUrl} alt={rev.labelName} className="w-full h-auto block" />
                  </div>
                </div>
              </div>
            )}
            {rev.requirements.length > 0 && (
              <>
                <div className="print-break-before p-8">
                  <MissingChanges requirements={rev.requirements} />
                </div>
                <div className="print-break-before p-8">
                  <InspectionSummary data={ZERO_SUMMARY} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
