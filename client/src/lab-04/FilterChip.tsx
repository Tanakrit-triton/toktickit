import "./styles/dashboard.css";

// The drill-down filter chip (docs/lab-04/ui-spec.md sections 3.5 and 7):
// "Showing: {label} ×" above the list, where × is a button named
// "Clear filter".

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="zg-dash-chip-row">
      <span className="zg-dash-chip" data-testid="filter-chip">
        <span>Showing: {label}</span>
        <button
          type="button"
          className="zg-dash-chip-clear"
          data-testid="btn-clear-filter"
          aria-label="Clear filter"
          onClick={onClear}
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>
    </div>
  );
}
