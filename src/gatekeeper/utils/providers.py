"""Internal adapter selection for supported provider services."""

from gatekeeper.contracts.providers import ProviderType

# Default invocation protocol frozen into each new candidate.
PROVIDER_ADAPTERS: dict[ProviderType, str] = {
    ProviderType.OPENAI: "openai_responses",
    ProviderType.ANTHROPIC: "anthropic_messages",
    ProviderType.GOOGLE: "google_generate_content",
    ProviderType.GROQ: "openai_chat_completions",
    ProviderType.OPENROUTER: "openai_chat_completions",
}
