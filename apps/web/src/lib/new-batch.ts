import { useLocation, useNavigate } from "react-router-dom";

/** Мастер поверх текущего экрана; прямой URL остаётся самостоятельной страницей. */
export function useNewBatch() {
  const location = useLocation();
  const navigate = useNavigate();
  return (productId?: string) =>
    void navigate(`/new-batch${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`, {
      state: { batchBackground: location },
    });
}
