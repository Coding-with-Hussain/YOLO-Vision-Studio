import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useApplyTheme } from "@/hooks/useTheme";
import { createQueryClient } from "@/lib/queryClient";

function ThemedToaster() {
  const theme = useApplyTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "!rounded-xl !border !border-border !bg-popover !text-foreground", description: "!text-muted-foreground" } }}
    />
  );
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
