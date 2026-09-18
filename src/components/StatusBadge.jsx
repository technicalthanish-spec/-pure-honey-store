const statusClass = (status = '') => status.toLowerCase().replaceAll(' ', '-')

export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${statusClass(status)}`}>{status}</span>
}
