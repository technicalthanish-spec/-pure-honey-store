import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return <div className="not-found"><h1>404</h1><p>Page not found.</p><Link className="primary-btn" to="/">Go home</Link></div>
}
