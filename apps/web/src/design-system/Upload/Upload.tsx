import { useRef, useState } from "react";
import { ImageIcon, Upload as UploadIcon, X } from "lucide-react";
import { cn } from "../utils";
import { Dialog, DialogContent } from "../Modal/Dialog";

// GarmentUpload — docs/DESIGN_SYSTEM_MAP.md §3.9/§6: паттерн Origin UI
// file-dropzone (уже зафиксирован как источник в docs/UI_FOUNDATION.md,
// раздел 2). Первый реальный сценарий — фото ткани/брака/накладной
// (docs/PRINCIPLES.md принцип 20, п.3: камера — полноценный канал ввода).
// Своя реализация на нативных drag-событиях — не тянуть react-dropzone
// ради обёртки над тем, что API браузера уже даёт бесплатно.
interface UploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  /** Подпись зоны. По умолчанию — про фото: первым сценарием была съёмка
   *  ткани и брака. Для документов передаётся своя, иначе зона предлагает
   *  перетащить фото туда, куда кладут PDF. */
  label?: string;
}

export function Upload({
  files,
  onChange,
  accept = "image/*",
  multiple = true,
  hint,
  label = "Перетащите фото сюда или нажмите",
}: UploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = multiple ? [...files, ...Array.from(incoming)] : [incoming[0]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-border bg-secondary/40 p-6 text-center transition-colors",
          "hover:border-primary/40 hover:bg-secondary",
          dragOver && "border-primary bg-accent",
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <UploadIcon className="h-4 w-4" />
        </span>
        <span className="text-[0.85rem] font-bold text-foreground">{label}</span>
        {hint && <span className="text-[0.75rem] text-muted-foreground">{hint}</span>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <FilePreviewChip
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
              onPreview={() => setPreviewFile(file)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-lg p-2">
          {previewFile && previewFile.type.startsWith("image/") && (
            <img
              src={URL.createObjectURL(previewFile)}
              alt={previewFile.name}
              className="max-h-[70vh] w-full rounded-[16px] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilePreviewChip({ file, onRemove, onPreview }: { file: File; onRemove: () => void; onPreview: () => void }) {
  const isImage = file.type.startsWith("image/");
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-[12px] border border-border bg-secondary">
      <button type="button" onClick={onPreview} className="h-full w-full">
        {isImage ? (
          <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить файл"
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
