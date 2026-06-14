import { NextResponse } from "next/server";

export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export function getRequestContentLength(request: Request) {
  const rawContentLength = request.headers.get("content-length")?.trim();

  if (!rawContentLength) {
    return null;
  }

  const contentLength = Number(rawContentLength);

  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return null;
  }

  return contentLength;
}

export async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number
) {
  const contentLength = getRequestContentLength(request);

  if (contentLength !== null && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(maxBytes);
    }

    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

export async function readRequestJsonWithLimit<T>(
  request: Request,
  maxBytes: number
) {
  const rawBody = await readRequestTextWithLimit(request, maxBytes);

  return JSON.parse(rawBody) as T;
}

export function buildRequestBodyTooLargeResponse(maxBytes: number) {
  return NextResponse.json(
    {
      error: `El cuerpo de la petición no puede superar ${maxBytes} bytes.`,
    },
    { status: 413 }
  );
}
