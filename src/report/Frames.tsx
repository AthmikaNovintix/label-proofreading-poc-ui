import { ReportInspectionSummary } from './InspectionSummary';
import { LabelComparison } from './LabelComparison';
import { ReportDiscrepancyDetails } from './DiscrepancyDetails';
import { MissingChanges } from './MissingChanges';
import { ExpectedChanges } from './ExpectedChanges';
import type { ReportData, DiscrepancyCategory, Requirement } from './types';
import type { ProofRequestMissingItem } from '@/data/dummyData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a readable requirement description from a change value string */
function generateRequirement(changeType: string, value: string): string {
  const fromTo = value.match(/From:\s*'(.+?)'\s*[→]+\s*To:\s*'(.+?)'/);
  if (fromTo) return `Update '${fromTo[1]}' to '${fromTo[2]}'`;
  if (changeType === 'Added')   return `Add: ${value}`;
  if (changeType === 'Deleted') return `Remove: ${value}`;
  return value;
}

/** Convert discrepancy categories → Requirement[] for the unexpected changes table */
function discrepancyToRequirements(categories: DiscrepancyCategory[]): Requirement[] {
  const ELEMENT_MAP: Record<string, Requirement['elementType']> = {
    TEXT: 'Text', SYMBOLS: 'Symbol', BARCODES: 'Barcode', IMAGE: 'Image',
  };
  let id = 1;
  const out: Requirement[] = [];
  for (const cat of categories) {
    const elementType = ELEMENT_MAP[cat.title] ?? 'Text';
    for (const item of cat.items) {
      out.push({
        id: id++,
        elementType,
        changeType: item.changeType,
        description: generateRequirement(item.changeType, item.value),
        expectedValue: '-',
        actualValue: item.value,
        status: 'Match',
      });
    }
  }
  return out;
}

/** Combined inspection summary count (requirements + discrepancy categories) */
function buildCombinedSummary(data?: ReportData) {
  const empty = () => ({ text: 0, symbol: 0, barcode: 0, image: 0 });
  const result = { deleted: empty(), added: empty(), modified: empty(), misplaced: empty() };

  // Case-insensitive element-type → bucket
  const elOf = (s: string): keyof ReturnType<typeof empty> | undefined => {
    switch (String(s ?? '').toLowerCase()) {
      case 'text':    return 'text';
      case 'symbol':
      case 'symbols': return 'symbol';
      case 'barcode':
      case 'barcodes':return 'barcode';
      case 'image':   return 'image';
      default:        return undefined;
    }
  };
  // Case-insensitive change-type → bucket
  const ctOf = (s: string): keyof typeof result | undefined => {
    switch (String(s ?? '').toLowerCase()) {
      case 'modified':     return 'modified';
      case 'added':        return 'added';
      case 'deleted':      return 'deleted';
      case 'misplaced':
      case 'repositioned': return 'misplaced';
      default:             return undefined;
    }
  };

  for (const req of data?.requirements ?? []) {
    const ek = elOf(req.elementType); const ck = ctOf(req.changeType);
    if (ek && ck) result[ck][ek]++;
  }
  for (const cat of data?.discrepancyCategories ?? []) {
    const ek = elOf(cat.title);
    for (const item of cat.items) {
      const ck = ctOf(item.changeType);
      if (ek && ck) result[ck][ek]++;
    }
  }
  return result;
}

/** Combined Changes Made categories (requirements + discrepancy categories) */
function buildCombinedCategories(data?: ReportData): DiscrepancyCategory[] {
  const ELEMENT_TITLE: Record<string, string> = {
    Text: 'TEXT', Symbol: 'SYMBOLS', Barcode: 'BARCODES', Image: 'IMAGE',
  };
  const ORDER = ['TEXT', 'SYMBOLS', 'BARCODES', 'IMAGE'];
  const map = new Map<string, DiscrepancyCategory['items']>();

  for (const req of data?.requirements ?? []) {
    const title = ELEMENT_TITLE[req.elementType] ?? 'TEXT';
    if (!map.has(title)) map.set(title, []);
    map.get(title)!.push({ changeType: req.changeType, value: req.description });
  }
  for (const cat of data?.discrepancyCategories ?? []) {
    if (!map.has(cat.title)) map.set(cat.title, []);
    map.get(cat.title)!.push(...cat.items);
  }

  return ORDER.filter(t => map.has(t)).map(t => ({ title: t, items: map.get(t)! }));
}

// ─── Components ───────────────────────────────────────────────────────────────

