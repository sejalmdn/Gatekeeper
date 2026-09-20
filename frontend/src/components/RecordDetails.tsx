import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "./PageHeading";
import { RecordMetadata } from "./RecordData";
import "../styles/RecordDetails.css";

// Shared read-only record frame preserves navigation and integrity metadata.
export function RecordDetails({
    title, detail, backTo, backLabel, createdAt, digestLabel, digest, children,
}: {
    title: string;
    detail: string;
    backTo: string;
    backLabel: string;
    createdAt: string;
    digestLabel?: string;
    digest?: string;
    children: ReactNode;
}): ReactElement {
    return (
        <section className="page-content">
            <PageHeading
                title={title}
                detail={detail}
                action={<Link className="quiet-link" to={backTo}>{backLabel}</Link>}
            />
            <RecordMetadata createdAt={createdAt} digestLabel={digestLabel} digest={digest} />
            {children}
        </section>
    );
}
