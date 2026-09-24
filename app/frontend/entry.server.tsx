import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import type { EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "../backend/common/shopify/shopify-app.server";

export const streamTimeout = 5000;
const ABORT_DELAY_MS = streamTimeout + 1000;

type ReadyEvent = "onAllReady" | "onShellReady";

function readyEventFor(request: Request): ReadyEvent {
  const userAgent = request.headers.get("user-agent");
  return isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
}

function toHtmlResponse(
  pipe: (destination: PassThrough) => void,
  headers: Headers,
  status: number,
): Response {
  const body = new PassThrough();
  const stream = createReadableStreamFromReadable(body);

  headers.set("Content-Type", "text/html");
  const response = new Response(stream, {
    headers,
    status,
  });
  pipe(body);
  return response;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const readyEvent = readyEventFor(request);

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [readyEvent]: () => {
          resolve(toHtmlResponse(pipe, responseHeaders, responseStatusCode));
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Abort after streamTimeout plus a buffer so React can flush rejected boundaries.
    setTimeout(abort, ABORT_DELAY_MS);
  });
}
