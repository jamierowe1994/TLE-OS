/**
 * Runs once when a server instance starts, before it takes a request.
 *
 * Builds the schema here (23 Sep 2026) instead of inside whichever request
 * happens to be first. That first request used to be the middleware's switch
 * check, which has 2.5 seconds to answer a page, and a cold schema build on
 * top of it is how five saves were refused on 22 Sep straight after a deploy.
 *
 * The Node half lives in its own file: this one is compiled for the edge too,
 * and only this exact `if` keeps pg out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await (await import("./instrumentation-node")).warmAtBoot();
  }
}
