import type { ReactElement } from "react";
import { Route, Routes, useLocation, type Location } from "react-router-dom";
import { ProjectLayout } from "./components/Workspace";
import { CandidateDetail, CandidateForm, CandidatesPage } from "./pages/Candidates";
import { ConfigDetail, ConfigForm, ConfigsPage } from "./pages/Configurations";
import { DatasetDetail, DatasetForm, DatasetsPage } from "./pages/Datasets";
import {
    EvaluationDetail, EvaluationForm, EvaluationModal, EvaluationsPage,
} from "./pages/Evaluations";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";

// Application wiring stays separate from page behavior and reusable components.
export default function App(): ReactElement {
    const location = useLocation();
    const background = (location.state as { backgroundLocation?: Location } | null)
        ?.backgroundLocation;
    return (<>
        <Routes location={background ?? location}>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="candidates" element={<CandidatesPage />} />
                <Route path="candidates/new" element={<CandidateForm />} />
                <Route path="candidates/:recordId" element={<CandidateDetail />} />
                <Route path="datasets" element={<DatasetsPage />} />
                <Route path="datasets/new" element={<DatasetForm />} />
                <Route path="datasets/:recordId" element={<DatasetDetail />} />
                <Route path="configs" element={<ConfigsPage />} />
                <Route path="configs/new" element={<ConfigForm />} />
                <Route path="configs/:recordId" element={<ConfigDetail />} />
                <Route path="evaluations" element={<EvaluationsPage />} />
                <Route path="evaluations/new" element={<EvaluationForm />} />
                <Route path="evaluations/:recordId" element={<EvaluationDetail />} />
            </Route>
            <Route path="*" element={<ProjectsPage />} />
        </Routes>
        {background && <Routes>
            <Route path="/projects/:projectId/evaluations/new" element={<EvaluationModal />} />
        </Routes>}
    </>);
}
