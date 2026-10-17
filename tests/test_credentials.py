"""Environment credential resolution tests."""

import pytest
from pydantic import SecretStr

from gatekeeper.resolver import CredentialUnavailableError, resolve_environment_credential


# Resolve valid provider variables into redacted secret wrappers.
def test_resolve_environment_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    variable_name = "GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY"
    monkeypatch.setenv(variable_name, "configured-secret")

    credential = resolve_environment_credential(f"env://{variable_name}")

    assert isinstance(credential, SecretStr)
    assert str(credential) == "**********"
    assert credential.get_secret_value() == "configured-secret"


# Reject references outside the dedicated credential namespace.
@pytest.mark.parametrize(
    "reference",
    [
        "env:GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY",
        "vault://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY",
        "env://OPENAI_API_KEY",
        "env://GATEKEEPER_CREDENTIAL_openai",
        "env://GATEKEEPER_CREDENTIAL_OPENAI-PRIMARY",
        "env://GATEKEEPER_CREDENTIAL_1OPENAI",
    ],
)
def test_resolve_environment_credential_rejects_malformed_references(reference: str) -> None:
    with pytest.raises(
        CredentialUnavailableError, match="Invalid environment credential reference"
    ):
        resolve_environment_credential(reference)


# Reject absent and blank values with a non-sensitive error.
@pytest.mark.parametrize("value", [None, "", "  \t  "])
def test_resolve_environment_credential_rejects_unavailable_values(
    monkeypatch: pytest.MonkeyPatch, value: str | None
) -> None:
    variable_name = "GATEKEEPER_CREDENTIAL_UNAVAILABLE"
    if value is None:
        monkeypatch.delenv(variable_name, raising=False)
    else:
        monkeypatch.setenv(variable_name, value)

    with pytest.raises(CredentialUnavailableError) as error:
        resolve_environment_credential(f"env://{variable_name}")

    assert str(error.value) == "The configured credential is unavailable."


# Keep independently configured provider credentials separate.
def test_resolve_environment_credentials_independently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY", "openai-secret")
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY", "anthropic-secret")

    openai = resolve_environment_credential(
        "env://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY"
    )
    anthropic = resolve_environment_credential(
        "env://GATEKEEPER_CREDENTIAL_ANTHROPIC_PRIMARY"
    )

    assert openai.get_secret_value() == "openai-secret"
    assert anthropic.get_secret_value() == "anthropic-secret"
