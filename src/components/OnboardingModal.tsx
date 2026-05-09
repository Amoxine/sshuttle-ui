import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "sshuttle-ui-onboarding-v2";

const STEPS = [
  {
    title: "Welcome",
    body: "This app runs sshuttle — a tunnel through SSH. Pick a profile and hit Connect.",
  },
  {
    title: "Profiles",
    body: "Profiles save hosts, routes, and SSH keys. Import from your ~/.ssh/config on the Profiles page.",
  },
  {
    title: "Tray",
    body: "Close the window and we stay in the menu bar. Right‑click the icon for quick actions.",
  },
  {
    title: "Quick tip",
    body: "Press ⌘K (Ctrl+K on Windows/Linux) to jump anywhere fast.",
  },
];

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="card max-w-md border border-brand-500/30 shadow-2xl">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
          Step {step + 1} / {STEPS.length}
        </div>
        <h2 className="text-xl font-semibold text-ink-100 light:text-ink-900">
          {s.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">{s.body}</p>
        <div className="mt-6 flex justify-between gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={finish}>
            Skip
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1"
            onClick={() => {
              if (step + 1 < STEPS.length) setStep(step + 1);
              else finish();
            }}
          >
            {step + 1 < STEPS.length ? (
              <>
                Next <ChevronRight className="size-4" />
              </>
            ) : (
              "Done"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
