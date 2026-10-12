import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, AlertTriangle, Lock, User as UserIcon } from "lucide-react";
import { fetchMe, login as apiLogin, setToken, setUser } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Label, TextInput } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { borders, colors, radius, spacing, typography } from "../tokens";

export function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";
  const [username, setU] = useState("");
  const [password, setP] = useState("");

  const loginMut = useMutation({
    mutationFn: async () => {
      const { token } = await apiLogin({ username, password });
      setToken(token);
      try {
        const me = await fetchMe();
        setUser(me);
      } catch {}
      return token;
    },
    onSuccess: () => {
      try {
        const clean = redirect.startsWith("/") ? redirect : "/dashboard";
        nav(clean, { replace: true });
      } catch {
        nav("/dashboard", { replace: true });
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    loginMut.mutate();
  };

  const err = loginMut.error as any;
  const status = err?.response?.status;

  return (
    <div style={{
      minHeight: "100vh", background: colors.bgRoot, color: colors.textPrimary,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: spacing["6"], position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(1200px 500px at 20% -10%, rgba(79,70,229,0.15), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(220,38,38,0.08), transparent 60%)`,
        pointerEvents: "none",
      }}/>
      <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"], marginBottom: spacing["6"] }}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: `linear-gradient(135deg, ${colors.primary}, #6366f1)`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>
            <Shield size={22} strokeWidth={2.2}/>
          </div>
          <div>
            <div style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>NIDS Console</div>
            <div style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
              Defensive network intrusion detection · Sign in as analyst
            </div>
          </div>
        </div>

        <div style={{
          background: colors.bgSurface, border: borders.base, borderRadius: radius.lg,
          padding: spacing["6"],
        }}>
          <div style={{ marginBottom: spacing["5"] }}>
            <div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold }}>Sign in</div>
            <div style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: spacing["1"] }}>
              Credentials are configured in <code style={{ padding: "1px 5px", borderRadius: 3, background: colors.bgSurfaceElevated, border: borders.base }}>.env</code>
            </div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: spacing["4"] }}>
            <div>
              <Label htmlFor="u" required>Username</Label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: spacing["3"], top: "50%", transform: "translateY(-50%)", color: colors.textMuted }}>
                  <UserIcon size={14}/>
                </div>
                <TextInput id="u" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} placeholder="analyst" style={{ paddingLeft: 36 }}/>
              </div>
            </div>
            <div>
              <Label htmlFor="p" required>Password</Label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: spacing["3"], top: "50%", transform: "translateY(-50%)", color: colors.textMuted }}>
                  <Lock size={14}/>
                </div>
                <TextInput id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 36 }}/>
              </div>
            </div>

            {status === 401 && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: spacing["2"],
                padding: spacing["3"], borderRadius: radius.md,
                background: "#1a1020", border: `1px solid #3b1f2b`,
                color: "#fecaca", fontSize: typography.fontSize.sm,
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }}/>
                <span>Invalid credentials. Check <code style={{ padding: "1px 5px", borderRadius: 3, background: "#261528", border: `1px solid #3b1f2b` }}>FIRST_ADMIN_USERNAME / FIRST_ADMIN_PASSWORD</code> in your <code style={{ padding: "1px 5px", borderRadius: 3, background: "#261528", border: `1px solid #3b1f2b` }}>.env</code> file.</span>
              </div>
            )}
            {loginMut.error && status !== 401 && (
              <div style={{
                display: "flex", alignItems: "center", gap: spacing["2"],
                padding: spacing["3"], borderRadius: radius.md,
                background: "#0a1025", border: `1px solid ${colors.border}`,
                color: colors.textSecondary, fontSize: typography.fontSize.sm,
              }}>
                <AlertTriangle size={15}/>
                <span>Unexpected error: {String((loginMut.error as any)?.message || loginMut.error)}</span>
              </div>
            )}

            <Button type="submit" disabled={!username || !password || loginMut.isPending}>
              {loginMut.isPending ? "Signing in…" : "Sign in"}
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: spacing["2"], justifyContent: "space-between", marginTop: spacing["1"], flexWrap: "wrap" }}>
              <Badge tone="info">Passive monitoring only</Badge>
              <Badge tone="low">Live capture off by default</Badge>
            </div>
          </form>
        </div>

        <div style={{ marginTop: spacing["4"], color: colors.textMuted, fontSize: typography.fontSize.xs, lineHeight: 1.5 }}>
          Authorized networks only. Do not monitor networks you do not own or have explicit permission to monitor.
        </div>
      </div>
    </div>
  );
}
