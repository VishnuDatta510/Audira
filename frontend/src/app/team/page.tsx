"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Pencil, UserPlus, X } from "lucide-react";
import { InterviewerGate } from "@/components/admin/interviewer-gate";
import { PageError, PageLoading } from "@/components/page-state";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { hasRole, updateUser, useUser } from "@/lib/auth";
import { cx, roleHint, roleLabel, timeUntil } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { useLoad } from "@/lib/use-load";
import type { Invite, Member, MemberRole, Workspace } from "@/lib/types";

const ROLE_OPTIONS = (["viewer", "recruiter", "owner"] as const).map((value) => ({ value, label: roleLabel[value] }));
const card = "rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8";

function Alert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p key={message} className="mt-4 animate-shake rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger" role="alert">
      {message}
    </p>
  );
}

/** Refreshes the stored user, since a change to the team can change the caller's own role or membership. */
async function refreshMe() {
  updateUser(await api.me());
}

function Team() {
  const { data, error, reload, setData } = useLoad(() => api.workspace(), "workspace");
  if (error && !data) return <PageError message={error} onRetry={reload} />;
  if (!data) return <PageLoading label="Loading your team" />;
  const owner = data.role === "owner";
  const owners = data.members.filter((m) => m.role === "owner").length;

  return (
    <>
      <TeamName workspace={data} onRenamed={(name) => setData({ ...data, name })} />
      <p className="rise mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2" style={{ "--d": "60ms" } as React.CSSProperties}>
        Everyone here sees the same interviews, scoreboards and reports. {owner ? "You can invite people and change their roles." : `You are a ${roleLabel[data.role].toLowerCase()}.`}
      </p>
      {owner && <InviteForm onInvited={reload} />}
      <Members workspace={data} owners={owners} onChange={reload} />
      {owner && data.invites.length > 0 && <Invites invites={data.invites} onChange={reload} />}
      <Leave workspace={data} lastOwner={owner && owners === 1} />
    </>
  );
}

