import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginDto } from "@garmentos/shared-types";
import { ApiError } from "../api/client";
import { useAuth } from "./AuthContext";
import { Card } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { Field } from "../design-system/Form/Field";

// Экран входа переоформлён на дизайн-систему (docs/UI_MIGRATION_PLAN.md,
// этап 7): раньше он был единственным экраном целиком на легаси-классах
// (.auth-screen/.auth-card/.field-error) и голых <input>/<button>.
// Собственного экрана входа в прототипе нет, поэтому взят его же
// визуальный язык: знак бренда, карточка на фоне ambient-field, поля и
// кнопка дизайн-системы. Логика входа, валидация и обработка ошибок не
// менялись.

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginDto) => {
    setServerError(null);
    try {
      await login(data);
      void navigate("/", { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Не удалось войти. Проверьте соединение с сервером.");
    }
  };

  return (
    <div className="ambient-field flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-[380px] p-6 md:p-7">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))]">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2.5v7.2" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="10" cy="12.1" rx="2.5" ry="3.2" stroke="var(--primary)" strokeWidth="1.6" />
              <path
                d="M4.2 17.5c1.9-1.5 3.8-1.5 5.8 0"
                stroke="var(--foreground)"
                strokeOpacity="0.45"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">GarmentOS</span>
            <span className="mt-1.5 block text-[9px] uppercase leading-none tracking-[0.1em] text-muted-foreground">
              производственная система
            </span>
          </span>
        </div>

        <p className="t-secondary mt-4">Войдите, чтобы продолжить</p>

        <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
            <Input id="login-email" type="email" autoComplete="email" {...register("email")} />
          </Field>

          <Field label="Пароль" htmlFor="login-password" error={errors.password?.message}>
            <Input id="login-password" type="password" autoComplete="current-password" {...register("password")} />
          </Field>

          {serverError && (
            <p
              role="alert"
              className="rounded-[10px] border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[12px] font-medium text-danger"
            >
              {serverError}
            </p>
          )}

          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Входим…" : "Войти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
