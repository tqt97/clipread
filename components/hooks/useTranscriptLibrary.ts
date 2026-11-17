'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptDocument } from '@/domain/transcript';

export interface LibraryEntry {
  id: string;
  title: string;
  sourceUrl: string;
  platform: TranscriptDocument['platform'];
  savedAt: string;
  document: TranscriptDocument;
}

const KEY = 'clipread:library:v1';
const MAX_ENTRIES = 5;
const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;

const read = (): LibraryEntry[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const useTranscriptLibrary = () => {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const entriesRef = useRef<LibraryEntry[]>([]);
  useEffect(() => {
    const initial = read();
    entriesRef.current = initial;
    setEntries(initial);
  }, []);

  const save = useCallback((document: TranscriptDocument): boolean => {
    const entry: LibraryEntry = {
      id: `${document.sourceUrl}:${document.language || 'auto'}`,
      title: document.title,
      sourceUrl: document.sourceUrl,
      platform: document.platform,
      savedAt: new Date().toISOString(),
      document,
    };
    const current = entriesRef.current;
    const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES);
    if (JSON.stringify([entry]).length > MAX_LIBRARY_BYTES) return false;
    while (next.length > 0 && JSON.stringify(next).length > MAX_LIBRARY_BYTES) next.pop();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      entriesRef.current = next;
      setEntries(next);
      return true;
    } catch {
      return false;
    }
  }, []);

  const remove = useCallback((id: string) => {
    const next = entriesRef.current.filter((entry) => entry.id !== id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      entriesRef.current = next;
      setEntries(next);
    } catch {
      // Keep the in-memory library intact when storage is unavailable.
    }
  }, []);
  return { entries, save, remove };
};
