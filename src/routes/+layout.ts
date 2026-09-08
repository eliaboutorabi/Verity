/**
 * One page, rendered at build time, with no server behind it.
 *
 * Prerendering is what makes this deployable to a static host; turning the
 * server off is what makes it honest. Every request the app makes goes straight
 * from the browser to the upstream that answers it, on the reader's own key —
 * so there is nothing for a server to do during a session and nothing for one
 * to see.
 */

export const prerender = true;
export const ssr = false;
