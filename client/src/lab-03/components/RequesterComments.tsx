import { useCallback, useEffect, useState } from "react";
import { Callout } from "./Callout.js";
import { Composer, EntryList } from "./Conversation.js";
import * as ticketsApi from "../tickets-api.js";
import type { CommentOrNote } from "../tickets-api.js";

// The Comments card on Requester Ticket Detail (docs/lab-03/ui-spec.md 6.3).
// Public Comments only: a Requester never requests, sees, or counts Internal
// Notes (BR-53).

export function RequesterComments({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [comments, setComments] = useState<CommentOrNote[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setComments(await ticketsApi.fetchComments(ticketId));
    } catch {
      setFailed(true);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="zg-card" data-testid="comments-card">
      <h2 className="zg-section-title">Comments</h2>

      {failed ? (
        <div>
          <Callout variant="error" testId="callout-error">
            Something went wrong. Try again.
          </Callout>
          <button type="button" className="zg-btn zg-btn--secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : comments === null ? (
        <p className="zg-helper" aria-busy="true">
          Loading comments...
        </p>
      ) : (
        <EntryList entries={comments} kind="comment" emptyText="No comments yet." />
      )}

      {/* Posting is refused on CLOSED (BR-52); CANCELLED still accepts it. */}
      {closed ? (
        <p className="zg-helper">Comments are closed for this ticket.</p>
      ) : (
        <Composer
          label="Add a comment"
          fieldTestId="field-comment-body"
          buttonTestId="btn-post-comment"
          buttonText="Post comment"
          buttonVariant="secondary"
          onPost={(body) => ticketsApi.postComment(ticketId, body)}
          onPosted={(entry) => setComments((current) => [...(current ?? []), entry])}
        />
      )}
    </section>
  );
}
