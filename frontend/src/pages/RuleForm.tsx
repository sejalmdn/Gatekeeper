import type { ReactElement } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

// Redirects legacy rule-authoring links into the dataset's canonical rule tab.
export function RuleForm(): ReactElement {
  // Reads the legacy route scopes used to build the canonical dataset URL.
  const { projectId = "", recordId = "" } = useParams();

  // Preserves an old scenario shortcut while redirecting saved links.
  const [searchParams] = useSearchParams();
  const scenario = searchParams.get("scenario");
  const query = new URLSearchParams({ tab: "rules", view: "add" });
  if (scenario) query.set("scenario", scenario);
  return (
    <Navigate
      replace
      to={`/projects/${projectId}/datasets/${recordId}?${query.toString()}`}
    />
  );
}
