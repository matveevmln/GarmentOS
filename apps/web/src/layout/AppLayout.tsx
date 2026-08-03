import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../design-system/Icons/Icon";

const NAV_ITEMS = [
  { to: "/workshops", label: "Цеха", icon: "factory" },
  { to: "/suppliers", label: "Поставщики", icon: "users" },
  { to: "/materials", label: "Материалы", icon: "layers" },
  { to: "/warehouses", label: "Склады", icon: "building" },
  { to: "/products", label: "Модели", icon: "box" },
  { to: "/purchase-orders", label: "Закупки", icon: "cash" },
  { to: "/production-orders", label: "Заказы пошива", icon: "scissors" },
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
              <Icon name={item.icon} />
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
