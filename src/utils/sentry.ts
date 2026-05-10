const CONSENT_KEY = "sshuttle-ui-sentry-consent";

let sentryReady = false;

export function readSentryConsent(): "granted" | "denied" | "unknown" {
  try {
    const value = localStorage.getItem(CONSENT_KEY);

    if (value === "true") return "granted";
    if (value === "false") return "denied";
  } catch {
    return "unknown";
  }

  return "unknown";
}

export function shouldInitSentry(): boolean {
  return readSentryConsent() === "granted" && !!readSentryDsn();
}

export function initSentryIfConsented(): void {
  if (readSentryConsent() !== "granted") return;

  const dsn = readSentryDsn();

  if (!dsn) {
    console.info("Sentry: no DSN configured, skipping init.");
    return;
  }

  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        release: import.meta.env.VITE_APP_VERSION ?? "0.0.0",
        environment: import.meta.env.MODE,
        beforeSend(event) {
          return scrubEvent(event);
        },
      });
      sentryReady = true;
    })
    .catch((e: unknown) => {
      console.warn("Sentry init failed:", e);
    });
}

function readSentryDsn(): string | undefined {
  return import.meta.env["VITE_SENTRY_DSN"];
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryReady) return;

  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.captureException(err, { extra: context });
    })
    .catch(() => {});
}

function scrubEvent(
  event: import("@sentry/react").ErrorEvent,
): import("@sentry/react").ErrorEvent | null {
  if (typeof event.message === "string") {
    event.message = scrubText(event.message);
  }

  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") {
      exception.value = scrubText(exception.value);
    }

    for (const frame of exception.stacktrace?.frames ?? []) {
      if (typeof frame.filename === "string") {
        frame.filename = scrubText(frame.filename);
      }
    }
  }

  return event;
}

function scrubText(value: string): string {
  return value
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "<user@host>")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .replace(/\/home\/[^/\s]+/g, "/home/<user>");
}
