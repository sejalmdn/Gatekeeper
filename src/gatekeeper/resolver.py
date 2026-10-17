"""Environment-backed provider credential resolution."""

import os
import re

from pydantic import SecretStr

# Strict reference format for allowed provider credential variables.
ENVIRONMENT_REFERENCE = re.compile(r"env://(GATEKEEPER_CREDENTIAL_[A-Z][A-Z0-9_]*)\Z")


# Credential resolution failure.
class CredentialUnavailableError(RuntimeError):
    """Indicates that a configured credential cannot be resolved."""


# Resolve an environment credential without exposing its value.
def resolve_environment_credential(reference: str) -> SecretStr:
    match = ENVIRONMENT_REFERENCE.fullmatch(reference)
    if match is None:
        raise CredentialUnavailableError("Invalid environment credential reference.")

    value = os.environ.get(match.group(1))
    if value is None or not value.strip():
        raise CredentialUnavailableError("The configured credential is unavailable.")

    return SecretStr(value)
