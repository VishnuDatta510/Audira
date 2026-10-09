import { CircleAlert } from "lucide-react";
import { VoiceLoader } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-sm text-ink-2" role="status">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent animate-pop">
        <VoiceLoader className="h-5" />
      </span>
      <span className="rise" style={{ "--d": "120ms" } as React.CSSProperties}>
        {label}
      </span>
    </div>
  );
}

export function PageError({ message, onRetry, action }: { message: string; onRetry?: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger animate-pop">
          <CircleAlert className="size-5" />
        </span>
        <p className="rise mt-4 text-[15px] leading-relaxed text-ink" style={{ "--d": "100ms" } as React.CSSProperties}>
          {message}
        </p>
        {(onRetry || action) && (
          <div className="rise mt-6 flex flex-wrap justify-center gap-2" style={{ "--d": "200ms" } as React.CSSProperties}>
            {action}
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
