import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/layout/AppShell";
import { NavigateRegistrar } from "@/components/NavigateRegistrar";
import { PageLoading } from "@/components/PageLoading";

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProfilesPage = lazy(() =>
  import("@/pages/ProfilesPage").then((m) => ({ default: m.ProfilesPage })),
);
const ProfileEditorPage = lazy(() =>
  import("@/pages/ProfileEditorPage").then((m) => ({
    default: m.ProfileEditorPage,
  })),
);
const LogsPage = lazy(() =>
  import("@/pages/LogsPage").then((m) => ({ default: m.LogsPage })),
);
const DnsPage = lazy(() =>
  import("@/pages/DnsPage").then((m) => ({ default: m.DnsPage })),
);
const DiagnosticsPage = lazy(() =>
  import("@/pages/DiagnosticsPage").then((m) => ({
    default: m.DiagnosticsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const AboutPage = lazy(() =>
  import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <NavigateRegistrar />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="profiles" element={<ProfilesPage />} />
            <Route path="profiles/new" element={<ProfileEditorPage />} />
            <Route path="profiles/:id/edit" element={<ProfileEditorPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="dns" element={<DnsPage />} />
            <Route path="diagnostics" element={<DiagnosticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
