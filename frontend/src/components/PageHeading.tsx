import type { ReactElement, ReactNode } from "react";
import "../styles/PageHeading.css";

// Page title, explanatory copy, and one contextual primary action.
export function PageHeading({ title, detail, action, context }: {
    title: string;
    detail: string;
    action?: ReactNode;
    context?: ReactNode;
}): ReactElement {
    return (
        <header className="page-heading">
            <div>
                {context && <div className="page-heading-context">{context}</div>}
                <h1>{title}</h1>
                <p>{detail}</p>
            </div>
            {action && <div className="page-heading-action">{action}</div>}
        </header>
    );
}
