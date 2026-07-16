import AdminExperience from "../AdminExperience";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  return <AdminExperience displayName={user.fullName ?? "Ekaterina & Dimitar"} signOutPath={chatGPTSignOutPath("/")} />;
}
