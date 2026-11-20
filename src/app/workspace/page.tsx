import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/user-context";

export default async function WorkspacePage() {
  const user = await requireUser();
  const memberships = await withUserContext(prisma, user.id, (tx) =>
    tx.membership.findMany({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" }
    })
  );

  return (
    <main className="auth-page">
      <section className="auth-card workspace-card">
        <Link className="auth-brand" href="/">fin<span>sight</span></Link>
        <p className="auth-eyebrow">AUTHENTICATED WORKSPACE</p>
        <h1>Welcome, {user.name ?? user.email}</h1>
        <p className="auth-description">Choose an organization to view its live cloud cost analytics.</p>
        <div className="workspace-list">
          {memberships.map((membership) => (
            <Link className="workspace-option workspace-option-link" href={"/workspace/" + membership.organization.id} key={membership.id}>
              <div><strong>{membership.organization.name}</strong><span>{membership.role.replaceAll("_", " ")}</span></div>
              <span className="workspace-slug">Open analytics →</span>
            </Link>
          ))}
          {memberships.length === 0 ? <p>No organization membership found.</p> : null}
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
