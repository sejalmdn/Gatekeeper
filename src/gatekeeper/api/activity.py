"""Safe summaries for API writes and unexpected HTTP failures."""

import logging
from time import perf_counter
from uuid import UUID

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# API summaries contain route templates and validated identifiers, never submitted values.
logger = logging.getLogger(__name__)


# Observe writes and failures without reading bodies or buffering responses.
class ActivityLoggingMiddleware:
    # Retain the next application in the ASGI chain.
    def __init__(self, app: ASGIApp) -> None:
        """Store the wrapped ASGI app; return None."""
        self.app = app

    # Summarize operation outcomes while allowing the framework to handle original exceptions.
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Forward scope/receive/send and log write outcomes or failures; return None."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = perf_counter()
        status = 500

        # Observe only status so request and response content stays private.
        async def observe(message: Message) -> None:
            """Forward message to send and retain its HTTP status when present; return None."""
            nonlocal status

            if message["type"] == "http.response.start":
                status = message["status"]

            await send(message)

        try:
            await self.app(scope, receive, observe)
        except Exception:
            context = request_context(scope)
            logger.exception(
                "api_operation_failed method=%s route=%s project_id=%s run_id=%s "
                "status=500 duration_ms=%d error_code=unhandled_exception",
                scope["method"],
                context["route"],
                context.get("project_id"),
                context.get("run_id"),
                (perf_counter() - started) * 1000,
            )
            raise

        if scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"} and status < 500:
            return

        context = request_context(scope)
        error_code = {
            404: "resource_not_found",
            409: "resource_conflict",
            422: "validation_failed",
        }.get(status, "http_error" if status >= 400 else "none")
        event = "api_operation_completed"
        level = logging.INFO

        if status >= 500:
            event, level = "api_operation_failed", logging.ERROR
        elif status >= 400:
            event, level = "api_operation_rejected", logging.WARNING

        logger.log(
            level,
            "%s method=%s route=%s project_id=%s dataset_id=%s run_id=%s "
            "execution_id=%s status=%d duration_ms=%d error_code=%s",
            event,
            scope["method"],
            context["route"],
            context.get("project_id"),
            context.get("dataset_id"),
            context.get("run_id"),
            context.get("execution_id"),
            status,
            (perf_counter() - started) * 1000,
            error_code,
        )


# Resolve known route metadata without including raw URLs or invalid parameter values.
def request_context(scope: Scope) -> dict[str, str]:
    """Return the route template and validated resource IDs from an HTTP scope."""
    context = {"route": getattr(scope.get("route"), "path", "unmatched")}

    for key, value in scope.get("path_params", {}).items():
        if key.endswith("_id"):
            try:
                context["run_id" if key == "evaluation_run_id" else key] = str(UUID(str(value)))
            except ValueError:
                continue

    return context
