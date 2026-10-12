import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Shield, LayoutDashboard, AlertTriangle, LogOut, User as UserIcon, Database } from "lucide-react";
import { borders, colors, radius, spacing, typography } from "../tokens";
import { clearAuth, getUser } from "../lib/api";

export function AppShell() {
  const nav = useNavigate();
  const user = getUser();

  const onLogout = () => {
    clearAuth();
    nav("/login", { replace: true });
  };

  return (
    <div className="app-shell" style={{ minHeight: "100vh", background: colors.bgRoot, color: colors.textPrimary }}>
      <aside className="app-sidebar" style={{
        borderRight: borders.base, background: colors.bgSurface, padding: spacing["5"],
        display: "flex", flexDirection: "column", gap: spacing["5"],
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"], padding: spacing["1"] }}>
          <div style={{
            width: 28, height: 28, borderRadius: radius.md,
            background: `linear-gradient(135deg, ${colors.primary}, #6366f1)`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>
            <Shield size={16} strokeWidth={2.2}/>
          </div>
          <div>
            <div style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold }}>NIDS Console</div>
            <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>Security Operations</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: spacing["1"] }}>
          <StyledLink to="/dashboard">
            <LayoutDashboard size={15}/>
            <span>Dashboard</span>
          </StyledLink>
          <StyledLink to="/alerts">
            <AlertTriangle size={15}/>
            <span>Alerts & Events</span>
          </StyledLink>
        </nav>

        <div className="app-sidebar-footer" style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: spacing["2"] }}>
          <div style={{
            padding: spacing["3"], borderRadius: radius.md, border: borders.base,
            background: colors.bgSurfaceElevated,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"] }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9999, background: "#1f2a4d",
                border: `1px solid ${colors.border}`,
                display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary,
              }}>
                <UserIcon size={14}/>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.display_name || user?.username || "Analyst"}
                </div>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  @{user?.username || "analyst"}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            style={{
              display: "flex", alignItems: "center", gap: spacing["2.5"],
              padding: `${spacing["2.5"]} ${spacing["3.5"]}`, borderRadius: radius.md,
              background: "transparent", color: colors.textSecondary, border: borders.base,
              cursor: "pointer", fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = colors.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colors.textSecondary; }}
          >
            <LogOut size={15}/> Sign out
          </button>
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{
          height: 56, borderBottom: borders.base,
          padding: `0 ${spacing["6"]}`, display: "flex", alignItems: "center",
          justifyContent: "space-between", background: colors.bgSurface,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"] }}>
            <Database size={14} color={colors.textMuted}/>
            <span style={{ fontSize: typography.fontSize.sm, color: colors.textMuted }}>
              Passive monitoring only · no active response
            </span>
          </div>
        </header>
        <div style={{ padding: spacing["6"], minWidth: 0 }}>
          <Outlet />
        </div>
      </main>

    </div>
  );
}

function StyledLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: spacing["2.5"],
        padding: `${spacing["2.5"]} ${spacing["3.5"]}`, borderRadius: radius.md,
        color: isActive ? colors.textPrimary : colors.textSecondary,
        background: isActive ? colors.bgSurfaceElevated : "transparent",
        border: `1px solid ${isActive ? colors.border : "transparent"}`,
        fontWeight: typography.fontWeight.medium,
        fontSize: typography.fontSize.sm,
        textDecoration: "none",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
      })}
    >
      {children}
    </NavLink>
  );
}
