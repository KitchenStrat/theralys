import { notFound } from "next/navigation";
import { demoUrl, getDemo, isLinkActive } from "@/lib/demos";
import { EditDemoForm } from "./edit-demo-form";

export const metadata = { title: "Éditer la démo" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditDemoPage({ params }: Props) {
  const { id } = await params;
  const demo = await getDemo(id);
  if (!demo || !demo.prospect) notFound();

  const { site, prospect } = demo;

  return (
    <EditDemoForm
      demo={{
        siteId: site.id,
        slug: site.slug,
        status: site.status,
        progress: site.generationProgress,
        generationError: site.generationError,
        url: demoUrl(site),
        linkActive: isLinkActive(site),
        demoExpiresAt: site.demoExpiresAt?.toISOString() ?? null,
        plan: site.plan,
        themePreset: site.theme.preset,
        bookingUrl: site.bookingUrl ?? "",
        highlightedMotifs: site.highlightedMotifs,
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        profession: prospect.profession,
        city: prospect.city,
        gender: prospect.gender,
        googleBusinessName: prospect.googleBusinessName,
      }}
    />
  );
}
