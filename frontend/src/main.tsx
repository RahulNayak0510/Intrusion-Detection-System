import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import "./styles/global.css";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AlertDetailPage } from "./pages/AlertDetailPage";
import { RequireAuth } from "./components/RequireAuth";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
    },
  },
});

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "alerts/:id", element: <AlertDetailPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root missing");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
