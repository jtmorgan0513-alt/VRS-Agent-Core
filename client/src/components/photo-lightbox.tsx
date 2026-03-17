import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Download } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { downloadPhotoUrl } from "@/lib/utils";

interface PhotoLightboxProps {
  photos: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;

export default function PhotoLightbox({ photos, initialIndex, open, onClose }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }, [initialIndex, open]);

  const resetView = useCallback(() => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }, []);

  const downloadPhoto = useCallback(() => {
    const url = photos[currentIndex];
    if (!url) return;
    downloadPhotoUrl(url, `photo-${currentIndex + 1}`);
  }, [photos, currentIndex]);

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetView();
    }
  }, [currentIndex, photos.length, resetView]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetView();
    }
  }, [currentIndex, resetView]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (zoom <= 100) goPrev();
          else setPan((p) => ({ ...p, x: p.x + 50 }));
          break;
        case "ArrowRight":
          if (zoom <= 100) goNext();
          else setPan((p) => ({ ...p, x: p.x - 50 }));
          break;
        case "ArrowUp":
          setPan((p) => ({ ...p, y: p.y + 50 }));
          break;
        case "ArrowDown":
          setPan((p) => ({ ...p, y: p.y - 50 }));
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
        case "0":
          resetView();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, goNext, goPrev, zoomIn, zoomOut, resetView, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 100) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setPanStart({ ...pan });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: panStart.x + (e.clientX - dragStart.x),
        y: panStart.y + (e.clientY - dragStart.y),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches);
      setInitialPinchDist(dist);
      setPinchStartZoom(zoom);
    } else if (e.touches.length === 1 && zoom > 100) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setPanStart({ ...pan });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist !== null) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const scale = dist / initialPinchDist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(pinchStartZoom * scale)));
      setZoom(newZoom);
    } else if (e.touches.length === 1 && isDragging) {
      setPan({
        x: panStart.x + (e.touches[0].clientX - dragStart.x),
        y: panStart.y + (e.touches[0].clientY - dragStart.y),
      });
    }
  };

  const handleTouchEnd = () => {
    setInitialPinchDist(null);
    setIsDragging(false);
  };

  if (!open || photos.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex flex-col"
      data-testid="lightbox-overlay"
    >
      <div className="flex items-center justify-between gap-2 p-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            data-testid="button-zoom-out"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            onValueChange={([v]) => setZoom(v)}
            className="w-32"
            data-testid="slider-zoom"
          />
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            data-testid="button-zoom-in"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <span className="text-white text-sm font-mono min-w-[3.5rem] text-center" data-testid="text-zoom-level">
            {zoom}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={resetView}
            data-testid="button-zoom-reset"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={downloadPhoto}
            data-testid="button-download-photo"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm" data-testid="text-photo-counter">
            {currentIndex + 1} / {photos.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={onClose}
            data-testid="button-lightbox-close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: zoom > 100 ? (isDragging ? "grabbing" : "grab") : "default", touchAction: "none" }}
        data-testid="lightbox-image-container"
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <img
            src={photos[currentIndex]}
            alt={`Photo ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain pointer-events-none"
            draggable={false}
            data-testid="img-lightbox-photo"
          />
        </div>

        {photos.length > 1 && currentIndex > 0 && (
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 rounded-md p-2 text-white hover:bg-black/70 transition-colors"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            data-testid="button-lightbox-prev"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {photos.length > 1 && currentIndex < photos.length - 1 && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 rounded-md p-2 text-white hover:bg-black/70 transition-colors"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            data-testid="button-lightbox-next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
