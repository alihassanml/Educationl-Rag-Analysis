"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/api";
import { credentialsSchema, fieldErrors, serverFieldErrors } from "@/lib/validators";

type Mode = "login" | "register";

const COPY = {
  login: {
    title: "Sign in",
    description: "Welcome back. Continue studying from your own material",
    submit: "Sign in",
    pending: "Signing in",
    switchText: "New to EduRAG?",
    switchLink: "Create an account",
    switchHref: "/register",
    autoComplete: "current-password",
  },
  register: {
    title: "Create your account",
    description: "Upload your notes and start studying with cited answers",
    submit: "Create account",
    pending: "Creating account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
    autoComplete: "new-password",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const expired = useSearchParams().has("expired");
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = credentialsSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const action = mode === "login" ? authApi.login : authApi.register;
      await action(parsed.data.email, parsed.data.password);
      router.replace("/dashboard");
    } catch (error) {
      // Entered values are kept so the student can correct them
      if (error instanceof ApiError && error.fields.length > 0) setErrors(serverFieldErrors(error.fields));
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-page font-medium text-ink">{copy.title}</h1>
      <p className="mt-1 text-ink-2">{copy.description}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-4">
        {expired && !formError ? <Notice>Your session ended. Please sign in again.</Notice> : null}
        {formError ? (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            {formError}
          </div>
        ) : null}
        <Field id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email", errors.email)}
            disabled={pending}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password}
          hint={mode === "register" ? "Use at least 8 characters" : undefined}
        >
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={copy.autoComplete}
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy("password", errors.password, mode === "register" ? "hint" : undefined)}
              disabled={pending}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-1 right-1 flex w-9 items-center justify-center rounded-control border border-stone-strong bg-paper text-ink-2 hover:bg-stone-100 hover:text-ink"
            >
              {showPassword ? <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={16} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <Button type="submit" loading={pending} size="lg" className="w-full">
          {pending ? copy.pending : copy.submit}
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="font-medium text-clay-strong underline-offset-4 hover:underline">
          {copy.switchLink}
        </Link>
      </p>
    </div>
  );
}
