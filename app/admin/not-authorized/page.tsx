import Link from "next/link";
import { chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function NotAuthorizedPage() {
  const user = await getChatGPTUser();

  return (
    <main className="admin-access-page">
      <section>
        <p className="eyebrow">Private planning area</p>
        <h1>This account is not on the wedding planning list.</h1>
        <p>
          {user?.email
            ? `You are signed in as ${user.email}.`
            : "Please sign in with an approved wedding planning account."}
        </p>
        <div className="admin-access-actions">
          <Link href="/">Return to the invitation</Link>
          {user && <a href={chatGPTSignOutPath("/admin")}>Use another account</a>}
        </div>
      </section>
    </main>
  );
}
