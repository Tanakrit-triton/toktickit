import { useRef } from "react";

// Attachment selection -- ui-spec.md section 5.3.
//
// SELECTION and client-side validation only (AC-17). Nothing here uploads:
// api-spec.md section 7 makes creation and upload separate calls, and the
// upload half, together with the partial-success state, is Issue #18. A file
// selected on this screen is validated, shown, and then goes no further in
// Lab 2's current state.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

/** Extension and declared MIME type must both be permitted and must agree (BR-30). */
const PERMITTED: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export interface SelectedFile {
  file: File;
  /** Null when the file passed validation. */
  error: string | null;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function validateSelection(file: File): string | null {
  const permittedExtensions = PERMITTED[file.type];
  if (!permittedExtensions || !permittedExtensions.includes(extensionOf(file.name))) {
    return "File type not permitted";
  }
  if (file.size > MAX_BYTES) {
    return "File exceeds 5 MB";
  }
  return null;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncates in the middle so the extension stays readable (ui-spec 5.3). */
export function truncateMiddle(name: string, keep = 18): string {
  if (name.length <= keep * 2) return name;
  return `${name.slice(0, keep)}...${name.slice(-keep)}`;
}

export interface AttachmentSelectionProps {
  files: SelectedFile[];
  onChange: (files: SelectedFile[]) => void;
  disabled?: boolean;
  /**
   * False while the upload endpoint does not exist (Issue #18). The control
   * then offers no selection at all rather than accepting files it cannot
   * send, which would let a Requester believe evidence was attached.
   */
  uploadAvailable?: boolean;
}

export function AttachmentSelection({
  files,
  onChange,
  disabled = false,
  uploadAvailable = true,
}: AttachmentSelectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Only valid files count toward the limit; a rejected one stays visible but
  // occupies no slot (ui-spec 5.3, BR-32).
  const acceptedCount = files.filter((f) => f.error === null).length;
  const limitReached = acceptedCount >= MAX_FILES;

  function handleFiles(list: FileList | null) {
    if (list === null) return;
    const added = Array.from(list).map((file) => ({ file, error: validateSelection(file) }));
    onChange([...files, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <fieldset className="zg-group" data-testid="attachment-selection">
      <legend className="zg-legend">Attachments</legend>

      {/* uploadAvailable is retained for callers that cannot upload yet. */}
      {!uploadAvailable ? (
        <p className="zg-helper" data-testid="attachment-deferred">
          Attachments are added from Ticket Detail once the ticket has been created.
        </p>
      ) : (
      <div className={limitReached ? "zg-dropzone zg-dropzone--disabled" : "zg-dropzone"}>
        {limitReached ? (
          <p className="zg-helper" data-testid="attachment-limit-reached">
            Maximum of 5 attachments reached.
          </p>
        ) : (
          <>
            <p>Attach evidence (optional)</p>
            <p className="zg-helper">JPG, PNG, WEBP, or PDF. Maximum 5 MB each, up to 5 files.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="zg-file-input"
              data-testid="field-attachments"
              // No accept filter: it would make the browser hide
              // impermissible files, so the "File type not permitted" state
              // ui-spec 5.3 specifies could never be reached. validateSelection
              // is the single gate, and it reports the reason (BR-30).
              disabled={disabled}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </>
        )}
      </div>
      )}

      {files.length > 0 && (
        <ul className="zg-attachment-list">
          {files.map((selected, index) => (
            <li
              key={`${selected.file.name}-${index}`}
              className={selected.error ? "zg-attachment-row zg-attachment-row--invalid" : "zg-attachment-row"}
              data-testid={selected.error ? "attachment-row-invalid" : "attachment-row"}
            >
              <span className="zg-attachment-name" title={selected.file.name}>
                {truncateMiddle(selected.file.name)}
              </span>
              <span className="zg-helper">{humanSize(selected.file.size)}</span>
              {selected.error && (
                <span className="zg-message-error" data-testid="attachment-error">
                  {selected.error}
                </span>
              )}
              <button
                type="button"
                className="zg-btn zg-btn--tertiary"
                data-testid="btn-remove-selection"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
