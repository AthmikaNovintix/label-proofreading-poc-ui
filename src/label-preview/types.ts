// Re-export base types from the report module so all label-preview components
// share the same underlying types as the existing report components.
export type {
  ChangeType,
  ElementType,
  DrawnBox,
  RequirementStatus,
  Requirement,
  DiscrepancyItem,
  DiscrepancyCategory,
  ReportData,
} from '@/report/types';

import type { DrawnBox, Requirement, DiscrepancyCategory } from '@/report/types';

// ─── Multi-revision types ─────────────────────────────────────────────────────

export type ReportMode = 'A' | 'B' | 'C';

export interface LabelRevision {
  revisionName: string;
  labelName: string;
  fileName: string;
  fileIndex: number;
  pageIndex: number;
  /** Per-revision report ID override (used when printing a subset of revisions). */
  reportId?: string;
  sku: string;
  labelType: string;
  stockNumber: string;
  labelUrl: string;
  boxes: DrawnBox[];
  hasChanges: boolean;
  requirements: Requirement[];
  discrepancyCategories: DiscrepancyCategory[];
}

export interface MultiRevisionReport {
  reportId: string;
  crNumber: string;
  sku: string;
  currentRevision: string;
  currentLabelName: string;
  currentLabelUrl: string;
  /** One entry per page of the base/current label PDF. */
  currentLabelPages: { url: string; name: string; boxes: DrawnBox[] }[];
  currentBoxes: DrawnBox[];
  revisedFileName: string;
  revisedFileNames: string[];
  revisions: LabelRevision[];
  mode: ReportMode;
}

// ─── SetupForm types (superset of ReportData used by the setup page) ──────────

export type SetupReportMode = 'A' | 'B' | 'C';

export interface RevisedLabelPage {
  url: string;
  name: string;
  sku: string;
  revisionName: string;
  labelType: string;
  stockNumber: string;
  status: 'changed' | 'no-changes';
  boxes: DrawnBox[];
  requirements: Requirement[];
  discrepancyCategories: DiscrepancyCategory[];
}

export interface RevisedFile {
  fileName: string;
  pages: RevisedLabelPage[];
}

export interface SetupReportData {
  reportId: string;
  crNumber: string;
  sku: string;
  currentRevision: string;
  newRevision: string;
  currentLabelName: string;
  newLabelName: string;
  currentLabelUrl: string;
  newLabelUrl: string;
  currentBoxes: DrawnBox[];
  newBoxes: DrawnBox[];
  requirements: Requirement[];
  discrepancyCategories: DiscrepancyCategory[];
  newLabelPages?: { url: string; name: string; labelType: string; stockNumber: string }[];
  commonRequirements?: Requirement[];
  revisedFiles?: RevisedFile[];
  reportMode?: SetupReportMode;
  currentLabelPages?: { url: string; name: string; boxes: DrawnBox[] }[];
}
