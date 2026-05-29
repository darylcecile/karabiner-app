import { isRecord } from "@karabiner/shared";

export class JsonRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "JsonRequestError";
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new JsonRequestError(
      415,
      "unsupported_media_type",
      "Expected an application/json request body."
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new JsonRequestError(400, "invalid_json", "Request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new JsonRequestError(400, "invalid_json_object", "Request body must be a JSON object.");
  }

  return body;
}
