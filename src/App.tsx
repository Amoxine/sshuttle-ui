import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { DiagnosticsPage } from "@/pages/DiagnosticsPage";
import { DnsPage } from "@/pages/DnsPage";
import { LogsPage } from "@/pages/LogsPage";
import { ProfileEditorPage } from "@/pages/ProfileEditorPage";
import { ProfilesPage } from "@/pages/ProfilesPage";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
