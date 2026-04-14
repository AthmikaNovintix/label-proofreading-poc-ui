/**
 * LabelPreviewPage — wraps SetupForm and pre-fills it from the compare page state.
 *
 * Flow:  /compare  →  /label-preview (this page)  →  /report
 *
 * Data from navigation state is converted into a SetupReportData object that
 * pre-populates the form.  When the user clicks "Generate Report", the submitted
 * SetupReportData is passed to /report via navigation state.
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SetupForm }                from '@/pages/SetupFormComponent';
import type { SetupReportData }     from '@/label-preview/types';
import type { DrawnBox, Requirement, DiscrepancyCategory } from '@/report/types';
import type { ProofRequestMissingItem } from '@/data/dummyData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer report mode from available data:
 *  B — no base label (supportive/new document only)
 *  C — both labels + analysis data (full comparison with requirements)
 *  A — both labels, no analysis data (basic side-by-side)
 */
function inferReportMode(
  hasBase: boolean,
  hasChild: boolean,
  hasAnalysis: boolean,
): 'A' | 'B' | 'C' {
  if (!hasBase && hasChild) return 'B';
  if (hasBase && hasChild && hasAnalysis) return 'C';
  return 'A';
}

function generateReportId(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm   = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}0001`;
}

function buildRequirements(
  satisfiedItems: ProofRequestMissingItem[],
  missingItems: ProofRequestMissingItem[],
): Requirement[] {
  let id = 1;
  return [
    ...satisfiedItems.map(item => ({
      id: id++,
      elementType: item.category as Requirement['elementType'],
      changeType:  item.expectedChange as Requirement['changeType'],
      description: item.label,
      expectedValue: item.expectedValue,
      actualValue:   (item.actualValue && item.actualValue !== '—') ? item.actualValue : item.expectedValue,
      status: 'Match' as const,
    })),
    ...missingItems.map(item => ({
      id: id++,
      elementType: item.category as Requirement['elementType'],
      changeType:  item.expectedChange as Requirement['changeType'],
      description: item.label,
      expectedValue: item.expectedValue,
      actualValue:   (item.actualValue && item.actualValue !== '—') ? item.actualValue : '— NOT FOUND —',
      status: 'Mismatch' as const,
    })),
  ];
}

function buildDiscrepancyCategories(parsedItems: any[]): DiscrepancyCategory[] {
  const ORDER = ['Text', 'Symbol', 'Barcode', 'Image'];
  const TITLE: Record<string, string> = {
    Text: 'TEXT', Symbol: 'SYMBOLS', Barcode: 'BARCODES', DataMatrix: 'BARCODES', Image: 'IMAGE',
  };
  const map: Record<string, { changeType: any; value: string }[]> = {};
  for (const item of parsedItems) {
    // Skip items that matched an LRF requirement — those belong in Expected Changes,
    // not in Unexpected Changes. Items without isValid (no form mode) always pass through.
    if (item.isValid === true) continue;
    const title = TITLE[item.category] ?? item.category.toUpperCase();
    if (!map[title]) map[title] = [];
    map[title].push({ changeType: item.status, value: item.value });
  }
  return ORDER
    .map(cat => TITLE[cat])
    .filter(title => map[title]?.length)
    .map(title => ({ title, items: map[title] }));
}

function buildAnnotationBoxes(annotations: any[]): DrawnBox[] {
  return annotations.map((ann, i) => ({
    id:     `ann-${i}`,
    type:   ann.change_type as DrawnBox['type'],
    top:    ann.y      * 100,
    left:   ann.x      * 100,
    width:  ann.width  * 100,
    height: ann.height * 100,
    text:   ann.label,
  }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LabelPreviewPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [initialData, setInitialData] = useState<SetupReportData | undefined>(undefined);
  const [ready,       setReady]       = useState(false);

  // Build initialData from navigation state once files are resolved as URLs
  useEffect(() => {
    const state        = location.state ?? {};
    const baseFile     = state.baseFile  as File | null | undefined;
    const childFile    = state.childFile as File | null | undefined;
    const baseFileName = (state.baseFileName  as string | undefined) ?? '';
    const childFileName= (state.childFileName as string | undefined) ?? '';
    const formData     = state.formData;
    const parsedItems  = state.parsedItems    ?? [];
    const missingItems = state.missingItems   ?? [];
    const satisfiedItems = state.satisfiedItems ?? [];
    const annotations  = state.annotations   ?? [];

    // Create object URLs from files (revoked when component unmounts)
    const baseUrl  = baseFile  ? URL.createObjectURL(baseFile)  : '';
    const childUrl = childFile ? URL.createObjectURL(childFile) : '';

    const labelVersion = formData?.metadata?.label_version ?? '';
    const revParts = labelVersion.includes('→')
      ? labelVersion.split('→').map((s: string) => s.trim())
      : [labelVersion, ''];

    const requirements          = buildRequirements(satisfiedItems, missingItems);
    const discrepancyCategories = buildDiscrepancyCategories(parsedItems);
    const newBoxes              = buildAnnotationBoxes(annotations);

    const hasBase     = !!baseUrl;
    const hasChild    = !!childUrl;
    const hasAnalysis = requirements.length > 0 || discrepancyCategories.length > 0;
    const reportMode  = inferReportMode(hasBase, hasChild, hasAnalysis);

    const data: SetupReportData = {
      reportId:        generateReportId(),
      crNumber:        formData?.metadata?.cr_number  ?? '',
      sku:             formData?.metadata?.part_number ?? '',
      currentRevision: revParts[0] ?? '',
      newRevision:     revParts[1] ?? '',
      currentLabelName: baseFileName,
      newLabelName:    childFileName,
      currentLabelUrl: baseUrl,
      newLabelUrl:     childUrl,
      currentBoxes:    [],
      newBoxes,
      requirements,
      discrepancyCategories,
      reportMode,
      currentLabelPages: baseUrl
        ? [{ url: baseUrl, name: baseFileName, boxes: [] }]
        : [],
      // Pre-populate the revised-files section so the label image is visible
      revisedFiles: childUrl ? [{
        fileName: childFileName,
        pages: [{
          url:            childUrl,
          name:           childFileName,
          sku:            formData?.metadata?.part_number ?? '',
          revisionName:   revParts[1] ?? '',
          labelType:      '',
          stockNumber:    '',
          status:         'changed' as const,
          boxes:          newBoxes,
          requirements:   [],
          discrepancyCategories: [],
        }],
      }] : [],
    };

    setInitialData(data);
    setReady(true);

    return () => {
      if (baseUrl)  URL.revokeObjectURL(baseUrl);
      if (childUrl) URL.revokeObjectURL(childUrl);
    };
  }, []); // run once on mount

  const handleBack = () => {
    navigate('/compare', {
      state: {
        formData:     location.state?.formData,
        submissionId: location.state?.submissionId,
        baseFile:     location.state?.baseFile  ? [location.state.baseFile]  : [],
        childFile:    location.state?.childFile ? [location.state.childFile] : [],
        apiResults:   location.state?.apiResults  ?? [],
        lrfAnalysis:  location.state?.lrfAnalysis ?? null,
      },
    });
  };

  const handleSubmit = (data: SetupReportData) => {
    // Pass the SetupForm's output to /report
    navigate('/report', {
      state: {
        ...location.state,
        setupFormData: data,
      },
    });
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading preview…</div>
      </div>
    );
  }

  return (
    <SetupForm
      initialData={initialData}
      onSubmit={handleSubmit}
      onBack={handleBack}
    />
  );
}
