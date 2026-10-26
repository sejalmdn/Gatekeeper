"""Safe failure logging for API writes and unexpected HTTP failures."""

import logging
from uuid import UUID

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from gatekeeper.utils.logging import error_context, log_event

# API failures contain route templates and validated identifiers, never submitted values.
logger = logging.getLogger(__name__)


# Observe failures without reading bodies, buffering responses, or changing HTTP behavior.
class ActivityLoggingMiddleware:
    # Retain the next application in the ASGI chain.
    def __init__(self, app: ASGIApp) -> None:
        """Store the wrapped ASGI app; return None."""
        self.app = app

    # Report unsuccessful writes and unexpected errors using safe request metadata.
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Forward scope, receive, and send while logging HTTP failures; return None."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        status = 500

        # Observe only the response status so request and response content stays private.
        async def observe(message: Message) -> None:
            """Forward message to send and retain its HTTP status when present; return None."""
            nonlocal status

            if message["type"] == "http.response.start":
                status = message["status"]

            await send(message)

        try:
            await self.app(scope, receive, observe)
        except Exception as error:
            log_event(
                logger,
                "api.failed",
                level=logging.ERROR,
                **request_context(scope),
                status=500,
                **error_context(error),
            )
            raise

        if status >= 500 or (
            status >= 400 and scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}
        ):
            log_event(
                logger,
                "api.failed",
                level=logging.ERROR if status >= 500 else logging.WARNING,
                **request_context(scope),
                status=status,
            )


# Resolve known route metadata without including raw URLs or invalid parameter values.
def request_context(scope: Scope) -> dict[str, str]:
    """Return the route template, method, and validated resource IDs from an HTTP scope."""
    context = {
        "method": scope["method"],
        "route": getattr(scope.get("route"), "path", "unmatched"),
    }

    for key, value in scope.get("path_params", {}).items():
        if key.endswith("_id"):
            try:
                context[key] = str(UUID(str(value)))
            except ValueError:
                continue

    return context
