export default function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase();
  return <span className={`status status-${key}`}>{value}</span>;
}
