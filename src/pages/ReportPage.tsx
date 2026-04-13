import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/report/ThemeContext';
import { ReportHeader } from '@/report/ReportHeader';
import { MetadataRow } from '@/report/MetadataRow';
import { FrameA, FrameB, FrameC } from '@/report/Frames';
import type { ReportData, Requirement, DiscrepancyCategory, DrawnBox } from '@/report/types';
import type { ProofRequestMissingItem } from '@/data/dummyData';
import type { SetupReportData } from '@/label-preview/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function buildSummaryFromCategories(categories: DiscrepancyCategory[]) {
  const titleMap: Record<string, string> = {
    TEXT: 'text', SYMBOLS: 'symbol', BARCODES: 'barcode', IMAGE: 'image',
  };
  const ctMap: Record<string, string> = {
    Deleted: 'deleted', Added: 'added', Modified: 'modified',
    Repositioned: 'misplaced', Misplaced: 'misplaced',
  };
  const empty = () => ({ text: 0, symbol: 0, barcode: 0, image: 0 });
  const data  = { deleted: empty(), added: empty(), modified: empty(), misplaced: empty() };
  for (const cat of categories) {
    const ek = titleMap[cat.title];
    for (const item of cat.items) {
      const ck = ctMap[item.changeType];
      if (ck && ek) (data as Record<string, Record<string, number>>)[ck][ek]++;
    }
  }
  return data;
}

function buildRequirements(
  satisfiedItems: ProofRequestMissingItem[],
  missingItems: ProofRequestMissingItem[],
): Requirement[] {
  let id = 1;
  return [
    ...satisfiedItems.map((item) => ({
      id: id++,
      elementType: item.category as Requirement['elementType'],
      changeType:  item.expectedChange as Requirement['changeType'],
      description: item.label,
      expectedValue: item.expectedValue,
      actualValue:   item.expectedValue,
      status: 'Match' as const,
    })),
    ...missingItems.map((item) => ({
      id: id++,
      elementType: item.category as Requirement['elementType'],
      changeType:  item.expectedChange as Requirement['changeType'],
      description: item.label,
      expectedValue: item.expectedValue,
      actualValue:   '— NOT FOUND —',
      status: 'Mismatch' as const,
    })),
  ];
}

function buildDiscrepancyCategories(parsedItems: any[]): DiscrepancyCategory[] {
  const ORDER = ['Text', 'Symbol', 'Barcode', 'Image'];
  const TITLE: Record<string, string> = {
    Text: 'TEXT', Symbol: 'SYMBOLS', Barcode: 'BARCODES', Image: 'IMAGE',
  };
  const map: Record<string, { changeType: any; value: string }[]> = {};
  for (const item of parsedItems) {
    const title = TITLE[item.category] ?? item.category.toUpperCase();
    if (!map[title]) map[title] = [];
    map[title].push({ changeType: item.status, value: item.value });
  }
  return ORDER
    .map((cat) => TITLE[cat])
    .filter((title) => map[title]?.length)
    .map((title) => ({ title, items: map[title] }));
}

function buildSummaryData(parsedItems: any[]) {
  const empty = () => ({ text: 0, symbol: 0, barcode: 0, image: 0 });
  const data = { deleted: empty(), added: empty(), modified: empty(), misplaced: empty() };
  const catKey: Record<string, keyof ReturnType<typeof empty>> = {
    Text: 'text', Symbol: 'symbol', Barcode: 'barcode', Image: 'image',
  };
  const statusKey: Record<string, keyof typeof data> = {
    Deleted: 'deleted', Added: 'added', Modified: 'modified', Repositioned: 'misplaced',
  };
  for (const item of parsedItems) {
    const sk = statusKey[item.status];
    const ck = catKey[item.category];
    if (sk && ck) data[sk][ck]++;
  }
  return data;
}

function buildAnnotationBoxes(annotations: any[]): DrawnBox[] {
  return annotations.map((ann, i) => ({
    id: `ann-${i}`,
    type: ann.change_type as DrawnBox['type'],
    top:    ann.y      * 100,
    left:   ann.x      * 100,
    width:  ann.width  * 100,
    height: ann.height * 100,
    text:   ann.label,
  }));
}

// ── inner page ────────────────────────────────────────────────────────────────

