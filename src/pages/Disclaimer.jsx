import React from 'react';
import { Link } from 'react-router-dom';

const Disclaimer = () => {
  return (
    <div className="static-page">
      <div className="static-container">
        <h1>Disclaimer</h1>

        <div className="disclaimer-content">
          <p>
            StreamFlix does not host any files and only provides access to publicly available content sourced from non-affiliated third parties, with all movies, TV shows, and media remaining the intellectual property of their respective owners. We accept no responsibility or liability for content on external sites, and StreamFlix makes no claim to own, control, or distribute any such material. This platform is for entertainment and educational demonstration purposes only and is not intended as a commercial streaming service; users are solely responsible for complying with local laws, ensuring their legal right to access content, and supporting creators through official channels. Information such as metadata, cast details, artwork, and release data is provided via the TMDB API under its terms of service. Use of StreamFlix is at the user's own risk, and the developers are not responsible for any legal issues that may arise, so users should ensure their streaming activities follow applicable laws and consider supporting creators through legitimate platforms like Netflix, Hulu, Disney+, HBO Max, and Amazon Prime Video.
          </p>
        </div>

        <div className="static-links">
          <Link to="/" className="static-link">Back to Home</Link>
        </div>
      </div>
    </div>
  );
};

export default Disclaimer;