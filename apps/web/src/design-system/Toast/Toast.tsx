import { Toaster as SonnerToaster, toast } from "sonner";

// GarmentToast — обёртка над sonner (docs/UI_FOUNDATION.md), закрывает
// реальный пробел: действия (создать/подтвердить/принять) сейчас не дают
// визуальной обратной связи кроме обновления списка. Фирменный вид —
// токены из tokens.css через className/style на <SonnerToaster>, не
// дефолтная тема sonner.
export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      duration={2500}
      visibleToasts={1}
      offset={76}
      mobileOffset={76}
      toastOptions={{
        classNames: {
          toast: "!bg-foreground !text-white !border-none !rounded-2xl !shadow-card !font-sans",
          description: "!text-white/70",
        },
      }}
    />
  );
}
