import { redirect } from "next/navigation";

/** L'onglet « Leads » est devenu le CRM : l'ancienne adresse y mène. */
export default function LeadsPage() {
  redirect("/crm");
}
