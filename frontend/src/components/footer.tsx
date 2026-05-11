import { Link } from 'react-router-dom'

const footerSections = [
  {
    title: 'Explore',
    links: [
      { label: 'Places', to: '/businesses' },
      { label: 'Activity', to: '/activity' },
      { label: 'Saved', to: '/saved' }
    ]
  },
  {
    title: 'Business',
    links: [
      { label: 'Claim', to: '/claim' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Dashboard', to: '/dashboard' }
    ]
  },
  {
    title: 'Company',
    links: [
      { label: 'Privacy', href: 'mailto:privacy@vantage.local' },
      { label: 'Terms', href: 'mailto:legal@vantage.local' }
    ]
  }
]

export function Footer() {
  return (
    <footer className="site-footer min-theme">
      <div className="site-footer__grid">
        <div>
          <Link to="/" className="site-footer__brand">
            <img src="/Images/Vantage.png" alt="Vantage logo" />
            <span>Vantage</span>
          </Link>
          <p>Local discovery ranked by fresh, credible community activity.</p>
        </div>

        {footerSections.map((section) => (
          <div key={section.title}>
            <h3>{section.title}</h3>
            {section.links.map((link) =>
              'to' in link ? (
                <Link key={link.label} to={link.to}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              )
            )}
          </div>
        ))}

        <div className="site-footer__meta" aria-label="Copyright">
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  )
}
