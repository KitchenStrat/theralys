import type { ReactNode } from "react";
import { requireClient } from "@/lib/auth";

/** L'éditeur occupe tout l'écran, sans la nav du studio. */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return <div className="flex h-screen flex-col overflow-hidden">{children}</div>;
}
