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
    const FALLBACK_POSTER = `${ASSET_BASE}/api/images/poster/fallback.webp`;

    // Construct poster URL - returns null if no poster (fallback handled separately)
    const getPosterUrl = () => {
        if (!match.poster) return null;
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
            return { text: 'LIVE', isLive: true };
        }

        // Format time
        const timeStr = matchDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Determine date prefix
        let datePrefix = '';
        if (matchDay.getTime() === today.getTime()) {
            datePrefix = 'Today';
        } else if (matchDay.getTime() === tomorrow.getTime()) {
            datePrefix = 'Tomorrow';
        } else {
            datePrefix = matchDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }

        return { text: `${datePrefix} ${timeStr}`, isLive: false };
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
            {/* Background Poster/Gradient with all overlays */}
            <div className="match-card-bg">
                {posterUrl ? (
                    <img
                        src={posterUrl}
                        alt={match.title}
                        loading="lazy"
                        onError={(e) => {
                            // If poster fails, hide and show gradient behind
                            e.target.style.display = 'none';
                        }}
                    />
                ) : null}
                {/* Always render gradient behind - shows when no poster or poster fails */}
                <div
                    className="match-card-gradient"
                    style={{ background: getDynamicGradient() }}
                />
                <div className="match-card-overlay" />

                {/* LIVE Badge - Top Right (only for live matches) */}
                {timeInfo.isLive && (
                    <div className="match-badge live-top">
                        LIVE
                    </div>
                )}

                {/* Team Badges or StreamFlix Branding */}
                {(() => {
                    // Track loaded badges using closure
                    const homeBadge = homeTeam?.badge;
                    const awayBadge = awayTeam?.badge;
                    const hasBadgeData = homeBadge || awayBadge;

                    if (!hasBadgeData) {
                        return (
                            <div className="streamed-branding">
                                <span className="streamed-icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#ec5818" xmlns="http://www.w3.org/2000/svg">
                                        <g stroke="none" strokeWidth="0"></g>
                                        <g strokeLinecap="round" strokeLinejoin="round"></g>
                                        <g>
                                            <path fillRule="evenodd" d="M11.1758045,11.5299649 C11.7222481,10.7630248 11.6612694,9.95529555 11.2823626,8.50234466 C10.5329929,5.62882187 10.8313891,4.05382867 13.4147321,2.18916004 L14.6756139,1.27904986 L14.9805807,2.80388386 C15.3046861,4.42441075 15.8369398,5.42670671 17.2035766,7.35464078 C17.2578735,7.43122022 17.2578735,7.43122022 17.3124108,7.50814226 C19.2809754,10.2854144 20,11.9596204 20,15 C20,18.6883517 16.2713564,22 12,22 C7.72840879,22 4,18.6888043 4,15 C4,14.9310531 4.00007066,14.9331427 3.98838852,14.6284506 C3.89803284,12.2718054 4.33380946,10.4273676 6.09706666,8.43586022 C6.46961415,8.0150872 6.8930834,7.61067534 7.36962714,7.22370749 L8.42161802,6.36945926 L8.9276612,7.62657706 C9.30157948,8.55546878 9.73969716,9.28566491 10.2346078,9.82150804 C10.6537848,10.2753538 10.9647401,10.8460665 11.1758045,11.5299649 Z M7.59448531,9.76165711 C6.23711779,11.2947332 5.91440928,12.6606068 5.98692012,14.5518252 C6.00041903,14.9039019 6,14.8915108 6,15 C6,17.5278878 8.78360021,20 12,20 C15.2161368,20 18,17.527472 18,15 C18,12.4582072 17.4317321,11.1350292 15.6807305,8.66469725 C15.6264803,8.58818014 15.6264803,8.58818014 15.5719336,8.51124844 C14.5085442,7.0111098 13.8746802,5.96758691 13.4553336,4.8005211 C12.7704786,5.62117775 12.8107447,6.43738988 13.2176374,7.99765534 C13.9670071,10.8711781 13.6686109,12.4461713 11.0852679,14.31084 L9.61227259,15.3740546 L9.50184911,13.5607848 C9.43129723,12.4022487 9.16906461,11.6155508 8.76539217,11.178492 C8.36656566,10.7466798 8.00646835,10.2411426 7.68355027,9.66278925 C7.65342985,9.69565638 7.62374254,9.72861259 7.59448531,9.76165711 Z"></path>
                                        </g>
                                    </svg>
                                </span>
                                <span className="streamed-text">StreamFlix</span>
                            </div>
                        );
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
                                        // Check if both badges failed - show branding
                                        const container = e.target.closest('.match-teams');
                                        const visibleBadges = container?.querySelectorAll('.team-badge:not([style*="display: none"])');
                                        if (visibleBadges?.length === 0) {
                                            container.style.display = 'none';
                                            container.nextElementSibling?.classList.add('show-branding');
                                        }
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
                                        // Check if both badges failed - show branding
                                        const container = e.target.closest('.match-teams');
                                        const visibleBadges = container?.querySelectorAll('.team-badge:not([style*="display: none"])');
                                        if (visibleBadges?.length === 0) {
                                            container.style.display = 'none';
                                            container.nextElementSibling?.classList.add('show-branding');
                                        }
                                    }}
                                />
                            )}
                        </div>
                    );
                })()}

                {/* StreamFlix branding - hidden by default, shown when badges fail */}
                <div className="streamed-branding hidden-branding">
                    <span className="streamed-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="#ec5818" xmlns="http://www.w3.org/2000/svg">
                            <g stroke="none" strokeWidth="0"></g>
                            <g strokeLinecap="round" strokeLinejoin="round"></g>
                            <g>
                                <path fillRule="evenodd" d="M11.1758045,11.5299649 C11.7222481,10.7630248 11.6612694,9.95529555 11.2823626,8.50234466 C10.5329929,5.62882187 10.8313891,4.05382867 13.4147321,2.18916004 L14.6756139,1.27904986 L14.9805807,2.80388386 C15.3046861,4.42441075 15.8369398,5.42670671 17.2035766,7.35464078 C17.2578735,7.43122022 17.2578735,7.43122022 17.3124108,7.50814226 C19.2809754,10.2854144 20,11.9596204 20,15 C20,18.6883517 16.2713564,22 12,22 C7.72840879,22 4,18.6888043 4,15 C4,14.9310531 4.00007066,14.9331427 3.98838852,14.6284506 C3.89803284,12.2718054 4.33380946,10.4273676 6.09706666,8.43586022 C6.46961415,8.0150872 6.8930834,7.61067534 7.36962714,7.22370749 L8.42161802,6.36945926 L8.9276612,7.62657706 C9.30157948,8.55546878 9.73969716,9.28566491 10.2346078,9.82150804 C10.6537848,10.2753538 10.9647401,10.8460665 11.1758045,11.5299649 Z M7.59448531,9.76165711 C6.23711779,11.2947332 5.91440928,12.6606068 5.98692012,14.5518252 C6.00041903,14.9039019 6,14.8915108 6,15 C6,17.5278878 8.78360021,20 12,20 C15.2161368,20 18,17.527472 18,15 C18,12.4582072 17.4317321,11.1350292 15.6807305,8.66469725 C15.6264803,8.58818014 15.6264803,8.58818014 15.5719336,8.51124844 C14.5085442,7.0111098 13.8746802,5.96758691 13.4553336,4.8005211 C12.7704786,5.62117775 12.8107447,6.43738988 13.2176374,7.99765534 C13.9670071,10.8711781 13.6686109,12.4461713 11.0852679,14.31084 L9.61227259,15.3740546 L9.50184911,13.5607848 C9.43129723,12.4022487 9.16906461,11.6155508 8.76539217,11.178492 C8.36656566,10.7466798 8.00646835,10.2411426 7.68355027,9.66278925 C7.65342985,9.69565638 7.62374254,9.72861259 7.59448531,9.76165711 Z"></path>
                            </g>
                        </svg>
                    </span>
                    <span className="streamed-text">StreamFlix</span>
                </div>

                {/* Bottom Info Bar - inside bg container */}
                <div className="match-card-footer">
                    {/* Time Badge - Bottom Left (only for non-live matches) */}
                    {!timeInfo.isLive && (
                        <div className="match-badge time">
                            {timeInfo.text}
                        </div>
                    )}

                    {/* Category Badge - Bottom Right */}
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
