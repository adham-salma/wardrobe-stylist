import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Heart, MessageCircle, Trash2, X } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Photo } from "@/client/components/Photo";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { messageOf } from "@/client/lib/errors";
import type { FeedPost } from "@/server/feed";
import { occasionLabel } from "@/shared/catalog";
import {
  addComment,
  deleteComment,
  deletePost,
  getFeed,
  toggleLike,
} from "@/serverFunctions/feed";

export const Route = createFileRoute("/feed")({
  loader: () => getFeed(),
  head: () => ({ meta: [{ title: "Feed" }] }),
  component: Feed,
});

function Feed() {
  const posts = Route.useLoaderData();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Feed" />
      {posts.length === 0 ? (
        <EmptyState
          title="Nothing shared yet"
          description="Open one of your outfits and share it to the feed."
        />
      ) : (
        <ol className="space-y-6">
          {posts.map((post) => (
            <Post key={post.id} post={post} />
          ))}
        </ol>
      )}
    </AppShell>
  );
}

const when = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function Post({ post }: { post: FeedPost }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function run(key: string, work: () => Promise<unknown>) {
    setError(null);
    setPending(key);
    try {
      await work();
      await router.invalidate();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setPending(null);
    }
  }

  return (
    <li
      data-testid="post"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium" data-testid="post-author">
            {post.author}
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={post.createdAt} suppressHydrationWarning>
              {when.format(new Date(post.createdAt))}
            </time>
          </p>
        </div>
        {post.canDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete post"
            data-testid="delete-post"
            onClick={() => setDeleting(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{post.outfitName}</p>
          {post.occasion ? (
            <Badge variant="secondary">{occasionLabel(post.occasion)}</Badge>
          ) : null}
        </div>
        {post.caption ? (
          <p className="text-sm whitespace-pre-wrap">{post.caption}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {post.photos.map((photo) => (
          <Photo
            key={photo.id}
            id={photo.id}
            alt={photo.name}
            testId="post-photo"
          />
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          data-testid="like-button"
          aria-pressed={post.liked}
          aria-label={post.liked ? "Unlike" : "Like"}
          disabled={pending !== null}
          onClick={() =>
            void run("like", () => toggleLike({ data: { postId: post.id } }))
          }
          className={post.liked ? "text-primary" : undefined}
        >
          <Heart
            aria-hidden
            className={post.liked ? "fill-current" : undefined}
          />
          <span data-testid="like-count">{post.likeCount}</span>
        </Button>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3.5" aria-hidden />
          <span data-testid="comment-count">{post.comments.length}</span>
        </span>
      </div>

      {post.comments.length > 0 ? (
        <ul className="space-y-2 border-t border-border pt-3">
          {post.comments.map((c) => (
            <li
              key={c.id}
              data-testid="comment"
              className="flex items-start gap-2 text-sm"
            >
              <p className="min-w-0 flex-1">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="whitespace-pre-wrap">{c.body}</span>
              </p>
              {c.canDelete ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete comment"
                  data-testid="delete-comment"
                  disabled={pending !== null}
                  onClick={() =>
                    void run(`comment-${c.id}`, () =>
                      deleteComment({ data: { commentId: c.id } }),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = comment.trim();
          if (!body) return;
          if (
            await run("comment", () =>
              addComment({ data: { postId: post.id, body } }),
            )
          ) {
            setComment("");
          }
        }}
      >
        <Input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="Add a comment"
          value={comment}
          maxLength={1000}
          onChange={(event) => setComment(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          data-testid="comment-submit"
          pending={pending === "comment"}
        >
          Post
        </Button>
      </form>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this post?"
          confirmLabel="Delete"
          destructive
          pending={pending === "post"}
          onConfirm={() =>
            void run("post", () =>
              deletePost({ data: { postId: post.id } }),
            ).then(() => setDeleting(false))
          }
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </li>
  );
}
