import AdminExperience from "../AdminExperience";
import { chatGPTSignOutPath, requireWeddingAdmin } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireWeddingAdmin("/admin");
  return <AdminExperience displayName={user.fullName ?? "Ekaterina & Dimitar"} signOutPath={chatGPTSignOutPath("/")} />;
}
