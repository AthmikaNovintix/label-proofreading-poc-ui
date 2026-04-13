/**
 * SetupFormComponent — Label Proofing Report setup form.
 *
 * Ported from the standalone Label_Proofing_Report_V2 project.
 * Accepts optional initialData (pre-filled from the compare page) and
 * calls onSubmit(data) when the user clicks "Generate Report".
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, ScanLine } from 'lucide-react';
import StepIndicator from '@/components/StepIndicator';
import ProfileDropdown from '@/components/ProfileDropdown';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

import { BoundingBoxDrawer }                        from '@/components/BoundingBoxDrawer';
import { getDrafts, loadDraft, saveDraft, deleteDraft, toDataUrl, type Draft } from '@/services/drafts';
import type { DrawnBox, Requirement, DiscrepancyItem, DiscrepancyCategory, RequirementStatus, ChangeType, ElementType } from '@/report/types';
import type { SetupReportData, SetupReportMode, RevisedLabelPage, RevisedFile } from '@/label-preview/types';

export type { SetupReportData, SetupReportMode, RevisedLabelPage, RevisedFile };

// ─── Local form state for a revised page (adds 'pending' status) ──────────────

interface RevisedPageState extends Omit<RevisedLabelPage, 'status'> {
  status: 'pending' | 'changed' | 'no-changes';
}
interface RevisedFileState {
  fileName: string;
  pages: RevisedPageState[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ELEMENT_TYPES: ElementType[] = ['Text', 'Symbol', 'Barcode', 'Image'];
const CHANGE_TYPES_REQ: ChangeType[] = ['Modified', 'Added', 'Deleted'];
const CHANGE_TYPES_DISC: ChangeType[] = ['Modified', 'Added', 'Deleted', 'Misplaced', 'Repositioned'];
const REQ_STATUSES: RequirementStatus[] = ['Match', 'Mismatch'];

function makeRequirement(id: number): Requirement {
  return { id, elementType: 'Text', changeType: 'Modified', description: '', expectedValue: '', actualValue: '', status: 'Match' };
}
function makeCategory(): DiscrepancyCategory { return { title: '', items: [] }; }
function makeItem(): DiscrepancyItem { return { changeType: 'Modified', value: '' }; }

function generateReportId(existingIds: string[] = []): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm   = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(ist.getUTCDate()).padStart(2, '0');
  const prefix = `${yyyy}${mm}${dd}`;
  const maxCounter = existingIds
    .filter(id => id.startsWith(prefix))
    .reduce((max, id) => {
      const n = parseInt(id.slice(-4), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
  return `${prefix}${String(maxCounter + 1).padStart(4, '0')}`;
}

const AUTO_SAVE_KEY = 'setupFormAutoSave';

function readAutoSave(): SetupReportData | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SetupReportData;
    if (!parsed.revisedFiles?.length) return null;
    return parsed;
  } catch { return null; }
}

// ─── PDF rendering ─────────────────────────────────────────────────────────────

async function renderPdfPages(file: File): Promise<string[]> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const typedArray = new Uint8Array(reader.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        const urls: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          urls.push(canvas.toDataURL('image/png'));
        }
        resolve(urls);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── RequirementsTable ─────────────────────────────────────────────────────────

function RequirementsTable({
  requirements, onAdd, onUpdate, onDelete,
}: {
  requirements: Requirement[];
  onAdd: () => void;
  onUpdate: (i: number, field: keyof Requirement, value: string) => void;
  onDelete: (i: number) => void;
}) {
  const inp = "w-full border border-gray-300 px-1 py-1 text-xs focus:outline-none";
  const sel = "w-full border border-gray-300 px-1 py-1 text-xs focus:outline-none bg-white";
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">#</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Element</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Change Type</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Requirement</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Expected Value</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Actual Value</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-600 font-bold">Status</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                <td className="px-2 py-1">
                  <select className={sel} value={req.elementType} onChange={e => onUpdate(i, 'elementType', e.target.value)}>
                    {ELEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select className={sel} value={req.changeType} onChange={e => onUpdate(i, 'changeType', e.target.value)}>
                    {CHANGE_TYPES_REQ.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1"><input className={inp} value={req.description} onChange={e => onUpdate(i, 'description', e.target.value)} placeholder="Description" /></td>
                <td className="px-2 py-1"><input className={inp} value={req.expectedValue} onChange={e => onUpdate(i, 'expectedValue', e.target.value)} placeholder="Expected" /></td>
                <td className="px-2 py-1"><input className={inp} value={req.actualValue} onChange={e => onUpdate(i, 'actualValue', e.target.value)} placeholder="Actual" /></td>
                <td className="px-2 py-1">
                  <select className={sel} value={req.status} onChange={e => onUpdate(i, 'status', e.target.value)}>
                    {REQ_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1 text-center">
                  <button type="button" onClick={() => onDelete(i)} className="text-gray-400 hover:text-red-500 font-bold text-base leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={onAdd} className="text-xs border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors">
        + Add Requirement
      </button>
    </div>
  );
}

// ─── DiscrepancySection ────────────────────────────────────────────────────────

function DiscrepancySection({
  categories, onAddCategory, onDeleteCategory, onUpdateTitle,
  onAddItem, onDeleteItem, onUpdateItem,
}: {
  categories: DiscrepancyCategory[];
  onAddCategory: () => void;
  onDeleteCategory: (ci: number) => void;
  onUpdateTitle: (ci: number, title: string) => void;
  onAddItem: (ci: number) => void;
  onDeleteItem: (ci: number, ii: number) => void;
  onUpdateItem: (ci: number, ii: number, field: keyof DiscrepancyItem, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {categories.map((cat, ci) => (
        <div key={ci} className="border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <input
              className="border border-gray-300 px-2 py-1 text-xs font-bold uppercase w-48 focus:outline-none bg-white"
              value={cat.title}
              onChange={e => onUpdateTitle(ci, e.target.value)}
              placeholder="CATEGORY NAME"
            />
            <button type="button" onClick={() => onDeleteCategory(ci)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          </div>
          {cat.items.length > 0 && (
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: '20%' }} /><col style={{ width: '74%' }} /><col style={{ width: '6%' }} /></colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-1.5 text-left text-[10px] uppercase text-gray-500 font-bold">Change Type</th>
                  <th className="px-2 py-1.5 text-left text-[10px] uppercase text-gray-500 font-bold">Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cat.items.map((item, ii) => (
                  <tr key={ii} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <select className="w-full border border-gray-300 px-1 py-1 text-xs focus:outline-none bg-white" value={item.changeType} onChange={e => onUpdateItem(ci, ii, 'changeType', e.target.value)}>
                        {CHANGE_TYPES_DISC.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input className="w-full border border-gray-300 px-1 py-1 text-xs focus:outline-none" value={item.value} onChange={e => onUpdateItem(ci, ii, 'value', e.target.value)} placeholder="Description of change" />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button type="button" onClick={() => onDeleteItem(ci, ii)} className="text-gray-400 hover:text-red-500 font-bold text-base leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" onClick={() => onAddItem(ci)} className="text-xs border border-gray-300 px-2 py-1 text-gray-600 hover:bg-gray-50">+ Add Item</button>
        </div>
      ))}
      <button type="button" onClick={onAddCategory} className="text-xs border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors">
        + Add Category
      </button>
    </div>
  );
}

// ─── Main SetupForm ────────────────────────────────────────────────────────────

interface SetupFormProps {
  initialData?: SetupReportData;
  onSubmit: (data: SetupReportData) => void;
  onBack?: () => void;
}

export function SetupForm({ initialData, onSubmit, onBack }: SetupFormProps) {
  const isEditing = !!initialData;
  const auto      = !isEditing ? readAutoSave() : null;

  // ── Mode (derived from uploaded data — no manual selection) ──

  // ── Metadata ──
  const [reportId,        setReportId]        = useState(initialData?.reportId ?? auto?.reportId ?? generateReportId());
  const [crNumber,        setCrNumber]        = useState(initialData?.crNumber ?? auto?.crNumber ?? '');
  const [sku,             setSku]             = useState(initialData?.sku ?? auto?.sku ?? '');
  const [currentRevision, setCurrentRevision] = useState(initialData?.currentRevision ?? auto?.currentRevision ?? '');
  const [newRevision,     setNewRevision]     = useState(initialData?.newRevision ?? auto?.newRevision ?? '');

  // ── Base label ──
  const [currentLabelName,  setCurrentLabelName]  = useState(initialData?.currentLabelName ?? auto?.currentLabelName ?? '');
  const [currentLabelUrl,   setCurrentLabelUrl]   = useState(initialData?.currentLabelUrl  ?? auto?.currentLabelUrl  ?? '');
  const [currentLabelPages, setCurrentLabelPages] = useState<{ url: string; name: string; boxes: DrawnBox[] }[]>(() => {
    const saved = initialData?.currentLabelPages ?? auto?.currentLabelPages;
    if (saved?.length) return saved.map(p => ({ ...p, boxes: p.boxes ?? [] }));
    const url   = initialData?.currentLabelUrl ?? auto?.currentLabelUrl ?? '';
    const name  = initialData?.currentLabelName ?? auto?.currentLabelName ?? '';
    const boxes = initialData?.currentBoxes ?? auto?.currentBoxes ?? [];
    return url ? [{ url, name, boxes }] : [];
  });
  const [currentBoxes, setCurrentBoxes] = useState<DrawnBox[]>(initialData?.currentBoxes ?? auto?.currentBoxes ?? []);

  // ── Common requirements ──
  const [commonRequirements, setCommonRequirements] = useState<Requirement[]>(() => {
    const src = initialData?.commonRequirements ?? initialData?.requirements ?? auto?.requirements;
    if (src?.length) {
      return src.map(r => ({
        ...r,
        status: ((r.status as string) === 'Matched' ? 'Match' : (r.status as string) === 'Mismatched' ? 'Mismatch' : r.status) as RequirementStatus,
      }));
    }
    return [makeRequirement(1)];
  });

  // ── Common discrepancy categories ──
  const [commonCategories, setCommonCategories] = useState<DiscrepancyCategory[]>(() => {
    const src = initialData?.discrepancyCategories ?? auto?.discrepancyCategories;
    return src?.length ? src : [makeCategory()];
  });

  // ── Revised files ──
  const [revisedFiles, setRevisedFiles] = useState<RevisedFileState[]>(() => {
    if (initialData?.revisedFiles?.length) {
      return initialData.revisedFiles.map(f => ({ ...f, pages: f.pages.map(p => ({ ...p })) }));
    }
    if (auto?.revisedFiles?.length) {
      return auto.revisedFiles.map(f => ({ ...f, pages: f.pages.map(p => ({ ...p })) }));
    }
    if (initialData) {
      if (initialData.newLabelPages?.length) {
        return [{
          fileName: initialData.newLabelName ?? 'Revised Label',
          pages: initialData.newLabelPages.map((p, i) => ({
            url: p.url, name: p.name, sku: '', revisionName: '', labelType: p.labelType, stockNumber: p.stockNumber,
            status: i === 0 ? 'changed' : 'no-changes',
            boxes: i === 0 ? (initialData.newBoxes ?? []) : [],
            requirements: [],
            discrepancyCategories: [],
          } as RevisedPageState)),
        }];
      }
      if (initialData.newLabelUrl) {
        return [{
          fileName: initialData.newLabelName ?? 'Revised Label',
          pages: [{
            url: initialData.newLabelUrl,
            name: initialData.newLabelName ?? '',
            sku: '', revisionName: '', labelType: '', stockNumber: '',
            status: 'changed' as const,
            boxes: initialData.newBoxes ?? [],
            requirements: [],
            discrepancyCategories: [],
          }],
        }];
      }
    }
    return [];
  });

  // ── Derived report mode (no manual selection) ──
  const reportMode: SetupReportMode = (() => {
    const hasBase     = currentLabelPages.length > 0;
    const hasRevised  = revisedFiles.some(f => f.pages.length > 0);
    const hasAnalysis = commonRequirements.length > 0 || commonCategories.length > 0;
    if (!hasBase && hasRevised) return 'B';
    if (hasBase && hasRevised && hasAnalysis) return 'C';
    return 'A';
  })();

  // ── Drafts ──
  const [drafts,          setDrafts]          = useState<Draft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [savingDraft,     setSavingDraft]     = useState(false);

  // ── Auto-save ──
  useEffect(() => {
    if (isEditing) return;
    try {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({
        reportMode,
        reportId, crNumber, sku, currentRevision, newRevision,
        currentLabelName, currentLabelUrl, currentLabelPages, currentBoxes,
        commonRequirements,
        discrepancyCategories: commonCategories,
        revisedFiles,
        ...deriveLegacyFields(),
      }));
    } catch { /* quota exceeded */ }
  }, [reportId, crNumber, sku, currentRevision, newRevision,
      currentLabelName, currentLabelUrl, currentLabelPages, currentBoxes,
      commonRequirements, commonCategories, revisedFiles, isEditing]);

  useEffect(() => {
    getDrafts().then(list => {
      setDrafts(list);
      const last = localStorage.getItem('lastDraftId');
      if (last && list.some(d => d.id === last)) setSelectedDraftId(last);
    }).catch(() => {});
  }, []);

  const refreshDrafts = () => getDrafts().then(setDrafts).catch(() => {});

  // ── Derive legacy flat fields from first changed page ──────────────────────

  function deriveLegacyFields() {
    for (const file of revisedFiles) {
      const changed = file.pages.find(p => p.status === 'changed');
      if (changed) {
        return {
          newLabelName: changed.name || file.fileName,
          newRevision,
          newLabelUrl: changed.url,
          newBoxes: changed.boxes,
          requirements: [...commonRequirements, ...changed.requirements].map((r, i) => ({ ...r, id: i + 1 })),
          discrepancyCategories: changed.discrepancyCategories.length
            ? changed.discrepancyCategories
            : commonCategories.filter(c => c.title || c.items.length),
          newLabelPages: revisedFiles.flatMap(f =>
            f.pages.map(p => ({ url: p.url, name: p.name, labelType: p.labelType, stockNumber: p.stockNumber }))
          ),
        };
      }
    }
    return {
      newLabelName: '', newRevision, newLabelUrl: '', newBoxes: [],
      requirements: commonRequirements.map((r, i) => ({ ...r, id: i + 1 })),
      discrepancyCategories: commonCategories.filter(c => c.title || c.items.length),
      newLabelPages: undefined,
    };
  }

  // ── Draft handlers ──────────────────────────────────────────────────────────

  const loadDraftData = (d: SetupReportData) => {
    setReportId(d.reportId);
    setCrNumber(d.crNumber);
    setSku(d.sku);
    setCurrentRevision(d.currentRevision);
    setNewRevision(d.newRevision);
    setCurrentLabelName(d.currentLabelName);
    setCurrentLabelUrl(d.currentLabelUrl);
    const draftPages = d.currentLabelPages;
    setCurrentLabelPages(
      draftPages?.length
        ? draftPages.map(p => ({ ...p, boxes: p.boxes ?? [] }))
        : d.currentLabelUrl ? [{ url: d.currentLabelUrl, name: d.currentLabelName ?? '', boxes: d.currentBoxes ?? [] }] : []
    );
    setCurrentBoxes(d.currentBoxes ?? []);
    setCommonRequirements(
      (d.commonRequirements ?? d.requirements)?.length
        ? (d.commonRequirements ?? d.requirements)!.map(r => ({
            ...r,
            status: ((r.status as string) === 'Matched' ? 'Match' : (r.status as string) === 'Mismatched' ? 'Mismatch' : r.status) as RequirementStatus,
          }))
        : [makeRequirement(1)]
    );
    setCommonCategories(d.discrepancyCategories?.length ? d.discrepancyCategories : [makeCategory()]);
    if (d.revisedFiles?.length) {
      setRevisedFiles(d.revisedFiles.map(f => ({ ...f, pages: f.pages.map(p => ({ ...p })) })));
    } else if (d.newLabelPages?.length) {
      setRevisedFiles([{
        fileName: d.newLabelName ?? 'Revised Label',
        pages: d.newLabelPages.map((p, i) => ({
          url: p.url, name: p.name, sku: '', revisionName: '', labelType: p.labelType, stockNumber: p.stockNumber,
          status: (i === 0 ? 'changed' : 'no-changes') as RevisedPageState['status'],
          boxes: i === 0 ? (d.newBoxes ?? []) : [],
          requirements: [],
          discrepancyCategories: [],
        })),
      }]);
    } else if (d.newLabelUrl) {
      setRevisedFiles([{
        fileName: d.newLabelName ?? 'Revised Label',
        pages: [{
          url: d.newLabelUrl, name: d.newLabelName ?? '', sku: '', revisionName: '',
          labelType: '', stockNumber: '', status: 'changed' as const,
          boxes: d.newBoxes ?? [], requirements: [], discrepancyCategories: [],
        }],
      }]);
    } else {
      setRevisedFiles([]);
    }
  };

  const handleSelectDraft = async (id: string) => {
    setSelectedDraftId(id);
    if (!id) return;
    try {
      const draft = await loadDraft(id);
      if (draft.data) { loadDraftData(draft.data); localStorage.setItem('lastDraftId', id); }
    } catch (e) { alert(`Failed to load draft: ${e instanceof Error ? e.message : 'unknown error'}`); }
  };

  const buildReportData = async (): Promise<SetupReportData> => {
    const resolvedCurrentUrl = await toDataUrl(currentLabelUrl);
    const legacy = deriveLegacyFields();
    return {
      reportMode,
      reportId, crNumber, sku, currentRevision, newRevision: legacy.newRevision,
      currentLabelName, currentLabelUrl: resolvedCurrentUrl,
      currentLabelPages,
      newLabelName: legacy.newLabelName,
      newLabelUrl:  legacy.newLabelUrl,
      currentBoxes, newBoxes: legacy.newBoxes,
      requirements: legacy.requirements,
      discrepancyCategories: legacy.discrepancyCategories,
      newLabelPages: legacy.newLabelPages,
      commonRequirements: commonRequirements.map((r, i) => ({ ...r, id: i + 1 })),
      revisedFiles: revisedFiles.map(f => ({
        fileName: f.fileName,
        pages: f.pages
          .filter(p => p.status !== 'pending')
          .map(p => ({
            url: p.url, name: p.name, sku: p.sku ?? '', revisionName: p.revisionName ?? '',
            labelType: p.labelType, stockNumber: p.stockNumber,
            status: p.status as 'changed' | 'no-changes',
            boxes: p.boxes,
            requirements: p.requirements.map((r, i) => ({ ...r, id: i + 1 })),
            discrepancyCategories: p.discrepancyCategories.filter(c => c.title || c.items.length),
          })),
      })),
    };
  };

  const persistDraft = async (id: string, data: SetupReportData) => {
    const draftLabel =
      data.sku ||
      data.revisedFiles?.flatMap(f => f.pages).find(p => p.sku)?.sku ||
      data.reportId;
    await saveDraft({ id, label: draftLabel, savedAt: new Date().toISOString(), data });
    setSelectedDraftId(id);
    localStorage.setItem('lastDraftId', id);
    await refreshDrafts();
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const now = new Date();
      const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
      const todayPrefix = `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${String(ist.getUTCDate()).padStart(2, '0')}`;
      const id = reportId.slice(0, 8) !== todayPrefix ? generateReportId(drafts.map(d => d.id)) : reportId;
      if (id !== reportId) setReportId(id);
      const data = await buildReportData();
      if (selectedDraftId && selectedDraftId !== id) await deleteDraft(selectedDraftId);
      await persistDraft(id, { ...data, reportId: id });
      alert(`Draft "${id}" saved.`);
    } catch (err) {
      alert(`Failed to save draft: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally { setSavingDraft(false); }
  };

  const handleCreateNew = () => {
    localStorage.removeItem(AUTO_SAVE_KEY);
    localStorage.removeItem('lastDraftId');
    setSelectedDraftId('');
    setReportId(generateReportId(drafts.map(d => d.id)));
    setCrNumber(''); setSku(''); setCurrentRevision(''); setNewRevision('');
    setCurrentLabelName(''); setCurrentLabelUrl(''); setCurrentLabelPages([]); setCurrentBoxes([]);
    setCommonRequirements([makeRequirement(1)]);
    setCommonCategories([makeCategory()]);
    setRevisedFiles([]);
  };

  const handleDeleteDraft = async () => {
    if (!selectedDraftId) return;
    if (!confirm(`Delete draft "${selectedDraftId}"?`)) return;
    await deleteDraft(selectedDraftId);
    setSelectedDraftId('');
    localStorage.removeItem('lastDraftId');
    refreshDrafts();
  };

  // ── Base label upload ───────────────────────────────────────────────────────

  const handleBaseUpload = (file: File) => {
    const name  = file.name.replace(/\.[^.]+$/, '');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      renderPdfPages(file).then(urls => {
        setCurrentLabelUrl(urls[0]);
        setCurrentLabelName(name);
        setCurrentLabelPages(urls.map((url, i) => ({
          url,
          name: urls.length > 1 ? `${name} (Page ${i + 1})` : name,
          boxes: [],
        })));
      }).catch(err => alert(`Failed to process PDF: ${err instanceof Error ? err.message : String(err)}`));
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setCurrentLabelUrl(url);
        setCurrentLabelName(name);
        setCurrentLabelPages([{ url, name, boxes: [] }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateBasePageBoxes = (pi: number, boxes: DrawnBox[]) =>
    setCurrentLabelPages(prev => prev.map((p, i) => i === pi ? { ...p, boxes } : p));

  // ── Revised file builder ────────────────────────────────────────────────────

  const buildRevisedFileState = async (file: File): Promise<RevisedFileState> => {
    const fileName = file.name;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const isPdf    = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const urls     = isPdf
      ? await renderPdfPages(file)
      : await new Promise<string[]>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve([reader.result as string]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
    return {
      fileName,
      pages: urls.map((url, i) => ({
        url,
        name: urls.length > 1 ? `${baseName} (Page ${i + 1})` : baseName,
        sku: '', revisionName: '',
        labelType: '', stockNumber: '',
        status: 'pending' as const,
        boxes: [], requirements: [], discrepancyCategories: [],
      })),
    };
  };

  const handlePrimaryRevisedUpload = async (file: File) => {
    try {
      const newFile = await buildRevisedFileState(file);
      setRevisedFiles(prev => [newFile, ...prev.slice(1)]);
    } catch (err) {
      alert(`Failed to process file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddRevisedFile = async (file: File) => {
    try {
      const newFile = await buildRevisedFileState(file);
      setRevisedFiles(prev => [...prev, newFile]);
    } catch (err) {
      alert(`Failed to process file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const removeRevisedFile = (fi: number) =>
    setRevisedFiles(prev => prev.filter((_, i) => i !== fi));

  const updatePage = <K extends keyof RevisedPageState>(fi: number, pi: number, field: K, value: RevisedPageState[K]) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : { ...p, [field]: value }),
    }));

  const addPageRequirement = (fi: number, pi: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        requirements: [...p.requirements, makeRequirement(p.requirements.length ? p.requirements[p.requirements.length - 1].id + 1 : 1)],
      }),
    }));

  const updatePageReq = (fi: number, pi: number, ri: number, field: keyof Requirement, value: string) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        requirements: p.requirements.map((r, k) => k !== ri ? r : { ...r, [field]: value }),
      }),
    }));

  const deletePageReq = (fi: number, pi: number, ri: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        requirements: p.requirements.filter((_, k) => k !== ri).map((r, k) => ({ ...r, id: k + 1 })),
      }),
    }));

  const addPageCategory = (fi: number, pi: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : { ...p, discrepancyCategories: [...p.discrepancyCategories, makeCategory()] }),
    }));

  const deletePageCategory = (fi: number, pi: number, ci: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : { ...p, discrepancyCategories: p.discrepancyCategories.filter((_, k) => k !== ci) }),
    }));

  const updatePageCatTitle = (fi: number, pi: number, ci: number, title: string) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        discrepancyCategories: p.discrepancyCategories.map((c, k) => k !== ci ? c : { ...c, title }),
      }),
    }));

  const addPageItem = (fi: number, pi: number, ci: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        discrepancyCategories: p.discrepancyCategories.map((c, k) => k !== ci ? c : { ...c, items: [...c.items, makeItem()] }),
      }),
    }));

  const deletePageItem = (fi: number, pi: number, ci: number, ii: number) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        discrepancyCategories: p.discrepancyCategories.map((c, k) => k !== ci ? c : { ...c, items: c.items.filter((_, l) => l !== ii) }),
      }),
    }));

  const updatePageItem = (fi: number, pi: number, ci: number, ii: number, field: keyof DiscrepancyItem, value: string) =>
    setRevisedFiles(prev => prev.map((f, i) => i !== fi ? f : {
      ...f,
      pages: f.pages.map((p, j) => j !== pi ? p : {
        ...p,
        discrepancyCategories: p.discrepancyCategories.map((c, k) => k !== ci ? c : {
          ...c,
          items: c.items.map((item, l) => l !== ii ? item : { ...item, [field]: value }),
        }),
      }),
    }));

  // ── Common requirements handlers ────────────────────────────────────────────

  const addCommonReq    = () => setCommonRequirements(prev => [...prev, makeRequirement(prev.length ? prev[prev.length - 1].id + 1 : 1)]);
  const updateCommonReq = (i: number, field: keyof Requirement, value: string) =>
    setCommonRequirements(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const deleteCommonReq = (i: number) =>
    setCommonRequirements(prev => prev.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, id: idx + 1 })));

  const addCommonCat = () => setCommonCategories(prev => [...prev, makeCategory()]);
  const deleteCommonCat = (ci: number) => setCommonCategories(prev => prev.filter((_, i) => i !== ci));
  const updateCommonCatTitle = (ci: number, title: string) =>
    setCommonCategories(prev => prev.map((c, i) => i === ci ? { ...c, title } : c));
  const addCommonItem = (ci: number) =>
    setCommonCategories(prev => prev.map((c, i) => i === ci ? { ...c, items: [...c.items, makeItem()] } : c));
  const deleteCommonItem = (ci: number, ii: number) =>
    setCommonCategories(prev => prev.map((c, i) => i === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c));
  const updateCommonItem = (ci: number, ii: number, field: keyof DiscrepancyItem, value: string) =>
    setCommonCategories(prev => prev.map((c, i) => i === ci
      ? { ...c, items: c.items.map((item, j) => j === ii ? { ...item, [field]: value } : item) }
      : c
    ));

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAnyRevisedPage = revisedFiles.some(f => f.pages.some(p => p.status !== 'pending'));
    if (!hasAnyRevisedPage) {
      alert('Please upload at least one revised version file and mark each page.');
      return;
    }
    const pendingPages = revisedFiles.flatMap((f, fi) =>
      f.pages.map((p, pi) => p.status === 'pending' ? `File ${fi + 1} Page ${pi + 1}` : null).filter(Boolean)
    );
    if (pendingPages.length) {
      if (!confirm(`${pendingPages.length} page(s) are still marked as Pending and will be excluded. Continue?`)) return;
    }
    const now = new Date();
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const todayPrefix = `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${String(ist.getUTCDate()).padStart(2, '0')}`;
    const id = reportId.slice(0, 8) !== todayPrefix ? generateReportId(drafts.map(d => d.id)) : reportId;
    if (id !== reportId) setReportId(id);
    const data      = await buildReportData();
    const finalData = { ...data, reportId: id };
    buildReportData().then(async d => {
      if (selectedDraftId && selectedDraftId !== id) await deleteDraft(selectedDraftId);
      await persistDraft(id, { ...d, reportId: id });
    }).catch(() => {});
    onSubmit(finalData);
  };

  // ── CSS shortcuts ───────────────────────────────────────────────────────────

  const input     = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500 bg-white";
  const lbl       = "block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1";
  const sec       = "bg-white border border-gray-300 p-6 space-y-4";
  const secH      = "text-xs uppercase tracking-wide font-bold text-gray-700 pb-3 border-b border-gray-200";
  const fileInput = "block w-full text-xs text-gray-600 cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-300 file:text-xs file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer";

  return (
    <div className="min-h-screen bg-[#f3f4f6]">

      {/* Header */}
      <nav className="bg-primary text-white px-6 py-0 flex items-center justify-between shadow-md sticky top-0 z-40" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-4 h-[52px]">
          {onBack && (
            <button type="button" onClick={onBack} className="flex items-center gap-1 border-r border-white/20 pr-4 h-full text-white/80 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">Back</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <span className="text-sm font-bold tracking-tight uppercase">LabelX Proofreading</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-xs text-white/70 font-medium">Label Preview</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            <StepIndicator current={4} total={4} labels={['Request Form', 'Review & Upload', 'Analysis', 'Label Preview']} />
          </div>
          <ProfileDropdown />
        </div>
      </nav>

      {/* Drafts bar */}
      <div className="w-full px-8 py-3 bg-white border-b border-gray-200 flex items-center gap-3 sticky top-[52px] z-30 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500 shrink-0">Drafts</span>
        <select
          className="border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-gray-500 min-w-[220px]"
          value={selectedDraftId}
          onChange={e => handleSelectDraft(e.target.value)}
        >
          <option value="">— select a draft —</option>
          {drafts.map(d => (
            <option key={d.id} value={d.id}>
              {d.label} &nbsp;·&nbsp; {new Date(d.savedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </option>
          ))}
        </select>
        <button type="button" disabled={!selectedDraftId} onClick={handleDeleteDraft}
          className="px-3 py-1.5 text-xs border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Delete
        </button>
        <div className="flex-1" />
        <button type="button" onClick={handleCreateNew} disabled={savingDraft}
          className="px-4 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60">
          + Create New
        </button>
        <button type="button" onClick={handleSaveDraft} disabled={savingDraft}
          className="px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: '#D71500' }}>
          {savingDraft ? 'Saving...' : 'Save Draft'}
        </button>
      </div>

      <form id="setup-form" onSubmit={handleSubmit} className="max-w-[1200px] mx-auto p-8 space-y-6 pb-24">

        {/* 1. Metadata */}
        <div className={sec}>
          <div className={secH}>1. Report Metadata</div>
          <div className="grid gap-4 grid-cols-3">
            <div><label className={lbl}>Report ID (LPR)</label>
              <input className={input} value={reportId} onChange={e => setReportId(e.target.value)} placeholder="e.g. 202603180001" /></div>
            <div><label className={lbl}>CR Number (Optional)</label>
              <input className={input} value={crNumber} onChange={e => setCrNumber(e.target.value)} placeholder="-" /></div>
            <div><label className={lbl}>SKU</label>
              <input className={input} value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. 187301111" /></div>
          </div>
          <div className="grid gap-4 grid-cols-3">
            <div><label className={lbl}>Current Revision</label>
              <input className={input} value={currentRevision} onChange={e => setCurrentRevision(e.target.value)} placeholder="e.g. Rev-D" /></div>
            <div><label className={lbl}>New Revision</label>
              <input className={input} value={newRevision} onChange={e => setNewRevision(e.target.value)} placeholder="e.g. Rev-E" /></div>
            <div><label className={lbl}>Current Version Label Name</label>
              <input className={input} value={currentLabelName} onChange={e => setCurrentLabelName(e.target.value)} placeholder="e.g. LCN-187301111_1_Rev-D" /></div>
          </div>
        </div>

        {/* 2. Label Images */}
        <div className={sec}>
          <div className={secH}>2. Label Images</div>
          <p className="text-xs text-gray-500">Upload the base PDF (optional) and the revised PDF(s). Mark each revised page as changed or no-changes.</p>
          <div className="grid grid-cols-2 gap-8">

            {/* Left: Base label */}
            <div className="space-y-3">
              <label className={lbl}>
                Current Version Label (Base)
                {currentLabelPages.length > 1 && <span className="ml-2 text-gray-400 normal-case font-normal">({currentLabelPages.length} pages)</span>}
              </label>
              <input type="file" accept="image/*,.pdf,application/pdf" className={fileInput}
                onChange={e => e.target.files?.[0] && handleBaseUpload(e.target.files[0])} />
              {currentLabelPages.length > 0 ? (
                <div className="space-y-4">
                  {currentLabelPages.map((page, pi) => (
                    <div key={pi} className="border border-gray-200">
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Page {pi + 1}</span>
                        <span className="text-[10px] text-gray-400 truncate">{page.name}</span>
                      </div>
                      <div className="p-2">
                        <BoundingBoxDrawer
                          imageUrl={page.url}
                          imageLabel={page.name || `Page ${pi + 1}`}
                          boxes={page.boxes}
                          onChange={boxes => updateBasePageBoxes(pi, boxes)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-gray-300 h-32 flex items-center justify-center text-xs text-gray-400">No image uploaded</div>
              )}
            </div>

            {/* Right (or full-width for B): Revised files */}
            <div className="space-y-3">
              <label className={lbl}>Revised Label(s)</label>

              {/* Primary upload slot */}
              {revisedFiles.length === 0 && (
                <label className="block border border-dashed border-gray-400 px-4 py-6 text-center text-xs text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="file" accept="image/*,.pdf,application/pdf" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) { handlePrimaryRevisedUpload(e.target.files[0]); e.target.value = ''; } }} />
                  Click to upload revised label file (supports multi-page PDFs)
                </label>
              )}

              {revisedFiles.length > 0 && (
                <div className="space-y-4">
                  {revisedFiles.map((rFile, fi) => (
                    <div key={fi} className="border border-gray-200">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                        <span className="text-[11px] font-bold text-gray-600 truncate">{rFile.fileName}</span>
                        <button type="button" onClick={() => removeRevisedFile(fi)}
                          className="text-xs text-red-400 hover:text-red-600 shrink-0 ml-2">Remove</button>
                      </div>
                      {rFile.pages.map((page, pi) => (
                        <div key={pi} className="border-b last:border-b-0 border-gray-200">
                          <div className="flex gap-3 p-3 items-start">
                            <div className="shrink-0">
                              <div className="text-[10px] text-gray-400 font-bold mb-1">Pg {pi + 1}</div>
                              <img src={page.url} alt={`Page ${pi + 1}`} className="w-20 h-auto border border-gray-100 block" />
                            </div>
                            <div className="flex-1 space-y-2 min-w-0">
                              <input className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                                value={page.name} placeholder="LCN / Label Name"
                                onChange={e => updatePage(fi, pi, 'name', e.target.value)} />
                              <div className="grid gap-2 grid-cols-4">
                                <input className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                                  value={page.sku ?? ''} placeholder="SKU"
                                  onChange={e => updatePage(fi, pi, 'sku', e.target.value)} />
                                <input className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                                  value={page.revisionName ?? ''} placeholder="New Revision (e.g. Rev-E)"
                                  onChange={e => updatePage(fi, pi, 'revisionName', e.target.value)} />
                                <input className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                                  value={page.labelType} placeholder="Label Type"
                                  onChange={e => updatePage(fi, pi, 'labelType', e.target.value)} />
                                <input className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                                  value={page.stockNumber} placeholder="Stock Number"
                                  onChange={e => updatePage(fi, pi, 'stockNumber', e.target.value)} />
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => updatePage(fi, pi, 'status', 'changed')}
                                  className={`px-2 py-0.5 text-xs font-semibold border transition-colors ${page.status === 'changed' ? 'bg-[#064b75] text-white border-[#064b75]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                  Has Changes
                                </button>
                                <button type="button" onClick={() => updatePage(fi, pi, 'status', 'no-changes')}
                                  className={`px-2 py-0.5 text-xs font-semibold border transition-colors ${page.status === 'no-changes' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                  No Changes ✓
                                </button>
                                {page.status === 'pending' && (
                                  <span className="text-[10px] text-amber-500 font-semibold">— pending —</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Expanded section — bounding boxes + requirements for changed pages */}
                          {page.status === 'changed' && (
                            <div className="border-t border-gray-200 p-3 space-y-4">
                              <BoundingBoxDrawer imageUrl={page.url} imageLabel={page.name || `Page ${pi + 1}`}
                                boxes={page.boxes} onChange={boxes => updatePage(fi, pi, 'boxes', boxes)} />
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-2">
                                  Label-Specific Requirements
                                  <span className="ml-1 text-gray-400 normal-case font-normal">(adds to common requirements)</span>
                                </div>
                                <RequirementsTable
                                  requirements={page.requirements}
                                  onAdd={() => addPageRequirement(fi, pi)}
                                  onUpdate={(ri, field, value) => updatePageReq(fi, pi, ri, field, value)}
                                  onDelete={ri => deletePageReq(fi, pi, ri)}
                                />
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-2">Changes Made</div>
                                <DiscrepancySection categories={page.discrepancyCategories}
                                  onAddCategory={() => addPageCategory(fi, pi)}
                                  onDeleteCategory={ci => deletePageCategory(fi, pi, ci)}
                                  onUpdateTitle={(ci, title) => updatePageCatTitle(fi, pi, ci, title)}
                                  onAddItem={ci => addPageItem(fi, pi, ci)}
                                  onDeleteItem={(ci, ii) => deletePageItem(fi, pi, ci, ii)}
                                  onUpdateItem={(ci, ii, field, value) => updatePageItem(fi, pi, ci, ii, field, value)} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <label className="block border border-dashed border-gray-400 px-4 py-3 text-center text-xs text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                <input type="file" accept="image/*,.pdf,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) { handleAddRevisedFile(e.target.files[0]); e.target.value = ''; } }} />
                + Upload Revised File (supports multi-page PDFs)
              </label>
            </div>
          </div>
        </div>

        {/* 3. Common Requirements */}
        <div className={sec}>
          <div className={secH}>3. Common Requirements</div>
          <p className="text-xs text-gray-500">Requirements that apply to <strong>all</strong> revised labels.</p>
          <RequirementsTable
            requirements={commonRequirements}
            onAdd={addCommonReq}
            onUpdate={updateCommonReq}
            onDelete={deleteCommonReq}
          />
        </div>

        {/* 4. Common Changes Made */}
        <div className={sec}>
          <div className={secH}>4. Common Changes Made</div>
          <p className="text-xs text-gray-500">Changes that apply across all revised labels. Group by category (e.g. TEXT, SYMBOLS).</p>
          <DiscrepancySection
            categories={commonCategories}
            onAddCategory={addCommonCat}
            onDeleteCategory={deleteCommonCat}
            onUpdateTitle={updateCommonCatTitle}
            onAddItem={addCommonItem}
            onDeleteItem={deleteCommonItem}
            onUpdateItem={updateCommonItem}
          />
        </div>

      </form>

      {/* Sticky footer — matches CompareFormNew action footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#e2e8f0] px-8 py-2.5 flex items-center justify-between z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="font-mono text-xs text-slate-400 font-medium tracking-wide flex items-center gap-4">
          <span>Report ID: {reportId}</span>
        </div>
        <button
          type="submit"
          form="setup-form"
          className="flex items-center gap-2 bg-[#d51900] text-white px-8 py-3 text-[13px] font-bold uppercase tracking-widest hover:bg-[#b01300] transition-colors shadow-md"
        >
          {isEditing ? 'Update Report →' : 'Generate Report →'}
        </button>
      </div>
    </div>
  );
}
