"use client";

import { Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminStats, api, User, UserRole } from "@/lib/api";

function number(value: number | undefined) {
  return new Intl.NumberFormat("en").format(value ?? 0);
}

export function AdminView({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [userRows, workspaceStats] = await Promise.all([api.users(), api.adminStats()]);
      setUsers(userRows);
      setStats(workspaceStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load administration data.");
    }
  }

  useEffect(() => { load(); }, []);

  async function update(user: User, change: { role?: UserRole; is_active?: boolean }) {
    setBusyId(user.id);
    setError("");
    try {
      const updated = await api.updateUser(user.id, change);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStats(await api.adminStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="admin-view">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="metrics-grid admin-metrics">
        <div className="metric-tile green"><span>Users</span><strong>{number(stats?.users)}</strong><small>{number(stats?.active_users)} active</small></div>
        <div className="metric-tile teal"><span>Datasets</span><strong>{number(stats?.datasets)}</strong></div>
        <div className="metric-tile amber"><span>Reports</span><strong>{number(stats?.reports)}</strong></div>
        <div className="metric-tile red"><span>Rows processed</span><strong>{number(stats?.rows_processed)}</strong></div>
      </div>
      <div className="panel wide">
        <div className="panel-heading"><div><h3>Workspace Users</h3><p>Access and account status</p></div><ShieldCheck size={20} /></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Access</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.full_name}</strong><small className="table-value">{user.email}</small></td>
                <td><select aria-label={`Role for ${user.full_name}`} disabled={busyId === user.id || user.id === currentUser.id} onChange={(event) => update(user, { role: event.target.value as UserRole })} value={user.role}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select></td>
                <td><span className={`account-state ${user.is_active ? "active" : "disabled"}`}>{user.is_active ? "Active" : "Disabled"}</span></td>
                <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "n/a"}</td>
                <td><button aria-label={user.is_active ? `Disable ${user.full_name}` : `Enable ${user.full_name}`} className="icon-button" disabled={busyId === user.id || user.id === currentUser.id} onClick={() => update(user, { is_active: !user.is_active })} title={user.is_active ? "Disable account" : "Enable account"} type="button">{busyId === user.id ? <Loader2 className="spin" size={17} /> : user.is_active ? <UserX size={17} /> : <UserCheck size={17} />}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
