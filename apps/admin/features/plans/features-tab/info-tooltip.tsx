'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@deqah/ui/primitives/tooltip';

type Props = {
  content: string;
  ariaLabel?: string;
};

// TODO i18n: default ariaLabel "More info" — no key in plans.* namespace
export function InfoTooltip({ content, ariaLabel = 'More info' }: Props) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M7 6.5V10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="7" cy="4.5" r="0.75" fill="currentColor" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
