import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm, ValidationError } from '@formspree/react';
import '../styles/LegalPages.css';

const BACKDROP_URL = 'https://image.tmdb.org/t/p/original';

const Contact = () => {
    const [state, handleSubmit] = useForm("mnjalzry");
    const [backdrop, setBackdrop] = useState(null);

    // Fetch a random trending movie backdrop
    useEffect(() => {
        const fetchBackdrop = async () => {
            try {
                const res = await fetch('/api/trending/movie/week');
                if (res.ok) {
                    const data = await res.json();
                    const moviesWithBackdrop = (data.results || []).filter(m => m.backdrop_path);
                    if (moviesWithBackdrop.length > 0) {
                        // Pick a random movie from top 10
                        const randomIndex = Math.floor(Math.random() * Math.min(10, moviesWithBackdrop.length));
                        setBackdrop(moviesWithBackdrop[randomIndex].backdrop_path);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch backdrop:', error);
            }
        };
        fetchBackdrop();
    }, []);

    return (
        <div className="legal-page">
            <div className="contact-container">
                {/* Header */}
                <header className="contact-header">
                    <h1 className="contact-title">
                        Get in <span className="title-highlight">touch</span>
                    </h1>
                    <p className="contact-subtitle">
                        Have a question or feedback? We'd love to hear from you!
                    </p>
                </header>

                {/* Two Column Layout */}
                <div className="contact-layout">
                    {/* Left Column - Form */}
                    <div className="contact-form-column">
                        <div className="contact-form-card">
                            {state.succeeded ? (
                                <div className="contact-success-new">
                                    <div className="success-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>
                                    <h2>Message Sent!</h2>
                                    <p>Thank you for reaching out. We'll get back to you as soon as possible.</p>
                                    <Link to="/" className="legal-nav-link">Return to Home</Link>
                                </div>
                            ) : (
                                <>
                                    <h2 className="form-title">Send us a message</h2>
                                    <p className="form-subtitle">Fill out the form and we'll respond within 24-48 hours.</p>

                                    <form className="contact-form-new" onSubmit={handleSubmit}>
                                        <div className="form-row">
                                            <div className="form-field">
                                                <input
                                                    type="text"
                                                    id="name"
                                                    name="name"
                                                    className="form-input"
                                                    required
                                                    placeholder="Your name"
                                                />
                                                <ValidationError
                                                    prefix="Name"
                                                    field="name"
                                                    errors={state.errors}
                                                    className="form-error"
                                                />
                                            </div>

                                            <div className="form-field">
                                                <input
                                                    type="email"
                                                    id="email"
                                                    name="email"
                                                    className="form-input"
                                                    required
                                                    placeholder="your.email@example.com"
                                                />
                                                <ValidationError
                                                    prefix="Email"
                                                    field="email"
                                                    errors={state.errors}
                                                    className="form-error"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-field">
                                            <select
                                                id="subject"
                                                name="subject"
                                                className="form-select"
                                                required
                                            >
                                                <option value="">Select a subject</option>
                                                <option value="general">General Inquiry</option>
                                                <option value="feedback">Feedback</option>
                                                <option value="bug">Report a Bug</option>
                                                <option value="copyright">Copyright Concern</option>
                                                <option value="advertising">Advertising</option>
                                                <option value="other">Other</option>
                                            </select>
                                            <ValidationError
                                                prefix="Subject"
                                                field="subject"
                                                errors={state.errors}
                                                className="form-error"
                                            />
                                        </div>

                                        <div className="form-field">
                                            <textarea
                                                id="message"
                                                name="message"
                                                className="form-textarea"
                                                required
                                                placeholder="Your message..."
                                                rows="5"
                                            />
                                            <ValidationError
                                                prefix="Message"
                                                field="message"
                                                errors={state.errors}
                                                className="form-error"
                                            />
                                        </div>

                                        <button type="submit" className="form-submit" disabled={state.submitting}>
                                            {state.submitting ? 'Sending...' : 'Send Message'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Movie Visual with Backdrop */}
                    <div className="contact-visual-column">
                        <div
                            className="contact-visual-card"
                            style={backdrop ? {
                                backgroundImage: `linear-gradient(135deg, rgba(20, 20, 20, 0.85) 0%, rgba(20, 20, 20, 0.7) 50%, rgba(20, 20, 20, 0.85) 100%), url(${BACKDROP_URL}${backdrop})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            } : {}}
                        >

                            <blockquote className="visual-quote">
                                "Movies can and do have tremendous influence in shaping young lives."
                            </blockquote>
                            <cite className="visual-author">Walt Disney</cite>

                            <div className="visual-stats">
                                <div className="stat-item">
                                    <span className="stat-number">10K+</span>
                                    <span className="stat-label">Movies</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-number">5K+</span>
                                    <span className="stat-label">TV Shows</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-number">24/7</span>
                                    <span className="stat-label">Streaming</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <nav className="legal-nav">
                    <Link to="/privacy" className="legal-nav-link">Privacy Policy</Link>
                    <Link to="/terms" className="legal-nav-link">Terms of Service</Link>
                </nav>
            </div>
        </div>
    );
};

export default Contact;
