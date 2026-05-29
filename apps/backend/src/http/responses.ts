import type { Env } from "../types";

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());

  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };
  }

  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

export function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export function errorResponse(
  request: Request,
  env: Env,
  status: number,
  code: string,
  message: string
): Response {
  return jsonResponse(request, env, { error: { code, message } }, { status });
}

export function optionsResponse(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}
