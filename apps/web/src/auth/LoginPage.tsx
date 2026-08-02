import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginDto } from "@garmentos/shared-types";
import { ApiError } from "../api/client";
import { useAuth } from "./AuthContext";

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
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <h1>GarmentOS</h1>
        <p className="auth-subtitle">Войдите, чтобы продолжить</p>

        <label>
          Email
          <input type="email" autoComplete="email" {...register("email")} />
        </label>
        {errors.email && <p className="field-error">{errors.email.message}</p>}

        <label>
          Пароль
          <input type="password" autoComplete="current-password" {...register("password")} />
        </label>
        {errors.password && <p className="field-error">{errors.password.message}</p>}

        {serverError && <p className="form-error">{serverError}</p>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
