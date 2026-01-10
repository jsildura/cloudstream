import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MatchCard.css';

/**
 * MatchCard Component
 * Displays a sports match card with poster, team badges, time, and category.
 * 
 * @param {Object} match - Match object from streami.su API
 * @param {string} match.id - Unique match identifier
 * @param {string} match.title - Match title (e.g., "Team A vs Team B")
 * @param {string} match.category - Sport category (e.g., "football")
 * @param {number} match.date - Unix timestamp in milliseconds
 * @param {string} [match.poster] - Poster image path
 * @param {boolean} match.popular - Whether match is popular
 * @param {Object} [match.teams] - Team information
 * @param {Array} match.sources - Stream sources
 */
const MatchCard = ({ match }) => {
    const navigate = useNavigate();

    // Base URL for streami.su assets
    const ASSET_BASE = 'https://streami.su';

    // Fallback sports background for cards without poster
    const FALLBACK_BACKGROUND = '/img/sports.jpg';

    // Construct poster URL - returns fallback if no poster
    const getPosterUrl = () => {
        if (!match.poster) return FALLBACK_BACKGROUND;
        // match.poster typically starts with "/" - append .webp if not present
        const poster = match.poster;
        const hasExtension = poster.endsWith('.webp') || poster.endsWith('.jpg') || poster.endsWith('.png');
        return `${ASSET_BASE}${poster}${hasExtension ? '' : '.webp'}`;
    };

    // Construct team badge URL
    const getBadgeUrl = (badge) => {
        if (!badge) return null;
        return `${ASSET_BASE}/api/images/badge/${badge}.webp`;
    };

    // Format match time with precision
    const formatMatchTime = () => {
        const matchDate = new Date(match.date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const matchDay = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());

        // Check if match is currently live (within 3 hours of start time)
        const threeHoursMs = 3 * 60 * 60 * 1000;
        const isLive = matchDate <= now && now - matchDate < threeHoursMs;

        if (isLive) {
            return { text: 'LIVE', isLive: true, badgeType: 'live', topRightBadge: 'LIVE' };
        }

        // Format time for display
        const timeStr = matchDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Check if match is today
        const isToday = matchDay.getTime() === today.getTime();

        // Check if match is tomorrow
        const isTomorrow = matchDay.getTime() === tomorrow.getTime();

        // Determine top-right badge text and type
        let topRightBadge = '';
        let badgeType = '';

        if (isToday) {
            // Show time only for today's matches (e.g., "2:30 PM")
            topRightBadge = timeStr;
            badgeType = 'time';
        } else {
            // Show date for future matches (e.g., "Jan 11")
            topRightBadge = matchDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
            badgeType = 'date';
        }

        // Full text for footer (keeping for backwards compatibility)
        let datePrefix = '';
        if (isToday) {
            datePrefix = 'Today';
        } else if (isTomorrow) {
            datePrefix = 'Tomorrow';
        } else {
            datePrefix = matchDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }

        return {
            text: `${datePrefix} ${timeStr}`,
            isLive: false,
            badgeType,
            topRightBadge
        };
    };

    // Format category name for display
    const formatCategory = (category) => {
        if (!category) return '';
        return category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    };

    // Generate dynamic gradient based on match ID for unique colors
    const getDynamicGradient = () => {
        // Use match ID to generate a consistent but unique hue
        const hash = match.id?.split('').reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0) || 0;

        // Generate base hue from hash (0-360)
        const hue = Math.abs(hash % 360);

        // Create gradient with varying saturation and lightness for depth
        return `linear-gradient(135deg, 
            hsl(${hue}, 35%, 12%) 0%, 
            hsl(${(hue + 15) % 360}, 40%, 18%) 50%, 
            hsl(${(hue + 30) % 360}, 45%, 25%) 100%)`;
    };

    // Handle card click - navigate to watch page
    const handleClick = () => {
        // Store match data in sessionStorage for immediate access in watch page
        sessionStorage.setItem('currentMatch', JSON.stringify(match));
        navigate(`/sports/watch/${match.id}`, { state: { match } });
    };

    const posterUrl = getPosterUrl();
    const timeInfo = formatMatchTime();
    const categoryLabel = formatCategory(match.category);

    // Get team info if available
    const homeTeam = match.teams?.home;
    const awayTeam = match.teams?.away;

    // Check if match has any team badges
    const hasTeamBadges = homeTeam?.badge || awayTeam?.badge;

    return (
        <div className="match-card" onClick={handleClick}>
            {/* Background Poster with all overlays */}
            <div className="match-card-bg">
                {/* Show poster image, or fallback to sports.jpg only if no team badges */}
                {match.poster ? (
                    <img
                        src={posterUrl}
                        alt={match.title}
                        loading="lazy"
                        onError={(e) => {
                            // If poster fails and has team badges, hide image to show gradient
                            // If no team badges, use fallback sports image
                            if (hasTeamBadges) {
                                e.target.style.display = 'none';
                            } else {
                                e.target.src = FALLBACK_BACKGROUND;
                            }
                        }}
                    />
                ) : !hasTeamBadges ? (
                    <img
                        src={FALLBACK_BACKGROUND}
                        alt={match.title}
                        loading="lazy"
                    />
                ) : null}

                {/* Dynamic gradient - only for matches with team badges and no poster */}
                {hasTeamBadges && (
                    <div
                        className="match-card-gradient"
                        style={{ background: getDynamicGradient() }}
                    />
                )}

                <div className="match-card-overlay" />

                {/* Top Right Badge - LIVE, Time, or Date */}
                {timeInfo.isLive ? (
                    <div className="match-badge live-top">
                        LIVE
                    </div>
                ) : (
                    <div className={`match-badge schedule-top ${timeInfo.badgeType}`}>
                        {timeInfo.topRightBadge}
                    </div>
                )}

                {/* Team Badges - only show if available */}
                {(() => {
                    const homeBadge = homeTeam?.badge;
                    const awayBadge = awayTeam?.badge;
                    const hasBadgeData = homeBadge || awayBadge;

                    if (!hasBadgeData) {
                        return null; // No branding, just show the background
                    }

                    return (
                        <div className="match-teams">
                            {homeBadge && (
                                <img
                                    src={getBadgeUrl(homeBadge)}
                                    alt={homeTeam.name}
                                    className="team-badge"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                            )}
                            {homeBadge && awayBadge && (
                                <span className="vs-text">vs</span>
                            )}
                            {awayBadge && (
                                <img
                                    src={getBadgeUrl(awayBadge)}
                                    alt={awayTeam.name}
                                    className="team-badge"
                                    loading="lazy"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                            )}
                        </div>
                    );
                })()}

                {/* Bottom Info Bar - inside bg container */}
                <div className="match-card-footer">
                    {/* Category Badge - Bottom Left */}
                    {categoryLabel && (
                        <div className="match-badge category">
                            {categoryLabel}
                        </div>
                    )}
                </div>
            </div>

            {/* Match Info - Below Card */}
            <div className="match-info">
                <h4 className="match-title">{match.title}</h4>
                {(homeTeam || awayTeam) && (
                    <p className="match-teams-text">
                        {homeTeam?.name || 'TBD'} vs {awayTeam?.name || 'TBD'}
                    </p>
                )}
                <p className="match-description">
                    {match.category} match: {match.title}
                </p>
            </div>
        </div>
    );
};

export default MatchCard;
