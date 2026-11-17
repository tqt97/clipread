'use client';

import { useState } from 'react';

export const useClipboard = () => {
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState(false);

  const copyText = async (text: string) => {
    setClipboardError(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      return true;
    } catch {
      setClipboardError(true);
      return false;
    }
  };

  return { copied, clipboardError, copyText };
};
