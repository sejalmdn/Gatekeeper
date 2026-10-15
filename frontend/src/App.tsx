import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { ProjectLayout } from "./components/Workspace";
import {
  CandidateDetail,
  CandidateForm,
  CandidatesPage,
} from "./pages/Candidates";
import { DatasetForm } from "./pages/DatasetForm";
import { DatasetDetail, DatasetsPage } from "./pages/Datasets";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProviderDetail, ProviderForm, ProvidersPage } from "./pages/Providers";

// Application wiring stays separate from page behavior and reusable components.
export default function App(): ReactElement {
  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="providers/new" element={<ProviderForm />} />
          <Route path="providers/:recordId" element={<ProviderDetail />} />
          <Route path="candidates" element={<CandidatesPage />} />
          <Route path="candidates/new" element={<CandidateForm />} />
          <Route path="candidates/:recordId" element={<CandidateDetail />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="datasets/new" element={<DatasetForm />} />
          <Route path="datasets/:recordId" element={<DatasetDetail />} />
        </Route>
        <Route path="*" element={<ProjectsPage />} />
      </Routes>
    </>
  );
}
