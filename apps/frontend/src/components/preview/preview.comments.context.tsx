'use client';

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

export interface PreviewComment {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  name: string | null;
  guest: boolean;
}

export interface PendingAnchor {
  postId: string;
  start: number;
  end: number;
  quote: string;
}

// Which side asked for the focus decides which side scrolls: a click on a
// highlight scrolls the card into view, a click on a card quote scrolls the
// highlight into view.
export interface ActiveThread {
  id: string;
  source: 'mark' | 'card';
}

// The public read never says who owns the post. Signed in, the same list comes
// through the organization's own route, which also says whether this viewer's
// team may resolve threads. The key moves once, when the session lands, and
// the preview never changes under it, so the list it already has stays up.
const useComments = (previewId: string, signedIn: boolean) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const response = signedIn
      ? await fetch(`/posts/${previewId}/comments`)
      : await fetch(`/public/posts/${previewId}/comments`);
    // customFetch resolves 4xx/5xx. Read as data, a failed revalidation would
    // empty the list and show "No comments yet"; thrown, SWR keeps what it has.
    if (!response.ok) {
      throw new Error(`Could not load comments (${response.status})`);
    }
    return response.json();
  }, [fetch, previewId, signedIn]);
  return useSWR<{ comments: PreviewComment[]; canResolve: boolean }>(
    `preview-comments-${previewId}-${signedIn ? 'team' : 'public'}`,
    load,
    { keepPreviousData: true }
  );
};

interface PreviewCommentsContextInterface {
  previewId: string;
  postIds: string[];
  comments: PreviewComment[];
  canResolve: boolean;
  isLoading: boolean;
  mutate: () => Promise<any>;
  pending: PendingAnchor | null;
  setPending: (pending: PendingAnchor | null) => void;
  activeThread: ActiveThread | null;
  setActiveThread: (thread: ActiveThread | null) => void;
  hoveredThread: string | null;
  setHoveredThread: (id: string | null) => void;
}

const PreviewCommentsContext = createContext<PreviewCommentsContextInterface>(
  {} as PreviewCommentsContextInterface
);

export const PreviewCommentsProvider: FC<{
  previewId: string;
  postIds: string[];
  children: ReactNode;
}> = ({ previewId, postIds, children }) => {
  const user = useUser();
  const { data, mutate, isLoading } = useComments(previewId, !!user?.id);
  const [pending, setPending] = useState<PendingAnchor | null>(null);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [hoveredThread, setHoveredThread] = useState<string | null>(null);

  return (
    <PreviewCommentsContext.Provider
      value={{
        previewId,
        postIds,
        comments: data?.comments || [],
        canResolve: !!data?.canResolve,
        isLoading: isLoading && !data,
        mutate,
        pending,
        setPending,
        activeThread,
        setActiveThread,
        hoveredThread,
        setHoveredThread,
      }}
    >
      {children}
    </PreviewCommentsContext.Provider>
  );
};

export const usePreviewComments = () => useContext(PreviewCommentsContext);
