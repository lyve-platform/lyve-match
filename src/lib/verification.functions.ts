/**
 * Staff-side verification review.
 *
 * Permission is enforced by the database routines (`verification.review`);
 * the service-role client is only used AFTER that check, to mint short-lived
 * signed URLs for private selfie and profile photos. Storage paths never
 * reach the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VerificationReviewRow = {
  requestId: string;
  profileId: string;
  nickname: string | null;
  status: "unverified" | "pending" | "verified" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  note: string | null;
  selfieUrl: string | null;
  photoUrls: string[];
};

export const listVerificationRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) => {
    const status = String(input?.status ?? "pending");
    return {
      status: (["pending", "verified", "rejected"] as const).includes(status as "pending")
        ? (status as "pending" | "verified" | "rejected")
        : ("pending" as const),
    };
  })
  .handler(async ({ data, context }): Promise<VerificationReviewRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_verification_requests", {
      p_status: data.status,
      p_limit: 50,
      p_offset: 0,
    });
    if (error) throw error;

    const list = (rows ?? []) as unknown as Array<{
      request_id: string;
      profile_id: string;
      nickname: string | null;
      selfie_path: string;
      status: VerificationReviewRow["status"];
      created_at: string;
      reviewed_at: string | null;
      note: string | null;
    }>;
    if (list.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: photos } = await supabaseAdmin
      .from("profile_photos")
      .select("profile_id, storage_path, is_primary, display_order")
      .in(
        "profile_id",
        list.map((row) => row.profile_id),
      )
      .order("is_primary", { ascending: false })
      .order("display_order", { ascending: true });

    const paths = [
      ...list.map((row) => row.selfie_path),
      ...(photos ?? []).map((photo) => photo.storage_path),
    ];
    const { data: signed } = await supabaseAdmin.storage
      .from("profile-photos")
      .createSignedUrls(paths, 10 * 60);

    const urls: Record<string, string> = {};
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    }

    return list.map((row) => ({
      requestId: row.request_id,
      profileId: row.profile_id,
      nickname: row.nickname,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      note: row.note,
      selfieUrl: urls[row.selfie_path] ?? null,
      photoUrls: (photos ?? [])
        .filter((photo) => photo.profile_id === row.profile_id)
        .slice(0, 4)
        .flatMap((photo) => (urls[photo.storage_path] ? [urls[photo.storage_path] as string] : [])),
    }));
  });

export const reviewVerificationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; approve: boolean; note?: string }) => ({
    requestId: String(input?.requestId ?? ""),
    approve: input?.approve === true,
    note: String(input?.note ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_review_verification", {
      p_request: data.requestId,
      p_approve: data.approve,
      p_note: data.note || undefined,
    });
    if (error) throw error;
    return { status: result as string };
  });
