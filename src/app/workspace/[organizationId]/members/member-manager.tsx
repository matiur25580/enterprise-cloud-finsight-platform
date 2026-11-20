"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Role = "OWNER" | "ADMIN" | "FINOPS_ANALYST" | "VIEWER";
type Member = { id: string; role: Role; createdAt: string; user: { id: string; name: string | null; email: string } };
type Invitation = { id: string; email: string; role: Role; expiresAt: string; createdAt: string };

export default function MemberManager({ organizationId, initialMembers, initialInvitations, actorRole }: {
  organizationId: string; initialMembers: Member[]; initialInvitations: Invitation[]; actorRole: Role;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "FINOPS_ANALYST" | "VIEWER">("VIEWER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = "/api/organizations/" + organizationId + "/members";

  async function refresh() {
    const response = await fetch(base, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to refresh organization members.");
    const data = await response.json();
    setMembers(data.members);
    setInvitations(data.invitations);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invitation failed.");
      setEmail(""); setMessage("Invitation email sent. The link expires in 7 days."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation failed."); }
    finally { setBusy(false); }
  }

  async function changeRole(memberId: string, nextRole: string) {
    setMessage("");
    try {
      const response = await fetch(base + "/" + memberId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: nextRole }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Role update failed.");
      await refresh(); setMessage("Member role updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Role update failed."); }
  }

  async function remove(member: Member) {
    if (!window.confirm("Remove " + member.user.email + " from this organization?")) return;
    setMessage("");
    try {
      const response = await fetch(base + "/" + member.id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Member removal failed.");
      await refresh(); setMessage("Member removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Member removal failed."); }
  }

  return <div className="member-manager">
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><h2>Invite a teammate</h2><p>Invitations expire after 7 days and can only be accepted by the invited email address.</p></div>
      <form className="member-invite-form" onSubmit={invite}>
        <label>Email address<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" /></label>
        <label>Organization role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="VIEWER">Viewer</option><option value="FINOPS_ANALYST">FinOps Analyst</option>{actorRole === "OWNER" ? <option value="ADMIN">Admin</option> : null}</select></label>
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</button>
      </form>
      {message ? <p className="member-feedback" role="status">{message}</p> : null}
    </section>
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><h2>Organization members</h2><p>{members.length} active member(s)</p></div>
      <div className="member-list">{members.map((member) => <article className="member-row" key={member.id}>
        <div><strong>{member.user.name || member.user.email}</strong><span>{member.user.email}</span></div>
        {member.role === "OWNER" ? <span className="member-role">Owner</span> : actorRole === "ADMIN" && member.role === "ADMIN" ? <span className="member-role">Admin · owner-managed</span> : <div className="member-actions">
          <select aria-label={"Role for " + member.user.email} defaultValue={member.role} onChange={(event) => changeRole(member.id, event.target.value)}><option value="ADMIN" disabled={actorRole !== "OWNER"}>Admin</option><option value="FINOPS_ANALYST">FinOps Analyst</option><option value="VIEWER">Viewer</option></select>
          <button type="button" className="member-remove" onClick={() => remove(member)}>Remove</button>
        </div>}
      </article>)}</div>
    </section>
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><h2>Pending invitations</h2><p>{invitations.length} awaiting acceptance</p></div>
      {invitations.length ? <div className="member-list">{invitations.map((invite) => <article className="member-row" key={invite.id}><div><strong>{invite.email}</strong><span>Expires {new Date(invite.expiresAt).toLocaleString()}</span></div><span className="member-role">{invite.role.replaceAll("_", " ")}</span></article>)}</div> : <p className="analytics-muted">No pending invitations.</p>}
    </section>
  </div>;
}
