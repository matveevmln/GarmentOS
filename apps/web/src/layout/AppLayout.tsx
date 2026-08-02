import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/workshops", label: "Цеха" },
  { to: "/suppliers", label: "Поставщики" },
  { to: "/materials", label: "Материалы" },
  { to: "/warehouses", label: "Склады" },
  { to: "/products", label: "Модели" },
  { to: "/purchase-orders", label: "Закупки" },
  { to: "/production-orders", label: "Заказы пошива" },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">GarmentOS</span>
        {user && (
          <div className="app-user">
            <span>Здравствуйте, {user.fullName.split(" ")[0]}</span>
            <button type="button" onClick={logout}>
              Выйти
            </button>
          </div>
        )}
      </header>
      <div className="app-body">
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
