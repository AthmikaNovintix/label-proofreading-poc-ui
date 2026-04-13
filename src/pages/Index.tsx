import { useState, useEffect, useMemo } from "react";
import { Download, RefreshCw, FileText, Activity, AlertCircle, Play, ScanLine, ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Dropzone from "@/components/Dropzone";
import VisualDiffViewer from "@/components/VisualDiffViewer";
import DataTables from "@/components/DataTables";
import ProfileDropdown from "@/components/ProfileDropdown";
import StepIndicator from "@/components/StepIndicator";
import { toast } from "sonner";
import { CATEGORIES } from "@/data/attributes";
import type { ProofRequestMissingItem } from "@/data/dummyData";

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const formData = location.state?.formData;
  const submissionId: string | null = location.state?.submissionId ?? null;

  const [baseFile, setBaseFile] = useState<File[]>(location.state?.baseFile || []);
  const [childFiles, setChildFiles] = useState<File[]>(location.state?.childFile || []);

  // Restored from location state when navigating back from the report page
  const [apiResults, setApiResults] = useState<any[]>(location.state?.apiResults || []);
  const [lrfAnalysis, setLrfAnalysis] = useState<{ symbols: any[]; fields: any[] } | null>(
    location.state?.lrfAnalysis || null
  );
  const [analysisRun, setAnalysisRun] = useState<boolean>(
    !!(location.state?.apiResults?.length > 0 || location.state?.lrfAnalysis)
  );
  const [loading, setLoading] = useState(false);

  // lrfOnly: form flow with no base file uploaded → validate against LRF only
  const lrfOnly = !!formData && baseFile.length === 0;

  // Auto-run analysis for Scenario 3 (only when results are not already restored)
  useEffect(() => {
    if (formData && childFiles.length > 0 && !analysisRun && !loading) {
      handleRunAnalysis();
    }
  }, [formData, baseFile, childFiles, analysisRun, loading]);

  const [progress, setProgress] = useState(0);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [basePreviewUrl, setBasePreviewUrl] = useState<string>("");
  const [childPreviewUrls, setChildPreviewUrls] = useState<string[]>([]);

  // Create object URLs from uploaded files for preview
  useEffect(() => {
    if (baseFile.length > 0) {
      const url = URL.createObjectURL(baseFile[0]);
      setBasePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [baseFile]);

  useEffect(() => {
    const urls = childFiles.map(f => URL.createObjectURL(f));
    setChildPreviewUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [childFiles]);

  const handleRunAnalysis = async () => {
    if (childFiles.length === 0) {
      toast.error("Please upload the new version label.");
      return;
    }
    if (!lrfOnly && baseFile.length === 0) {
      toast.error("Please upload both base and child labels.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setAnalysisRun(false);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) { clearInterval(progressInterval); return 95; }
        return prev + 5;
      });
    }, 400);

    const API_URL = import.meta.env.VITE_API_BASE_URL || "https://label-comparator.azurewebsites.net";

    try {
      if (lrfOnly) {
        // ── LRF-only mode: single-label analysis ────────────────────────────
        const data = new FormData();
        data.append("child_file", childFiles[0]);
        const response = await fetch(`${API_URL}/api/analyze-label`, { method: "POST", body: data });
        if (!response.ok) throw new Error(`Analysis failed: ${response.statusText}`);
        const rawData = await response.json();
        setLrfAnalysis(rawData);
        setApiResults([]);
        setSelectedResultIndex(0);
        setProgress(100);
        setAnalysisRun(true);
      } else {
        // ── Full diff mode ──────────────────────────────────────────────────
        const data = new FormData();
        data.append("base_file", baseFile[0]);
        childFiles.forEach(file => data.append("child_files", file));
        if (submissionId) data.append("submission_id", submissionId);
        const response = await fetch(`${API_URL}/api/compare`, { method: "POST", body: data });
        if (!response.ok) throw new Error(`Analysis failed: ${response.statusText}`);
        const rawData = await response.json();

        const processedResults = rawData.results.map((result: any, index: number) => {
          const apiDiscrepancies = result.discrepancies || {};
          const parsedItems: any[] = [];
          let idCounter = 1;

          for (const status of ["Added", "Deleted", "Modified", "Repositioned"]) {
            if (apiDiscrepancies[status]) {
              apiDiscrepancies[status].forEach((item: any) => {
                let oldText, newText;
                let value = item.Value;
                if (status === "Modified" && typeof value === "string") {
                  const match = value.match(/From:\s*'(.*?)'\s*➔\s*To:\s*'(.*?)'/);
                  if (match) { oldText = match[1]; newText = match[2]; }
                }
                parsedItems.push({ id: `api-d${index}-${idCounter++}`, category: item.Category, status, value, oldText, newText });
              });
            }
          }

          return { ...result, parsedItems };
        });

        setLrfAnalysis(null);
        setApiResults(processedResults);
        setSelectedResultIndex(0);
        setProgress(100);
        setAnalysisRun(true);
      }
    } catch (error) {
      console.error("Comparison error:", error);
      toast.error("Error running analysis. Please check your connection and try again.");
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => setLoading(false), 500);
    }
  };

  // ── LRF requirement validation ──────────────────────────────────────────────
  // Cross-reference every LRF change against AI-found discrepancies.
  // In lrfOnly mode, the AI returns present symbols + fields and we check whether
  // each LRF requirement is satisfied by what was detected on the label.
  // Produces:
  //   validatedParsedItems — parsedItems enriched with isValid flag (null in lrfOnly)
  //   missingItems         — LRF requirements the AI did NOT find
  //   satisfiedItems       — LRF requirements the AI DID find
  const { validatedParsedItems, missingItems, satisfiedItems } = useMemo<{
    validatedParsedItems: any[] | undefined;
    missingItems: ProofRequestMissingItem[];
    satisfiedItems: ProofRequestMissingItem[];
  }>(() => {
    if (!formData || !analysisRun) {
      return { validatedParsedItems: undefined, missingItems: [], satisfiedItems: [] };
    }

    // ── LRF-only mode ────────────────────────────────────────────────────────
    if (lrfOnly && lrfAnalysis) {
      const CATEGORY_LABEL_TO_AI: Record<string, "Text" | "Symbol" | "Barcode" | "Image"> = {
        "Text": "Text", "Symbols": "Symbol", "Symbol": "Symbol",
        "Barcodes": "Barcode", "Barcode": "Barcode", "Images": "Image", "Image": "Image",
      };
      const normCat = (label: string) => CATEGORY_LABEL_TO_AI[label] ?? label;
      const norm = (ct: string) => (ct === "Removed" ? "Deleted" : ct);

      type Req = { attrId: string; label: string; category: string; changeType: string; expectedValue: string };
      const requirements: Req[] = [];
      for (const catId of Object.keys(CATEGORIES)) {
        const cat = CATEGORIES[catId as keyof typeof CATEGORIES];
        for (const group of cat.groups) {
          const allAttrs = [...group.attributes, ...(formData.customAttributes?.[group.id] ?? [])];
          for (const attr of allAttrs) {
            const change = formData.changes?.[attr.id];
            if (change?.changeType) {
              requirements.push({
                attrId: attr.id,
                label: attr.label,
                category: normCat(cat.label),
                changeType: norm(change.changeType),
                expectedValue: change.expectedValue ?? "",
              });
            }
          }
        }
      }

      // For lrfOnly, check if the symbol/field exists on the label
      const detectedSymbolNames = new Set(
        lrfAnalysis.symbols.map(s => (s.name || s.id || "").toLowerCase())
      );
      const detectedFieldMap: Record<string, string> = {};
      for (const f of lrfAnalysis.fields) {
        if (f.value && f.value !== "null") detectedFieldMap[f.id] = f.value;
      }

      const reqFoundIds = new Set<string>();
      for (const req of requirements) {
        if (req.category === "Symbol") {
          const labelLower = req.label.toLowerCase();
          const evLower = req.expectedValue.toLowerCase().trim();
          if (
            Array.from(detectedSymbolNames).some(n => n.includes(labelLower) || labelLower.includes(n)) ||
            (evLower && Array.from(detectedSymbolNames).some(n => n.includes(evLower)))
          ) {
            reqFoundIds.add(req.attrId);
          }
        } else if (req.category === "Text") {
          // Check if any text field satisfies this requirement.
          // IMPORTANT: when an expected value is given (ev), the field value MUST
          // contain it. Do NOT fall through to label/fid substring matching — that
          // would falsely satisfy "Rev B" because other_text "Rev A" contains the
          // substring "rev", making fvalLower.includes(al) true regardless of value.
          //
          // For the "rev" attribute specifically: revision codes (e.g. "REV. B") are
          // extracted into other_text by the AI, not into a dedicated field. To avoid
          // a short expected value like "b" falsely matching unrelated fields (e.g. an
          // address containing "34B Main St"), we require the revision pattern
          // "rev <expected>" to appear in other_text, then fall back to generic value
          // matching for all other fields.
          const ev = req.expectedValue.toLowerCase().trim();
          const al = req.label.toLowerCase();

          if (req.attrId === "rev" && ev) {
            // Scope revision check to other_text using the "rev <letter>" pattern
            const otherText = (detectedFieldMap["other_text"] ?? "").toLowerCase();
            if (otherText && new RegExp(`\\brev[.\\s]*${ev}\\b`).test(otherText)) {
              reqFoundIds.add(req.attrId);
            }
          } else {
            for (const [fid, fval] of Object.entries(detectedFieldMap)) {
              const fvalLower = fval.toLowerCase();
              const satisfied = ev
                ? fvalLower.includes(ev)
                : fvalLower.includes(al) || al.includes(fid);
              if (satisfied) {
                reqFoundIds.add(req.attrId);
                break;
              }
            }
          }
        }
      }

      const missingItems: ProofRequestMissingItem[] = requirements
        .filter(req => !reqFoundIds.has(req.attrId))
        .map((req, i) => ({
          id: `missing-${i}`,
          category: req.category as ProofRequestMissingItem["category"],
          label: req.label,
          expectedChange: req.changeType,
          expectedValue: req.expectedValue || "—",
        }));

      const satisfiedItems: ProofRequestMissingItem[] = requirements
        .filter(req => reqFoundIds.has(req.attrId))
        .map((req, i) => ({
          id: `satisfied-${i}`,
          category: req.category as ProofRequestMissingItem["category"],
          label: req.label,
          expectedChange: req.changeType,
          expectedValue: req.expectedValue || "—",
        }));

      return { validatedParsedItems: undefined, missingItems, satisfiedItems };
    }

    // ── Full diff mode ───────────────────────────────────────────────────────
    if (apiResults.length === 0) {
      return { validatedParsedItems: undefined, missingItems: [], satisfiedItems: [] };
    }
    const result = apiResults[selectedResultIndex];
    if (!result) return { validatedParsedItems: undefined, missingItems: [], satisfiedItems: [] };

    const parsedItems: any[] = result.parsedItems ?? [];

    // Normalize "Removed" (form uses it) → "Deleted" (AI uses it)
    const norm = (ct: string) => (ct === "Removed" ? "Deleted" : ct);

    // Normalize category labels: lcm_attributes.json uses plural display labels
    // ("Symbols", "Barcodes", "Images") but the AI backend emits singular forms
    // ("Symbol", "Barcode", "Image"). Centralising the mapping here means adding
    // a new category to the JSON never silently breaks requirement matching.
    const CATEGORY_LABEL_TO_AI: Record<string, "Text" | "Symbol" | "Barcode" | "Image"> = {
      "Text":    "Text",
      "Symbols": "Symbol",
      "Symbol":  "Symbol",
      "Barcodes":"Barcode",
      "Barcode": "Barcode",
      "Images":  "Image",
      "Image":   "Image",
    };
    const normCat = (label: string): "Text" | "Symbol" | "Barcode" | "Image" =>
      CATEGORY_LABEL_TO_AI[label] ?? (label as "Text" | "Symbol" | "Barcode" | "Image");

    // Build flat requirement list from formData.changes + CATEGORIES
    type Req = { attrId: string; label: string; category: "Text" | "Symbol" | "Barcode" | "Image"; changeType: string; expectedValue: string };
    const requirements: Req[] = [];
    for (const catId of Object.keys(CATEGORIES)) {
      const cat = CATEGORIES[catId as keyof typeof CATEGORIES];
      for (const group of cat.groups) {
        const allAttrs = [...group.attributes, ...(formData.customAttributes?.[group.id] ?? [])];
        for (const attr of allAttrs) {
          const change = formData.changes?.[attr.id];
          if (change?.changeType) {
            requirements.push({
              attrId: attr.id,
              label: attr.label,
              category: normCat(cat.label), // always singular, matching AI backend output
              changeType: norm(change.changeType),
              expectedValue: change.expectedValue ?? "",
            });
          }
        }
      }
    }

    // Value similarity check
    const valueMatches = (
      piValue: string,
      piNewText: string | undefined,
      piOldText: string | undefined,
      piStatus: string,
      attrLabel: string,
      expectedValue: string,
    ): boolean => {
      const pv = piValue.toLowerCase();
      const al = attrLabel.toLowerCase();
      const ev = expectedValue.toLowerCase().trim();

      if (piStatus === "Modified") {
        // For Modified items, only match if the new value equals the expected value.
        // Never match on the old value — that would falsely satisfy a requirement
        // when the change went the wrong way (e.g. Ireland→UK when Ireland was expected).
        if (!ev) return false;
        if (piNewText && piNewText.toLowerCase().includes(ev)) return true;
        // Fallback: expected value appears in the full "From: X → To: Y" string
        // but only after the arrow (i.e. in the "To" part)
        const arrowIdx = pv.indexOf("→");
        if (arrowIdx !== -1 && pv.slice(arrowIdx).includes(ev)) return true;
        return false;
      }

      // For Added / Deleted / Repositioned: match on field label or expected value
      if (pv.includes(al) || al.includes(pv)) return true;
      if (ev && pv.includes(ev)) return true;
      return false;
    };

    const matchedParsedIds = new Set<string>();
    const reqFoundIds = new Set<string>();

    // Pass 1: strict label + value matching
    for (const req of requirements) {
      for (const pi of parsedItems) {
        if (pi.status !== req.changeType) continue;
        if (pi.category !== req.category) continue;
        if (valueMatches(pi.value, pi.newText, pi.oldText, pi.status, req.label, req.expectedValue)) {
          matchedParsedIds.add(pi.id);
          reqFoundIds.add(req.attrId);
          break;
        }
      }
    }

    // Pass 2: for symbol/barcode/image with no expectedValue, retry with
    // label-only matching (valueMatches still required — no blind first-match).
    for (const req of requirements) {
      if (reqFoundIds.has(req.attrId)) continue;
      if (!req.expectedValue && (req.category === "Symbol" || req.category === "Barcode" || req.category === "Image")) {
        for (const pi of parsedItems) {
          if (pi.status !== req.changeType) continue;
          if (pi.category !== req.category) continue;
          if (matchedParsedIds.has(pi.id)) continue;
          // Still require the item's value to loosely match the attribute label
          if (valueMatches(pi.value, pi.newText, pi.oldText, pi.status, req.label, req.expectedValue)) {
            matchedParsedIds.add(pi.id);
            reqFoundIds.add(req.attrId);
            break;
          }
        }
      }
    }

    // Pass 3: for text-field requirements still not satisfied, verify the new
    // (edited) label's actual extracted value against the LRF requirement.
    // This handles the case where both labels already match the requested value
    // (0 diff detected) — proof reading should confirm the new label IS correct,
    // not just that a change occurred.
    //   Modified / Added → child label must have the expected value
    //   Deleted          → child label must NOT have the field
    const childFields: Record<string, string> = result.child_fields || {};
    for (const req of requirements) {
      if (reqFoundIds.has(req.attrId)) continue;
      if (req.category !== "Text") continue;
      const ev = req.expectedValue.toLowerCase().trim();
      const fieldVal = childFields[req.attrId];
      if (req.changeType === "Modified" || req.changeType === "Added") {
        if (ev && fieldVal && fieldVal.toLowerCase().includes(ev)) {
          reqFoundIds.add(req.attrId);
        }
      } else if (req.changeType === "Deleted") {
        if (!fieldVal) {
          reqFoundIds.add(req.attrId);
        }
      }
    }

    // Enrich parsedItems with isValid flag
    const validatedParsedItems = parsedItems.map(pi => ({
      ...pi,
      isValid: matchedParsedIds.has(pi.id),
    }));

    // Build missingItems for requirements the AI didn't find
    const missingItems: ProofRequestMissingItem[] = requirements
      .filter(req => !reqFoundIds.has(req.attrId))
      .map((req, i) => ({
        id: `missing-${i}`,
        category: req.category as ProofRequestMissingItem["category"],
        label: req.label,
        expectedChange: req.changeType,
        expectedValue: req.expectedValue || "—",
      }));

    // Build satisfiedItems for requirements the AI DID find
    const satisfiedItems: ProofRequestMissingItem[] = requirements
      .filter(req => reqFoundIds.has(req.attrId))
      .map((req, i) => ({
        id: `satisfied-${i}`,
        category: req.category as ProofRequestMissingItem["category"],
        label: req.label,
        expectedChange: req.changeType,
        expectedValue: req.expectedValue || "—",
      }));

    return { validatedParsedItems, missingItems, satisfiedItems };
  }, [formData, analysisRun, lrfOnly, lrfAnalysis, apiResults, selectedResultIndex]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col">

      {/* Loading popup */}
      {loading && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[100] flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl px-8 py-6 flex flex-col items-center gap-4 w-72">
            <Activity className="h-8 w-8 text-[#d51900] animate-pulse" />
            <div className="text-center space-y-1">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Analysing Labels
              </div>
              <div className="text-xs text-slate-500">This may take a moment…</div>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#d51900] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 font-mono">{progress}%</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-primary text-white px-6 py-0 flex items-center justify-between shadow-md sticky top-0 z-40" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-4 h-[52px]">
          <button
            onClick={() => formData
              ? navigate("/form-summary?flow=to-compare", { state: { formData, submissionId } })
              : navigate("/")}
            className="flex items-center gap-1 border-r border-white/20 pr-4 h-full text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <span className="text-sm font-bold tracking-tight uppercase">LabelX Proofreading</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-xs text-white/70 font-medium">{formData ? "Proofing Analysis" : "Comparison Analysis"}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {formData && (
            <div className="hidden md:block">
              <StepIndicator current={3} />
            </div>
          )}
          <ProfileDropdown />
        </div>
      </nav>

      {/* Secondary Metadata Bar (only when navigated via form) */}
      {formData && (
        <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between text-xs sticky top-[52px] z-30 shadow-sm">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-[#94a3b8] font-bold tracking-widest uppercase text-[10px]">CR Number</span>
              <span className="text-[#334155] font-semibold text-[13px]">{formData.metadata.cr_number || "CR-2025-0042"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#94a3b8] font-bold tracking-widest uppercase text-[10px]">SKU</span>
              <span className="text-[#334155] font-semibold text-[13px]">{formData.metadata.part_number || "08714729-MX"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#94a3b8] font-bold tracking-widest uppercase text-[10px]">Revision</span>
              <span className="text-[#334155] font-semibold text-[13px]">{formData.metadata.label_version || "REV-D"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#94a3b8] font-bold tracking-widest uppercase text-[11px]">Requested By</span>
            <span className="text-[#334155] font-semibold text-[13px]">{formData.metadata.requested_by || "Athmika"}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">

        {/* Result Tabs — only when multiple child results */}
        {analysisRun && apiResults.length > 1 && (
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-2 overflow-x-auto">
            {apiResults.map((res, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedResultIndex(idx)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all border shrink-0 ${selectedResultIndex === idx
                  ? "bg-[#d51900] text-white border-[#d51900] shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                  }`}
              >
                {res.filename || `Label ${idx + 1}`}
              </button>
            ))}
          </div>
        )}

        <div className="px-6 py-6 space-y-6 pb-16 max-w-[1600px] mx-auto w-full">

          {/* ── Upload Section (Hidden in Scenario 3) ── */}
          {!formData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Dropzone
                  label="UPLOAD CURRENT VERSION LABEL (PDF / IMAGE)"
                  files={baseFile}
                  onFilesSelect={setBaseFile}
                  multiple={false}
                  alwaysShowUploadBox={true}
                />
                <Dropzone
                  label="UPLOAD NEW VERSION LABEL"
                  files={childFiles}
                  onFilesSelect={setChildFiles}
                  multiple={true}
                  alwaysShowUploadBox={true}
                />
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleRunAnalysis}
                  disabled={loading}
                  className="px-8 py-3 bg-primary text-white font-bold rounded shadow-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 tracking-wide text-sm"
                >
                  {loading ? "ANALYZING..." : "RUN COMPARATOR ANALYSIS"}
                </button>
              </div>
            </div>
          )}

          {/* ── Visual Diff Viewer ── */}
          <VisualDiffViewer
            baseImage={lrfOnly ? undefined : (basePreviewUrl || undefined)}
            childImage={childPreviewUrls[selectedResultIndex] || childPreviewUrls[0] || undefined}
            annotations={analysisRun && !lrfOnly && apiResults.length > 0 ? apiResults[selectedResultIndex]?.annotations ?? [] : []}
          />

          {/* ── Inspection Summary + Details ── */}
          <DataTables
            formData={formData}
            discrepancies={analysisRun && apiResults.length > 0
              ? (validatedParsedItems ?? apiResults[selectedResultIndex].parsedItems)
              : undefined}
            missingItems={missingItems}
            satisfiedItems={satisfiedItems}
          />

        </div>
      </main>

      {/* Footer action bar — sticky */}
      <div className="sticky bottom-0 bg-white border-t border-[#e2e8f0] px-8 py-2.5 flex items-center justify-between z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="font-mono text-xs text-slate-400 font-medium tracking-wide flex items-center gap-4">
          <span>Generated: {new Date().toISOString().split("T")[0]}</span>
          {formData && (
            <span>Ref: {formData?.metadata?.cr_number || "CR-2025-0042"}</span>
          )}
        </div>
        <button
          onClick={() => navigate('/label-preview', {
          state: {
            scenario: formData ? 'C' : 'A',
            formData,
            submissionId,
            parsedItems: validatedParsedItems ?? (analysisRun && apiResults.length > 0 ? apiResults[selectedResultIndex]?.parsedItems : []) ?? [],
            missingItems,
            satisfiedItems,
            annotations: analysisRun && apiResults.length > 0 ? apiResults[selectedResultIndex]?.annotations ?? [] : [],
            baseFile: baseFile[0] ?? null,
            childFile: childFiles[selectedResultIndex] ?? null,
            baseFileName: baseFile[0]?.name ?? '',
            childFileName: childFiles[selectedResultIndex]?.name ?? '',
            // Stored so the compare page can be fully restored when navigating back
            apiResults,
            lrfAnalysis,
          },
        })}
          className="flex items-center gap-2 bg-[#d51900] text-white px-8 py-3 text-[13px] font-bold uppercase tracking-widest hover:bg-[#b01300] transition-colors rounded-lg shadow-md"
        >
          <FileText className="w-4 h-4" />
          Preview Report
        </button>
      </div>
    </div>
  );
};

export default Index;
