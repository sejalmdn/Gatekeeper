import type { ReactElement } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { getProject } from "../api";
import { useLoad } from "../hooks/useLoad";
import { Brand } from "./Brand";
import { LoadBoundary } from "./Feedback";
import { Icon, type IconName } from "./Icon";
import "../styles/Workspace.css";

// Navigation reflects the implemented record types only.
const NAVIGATION: { path: string; label: string; icon: IconName }[] = [
  { path: "", label: "Overview", icon: "overview" },
  { path: "providers", label: "Providers", icon: "config" },
  { path: "candidates", label: "Candidates", icon: "candidate" },
  { path: "datasets", label: "Datasets", icon: "dataset" },
];

// Remount route-bound readers when project or record parameters change.
export function ProjectLayout(): ReactElement {
  const { projectId = "" } = useParams();
  return <Workspace key={projectId} projectId={projectId} />;
}

// Persistent navigation and project context surround the current record page.
function Workspace({ projectId }: { projectId: string }): ReactElement {
  const state = useLoad(() => getProject(projectId));
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = pathname.split("/")[3] ?? "";
  const label =
    NAVIGATION.find((item) => item.path === section)?.label ?? "Overview";
  const isCollection = pathname.split("/").filter(Boolean).length <= 3;
  return (
    <LoadBoundary state={state}>
      {(project) => (
        <div className="workspace">
          <a className="skip-link" href="#workspace-content">
            Skip to content
          </a>
          <aside className="workspace-sidebar">
            <div className="workspace-brand">
              <Brand />
            </div>
            <Link className="workspace-project" to="/" title="Switch project">
              <Icon name="folder" />
              <span title={project.name}>{project.name}</span>
            </Link>
            <div className="workspace-nav-label">Navigation</div>
            <nav className="workspace-nav" aria-label="Project navigation">
              {NAVIGATION.map((item) => (
                <NavLink
                  key={item.path}
                  end={!item.path}
                  to={`/projects/${projectId}${item.path ? `/${item.path}` : ""}`}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="workspace-note">
              <div className="workspace-note-title">
                <Icon name="lock" />
                <strong>Controlled inputs</strong>
              </div>
              <dl>
                <div>
                  <dt>Scope</dt>
                  <dd>Project</dd>
                </div>
                <div>
                  <dt>Scenarios</dt>
                  <dd>Typed</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>Offline</dd>
                </div>
              </dl>
              <p>Workflow evaluation control plane</p>
            </div>
          </aside>
          <div className="workspace-main hud-grid">
            <header className="workspace-topbar">
              <nav aria-label="Breadcrumb" className="workspace-breadcrumb">
                <Link to="/">Workspace</Link>
                <span aria-hidden="true">/</span>
                <Link to={`/projects/${projectId}`}>{project.name}</Link>
                <span aria-hidden="true">/</span>
                <span className="badge badge-amber" aria-current="page">
                  {label}
                </span>
              </nav>
              <div className="workspace-tools">
                {isCollection && (
                  <label className="workspace-search">
                    <Icon name="search" />
                    <input
                      type="search"
                      aria-label={
                        section
                          ? `Search ${label.toLowerCase()}`
                          : "Search project resources"
                      }
                      placeholder={
                        section
                          ? `Search ${label.toLowerCase()}…`
                          : "Search project resources…"
                      }
                      value={searchParams.get("q") ?? ""}
                      onChange={(event) => {
                        const next = new URLSearchParams(searchParams);
                        if (event.target.value) {
                          next.set("q", event.target.value);
                        } else next.delete("q");
                        setSearchParams(next, { replace: true });
                      }}
                    />
                  </label>
                )}
              </div>
            </header>
            <main
              id="workspace-content"
              className="workspace-content"
              tabIndex={-1}
            >
              <Outlet key={pathname} context={project} />
            </main>
          </div>
        </div>
      )}
    </LoadBoundary>
  );
}
