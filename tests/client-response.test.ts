import { describe, expect, it } from "vitest";
import { readApiResponse } from "../src/lib/client-response";

describe("browser handling of application and hosting responses", () => {
  it("preserves a successful JSON response", async () => {
    await expect(readApiResponse(Response.json({id: "report-1"}), "Failed")).resolves.toEqual({id: "report-1"});
  });
  it("preserves actionable application errors", async () => {
    const response = Response.json({error: {message: "Remove the unreadable source."}}, {status: 400});
    await expect(readApiResponse(response, "Failed")).rejects.toThrow("Remove the unreadable source.");
  });
  it.each([
    [401, "Your access session has expired"],
    [429, "Too many requests"],
    [504, "timed out"],
  ])("explains an HTML hosting error with status %s", async (status, message) => {
    const response = new Response("<html>Infrastructure error</html>", {status: status as number});
    await expect(readApiResponse(response, "Failed")).rejects.toThrow(message as string);
  });
  it("rejects an unreadable success response without exposing its raw body", async () => {
    await expect(readApiResponse(new Response("<html>Unexpected gateway page</html>"), "Failed")).rejects.toThrow("unreadable response");
  });
});
