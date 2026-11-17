import type { RefObject } from 'react';

export const TranscriptWorkspaceActions = ({
  inputRef,
  onExport,
  onImport,
  onShare,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImport: (file: File) => void;
  onShare: () => void;
}) => (
  <div className="workspace-actions">
    <button type="button" onClick={onExport}>
      Xuất workspace
    </button>
    <button type="button" onClick={() => inputRef.current?.click()}>
      Nhập workspace
    </button>
    <button type="button" onClick={onShare}>
      Chia sẻ link
    </button>
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onImport(file);
        event.currentTarget.value = '';
      }}
    />
  </div>
);
