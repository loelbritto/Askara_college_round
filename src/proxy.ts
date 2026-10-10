import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const screening=request.nextUrl.pathname==="/screen";
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : screening ? " 'wasm-unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'${screening ? " https://huggingface.co https://*.hf.co" : ""}${dev ? " ws://127.0.0.1:3000 ws://localhost:3000" : ""}; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce",nonce);
  requestHeaders.set("Content-Security-Policy",csp);
  const response = NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set("Content-Security-Policy",csp);
  response.headers.set("Cache-Control","no-store");
  return response;
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|icon.svg|pdf.worker.min.mjs|screen-worker.js|models-runtime|downloads).*)"] };
