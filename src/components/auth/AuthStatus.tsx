/**
 * Small signed-in indicator + sign-out control for the home screen. A plain
 * form POST to the signout route — no client JS needed. `displayName` is read
 * server-side by the home page from the profile.
 */
export function AuthStatus({ displayName }: { displayName: string | null }) {
  return (
    <div className="fixed right-3 top-3 z-[70] flex items-center gap-2">
      {displayName && (
        <span className="rounded-pill bg-ink/40 px-3 py-1 text-xs font-medium text-paper backdrop-blur-sm">
          {displayName}
        </span>
      )}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-pill bg-ink/40 px-3 py-1 text-xs font-medium text-paper backdrop-blur-sm transition-colors hover:bg-ink/60"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
