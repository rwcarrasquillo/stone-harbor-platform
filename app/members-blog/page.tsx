"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type BlogPost = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  created_at: string;
};

type BlogComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    display_name: string | null;
    username: string | null;
  } | null;
};

export default function MembersBlogPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBlog() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, title, excerpt, content, category, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPosts(data);
      setSelectedPost(data[0] ?? null);
    }

    setLoading(false);
  }

  async function loadComments(postId: string) {
    setCommentsLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("blog_comments")
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles (
          display_name,
          username
        )
      `,
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Could not load comments: ${error.message}`);
      setComments([]);
      setCommentsLoading(false);
      return;
    }

    setComments((data ?? []) as BlogComment[]);
    setCommentsLoading(false);
  }

  async function postComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedPost || !currentUserId || !commentText.trim()) return;

    setPostingComment(true);
    setMessage("");

    const { error } = await supabase.from("blog_comments").insert({
      post_id: selectedPost.id,
      user_id: currentUserId,
      content: commentText.trim(),
    });

    if (error) {
      setMessage(`Comment error: ${error.message}`);
      setPostingComment(false);
      return;
    }

    setCommentText("");
    await loadComments(selectedPost.id);
    setPostingComment(false);
  }

  async function deleteComment(commentId: string) {
    const confirmed = window.confirm("Delete this comment?");
    if (!confirmed || !selectedPost) return;

    const { error } = await supabase
      .from("blog_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      setMessage(`Delete error: ${error.message}`);
      return;
    }

    await loadComments(selectedPost.id);
  }

  function formatDate(dateValue: string) {
    return new Date(dateValue).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateTime(dateValue: string) {
    return new Date(dateValue).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const commentCountLabel = useMemo(() => {
    if (comments.length === 1) return "1 Comment";
    return `${comments.length} Comments`;
  }, [comments.length]);

  useEffect(() => {
    loadBlog();
  }, []);

  useEffect(() => {
    if (selectedPost?.id) {
      loadComments(selectedPost.id);
    }
  }, [selectedPost?.id]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3efe7] text-stone-700">
        <p className="text-sm font-bold uppercase tracking-[0.3em]">
          Loading Member Blog...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] px-6 py-12 text-stone-900`}
    >
      <section className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/dashboard"
            className="text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]"
          >
            ← Dashboard
          </a>

          <a
            href="/"
            className="text-sm font-bold uppercase tracking-[0.3em] text-stone-500"
          >
            Stone Harbor
          </a>
        </div>

        <div className="mb-12">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
            Members-Only Blog
          </p>

          <h1
            className={`${serif.className} max-w-5xl text-5xl font-medium leading-tight md:text-7xl`}
          >
            Private guidance for the rebuilding season.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-600">
            These articles and discussions are available only to logged-in Stone
            Harbor members.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-[2rem] bg-white/70 p-8 text-stone-600">
            No blog posts are published yet.
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-5">
              {posts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => {
                    setSelectedPost(post);
                    setMessage("");
                    setCommentText("");
                  }}
                  className={`w-full rounded-[2rem] border p-6 text-left transition hover:-translate-y-1 hover:shadow-md ${
                    selectedPost?.id === post.id
                      ? "border-[#a9793d]/60 bg-white"
                      : "border-stone-200 bg-white/60"
                  }`}
                >
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                    {post.category || "Member Article"}
                  </p>

                  <h2
                    className={`${serif.className} text-3xl font-medium text-stone-900`}
                  >
                    {post.title}
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-stone-600">
                    {post.excerpt}
                  </p>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                    {formatDate(post.created_at)}
                  </p>
                </button>
              ))}
            </div>

            <div className="space-y-8">
              <article className="rounded-[3rem] border border-white/50 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-12">
                {selectedPost && (
                  <>
                    <p className="mb-5 text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
                      {selectedPost.category || "Member Article"}
                    </p>

                    <h2
                      className={`${serif.className} text-5xl font-medium leading-tight text-stone-900 md:text-6xl`}
                    >
                      {selectedPost.title}
                    </h2>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                      {formatDate(selectedPost.created_at)}
                    </p>

                    <div className="mt-10 whitespace-pre-wrap text-lg leading-relaxed text-stone-700">
                      {selectedPost.content}
                    </div>
                  </>
                )}
              </article>

              {selectedPost && (
                <section className="rounded-[3rem] border border-white/50 bg-white/70 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.06)] backdrop-blur-2xl md:p-10">
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                        Member Discussion
                      </p>

                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                        {commentCountLabel}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={postComment} className="mb-8">
                    <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
                      Add a Comment
                    </label>

                    <textarea
                      required
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={4}
                      className="mb-5 w-full resize-none rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
                      placeholder="Share a reflection, encouragement, or thoughtful response..."
                    />

                    <button
                      type="submit"
                      disabled={postingComment}
                      className="group relative inline-flex overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#a9793d]/70 px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_30px_rgba(0,0,0,0.15)] backdrop-blur-2xl transition duration-300 hover:scale-[1.02] hover:bg-[#8d6432]/80 disabled:opacity-60"
                    >
                      <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
                      <span className="relative z-10">
                        {postingComment ? "Posting..." : "Post Comment"}
                      </span>
                    </button>
                  </form>

                  {message && (
                    <div className="mb-6 rounded-2xl bg-[#f5f0e8] px-4 py-4">
                      <p className="text-sm font-semibold text-stone-700">
                        {message}
                      </p>
                    </div>
                  )}

                  {commentsLoading ? (
                    <div className="rounded-[2rem] bg-[#f8f4ed] p-6 text-stone-600">
                      Loading comments...
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="rounded-[2rem] bg-[#f8f4ed] p-6 text-stone-600">
                      No comments yet. Be the first to start the discussion.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {comments.map((comment) => {
                        const displayName =
                          comment.profiles?.display_name ||
                          comment.profiles?.username ||
                          "Stone Harbor Member";

                        const canDelete = comment.user_id === currentUserId;

                        return (
                          <article
                            key={comment.id}
                            className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-6"
                          >
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold text-stone-900">
                                  {displayName}
                                </p>

                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                                  {formatDateTime(comment.created_at)}
                                </p>
                              </div>

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => deleteComment(comment.id)}
                                  className="rounded-full border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-500 transition hover:border-red-300 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            <p className="whitespace-pre-wrap leading-relaxed text-stone-700">
                              {comment.content}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
