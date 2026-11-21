import { Suspense } from "react";
import { TutorView } from "@/components/tutor/tutor-view";

export const metadata = { title: "Study tutor | EduRAG" };

async function ThreadRoute({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  // The key makes a different chat start from a clean state
  return <TutorView key={threadId} threadId={threadId} />;
}

export default function TutorThreadPage(props: { params: Promise<{ threadId: string }> }) {
  return (
    <Suspense>
      <ThreadRoute params={props.params} />
    </Suspense>
  );
}