function TeamName({ workspace, onRenamed }: { workspace: Workspace; onRenamed: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("At least 2 characters.");
    setBusy(true);
    setError(null);
    try {
      const saved = await api.renameWorkspace(name.trim());
      onRenamed(saved.name);
      await refreshMe();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-3">Team</p>
      {editing ? (
        <form onSubmit={save} noValidate className="rise mt-2 flex max-w-lg flex-wrap items-center gap-2">
          <Input
            aria-label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="h-12 min-w-0 flex-1 font-display text-2xl font-semibold"
          />
          <Button type="submit" size="lg" loading={busy} aria-label="Save name">
            <Check className="size-4" strokeWidth={3} />
            Save
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setEditing(false);
              setName(workspace.name);
              setError(null);
            }}
          >
            Cancel
          </Button>
          {error && <p className="w-full text-[13px] text-danger">{error}</p>}
        </form>
      ) : (
        <div className="group mt-1 flex items-center gap-3">
          <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink">{workspace.name}</h1>
          {workspace.role === "owner" && (
            <button
              onClick={() => setEditing(true)}
              className="grid size-9 place-items-center rounded-[10px] text-ink-3 transition-[background-color,color,opacity] duration-300 hover:bg-surface-2 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              aria-label="Rename workspace"
              title="Rename"
            >
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("recruiter");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; link: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter a valid email address.");
    setBusy(true);
    try {
      const invite = await api.invite(email.trim(), role);
      setSent({ email: invite.email, link: `${window.location.origin}/invite/${invite.token}` });
      setEmail("");
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cx("rise mt-10", card)} style={{ "--d": "120ms" } as React.CSSProperties}>
      <h2 className="font-display text-xl font-semibold text-ink">Invite a teammate</h2>
      <p className="mt-1 text-[13px] text-ink-3">You get a link to send them. It works once, only for that email, and expires in 7 days.</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <Field label="Email">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="teammate@company.com" />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-ink">Role</p>
          <div>
            <Segmented label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          </div>
          <p className="text-[13px] text-ink-3">{roleHint[role]}.</p>
        </div>
        <Button type="submit" loading={busy} className="group">
          <UserPlus className="size-4 transition-transform duration-500 ease-spring group-hover:scale-110" />
          Create invite link
        </Button>
      </form>
      <Alert message={error} />
      {sent && (
        <div className="rise mt-6 rounded-2xl border border-accent/15 bg-accent-soft p-4 sm:p-5" role="status">
          <p className="text-sm font-medium text-accent">Invite ready for {sent.email}</p>
          <p className="mt-1 text-[13px] text-ink-2">Copy it now and send it to them. For safety, Audira keeps only a fingerprint of the link, so it is not shown again.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="inline-flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink-2">
              <span className="size-1.5 shrink-0 rounded-full bg-accent" />
              <span className="break-all">{sent.link}</span>
            </p>
            <CopyButton text={sent.link} />
          </div>
        </div>
      )}
    </section>
  );
}

function Members({ workspace, owners, onChange }: { workspace: Workspace; owners: number; onChange: () => void }) {
  const user = useUser();
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, self: boolean) {
    setError(null);
    try {
      await action();
      if (self) await refreshMe();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the team.");
    }
  }

  return (
    <section className={cx("rise mt-6", card)} style={{ "--d": "180ms" } as React.CSSProperties}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">Members</h2>
        <span className="text-[13px] text-ink-3">{workspace.members.length}</span>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {workspace.members.map((member, i) => (
          <MemberRow
            key={member.email}
            member={member}
            index={i}
            you={member.email === user?.email}
            canManage={workspace.role === "owner"}
            soleOwner={member.role === "owner" && owners === 1}
            onRole={(role) => run(() => api.setMemberRole(member.email, role), member.email === user?.email)}
            onRemove={() => run(() => api.removeMember(member.email), false)}
          />
        ))}
      </ul>
      <Alert message={error} />
    </section>
  );
}

function MemberRow({
  member,
  index,
  you,
  canManage,
  soleOwner,
  onRole,
  onRemove,
}: {
  member: Member;
  index: number;
  you: boolean;
  canManage: boolean;
  soleOwner: boolean;
  onRole: (role: MemberRole) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // The last owner keeps the role: someone has to be able to manage the team.
  const editable = canManage && !soleOwner;

  return (
    <li className="rise flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0" style={{ "--i": index } as React.CSSProperties}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[15px] font-semibold text-accent">
        {member.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="flex items-center gap-2 truncate text-[15px] font-medium text-ink">
          {member.name}
          {you && <Badge>You</Badge>}
        </p>
        <p className="truncate text-[13px] text-ink-3">{member.email}</p>
      </div>
      {/* The role picker wraps below on a phone, so line it up under the name instead of the avatar. */}
      <div className={cx("flex items-center gap-x-4", editable && "max-sm:ml-14")}>
        {editable ? (
          <Segmented size="sm" label={`Role for ${member.name}`} value={member.role} onChange={onRole} options={ROLE_OPTIONS} />
        ) : (
          <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{roleLabel[member.role]}</Badge>
        )}
        {editable && !you && (
          <div className="flex items-center gap-1">
            {confirming ? (
              <>
                <Button size="sm" variant="danger" onClick={onRemove}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="grid size-8 place-items-center rounded-lg text-ink-3 transition-[background-color,color] duration-300 hover:bg-danger-soft hover:text-danger"
                aria-label={`Remove ${member.name}`}
                title="Remove from team"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Invites({ invites, onChange }: { invites: Invite[]; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await api.revokeInvite(id);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the invite.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className={cx("rise mt-6", card)} style={{ "--d": "240ms" } as React.CSSProperties}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">Pending invites</h2>
        <span className="text-[13px] text-ink-3">{invites.length}</span>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {invites.map((invite, i) => (
          <li key={invite.id} className="rise flex flex-wrap items-center gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0" style={{ "--i": i } as React.CSSProperties}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-3">
              <UserPlus className="size-4" />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-[15px] font-medium text-ink">{invite.email}</p>
              <p className="text-[13px] text-ink-3">
                Invited by {invite.invited_by_name} · expires {timeUntil(invite.expires_at)}
              </p>
            </div>
            <div className="flex items-center gap-x-4 max-sm:ml-14">
              <Badge tone="amber">{roleLabel[invite.role]}</Badge>
              <Button size="sm" variant="ghost" loading={revoking === invite.id} onClick={() => revoke(invite.id)}>
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Alert message={error} />
    </section>
  );
}

function Leave({ workspace, lastOwner }: { workspace: Workspace; lastOwner: boolean }) {
  const router = useRouter();
  const user = useUser();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeMember(user.email);
      await refreshMe();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not leave the team.");
      setBusy(false);
    }
  }

  return (
    <section className={cx("rise mt-6", card)} style={{ "--d": "300ms" } as React.CSSProperties}>
      <h2 className="font-display text-xl font-semibold text-ink">Leave {workspace.name}</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        {lastOwner
          ? "You are the only owner. Make someone else an owner first, so the team is not left without one."
          : "You lose access to its interviews and reports straight away. An owner can invite you back."}
      </p>
      <Alert message={error} />
      <div className="mt-5 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button variant="danger" loading={busy} onClick={leave}>
              Leave the team
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Stay
            </Button>
          </>
        ) : (
          <Button variant="secondary" disabled={lastOwner} onClick={() => setConfirming(true)}>
            Leave team
          </Button>
        )}
      </div>
    </section>
  );
}

export default function TeamPage() {
  const user = useUser();
  const ready = useHydrated();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        {!ready && <PageLoading label="Loading your team" />}
        {ready && !hasRole(user, "viewer") && <InterviewerGate next="/team" />}
        {ready && hasRole(user, "viewer") && <Team />}
      </main>
    </>
  );
}
