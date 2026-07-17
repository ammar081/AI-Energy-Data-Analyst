"use client";

import { Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DashboardSkeleton, EmptyState, ErrorState, Notify } from "@/components/FeedbackStates";
import { ResponsiveColumn, ResponsiveTable } from "@/components/ResponsiveTable";
import { AdminStats, api, User, UserRole } from "@/lib/api";

function number(value: number | undefined) {
  return new Intl.NumberFormat("en").format(value ?? 0);
}

export function AdminView({ currentUser, onNotify }: { currentUser: User; onNotify: Notify }) {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busyId, setBusyId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [userRows, workspaceStats] = await Promise.all([api.users(), api.adminStats()]);
      setUsers(userRows);
      setStats(workspaceStats);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load administration data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(user: User, change: { role?: UserRole; is_active?: boolean }) {
    setBusyId(user.id);
    setError("");
    try {
      const updated = await api.updateUser(user.id, change);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStats(await api.adminStats());
      onNotify(`${updated.full_name}'s access was updated.`, "success");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Could not update user.";
      setError(message);
      onNotify(message, "error");
    } finally {
      setBusyId("");
    }
  }

  const columns: ResponsiveColumn<User>[] = [
    { key: "user", label: "User", hideFromDetails: true, render: (user) => <><strong>{user.full_name}</strong><small className="table-value">{user.email}</small></> },
    { key: "role", label: "Role", render: (user) => <select aria-label={`Role for ${user.full_name}`} disabled={busyId === user.id || user.id === currentUser.id} onChange={(event) => void update(user, { role: event.target.value as UserRole })} value={user.role}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select> },
    { key: "status", label: "Status", render: (user) => <span className={`account-state ${user.is_active ? "active" : "disabled"}`}>{user.is_active ? "Active" : "Disabled"}</span> },
    { key: "joined", label: "Joined", render: (user) => user.created_at ? new Date(user.created_at).toLocaleDateString() : "Not available" },
    { key: "access", label: "Access", render: (user) => <button aria-label={user.is_active ? `Disable ${user.full_name}` : `Enable ${user.full_name}`} className="icon-button" disabled={busyId === user.id || user.id === currentUser.id} onClick={() => void update(user, { is_active: !user.is_active })} title={user.is_active ? "Disable account" : "Enable account"} type="button">{busyId === user.id ? <Loader2 aria-hidden="true" className="spin" size={17} /> : user.is_active ? <UserX aria-hidden="true" size={17} /> : <UserCheck aria-hidden="true" size={17} />}</button> }
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error && !stats) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <section className="admin-view">
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      <div aria-label="Administration metrics" className="metrics-grid admin-metrics">
        <div className="metric-tile green"><span>Users</span><strong>{number(stats?.users)}</strong><small>{number(stats?.active_users)} active</small></div>
        <div className="metric-tile teal"><span>Datasets</span><strong>{number(stats?.datasets)}</strong></div>
        <div className="metric-tile amber"><span>Reports</span><strong>{number(stats?.reports)}</strong></div>
        <div className="metric-tile red"><span>Rows processed</span><strong>{number(stats?.rows_processed)}</strong></div>
      </div>
      <section className="panel wide">
        <div className="panel-heading"><div><h3>Workspace Users</h3><p>Access and account status</p></div><ShieldCheck aria-hidden="true" size={20} /></div>
        {users.length ? <ResponsiveTable caption="Workspace users and permissions" columns={columns} mobileSummary={(user) => `${user.role} | ${user.is_active ? "active" : "disabled"}`} mobileTitle={(user) => user.full_name} rowKey={(user) => user.id} rows={users} /> : <EmptyState title="No workspace users" detail="User accounts will appear here after registration." />}
      </section>
    </section>
  );
}
