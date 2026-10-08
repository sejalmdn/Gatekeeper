import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProject, listProjects } from "../api";
import { Brand } from "../components/Brand";
import { LoadBoundary } from "../components/Feedback";
import "../styles/FormFields.css";
import { PageHeading } from "../components/PageHeading";
import { Icon } from "../components/Icon";
import { useLoad } from "../hooks/useLoad";
import { messageFor, timestamp } from "../utils/format";
import "../styles/ProjectsPage.css";

// Choose a workspace or create a project using the existing project contract.
export function ProjectsPage(): ReactElement {
    const projects = useLoad(listProjects);
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);

    // Create a project and enter its workspace after the API confirms creation.
    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const project = await createProject(name);
            navigate(`/projects/${project.id}`);
        } catch (requestError) {
            setError(messageFor(requestError));
        } finally {
            setSaving(false);
        }
    }
    return (
        <div className="projects-shell hud-grid">
            <header className="projects-header">
                <Brand />
                <span className="badge badge-cyan"><Icon name="lock" />Control plane</span>
            </header>
            <main className="projects-page">
                <PageHeading title="Project workspaces"
                    detail="Manage each application's candidates, datasets, and evaluations."
                    context={<span className="badge badge-amber">Gatekeeper control plane</span>} />
                <div className="projects-grid">
                    <section className="project-directory" aria-labelledby="existing-projects">
                        <div className="project-directory-heading">
                            <h2 id="existing-projects">Your projects</h2>
                            <span>{projects.data?.length ?? "—"}</span>
                        </div>
                        <LoadBoundary state={projects}>
                            {(items) => items.length ? (
                                <ul>{items.map((project) => (
                                    <li key={project.id}>
                                        <Link to={`/projects/${project.id}`}>
                                            <span className="project-directory-icon">
                                                <Icon name="folder" />
                                            </span>
                                            <span className="project-directory-name">
                                                <strong>{project.name}</strong>
                                                <small>
                                                    Created {timestamp(project.created_at)}
                                                </small>
                                            </span>
                                            <Icon name="arrow" />
                                        </Link>
                                    </li>
                                ))}</ul>
                            ) : (
                                <div className="project-directory-empty">
                                    <Icon name="folder" />
                                    <h3>Your first project starts here</h3>
                                    <p>Create a project to organize your evaluation records.</p>
                                </div>
                            )}
                        </LoadBoundary>
                    </section>
                    <section className="project-create" aria-labelledby="create-project">
                        <Icon name="plus" />
                        <h2 id="create-project">Create a project</h2>
                        <p>A workspace for one application and its evaluation inputs.</p>
                        <form onSubmit={submit} aria-busy={saving}>
                            <label className="form-field" htmlFor="project-name">
                                <span>Project name</span>
                                <input
                                    id="project-name"
                                    value={name}
                                    required
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="e.g. checkout-core"
                                />
                            </label>
                            {error && <p className="form-error" role="alert">{error}</p>}
                            <button disabled={saving}>
                                {saving ? "Creating…" : "Create project"}
                                <Icon name="arrow" />
                            </button>
                        </form>
                    </section>
                </div>
                <footer className="projects-footer">
                    <Icon name="lock" />
                    Versioned inputs. Immutable records. Credible measurement.
                </footer>
            </main>
        </div>
    );
}
