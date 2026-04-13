/**
 * Draft persistence — localStorage only (no server required).
 */

import type { SetupReportData } from '@/label-preview/types';

export interface Draft {
  id: string;
  label: string;
  savedAt: string;
  data?: SetupReportData;
}

const DRAFTS_KEY = 'labelProofingDrafts';

export async function getDrafts(): Promise<Draft[]> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  } catch {
    return [];
  }
}

export async function loadDraft(id: string): Promise<Draft> {
  const list = await getDrafts();
  const draft = list.find(d => d.id === id);
  if (!draft) throw new Error('Draft not found');
  return draft;
}

export async function saveDraft(draft: Draft & { data: SetupReportData }): Promise<void> {
  const list = await getDrafts();
  const idx  = list.findIndex(d => d.id === draft.id);
  if (idx >= 0) list[idx] = draft;
  else list.unshift(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
}

export async function deleteDraft(id: string): Promise<void> {
  const list    = await getDrafts();
  const filtered = list.filter(d => d.id !== id);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
}

export async function toDataUrl(url: string): Promise<string> {
  if (!url || !url.startsWith('blob:')) return url;
  const blob = await fetch(url).then(r => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
