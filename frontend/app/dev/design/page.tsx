import { notFound } from "next/navigation";
import { DesignGallery } from "@/components/dev/design-gallery";

export const metadata = { title: "Design | EduRAG" };

// Dev-only: every shared component in every state. Not linked from any navigation.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
