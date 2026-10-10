import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import "../styles/Brand.css";

// Local shield wordmark shared by the project picker and workspace.
export function Brand(): ReactElement {
  return (
    <Link className="brand" to="/" aria-label="Gatekeeper projects">
      <span className="brand-mark">
        <Icon name="shield" />
      </span>
      <span className="brand-copy">
        <strong>Gatekeeper</strong>
        <small>Workflow evaluation</small>
      </span>
    </Link>
  );
}
