/**
 * Every API route runs inside withErrors: an uncaught throw is logged as structured JSON,
 * persisted to the error store, and answered as a generic 500 carrying the request id,
 * so the report ("Reference ab12cd34…") points at the log line and the stored row.
 * Answers carry no-store unless the handler set its own Cache-Control (the gallery files).
 */
import { NO_STORE_VALUE } from "./cache";
import { recordError, buildErrorRow } from "./errors";
import { logError, requestId } from "./log";

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** Wrap a route handler so no throw ever leaks a stack or an internal sentence to the caller. */
export function withErrors<C>(route: string, handler: Handler<C>): Handler<C> {
  return async (req: Request, ctx: C): Promise<Response> => {
    const id = requestId();
    try {
      const res = await handler(req, ctx);
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", NO_STORE_VALUE);
      return res;
    } catch (e) {
      logError(route, "uncaught error", e, id);
      await recordError(buildErrorRow(route, "server", e, id));
      return Response.json(
        { error: "Something went wrong on our side. Try again in a moment.", requestId: id },
        { status: 500, headers: { "x-request-id": id, "cache-control": NO_STORE_VALUE } },
      );
    }
  };
}
