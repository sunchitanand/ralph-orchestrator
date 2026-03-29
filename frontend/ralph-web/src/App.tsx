import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout";
import { TasksPage, PlanPage, BuilderPage, TaskDetailPage, SettingsPage, PresetsPage, LoopsPage } from "./pages";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/presets" element={<PresetsPage />} />
        <Route path="/loops" element={<LoopsPage />} />
        <Route path="/loops/:id" element={<Navigate to="/loops" replace />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  );
}
