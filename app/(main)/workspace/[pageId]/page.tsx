import { PageView } from "@/components/editor/PageView";

export default async function Page({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  return <PageView pageId={pageId} />;
}
