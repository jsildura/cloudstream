import React from 'react';
import { MessageSquare, Sparkles, ShieldCheck } from 'lucide-react';

export default function GlobalChatSignInWall() {
  return (
    <div className="globalchat-signin-wall">
      <div className="globalchat-signin-hero">
        <div className="globalchat-signin-icon-wrap">
          <MessageSquare className="globalchat-signin-hero-icon" />
        </div>
        <h2 className="globalchat-signin-title">Join the Conversation</h2>
        <p className="globalchat-signin-desc">
          Chat live with viewers and share what you're watching.
        </p>
      </div>

      <div className="globalchat-signin-perks">
        <div className="globalchat-signin-perk">
          <ShieldCheck className="globalchat-signin-perk-icon" />
          <span>Real, verified profiles</span>
        </div>
        <div className="globalchat-signin-perk">
          <Sparkles className="globalchat-signin-perk-icon" />
          <span>Live movie &amp; show recommendations</span>
        </div>
      </div>
    </div>
  );
}
