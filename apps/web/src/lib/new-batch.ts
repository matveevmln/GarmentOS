import { useLocation, useNavigate } from "react-router-dom";

/** Мастер поверх текущего экрана; прямой URL остаётся самостоятельной страницей. */
export function useNewBatch() {
  const location = useLocation();
  const navigate = useNavigate();
  return (productId?: string, repeatOrderId?: string) =>
    void navigate(
      `/new-batch${repeatOrderId ? `?repeatOrderId=${encodeURIComponent(repeatOrderId)}` : productId ? `?productId=${encodeURIComponent(productId)}` : ""}`,
      {
        state: { batchBackground: location },
      },
    );
}
