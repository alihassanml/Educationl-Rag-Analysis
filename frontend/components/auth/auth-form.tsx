"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { Notice, Spinner } from "@/components/ui/feedback";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/api";
import { credentialsSchema, fieldErrors, serverFieldErrors } from "@/lib/validators";

type Mode = "login" | "register";

const COPY = {
  login: {
    title: "Sign in",
    description: "Welcome back. Continue studying from your own material.",
    submit: "Sign in",
    pending: "Signing in",
    switchText: "New to EduRAG?",
    switchLink: "Create an account",
    switchHref: "/register",
    autoComplete: "current-password",
  },
  register: {
    title: "Create your account",
    description: "Upload your notes and start studying with cited answers.",
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
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-muted">{copy.description}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
        {expired && !formError ? <Notice>Your session ended. Please sign in again.</Notice> : null}
        {formError ? (
          <div role="alert" className="rounded-control border border-danger/30 px-3 py-2 text-sm text-danger">
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
          <Input
            id="password"
            type="password"
            autoComplete={copy.autoComplete}
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy("password", errors.password, mode === "register" ? "hint" : undefined)}
            disabled={pending}
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Spinner /> : null}
          {pending ? copy.pending : copy.submit}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="font-medium text-primary underline-offset-4 hover:underline">
          {copy.switchLink}
        </Link>
      </p>
    </div>
  );
}
