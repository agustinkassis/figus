import type { EventTemplate } from "nostr-tools";
import type { Identity } from "./identity";
import { signEvent } from "./identity";
import { getPool, getRelays } from "./pool";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://figus.world";

export async function shareNote(
  content: string,
  identity: Identity,
  extraTags: string[][] = [],
): Promise<void> {
  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: extraTags,
  };
  const signed = await signEvent(template, identity.mode);
  await Promise.any(getPool().publish(getRelays(), signed));
}
