export function Logo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gold-500 bg-navy-800 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-gold-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="M6 10.5V16c0 1.5 2.5 3 6 3s6-1.5 6-3v-5.5" />
      </svg>
    </div>
  );
}
