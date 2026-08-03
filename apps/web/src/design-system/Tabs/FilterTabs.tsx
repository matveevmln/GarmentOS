// Пилюли-вкладки фильтра по статусу — дословно по классу .filters из
// утверждённого прототипа. Master Backlog 1.5: функциональный фильтр, не
// только визуальный — родитель передаёт value/onChange и сам решает, как
// фильтровать список (client-side, данных мало на этом масштабе).
export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterTabsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function FilterTabs<T extends string>({ options, value, onChange }: FilterTabsProps<T>) {
  return (
    <div className="filters">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
