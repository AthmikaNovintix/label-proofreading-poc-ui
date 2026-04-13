import { useState, useRef } from 'react';
import type { DrawnBox } from '@/report/types';

interface BoundingBoxDrawerProps {
  imageUrl: string;
  imageLabel: string;
  boxes: DrawnBox[];
  onChange: (boxes: DrawnBox[]) => void;
}

type BoxType = DrawnBox['type'];

const BOX_TYPES: BoxType[] = ['Modified', 'Added', 'Deleted', 'Misplaced'];

const typeColors: Record<BoxType, string> = {
  Modified:  '#2563eb',
  Added:     '#16a34a',
  Deleted:   '#dc2626',
  Misplaced: '#9333ea',
};

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface PendingBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function BoundingBoxDrawer({ imageUrl, imageLabel, boxes, onChange }: BoundingBoxDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing]       = useState<DrawState | null>(null);
  const [pendingBox, setPendingBox] = useState<PendingBox | null>(null);
  const [pendingText, setPendingText] = useState('');

  const getPct = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (pendingBox) return;
    e.preventDefault();
    const { x, y } = getPct(e);
    setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const { x, y } = getPct(e);
    setDrawing(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing) return;
    const { x, y } = getPct(e);
    const left   = Math.min(drawing.startX, x);
    const top    = Math.min(drawing.startY, y);
    const width  = Math.abs(x - drawing.startX);
    const height = Math.abs(y - drawing.startY);
    setDrawing(null);
    if (width < 1 || height < 1) return;
    setPendingBox({ top, left, width, height });
    setPendingText('');
  };

  const selectType = (type: BoxType) => {
    if (!pendingBox) return;
    const newBox: DrawnBox = {
      id:   `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      text: pendingText.trim() || undefined,
      ...pendingBox,
    };
    onChange([...boxes, newBox]);
    setPendingBox(null);
    setPendingText('');
  };

  const deleteBox = (id: string) => onChange(boxes.filter(b => b.id !== id));
  const undoLast  = () => onChange(boxes.slice(0, -1));

  const updateText = (id: string, text: string) =>
    onChange(boxes.map(b => b.id === id ? { ...b, text: text || undefined } : b));

  const drawingRect = drawing ? {
    left:   Math.min(drawing.startX, drawing.currentX),
    top:    Math.min(drawing.startY, drawing.currentY),
    width:  Math.abs(drawing.currentX - drawing.startX),
    height: Math.abs(drawing.currentY - drawing.startY),
  } : null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{imageLabel}</div>

      <div
        ref={containerRef}
        className="relative w-full border border-gray-300 select-none"
        style={{ cursor: pendingBox ? 'default' : 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { if (drawing) setDrawing(null); }}
      >
        <img src={imageUrl} alt={imageLabel} className="w-full h-auto block pointer-events-none" />

        {/* Committed boxes */}
        {boxes.map(box => (
          <div
            key={box.id}
            className="absolute pointer-events-none"
            style={{
              top:    `${box.top}%`,
              left:   `${box.left}%`,
              width:  `${box.width}%`,
              height: `${box.height}%`,
              border: `2px solid ${typeColors[box.type]}`,
              backgroundColor: 'transparent',
            }}
          >
            <span
              className="absolute text-white px-1 font-bold"
              style={{
                backgroundColor: typeColors[box.type],
                top: -18,
                left: -1,
                fontSize: 9,
                whiteSpace: 'nowrap',
                lineHeight: '16px',
              }}
            >
              {box.text || box.type}
            </span>
          </div>
        ))}

        {/* In-progress drawing rect */}
        {drawingRect && (
          <div
            className="absolute pointer-events-none"
            style={{
              top:    `${drawingRect.top}%`,
              left:   `${drawingRect.left}%`,
              width:  `${drawingRect.width}%`,
              height: `${drawingRect.height}%`,
              border: '2px dashed #6b7280',
              backgroundColor: 'rgba(107,114,128,0.1)',
            }}
          />
        )}

        {/* Type selector popover */}
        {pendingBox && (
          <div
            className="absolute z-10 bg-white border border-gray-300 shadow-lg p-2 space-y-1"
            style={{
              top:       `${pendingBox.top}%`,
              left:      `${pendingBox.left}%`,
              transform: 'translateY(-108%)',
              minWidth:  160,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="text-[9px] uppercase tracking-wide text-gray-400 font-bold pb-1">Label text (optional)</div>
            <input
              className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-500 mb-1"
              placeholder="e.g. CE mark removed"
              value={pendingText}
              onChange={e => setPendingText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              autoFocus
            />
            <div className="text-[9px] uppercase tracking-wide text-gray-400 font-bold pb-0.5">Change type</div>
            {BOX_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => selectType(t)}
                className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-50 font-semibold"
                style={{ color: typeColors[t] }}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPendingBox(null); setPendingText(''); }}
              className="block w-full text-left px-2 py-1 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 mt-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Box list */}
      {boxes.length > 0 ? (
        <div className="space-y-1">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={undoLast}
              className="text-[11px] text-gray-500 hover:text-red-500 border border-gray-300 px-2 py-0.5 hover:border-red-300 transition-colors"
            >
              ↩ Undo last
            </button>
          </div>
          {boxes.map(box => (
            <div
              key={box.id}
              className="flex items-center gap-2 text-[11px] bg-gray-50 border border-gray-200 px-2 py-1"
            >
              <span style={{ color: typeColors[box.type] }} className="font-semibold shrink-0 w-16">{box.type}</span>
              <input
                className="flex-1 border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700 focus:outline-none focus:border-gray-400 bg-white"
                placeholder="Label text…"
                value={box.text ?? ''}
                onChange={e => updateText(box.id, e.target.value)}
              />
              <button
                type="button"
                onClick={() => deleteBox(box.id)}
                className="text-gray-400 hover:text-red-500 font-bold text-sm shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic">
          Click and drag on the image above to draw bounding boxes.
        </div>
      )}
    </div>
  );
}
