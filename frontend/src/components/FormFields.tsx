import type { ReactElement } from "react";
import "../styles/FormFields.css";

export { JsonInput } from "./JsonInput";

interface SourceSelectOption {
  id: string;
  label: string;
}

interface SourceSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: SourceSelectOption[];
}

// Select one related project resource.
export function SourceSelect({
  id,
  label,
  value,
  onChange,
  placeholder,
  options,
}: SourceSelectProps): ReactElement {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
