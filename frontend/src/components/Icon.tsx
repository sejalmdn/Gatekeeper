import type { CSSProperties, ReactElement } from "react";

// Local assets keep the current control-plane icon vocabulary explicit and typed.
const ICON_ASSETS = {
    shield: "/assets/icons/shield.svg",
    overview: "/assets/icons/overview.svg",
    evaluation: "/assets/icons/evaluation.svg",
    candidate: "/assets/icons/candidate.svg",
    dataset: "/assets/icons/dataset.svg",
    config: "/assets/icons/config.svg",
    arrow: "/assets/icons/arrow.svg",
    plus: "/assets/icons/plus.svg",
    lock: "/assets/icons/lock.svg",
    folder: "/assets/icons/folder.svg",
    info: "/assets/icons/info.svg",
    search: "/assets/icons/search.svg",
    close: "/assets/icons/close.svg",
    chevron: "/assets/icons/chevron.svg",
} as const;

// Icon names keep navigation and feature labels consistent.
export type IconName = keyof typeof ICON_ASSETS;

// Render decorative assets as masks so every icon inherits the surrounding text color.
export function Icon({ name }: { name: IconName }): ReactElement {
    return (
        <span
            className="icon"
            aria-hidden="true"
            style={{ "--icon-mask": `url(${ICON_ASSETS[name]})` } as CSSProperties}
        />
    );
}
