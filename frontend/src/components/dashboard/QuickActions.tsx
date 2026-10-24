import { motion } from "framer-motion";
import { ArrowRight, Camera, Clapperboard, ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";

const ACTIONS = [
  {
    to: "/image",
    icon: ImageIcon,
    title: "Detect Objects in Images",
    description: "Upload an image and detect objects instantly.",
    cta: "Open image studio",
    accent: "from-primary/20",
  },
  {
    to: "/video",
    icon: Clapperboard,
    title: "Analyze Videos",
    description: "Process video files and visualize detections frame by frame.",
    cta: "Process a video",
    accent: "from-cyan/20",
  },
  {
    to: "/live",
    icon: Camera,
    title: "Live Camera Detection",
    description: "Start your webcam and detect objects in real time.",
    cta: "Start camera",
    accent: "from-success/20",
  },
];

export function QuickActions() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {ACTIONS.map((action, i) => (
        <motion.div
          key={action.to}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.05, duration: 0.25 }}
          whileHover={{ y: -3 }}
        >
          <Link
            to={action.to}
            className="group surface relative flex h-full flex-col gap-4 overflow-hidden p-5 transition-colors hover:border-primary/40 sm:p-6"
          >
            <div className={`pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-gradient-to-br ${action.accent} to-transparent blur-2xl transition-opacity group-hover:opacity-100 sm:opacity-60`} aria-hidden />
            <div className="relative flex size-11 items-center justify-center rounded-xl border bg-elevated text-primary transition-colors group-hover:border-primary/40">
              <action.icon className="size-5" aria-hidden />
            </div>
            <div className="relative space-y-1.5">
              <h3 className="font-semibold tracking-tight">{action.title}</h3>
              <p className="text-sm text-muted-foreground">{action.description}</p>
            </div>
            <span className="relative mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              {action.cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
