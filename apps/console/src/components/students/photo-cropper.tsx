import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

const VIEW = 280;
const OUT = 512;

export function PhotoCropper({
  file,
  uploading = false,
  onCancel,
  onCropped,
}: {
  file: File;
  uploading?: boolean;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
}) {
  const [src, setSrc] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setImage(null);
    setError(null);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setError("This file could not be opened as an image.");
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const minScale = image ? Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight) : 1;
  const scale = minScale * zoom;

  function clampOffset(x: number, y: number, nextZoom = zoom) {
    if (!image) return { x: 0, y: 0 };
    const nextScale = minScale * nextZoom;
    const maxX = Math.max(0, (image.naturalWidth * nextScale - VIEW) / 2);
    const maxY = Math.max(0, (image.naturalHeight * nextScale - VIEW) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset(
      clampOffset(drag.current.ox + (event.clientX - drag.current.x), drag.current.oy + (event.clientY - drag.current.y)),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function crop() {
    if (!image) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not crop this image");
      const ratio = OUT / VIEW;
      const dw = image.naturalWidth * scale * ratio;
      const dh = image.naturalHeight * scale * ratio;
      const dx = (VIEW / 2 + offset.x - (image.naturalWidth * scale) / 2) * ratio;
      const dy = (VIEW / 2 + offset.y - (image.naturalHeight * scale) / 2) * ratio;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(image, dx, dy, dw, dh);
      onCropped(canvas.toDataURL("image/jpeg", 0.82));
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop this image");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close cropper" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-lg">
        <h2 id="photo-crop-title" className="font-display text-2xl">
          Crop photo
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Drag to position, then zoom so the face fills the circle.</p>
        <div
          className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-full bg-ink active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none max-w-none select-none"
              style={{
                width: image ? image.naturalWidth * scale : undefined,
                height: image ? image.naturalHeight * scale : undefined,
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          ) : null}
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="photo-zoom">Zoom</FieldLabel>
          <input
            id="photo-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            className="mt-2 w-full accent-indigo"
            onChange={(event) => {
              const next = Number(event.target.value);
              setZoom(next);
              setOffset((current) => clampOffset(current.x, current.y, next));
            }}
          />
        </Field>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving || uploading}>
            Cancel
          </Button>
          <Button type="button" loading={saving || uploading} disabled={!image} onClick={crop}>
            Use photo
          </Button>
        </div>
      </div>
    </div>
  );
}
