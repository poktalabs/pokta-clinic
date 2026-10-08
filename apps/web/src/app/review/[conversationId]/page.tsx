import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Review } from "@/components/review";
import { ReviewHeader } from "@/components/review-header";
import { loadReview, reviewIndex } from "@/review/files";

// One recorded call, replayed: prerendered from the static export for each conversation in the index.
export const dynamicParams = false;

export function generateStaticParams() {
  return reviewIndex().map((c) => ({ conversationId: c.conversation_id }));
}

export async function generateMetadata({ params }: PageProps<"/review/[conversationId]">): Promise<Metadata> {
  const { conversationId } = await params;
  return { title: `PoktaClinic call review: ${conversationId}`, robots: { index: false } };
}

export default async function ReviewPage({ params }: PageProps<"/review/[conversationId]">) {
  const { conversationId } = await params;
  const data = loadReview(conversationId);
  if (!data) notFound();
  return (
    <>
      <ReviewHeader />
      <main className="wrap x-wide x-page">
        <Review conversation={data.conversation} manifest={data.manifest} config={data.config} />
      </main>
    </>
  );
}
