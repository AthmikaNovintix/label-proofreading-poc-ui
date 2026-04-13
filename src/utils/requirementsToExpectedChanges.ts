import type { Requirement } from '@/report/types';
import type { ExpectedChangesData, ExpectedChangesTabData } from '@/label-preview/ExpectedChanges';

/**
 * Converts a flat Requirement[] (from form/analysis) into the nested
 * ExpectedChangesData shape consumed by the ExpectedChanges component.
 * Groups by elementType (Text / Symbol / Barcode / Image) and shows
 * expected vs. actual values side-by-side.
 */
export function requirementsToExpectedChanges(requirements: Requirement[]): ExpectedChangesData {
  const byType: Record<string, Requirement[]> = {
    Text: [], Symbol: [], Barcode: [], Image: [],
  };

  for (const req of requirements) {
    const key = req.elementType as string;
    if (key in byType) {
      byType[key].push(req);
    }
  }

  function toTabData(reqs: Requirement[]): ExpectedChangesTabData | undefined {
    if (!reqs.length) return undefined;
    return {
      expected: [{
        category: 'Requirements',
        items: reqs.map(r => ({
          attribute:  r.description || r.elementType,
          changeType: r.changeType,
          value:      r.expectedValue || '—',
        })),
      }],
      actual: [{
        category: 'Requirements',
        items: reqs.map(r => ({
          attribute:  r.description || r.elementType,
          changeType: r.changeType,
          value:      r.actualValue && r.actualValue !== '' ? r.actualValue : '— NOT FOUND —',
        })),
      }],
    };
  }

  return {
    text:     toTabData(byType.Text),
    symbols:  toTabData(byType.Symbol),
    barcodes: toTabData(byType.Barcode),
    images:   toTabData(byType.Image),
  };
}
