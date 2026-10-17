# Credentials for a simple self-hosted deployment

## Scope

Gatekeeper's initial self-hosted deployment reads provider credentials from environment variables
and stores only references such as `env://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY` in SQLite. This
assumes one trusted, operator-controlled backend whose administrators configure providers.

Resolved credentials must never be stored, returned by an API, logged, included in evidence, or
placed in a candidate prompt. Replace this approach with a managed secret store if Gatekeeper
becomes hosted, multi-tenant, or distributed across independently managed workers.

## Reference format

Credential variables must match `GATEKEEPER_CREDENTIAL_[A-Z][A-Z0-9_]*`. Provider records store
the variable name with the `env://` scheme, not the secret value:

| Connection | Environment variable | Provider credential reference |
|---|---|---|
| OpenAI primary | `GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY` | `env://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY` |
| Anthropic primary | `GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY` | `env://GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY` |
| Internal agent | `GATEKEEPER_CREDENTIAL_INTERNAL_AGENT` | `env://GATEKEEPER_CREDENTIAL_INTERNAL_AGENT` |

The required prefix prevents provider configuration from reading unrelated environment variables.
Use a separate variable for each independently managed provider connection.

## Lifecycle

```text
Operator exports variable -> provider stores reference -> evaluation loads provider
    -> resolver reads variable -> provider adapter authenticates its request
```

Validate reference syntax when creating a provider, but do not require the variable to exist then.
Resolve it only when starting an evaluation attempt. Provider adapters may unwrap the secret only
while constructing transport authentication; it must not enter model or agent input.

## Resolver contract

The resolver in `src/gatekeeper/resolver.py`:

1. Validates the complete reference against the allowed scheme, prefix, and uppercase name format.
2. Extracts the variable name only after validation succeeds.
3. Reads that exact variable from the Gatekeeper process environment.
4. Rejects missing, empty, and whitespace-only values with a non-sensitive error.
5. Returns the value as a redacted `SecretStr` for use by the provider adapter.

It never searches the environment, accepts arbitrary variable names, or exposes the resolved value.

## Starting Gatekeeper

Enter and export every required provider credential before starting the application:

```bash
read -rsp "OpenAI API key: " GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY
export GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY
echo
read -rsp "Anthropic API key: " GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY
export GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY
echo
read -rsp "Internal agent token: " GATEKEEPER_CREDENTIAL_INTERNAL_AGENT
export GATEKEEPER_CREDENTIAL_INTERNAL_AGENT
echo
.venv/bin/uvicorn gatekeeper.app:app
```

Containers require explicit forwarding:

```bash
docker run \
  -e GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY \
  -e GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY \
  -e GATEKEEPER_CREDENTIAL_INTERNAL_AGENT \
  gatekeeper
```

Protected environment files may also be used, but must stay outside the repository and must not be
committed.

## Validation and failures

Reject malformed references and missing, empty, or whitespace-only values. Credential failures are
infrastructure or configuration failures, never candidate failures, and must not affect evaluation
scores. Use machine-readable reasons such as `credential_reference_invalid`,
`credential_unavailable`, and `credential_not_allowed_for_provider`.

Only send credentials to approved provider destinations. Production deployments should require
HTTPS, reject credentials embedded in URLs, and bind references to allowed provider types and hosts
when provider configuration is not fully trusted.

## Rotation and limitations

To rotate a credential, stop Gatekeeper, replace the environment value, restart and verify the
connection, then revoke the old key. The SQLite reference remains unchanged. Running processes do
not receive later changes made in a parent shell.

Environment variables provide no audit history, automatic rotation, or centralized access control.
Every Gatekeeper instance must receive its required variables, and users with sufficient operating
system access may be able to inspect them.
