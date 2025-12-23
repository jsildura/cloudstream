import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/LegalPages.css';

const TermsOfService = () => {
    return (
        <div className="legal-page">
            <div className="legal-container">
                <header className="legal-header">
                    <h1 className="legal-title">Terms of Service</h1>
                    <p className="legal-subtitle">Last updated: December 2024</p>
                </header>

                <div className="legal-card">
                    <section className="legal-section">
                        <h2 className="legal-section-title">What You Need to Know</h2>
                        <p>
                            StreamFlix helps you discover movies and TV shows. We don't host any videos, we just help you find them.
                            Use the site responsibly and follow your local laws. That's pretty much it!
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">What StreamFlix Is</h2>
                        <p>
                            StreamFlix is a free website that helps you discover movies and TV shows.
                            We get our movie information (like titles, posters, and descriptions) from TMDB a public movie database.
                        </p>
                        <p>
                            <strong>Important:</strong> We don't store or host any video files. Videos come from third-party sources that we don't control.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">What We Ask From You</h2>
                        <p>When using StreamFlix, please:</p>
                        <ul>
                            <li>Use the site for personal entertainment only</li>
                            <li>Follow the laws in your country</li>
                            <li>Don't try to break or hack the website</li>
                            <li>Don't use bots or scrapers to copy our content</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">About External Links</h2>
                        <p>
                            StreamFlix may link to other websites. We don't control these sites and aren't responsible for their content.
                            Click external links at your own risk.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">No Guarantees</h2>
                        <p>
                            We try our best, but we can't promise that:
                        </p>
                        <ul>
                            <li>The site will always work perfectly</li>
                            <li>All information will be 100% accurate</li>
                            <li>The site will never go down</li>
                        </ul>
                        <p>
                            We provide StreamFlix "as is" meaning you use it at your own risk.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">We're Not Responsible For</h2>
                        <p>
                            We can't be held responsible for problems that happen from using StreamFlix, including:
                        </p>
                        <ul>
                            <li>Issues with third-party video sources</li>
                            <li>Content on external websites we link to</li>
                            <li>Any legal issues from how you use the site</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Changes to These Terms</h2>
                        <p>
                            We might update these terms sometimes. If we do, we'll post the new version here.
                            By continuing to use StreamFlix after changes, you agree to the new terms.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Questions?</h2>
                        <p>
                            Something unclear? Reach out on our{' '}
                            <Link to="/contact">Contact Page</Link>.
                        </p>
                    </section>
                </div>

                <nav className="legal-nav">
                    <Link to="/privacy" className="legal-nav-link">Privacy Policy</Link>
                    <Link to="/contact" className="legal-nav-link">Contact Us</Link>
                </nav>
            </div>
        </div>
    );
};

export default TermsOfService;
