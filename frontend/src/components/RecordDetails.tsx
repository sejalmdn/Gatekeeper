import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "./PageHeading";
import { RecordMetadata } from "./RecordData";
import "../styles/RecordDetails.css";

interface RecordDetailsProps {
  title: string;
  detail: string;
  backTo: string;
  backLabel: string;
  createdAt: string;
  children: ReactNode;
}

// Shared read-only resource frame preserves navigation and creation metadata.
export function RecordDetails({
  title,
  detail,
  backTo,
  backLabel,
  createdAt,
  children,
}: RecordDetailsProps): ReactElement {
  return (
    <section className="page-content">
      <PageHeading
        title={title}
        detail={detail}
        action={
          <Link className="quiet-link" to={backTo}>
            {backLabel}
          </Link>
        }
      />
      <RecordMetadata createdAt={createdAt} />
      {children}
    </section>
  );
}
