import type { ReactElement } from "react";
import "../styles/FormFields.css";

interface JsonInputProps {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

// Labeled structured input for the existing JSON creation contracts.
export function JsonInput({
  id,
  label,
  help,
  value,
  onChange,
  required = true,
}: JsonInputProps): ReactElement {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <small id={`${id}-help`}>{help}</small>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-describedby={`${id}-help`}
        required={required}
      />
    </label>
  );
}

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
