import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Social Media Icons */}
        <div className="footer-social-icons">
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            className="social-icon facebook"
            aria-label="Facebook"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
            </svg>
          </a>
          <a
            href="#"
            className="social-icon twitter"
            aria-label="Twitter"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
            </svg>
          </a>
          <a
            href="#"
            className="social-icon telegram"
            aria-label="Telegram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
              <path d="m21.854 2.147-10.94 10.939"></path>
            </svg>
          </a>
          <a
            href="#"
            className="social-icon youtube"
            aria-label="YouTube"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"></path>
              <path d="m10 15 5-3-5-3z"></path>
            </svg>
          </a>
        </div>

        {/* Streaming Service Links */}
        <nav className="footer-nav-links">
          <Link to="/netflix" className="footer-nav-link">Netflix</Link>
          <Link to="/prime-video" className="footer-nav-link">Prime Video</Link>
          <Link to="/disney" className="footer-nav-link">Disney+</Link>
          <Link to="/hbo" className="footer-nav-link">HBO Max</Link>
          <Link to="/apple-tv" className="footer-nav-link">Apple TV+</Link>
          <Link to="/viu" className="footer-nav-link">Viu</Link>
        </nav>

        {/* Disclaimer Text */}
        <p className="footer-disclaimer">
          <strong className="footer-brand">StreamFlix</strong> operates strictly as a search index and does not host any media files on its servers. All content is provided by non-affiliated third parties. Any copyright concerns should be directed to the respective file hosting services. <strong className="footer-brand">StreamFlix</strong> exercises no control over, and accepts no liability for, any media files distributed by external hosting services.
        </p>

        {/* Legal Links */}
        <nav className="footer-legal-links">
          <Link to="/privacy" className="footer-legal-link">Privacy Policy</Link>
          <Link to="/terms" className="footer-legal-link">Terms of Service</Link>
          <Link to="/contact" className="footer-legal-link">Contact</Link>
        </nav>

        {/* Copyright */}
        <p className="footer-copyright">© {currentYear} StreamFlix All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;