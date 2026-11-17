'use client';

import { useEffect, useMemo, useState } from 'react';
import { searchTranscript, type TranscriptSearchResult } from '@/domain/insights';
import { createSemanticSearchIndex } from '@/domain/semantic-search';
import type { TranscriptSegment } from '@/domain/transcript';
import { useDebouncedValue } from './useDebouncedValue';

export type TranscriptSearchMode = 'exact' | 'related';

export const useTranscriptSearch = (segments: TranscriptSegment[]) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<TranscriptSearchMode>('exact');
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 180);
  const exactResults = useMemo(() => searchTranscript(segments, debouncedQuery), [segments, debouncedQuery]);
  const semanticIndex = useMemo(() => createSemanticSearchIndex(segments), [segments]);
  const relatedResults = useMemo(() => semanticIndex.search(debouncedQuery), [semanticIndex, debouncedQuery]);
  const results: TranscriptSearchResult[] = mode === 'related' ? relatedResults : exactResults;

  useEffect(() => setActiveIndex(0), [debouncedQuery, mode]);

  return {
    query,
    setQuery,
    mode,
    setMode,
    debouncedQuery,
    results,
    semanticSearch: mode === 'related' && relatedResults.length > 0,
    activeIndex,
    setActiveIndex,
  };
};
