import React from 'react';
import { MessageSquare, Sparkles, ShieldCheck } from 'lucide-react';

export default function GlobalChatSignInWall() {
  return (
    <div className="globalchat-signin-wall">
      <div className="globalchat-signin-hero">
        <div className="globalchat-signin-icon-wrap">
          <MessageSquare className="globalchat-signin-hero-icon" />
        </div>
        <span className="globalchat-signin-badge">COMMUNITY CHAT</span>
        <h2 className="globalchat-signin-title">Sign in to take part in GlobalChat</h2>
        <p className="globalchat-signin-desc">
          Share what you're watching, recommend your favorites, report playback issues, and chat with the community.
        </p>
      </div>

      <div className="globalchat-signin-perks">
        <div className="globalchat-signin-perk">
          <ShieldCheck className="globalchat-signin-perk-icon" />
          <span>Real, verified profiles</span>
        </div>
        <div className="globalchat-signin-perk">
          <Sparkles className="globalchat-signin-perk-icon" />
          <span>Live movie & show recommendations</span>
        </div>
      </div>
    </div>
  );
}
