import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Icon } from "./Icon";
import "../styles/Modal.css";

// Native dialogs provide focus containment, Escape handling, and focus restoration.
export function Modal({ label, onDismiss, children }: {
    label: string;
    onDismiss: () => void;
    children: ReactNode;
}): ReactElement {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        const overflow = document.body.style.overflow;
        dialog?.showModal();
        document.body.style.overflow = "hidden";
        return () => {
            dialog?.close();
            document.body.style.overflow = overflow;
        };
    }, []);
    return (
        <dialog
            ref={ref}
            className="modal"
            aria-label={label}
            onCancel={(event) => {
                event.preventDefault();
                onDismiss();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), a[href], input, select, textarea, summary, "
                    + "[tabindex='0']",
                )).filter((element) => element.getClientRects().length > 0);
                const first = targets[0];
                const last = targets.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right
                    || event.clientY < bounds.top || event.clientY > bounds.bottom) {
                    onDismiss();
                }
            }}
        >
            <button className="quiet-button modal-close" type="button"
                aria-label="Close evaluation form" onClick={onDismiss} autoFocus>
                <Icon name="close" />
            </button>
            {children}
        </dialog>
    );
}