interface FormData {
  changes: Record<string, { changeType: string; expectedValue: string }>;
}

interface DynamicProps {
  data?: ReportData;
  formData?: FormData;
  summaryData?: any;
  satisfiedItems?: ProofRequestMissingItem[];
  missingItems?: ProofRequestMissingItem[];
}

/** Page 3 — Report Details */
function ReportDetailsPage({ data }: Pick<DynamicProps, 'data'>) {
  const unexpectedReqs = data?.discrepancyCategories?.length
    ? discrepancyToRequirements(data.discrepancyCategories)
    : [];

  return (
    <div className="space-y-6">
      <h3 className="text-sm uppercase tracking-wide font-bold text-gray-700">Report Details</h3>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 px-1">Expected Changes</h3>
        <MissingChanges
          requirements={data?.requirements?.length ? data.requirements : undefined}
          summaryOnly={false}
          hideTitle
          hideCount
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 px-1">Unexpected Changes</h3>
        {unexpectedReqs.length > 0 ? (
          <MissingChanges requirements={unexpectedReqs} mode="unexpected" hideTitle hideCount />
        ) : (
          <div className="bg-white border border-gray-300 px-5 py-6 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
            No Unexpected Changes
          </div>
        )}
      </div>
    </div>
  );
}

// Scene 1 → Existing + Master
export function FrameA({ data, summaryData }: Pick<DynamicProps, 'data' | 'summaryData'>) {
  const combinedSummary   = buildCombinedSummary(data);
  const combinedCategories = buildCombinedCategories(data);

  return (
    <div className="report-section space-y-6">
      {/* Page 1 */}
      <MissingChanges
        requirements={data?.requirements?.length ? data.requirements : undefined}
        summaryOnly
      />

      {/* Page 2 */}
      <div className="report-page-break report-label-page">
        <LabelComparison
          currentLabelUrl={data?.currentLabelUrl} currentLabelName={data?.currentLabelName}
          newLabelUrl={data?.newLabelUrl}          newLabelName={data?.newLabelName}
          currentBoxes={data?.currentBoxes}        newBoxes={data?.newBoxes}
        />
      </div>

      {/* Page 3 */}
      <div className="report-page-break">
        <ReportDetailsPage data={data} />
      </div>

      {/* Page 4 */}
      <div className="report-page-break space-y-6">
        <ReportInspectionSummary data={combinedSummary} />
        <div className="space-y-2">
          <h3 className="text-sm uppercase tracking-wide font-bold text-gray-700">Changes Made</h3>
          <ReportDiscrepancyDetails categories={combinedCategories} hideTitle />
        </div>
      </div>
    </div>
  );
}

// Scene 3 → Supportive + Master
export function FrameB({ formData }: { formData?: FormData }) {
  return (
    <div className="report-section space-y-6">
      <MissingChanges summaryOnly />

      <div className="report-page-break">
        <ExpectedChanges formData={formData} />
      </div>

      <div className="report-page-break report-label-page">
        <LabelComparison show="master" />
      </div>

      <div className="report-page-break space-y-6">
        <ReportInspectionSummary />
        <ReportDiscrepancyDetails />
      </div>
    </div>
  );
}

// Scene 2 → Full Comparison
export function FrameC({ data, formData, summaryData, satisfiedItems, missingItems }: DynamicProps) {
  const combinedSummary    = buildCombinedSummary(data);
  const combinedCategories = buildCombinedCategories(data);

  return (
    <div className="report-section space-y-6">
      {/* Page 1 */}
      <MissingChanges
        requirements={data?.requirements?.length ? data.requirements : undefined}
        summaryOnly
      />

      {/* Page 2 */}
      <div className="report-page-break report-label-page">
        <LabelComparison
          currentLabelUrl={data?.currentLabelUrl} currentLabelName={data?.currentLabelName}
          newLabelUrl={data?.newLabelUrl}          newLabelName={data?.newLabelName}
          currentBoxes={data?.currentBoxes}        newBoxes={data?.newBoxes}
        />
      </div>

      {/* Page 3 */}
      <div className="report-page-break">
        <ReportDetailsPage data={data} />
      </div>

      {/* Page 4 */}
      <div className="report-page-break space-y-6">
        <ReportInspectionSummary data={combinedSummary} />
        <div className="space-y-2">
          <h3 className="text-sm uppercase tracking-wide font-bold text-gray-700">Changes Made</h3>
          <ReportDiscrepancyDetails categories={combinedCategories} hideTitle />
        </div>
      </div>
    </div>
  );
}