const ReportPageInner = () => {
  const location = useLocation();

  // ── If coming from SetupForm, use its data directly ──────────────────────────
  const setupFormData = location.state?.setupFormData as SetupReportData | undefined;

  const initialScenario = (
    setupFormData?.reportMode ??
    (location.state?.scenario as 'A' | 'B' | 'C')
  ) ?? 'A';
  const [activeScenario, setActiveScenario] = useState<'A' | 'B' | 'C'>(initialScenario);

  // Raw state from navigate (used when NOT coming from SetupForm)
  const formData       = location.state?.formData;
  const parsedItems    = location.state?.parsedItems    ?? [];
  const missingItems   = location.state?.missingItems   ?? [];
  const satisfiedItems = location.state?.satisfiedItems ?? [];
  const annotations    = location.state?.annotations    ?? [];
  const baseFile       = location.state?.baseFile       as File | null | undefined;
  const childFile      = location.state?.childFile      as File | null | undefined;
  const baseFileName   = location.state?.baseFileName   ?? '';
  const childFileName  = location.state?.childFileName  ?? '';

  // Create stable object URLs from File objects (only needed when NOT from SetupForm)
  const [baseUrl,  setBaseUrl]  = useState('');
  const [childUrl, setChildUrl] = useState('');

  useEffect(() => {
    if (setupFormData || !baseFile) return;
    const url = URL.createObjectURL(baseFile);
    setBaseUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [baseFile, setupFormData]);

  useEffect(() => {
    if (setupFormData || !childFile) return;
    const url = URL.createObjectURL(childFile);
    setChildUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [childFile, setupFormData]);

  // ── Build reportData & summaryData ────────────────────────────────────────────
  let reportData: ReportData;
  let summaryData: ReturnType<typeof buildSummaryData>;

  if (setupFormData) {
    // SetupForm path — use the submitted form data directly
    reportData = {
      reportId:         setupFormData.reportId,
      crNumber:         setupFormData.crNumber,
      sku:              setupFormData.sku,
      currentRevision:  setupFormData.currentRevision,
      newRevision:      setupFormData.newRevision,
      currentLabelName: setupFormData.currentLabelName,
      newLabelName:     setupFormData.newLabelName,
      currentLabelUrl:  setupFormData.currentLabelUrl  || undefined,
      newLabelUrl:      setupFormData.newLabelUrl       || undefined,
      currentBoxes:     setupFormData.currentBoxes ?? [],
      newBoxes:         setupFormData.newBoxes     ?? [],
      requirements:     setupFormData.requirements,
      discrepancyCategories: setupFormData.discrepancyCategories,
    };
    summaryData = buildSummaryFromCategories(setupFormData.discrepancyCategories);
  } else {
    // Standard path — build from compare-page navigation state
    const requirements          = buildRequirements(satisfiedItems, missingItems);
    const discrepancyCategories = buildDiscrepancyCategories(parsedItems);
    const newBoxes              = buildAnnotationBoxes(annotations);
    const labelVersion          = formData?.metadata?.label_version ?? '';
    const revParts              = labelVersion.includes('→')
      ? labelVersion.split('→').map((s: string) => s.trim())
      : [labelVersion, ''];
    summaryData = buildSummaryData(parsedItems);
    reportData  = {
      reportId:         '',
      crNumber:         formData?.metadata?.cr_number   ?? '',
      sku:              formData?.metadata?.part_number ?? '',
      currentRevision:  revParts[0] ?? '',
      newRevision:      revParts[1] ?? '',
      currentLabelName: baseFileName,
      newLabelName:     childFileName,
      currentLabelUrl:  baseUrl  || undefined,
      newLabelUrl:      childUrl || undefined,
      currentBoxes:     [],
      newBoxes,
      requirements,
      discrepancyCategories,
    };
  }

  return (
    <div className="min-h-screen bg-white">
      <ReportHeader
        activeScenario={activeScenario}
        onScenarioChange={setActiveScenario}
        reportId={reportData.reportId || undefined}
      />
      <div className="sticky top-[52px] z-30 print:static">
        <MetadataRow data={reportData} />
      </div>
      <div className="report-content-wrap max-w-[1600px] mx-auto px-8 py-6">
        {activeScenario === 'A' && (
          <FrameA
            data={reportData}
            summaryData={summaryData}
          />
        )}
        {activeScenario === 'B' && <FrameB formData={setupFormData ? undefined : formData} />}
        {activeScenario === 'C' && (
          <FrameC
            data={reportData}
            formData={setupFormData ? undefined : formData}
            summaryData={summaryData}
            satisfiedItems={setupFormData ? undefined : satisfiedItems}
            missingItems={setupFormData ? undefined : missingItems}
          />
        )}
      </div>
    </div>
  );
};

const ReportPage = () => (
  <ThemeProvider>
    <ReportPageInner />
  </ThemeProvider>
);

export default ReportPage;
