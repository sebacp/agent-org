import { useEffect, useRef } from "react";
import type { OrgTopic } from "@agent-org/shared/event-types";

/**
 * What the server changed behind this tab's back: an agent filing a file or
 * opening a pendiente mid-run, or the same company open in another window.
 */
export function useOrgEvents(
  orgId: string,
  onChange: (topic: OrgTopic) => void,
): void {
  // Behind a ref because the library's refresh changes with the search box, and
  // a keystroke shouldn't tear the stream down and open another.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const source = new EventSource(
      `/api/events?orgId=${encodeURIComponent(orgId)}`,
    );
    source.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as { topic?: OrgTopic };
      if (data.topic) latest.current(data.topic);
    };
    return () => source.close();
  }, [orgId]);
}
