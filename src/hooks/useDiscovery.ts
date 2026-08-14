import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDiscoveryFeed, getLikesReceived, getMatches } from "@/lib/discovery.functions";
import type { DiscoveryCard } from "@/lib/discovery-core";
import {
  blockProfile,
  likeProfile,
  passProfile,
  reportProfile,
  unmatch,
  type LikeOutcome,
} from "@/lib/discovery";
import type { ReportCategory } from "@/config/lyve";

export const discoveryKeys = {
  feed: ["discovery", "feed"] as const,
  likes: ["discovery", "likes"] as const,
  matches: ["discovery", "matches"] as const,
};

/** Discovery feed with a local queue so a decision advances instantly. */
export function useDiscoveryFeed() {
  const fetchFeed = useServerFn(getDiscoveryFeed);
  const [page, setPage] = useState(0);
  const [decided, setDecided] = useState<string[]>([]);

  const query = useQuery({
    queryKey: [...discoveryKeys.feed, page],
    queryFn: () => fetchFeed({ data: { page } }),
    staleTime: 60_000,
  });

  const cards: DiscoveryCard[] = useMemo(
    () => (query.data?.cards ?? []).filter((card) => !decided.includes(card.profileId)),
    [query.data, decided],
  );

  const markDecided = useCallback((profileId: string) => {
    setDecided((current) => [...current, profileId]);
  }, []);

  const loadMore = useCallback(() => {
    if (query.data?.nextPage !== null && query.data?.nextPage !== undefined) {
      setPage(query.data.nextPage);
      setDecided([]);
    }
  }, [query.data]);

  return {
    ...query,
    cards,
    markDecided,
    loadMore,
    hasMore: Boolean(query.data?.nextPage !== null && query.data?.nextPage !== undefined),
  };
}

export function useLikesReceived() {
  const fetchLikes = useServerFn(getLikesReceived);
  return useQuery({
    queryKey: discoveryKeys.likes,
    queryFn: () => fetchLikes({ data: undefined }),
    staleTime: 30_000,
  });
}

export function useMatchList() {
  const fetchMatches = useServerFn(getMatches);
  return useQuery({
    queryKey: discoveryKeys.matches,
    queryFn: () => fetchMatches({ data: undefined }),
    staleTime: 30_000,
  });
}

function useInvalidateDiscovery() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["discovery"] });
  }, [queryClient]);
}

export function useDecision() {
  const invalidate = useInvalidateDiscovery();

  const like = useMutation<LikeOutcome, Error, string>({
    mutationFn: (profileId) => likeProfile(profileId),
    onSuccess: invalidate,
  });

  const pass = useMutation<void, Error, string>({
    mutationFn: (profileId) => passProfile(profileId),
    onSuccess: invalidate,
  });

  return { like, pass };
}

export function useSafetyActions() {
  const invalidate = useInvalidateDiscovery();

  const block = useMutation<void, Error, string>({
    mutationFn: (profileId) => blockProfile(profileId),
    onSuccess: invalidate,
  });

  const report = useMutation<
    void,
    Error,
    { profileId: string; category: ReportCategory; description?: string; alsoBlock?: boolean }
  >({
    mutationFn: (input) => reportProfile(input),
    onSuccess: invalidate,
  });

  const endMatch = useMutation<void, Error, string>({
    mutationFn: (matchId) => unmatch(matchId),
    onSuccess: invalidate,
  });

  return { block, report, endMatch };
}
