import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin motion-reduce:animate-none", className)} size={16} strokeWidth={1.75} aria-hidden="true" />;
}
