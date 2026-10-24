import type { ReactElement } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

// Redirects legacy rule-authoring links into the dataset's scenario workspace.
export function RuleForm(): ReactElement {
  // Reads the legacy route scopes used to build the canonical dataset URL.
  const { projectId = "", recordId = "" } = useParams();

  // Preserves an old scenario shortcut while redirecting saved links.
  const [searchParams] = useSearchParams();
  const scenario = searchParams.get("scenario");
  const query = new URLSearchParams();
  if (scenario) {
    query.set("scenario", scenario);
    query.set("view", "add");
  }
  return (
    <Navigate
      replace
      to={`/projects/${projectId}/datasets/${recordId}?${query.toString()}`}
    />
  );
}
