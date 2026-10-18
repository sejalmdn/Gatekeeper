import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createProvider, getProvider, listProviders } from "../api";
import { SourceSelect } from "../components/FormFields";
import { LoadBoundary } from "../components/Feedback";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { ProviderTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import { messageFor } from "../utils/format";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

// Provider list page.
export function ProvidersPage(): ReactElement {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listProviders(projectId));
  return (
    <RecordList
      title="Providers"
      detail="Connections available to project candidates."
      action="Create provider"
      actionPath="new"
      state={state}
      projectId={projectId}
      render={(items) => (
        <ProviderTable providers={items} projectId={projectId} />
      )}
      kind="provider"
    />
  );
}

// Create a provider connection record.
export function ProviderForm(): ReactElement {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  // Requires an explicit choice from the supported provider services.
  const [providerType, setProviderType] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credentialRef, setCredentialRef] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Persist the provider and open its detail page.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const provider = await createProvider(projectId, {
        name,
        provider_type: providerType,
        base_url: baseUrl || null,
        credential_ref: credentialRef,
      });
      navigate(`/projects/${projectId}/providers/${provider.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Create provider"
      detail="Register connection metadata and a secure credential reference."
      submitLabel="Create provider"
      error={error}
      saving={saving}
      onSubmit={submit}
      onCancel={() => navigate(`/projects/${projectId}/providers`)}
    >
      <div className="form-row">
        <TextField
          id="provider-name"
          label="Name"
          value={name}
          onChange={setName}
          placeholder="OpenAI primary"
        />
        <SourceSelect
          id="provider-type"
          label="Provider type"
          value={providerType}
          onChange={setProviderType}
          placeholder="Select a provider type"
          options={[
            {
              id: "openai",
              label: "OpenAI",
            },
            {
              id: "anthropic",
              label: "Anthropic",
            },
            {
              id: "google",
              label: "Google",
            },
            {
              id: "groq",
              label: "Groq",
            },
            {
              id: "openrouter",
              label: "OpenRouter",
            },
          ]}
        />
      </div>
      <TextField
        id="provider-base-url"
        label="Base URL (optional)"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://api.example.com/v1"
        required={false}
      />
      <TextField
        id="credential-ref"
        label="Credential reference"
        value={credentialRef}
        onChange={setCredentialRef}
        placeholder="env://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY"
      />
    </RecordForm>
  );
}

// Provider detail page.
export function ProviderDetail(): ReactElement {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getProvider(projectId, recordId));
  return (
    <LoadBoundary state={state}>
      {(provider) => (
        <RecordDetails
          title={provider.name}
          detail="Provider connection metadata for this project."
          backTo={`/projects/${projectId}/providers`}
          backLabel="Back to providers"
          createdAt={provider.created_at}
        >
          <section className="detail-section detail-grid">
            <div>
              <h2>Provider type</h2>
              <p>{provider.provider_type}</p>
            </div>
            <div>
              <h2>Base URL</h2>
              <p>{provider.base_url ?? "Provider default"}</p>
            </div>
            <div>
              <h2>Credential reference</h2>
              <p>{provider.credential_ref}</p>
            </div>
          </section>
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}

// Small text input shared within provider creation.
function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = true,
}: TextFieldProps): ReactElement {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
