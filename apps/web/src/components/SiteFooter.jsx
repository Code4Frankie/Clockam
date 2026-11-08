import { Link } from 'react-router-dom';

// Footer for the public pages. Needs the `.lp` styles from pages/landing.css on a parent.
export default function SiteFooter({ extra = null }) {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-foot">
        <div className="lp-foot-brand">
          <img src="/logo.png" alt="" width="64" height="64" />
          <div>
            <strong>ClockAm by Frankiecode Solutions</strong>
            <a href="https://www.frankiecode.org.ng" target="_blank" rel="noopener noreferrer">www.frankiecode.org.ng</a>
          </div>
        </div>
        <nav className="lp-foot-links" aria-label="Footer">
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create your workplace</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          {extra}
        </nav>
      </div>
      <p className="lp-wrap lp-legal">© {new Date().getFullYear()} Frankiecode Solutions. Photos and screens on the home page are illustrations.</p>
    </footer>
  );
}
